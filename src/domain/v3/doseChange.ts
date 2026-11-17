// Change how to take a medicine, "เปลี่ยนวิธีกิน" (M4 PR 8b, boards #41 - #49, #52). Pure: no UI, no storage, no clock.
// A draft is made from the saved meal schedule, changed step by step, and applied as ONE `adjust` MedEvent + the new schedule.
// Days are per schedule in the data (daily / every other day / chosen weekdays), so they are shared by every meal.
// The new schedule counts from TODAY only: before it is swapped in, the stock is recounted to today's amount (see `recounted`).
import type { IsoDate } from '../calc';
import { QUICK_ML, WEEKDAY_CHIPS, defaultAmount, doseRules, isTubeKind, stepAmount } from './addMedicine';
import { MEAL_LABEL, PERIODS, PERIOD_LABEL, formatDose, unitWord, type Meal, type Period } from './home';
import { defaultNewId } from './medActions';
import { fullThaiDate } from './medDetail';
import {
  ADJUST_REASONS,
  rootSchema,
  unitsPerStrip,
  type Assignment,
  type MedEvent,
  type MedKind,
  type Medication,
  type Root,
  type Schedule,
  type Stock,
} from './schema';
import { daysLeft, isLowStock, stockNow, type DaysLeft } from './stock';
import { formatDaysLeft, unitFor, type LeftUnit } from './stockText';

export type AdjustReason = (typeof ADJUST_REASONS)[number];
export const NOTE_MAX = 200;
export const SAVE_FAILED_TEXT = 'ข้อมูลไม่ถูกต้อง บันทึกไม่ได้ ลองใหม่อีกครั้ง';

// ---------- the draft ----------

export interface MealDraft {
  on: boolean;
  amount: number; // pills, or ml for a liquid; a cream keeps the stand-in dose of the data
  timing: Meal; // bedtime has no timing in the data (ignored there)
}
export type DaysDraft = { kind: 'daily' } | { kind: 'alt'; anchor: IsoDate } | { kind: 'weekdays'; days: number[] }; // 0 = Sunday
export interface DoseDraft {
  kind: MedKind;
  meals: Record<Period, MealDraft>;
  days: DaysDraft;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Chosen weekdays sorted, once; all 7 are 'daily'. */
function normalDays(days: DaysDraft): DaysDraft {
  if (days.kind !== 'weekdays') return days;
  const set = [...new Set(days.days)].sort((a, b) => a - b);
  return set.length === 7 ? { kind: 'daily' } : { kind: 'weekdays', days: set };
}

/** The draft of a saved schedule. null = an interval schedule ("ทุก N ชั่วโมง"): this page cannot change it. */
export function draftFromSchedule(kind: MedKind, schedule: Schedule): DoseDraft | null {
  if (schedule.kind !== 'meal') return null;
  const fresh = (): MealDraft => ({ on: false, amount: defaultAmount(kind), timing: 'after' });
  const meals: Record<Period, MealDraft> = { morning: fresh(), noon: fresh(), evening: fresh(), bedtime: fresh() };
  for (const p of PERIODS) {
    const slot = schedule.slots[p];
    if (!slot) continue;
    meals[p] = { on: true, amount: slot.pills, timing: 'meal' in slot ? slot.meal : 'after' };
  }
  return { kind, meals, days: normalDays(schedule.days) };
}

const withMeal = (d: DoseDraft, p: Period, patch: Partial<MealDraft>): DoseDraft => ({ ...d, meals: { ...d.meals, [p]: { ...d.meals[p], ...patch } } });
const onCount = (d: DoseDraft): number => PERIODS.filter((p) => d.meals[p].on).length;

/** The last meal that is ON cannot be turned off. */
export const canTurnOff = (d: DoseDraft, p: Period): boolean => !d.meals[p].on || onCount(d) > 1;

/** Turn a meal ON (1 unit, a liquid 5 ml, after the meal) or OFF (not for the last one). */
export function toggleMeal(d: DoseDraft, p: Period): DoseDraft {
  if (d.meals[p].on) return canTurnOff(d, p) ? withMeal(d, p, { on: false }) : d;
  return withMeal(d, p, { on: true, amount: defaultAmount(d.kind), timing: 'after' });
}

/** Does the stepper exist (not for cream / drops) and can it go one step this way (the limits of the data: tablet 0.5 - 4, liquid 2.5 - 100)? */
export function canStep(d: DoseDraft, p: Period, dir: 1 | -1): boolean {
  const rules = doseRules(d.kind);
  if (!rules) return false;
  const v = d.meals[p].amount;
  return dir === 1 ? v < rules.max : v > rules.min;
}
export function stepMeal(d: DoseDraft, p: Period, dir: 1 | -1): DoseDraft {
  return canStep(d, p, dir) ? withMeal(d, p, { amount: stepAmount(d.kind, d.meals[p].amount, dir) }) : d;
}
/** A liquid spoon pill: 1 teaspoon = 5 ml, 1 tablespoon = 15 ml. */
export const SPOONS = QUICK_ML;
export const setSpoon = (d: DoseDraft, p: Period, ml: number): DoseDraft => (d.kind === 'liquid' ? withMeal(d, p, { amount: ml }) : d);
export const setTiming = (d: DoseDraft, p: Period, timing: Meal): DoseDraft => withMeal(d, p, { timing });

/** The weekdays that are chosen (0 = Sunday). Every-other-day has none chosen. */
export function selectedDays(days: DaysDraft): number[] {
  return days.kind === 'daily' ? ALL_DAYS : days.kind === 'alt' ? [] : days.days;
}

/** A day chip. Every-other-day turns into chosen days with only this day; at least 1 day stays; all 7 = daily. */
export function toggleDay(d: DoseDraft, day: number): DoseDraft {
  if (d.days.kind === 'alt') return { ...d, days: { kind: 'weekdays', days: [day] } };
  const now = selectedDays(d.days);
  const next = now.includes(day) ? now.filter((x) => x !== day) : [...now, day];
  if (next.length === 0) return d;
  return { ...d, days: normalDays({ kind: 'weekdays', days: next }) };
}
/** Back to "วันเว้นวัน" (the anchor it had). */
export const setAltDays = (d: DoseDraft, anchor: IsoDate): DoseDraft => ({ ...d, days: { kind: 'alt', anchor } });

// ---------- what changed ----------

const sameDays = (a: DaysDraft, b: DaysDraft): boolean => JSON.stringify(normalDays(a)) === JSON.stringify(normalDays(b));
/** Timing counts only where the data has it: not for bedtime, not for cream / drops. */
const hasTiming = (kind: MedKind, p: Period): boolean => p !== 'bedtime' && !isTubeKind(kind);

function sameMeal(kind: MedKind, p: Period, a: MealDraft, b: MealDraft): boolean {
  return a.on === b.on && (!a.on || (a.amount === b.amount && (!hasTiming(kind, p) || a.timing === b.timing)));
}

export function isChanged(original: DoseDraft, d: DoseDraft): boolean {
  return !sameDays(original.days, d.days) || PERIODS.some((p) => !sameMeal(d.kind, p, original.meals[p], d.meals[p]));
}

export type MealStatus = 'off' | 'new' | 'changed' | 'same';
/** The chip of a row: "เพิ่มใหม่" (new), "แก้แล้ว" (changed; also when only the shared days changed), none (same). */
export function mealStatus(original: DoseDraft, d: DoseDraft, p: Period): MealStatus {
  if (!d.meals[p].on) return 'off';
  if (!original.meals[p].on) return 'new';
  return !sameMeal(d.kind, p, original.meals[p], d.meals[p]) || !sameDays(original.days, d.days) ? 'changed' : 'same';
}

// ---------- texts ----------

/** 'ทุกวัน' / 'วันเว้นวัน' / 'จ พ ศ' (Monday first). */
export function daysShort(days: DaysDraft): string {
  if (days.kind === 'daily') return 'ทุกวัน';
  if (days.kind === 'alt') return 'วันเว้นวัน';
  return WEEKDAY_CHIPS.filter((w) => days.days.includes(w.value)).map((w) => w.label).join(' ');
}

/** The grey line under a meal name: 'หลังอาหาร · ทุกวัน' (bedtime and cream: days only). */
export function mealSub(kind: MedKind, d: DoseDraft, p: Period): string {
  const days = daysShort(d.days);
  return hasTiming(kind, p) ? `${MEAL_LABEL[d.meals[p].timing]} · ${days}` : days;
}

/** The stepper text: '1 เม็ด', '½ เม็ด', '10 มล.'. */
export const doseText = (m: Medication, amount: number): string => `${formatDose(m, amount)} ${unitWord(m)}`;

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---------- the schedule to write ----------

/** The Schedule of a draft. A cream keeps its saved stand-in dose and timing; a meal turned on gets 1 and "after". Bedtime has no meal. */
export function buildDoseSchedule(d: DoseDraft): Extract<Schedule, { kind: 'meal' }> {
  const slots: Extract<Schedule, { kind: 'meal' }>['slots'] = {};
  const slotOf = (p: Exclude<Period, 'bedtime'>): { pills: number; meal: Meal } => ({ pills: d.meals[p].amount, meal: d.meals[p].timing });
  if (d.meals.morning.on) slots.morning = slotOf('morning');
  if (d.meals.noon.on) slots.noon = slotOf('noon');
  if (d.meals.evening.on) slots.evening = slotOf('evening');
  if (d.meals.bedtime.on) slots.bedtime = { pills: d.meals.bedtime.amount };
  const days = normalDays(d.days);
  return { kind: 'meal', slots, days };
}

// ---------- who may change ----------

export type DoseAvailability = 'ok' | 'interval' | 'stopped' | 'missing';
export function doseAvailability(root: Root, assignmentId: string): DoseAvailability {
  const a = root.assignments.find((x) => x.id === assignmentId);
  if (!a || !root.medications.some((m) => m.id === a.medicationId)) return 'missing';
  if (a.status !== 'active') return 'stopped';
  return a.schedule.kind === 'meal' ? 'ok' : 'interval';
}

// ---------- stock: the new schedule counts from today only ----------

/** The stock as it is at the start of `today`, written with `countedOn = today`. `walkUsed` (stock.ts) walks the PAST days with the
 * schedule that is saved now, so a new schedule must never meet an older counting day: the past is settled first with the old schedule.
 * A count made today (or later) and tubes / no stock need nothing. */
function recounted(a: Assignment, m: Medication, root: Root, today: IsoDate): Stock | null {
  const s = a.stock;
  if (!s || s.kind === 'tubes' || s.countedOn >= today) return s;
  const qty = stockNow(a, m, today, root.events);
  if (qty === null) return s;
  if (s.kind === 'volume') return { kind: 'volume', ml: round2(qty), countedOn: today };
  const per = unitsPerStrip(m.pack);
  if (per === null) return { kind: 'count', strips: 0, loose: round2(qty), countedOn: today };
  const strips = Math.floor(qty / per);
  return { kind: 'count', strips, loose: round2(qty - strips * per), countedOn: today };
}

// ---------- the summary card ----------

export interface DoseSummary {
  oldLine: string;
  newLine: string;
  stockLine: string | null;
  leftLine: string | null;
  chip: { tone: 'ok' | 'low' | 'out'; label: string } | null;
  note: string | null;
  effectiveLine: string;
}

function scheduleFromDraft(a: Assignment, d: DoseDraft): Assignment {
  return { ...a, schedule: buildDoseSchedule(d) };
}

/** Units per day (every day) and per week of a draft. Every-other-day is 3.5 days a week. */
function totals(d: DoseDraft): { day: number; week: number } {
  const day = PERIODS.reduce((sum, p) => sum + (d.meals[p].on ? d.meals[p].amount : 0), 0);
  const norm = normalDays(d.days);
  const perWeek = norm.kind === 'daily' ? 7 : norm.kind === 'alt' ? 3.5 : norm.days.length;
  return { day: round2(day), week: round2(day * perWeek) };
}

function line(m: Medication, original: DoseDraft, d: DoseDraft, side: 'old' | 'new', unit: LeftUnit): string {
  const shown = side === 'old' ? original : d;
  const tube = isTubeKind(d.kind);
  const parts = PERIODS.flatMap((p): string[] => {
    if (shown.meals[p].on) return [tube ? PERIOD_LABEL[p] : `${PERIOD_LABEL[p]} ${doseText(m, shown.meals[p].amount)}`];
    return side === 'new' && original.meals[p].on ? [`${PERIOD_LABEL[p]}: ตัดออก`] : [];
  });
  const norm = normalDays(shown.days);
  if (norm.kind !== 'daily') parts.push(norm.kind === 'alt' ? 'วันเว้นวัน' : `เฉพาะ ${daysShort(norm)}`);
  const text = parts.join(' · ');
  if (tube) return text;
  const t = totals(shown);
  return `${text} (รวม ${formatDose(m, unit === 'weeks' ? t.week : t.day)} ${unitWord(m)}/${unit === 'weeks' ? 'สัปดาห์' : 'วัน'})`;
}

/** 'พอใช้ประมาณ 26 วัน → 17 วัน' (the words of `formatDaysLeft`, never doubled). null when there are no days to compare. */
function leftChange(before: DaysLeft, after: DaysLeft, unit: LeftUnit): string | null {
  const known = (x: DaysLeft): boolean => x.status === 'ok' || x.status === 'enough';
  if (!known(before) && !known(after)) return null;
  const a = formatDaysLeft(before, unit);
  const b = formatDaysLeft(after, unit);
  const bare = (t: string): string => t.replace(/^ประมาณ /, '');
  const numeric = (t: string): boolean => /^\d/.test(bare(t));
  if (numeric(a) && numeric(b)) return `พอใช้ประมาณ ${bare(a)} → ${bare(b)}`;
  if (a.startsWith('ไม่พอ') || b.startsWith('ไม่พอ')) return `${a} → ${b}`;
  const approx = (t: string): string => (numeric(t) ? `ประมาณ ${bare(t)}` : t);
  return `พอใช้ ${approx(a)} → ${approx(b)}`;
}

/** The "สรุปก่อนบันทึก" card (dose.md sections 3 and 4). Days left come from stock.ts (day by day, the real schedule), the chip from the
 * setting `lowStockDays` (default 14). null = no such medicine. */
export function summarize(root: Root, assignmentId: string, original: DoseDraft, d: DoseDraft, today: IsoDate): DoseSummary | null {
  const a = root.assignments.find((x) => x.id === assignmentId);
  const m = a ? root.medications.find((x) => x.id === a.medicationId) : undefined;
  if (!a || !m) return null;
  const unit = unitFor(buildDoseSchedule(original), buildDoseSchedule(d));
  const effectiveLine = `มีผลตั้งแต่วันนี้ ${fullThaiDate(today)}`;
  const lines = { oldLine: line(m, original, d, 'old', unit), newLine: line(m, original, d, 'new', unit), effectiveLine };

  const stock = recounted(a, m, root, today);
  if (stock === null) return { ...lines, stockLine: 'ยังไม่ได้นับยา', leftLine: null, chip: null, note: null };
  if (stock.kind === 'tubes') {
    const word = m.kind === 'drops' ? 'ขวด' : 'หลอด';
    return { ...lines, stockLine: `ยาคงเหลือ สำรอง ${stock.spare} ${word}`, leftLine: null, chip: null, note: `${m.kind === 'drops' ? 'ยาหยอด' : 'ครีม'}ไม่นับวันที่พอใช้` };
  }
  const qty = stock.kind === 'volume' ? stock.ml : stock.strips * (unitsPerStrip(m.pack) ?? 0) + stock.loose;
  const stockLine = stock.kind === 'volume' ? `ยาคงเหลือ ${qty} มล.` : `ยาคงเหลือ ${formatDose(m, qty)} ${unitWord(m)}`;
  const after = scheduleFromDraft({ ...a, stock }, d);
  const before = daysLeft(a, m, today, root.events);
  const next = daysLeft(after, m, today, root.events);
  const out = next.status === 'ok' && next.days === 0;
  const low = isLowStock(after, m, today, root.settings.lowStockDays, root.events);
  const chip = out ? ({ tone: 'out', label: 'หมด' } as const) : low ? ({ tone: 'low', label: 'ใกล้หมด' } as const) : ({ tone: 'ok', label: 'เพียงพอ' } as const);
  return { ...lines, stockLine, leftLine: leftChange(before, next, unit), chip, note: null };
}

// ---------- saving ----------

export type DoseResult = { ok: true; root: Root } | { ok: false; error: string };
const fail = (error: string): DoseResult => ({ ok: false, error });

/** One `adjust` MedEvent (from / to snapshots, today, reason, optional note) and the assignment's new schedule, all or nothing: the whole
 * root is checked with `rootSchema` and nothing is returned if it does not pass. The stock is recounted to today first (see `recounted`),
 * so the new schedule never changes how much was used before today. Not for stopped medicines or interval schedules. */
export function applyDoseChange(
  root: Root,
  assignmentId: string,
  newSchedule: Schedule,
  reason: AdjustReason,
  note: string,
  today: IsoDate,
  nowIso: string,
  newId: () => string = defaultNewId,
): DoseResult {
  const a = root.assignments.find((x) => x.id === assignmentId);
  const m = a ? root.medications.find((x) => x.id === a.medicationId) : undefined;
  if (!a || !m) return fail('ไม่พบยานี้');
  if (a.status !== 'active') return fail('ยานี้หยุดไปแล้ว เปลี่ยนวิธีกินไม่ได้');
  if (a.schedule.kind !== 'meal' || newSchedule.kind !== 'meal') return fail('ยานี้กินทุก N ชั่วโมง ยังเปลี่ยนวิธีกินไม่ได้');
  const text = note.trim();
  if (text.length > NOTE_MAX) return fail(`หมายเหตุยาวเกิน ${NOTE_MAX} ตัวอักษร`);
  const event: MedEvent = {
    id: newId(),
    assignmentId,
    type: 'adjust',
    reason,
    effectiveOn: today,
    at: nowIso,
    from: { schedule: a.schedule },
    to: { schedule: newSchedule },
    ...(text === '' ? {} : { note: text }),
  };
  const stock = recounted(a, m, root, today);
  const next: Root = {
    ...root,
    assignments: root.assignments.map((x) => (x.id === assignmentId ? { ...x, schedule: newSchedule, stock } : x)),
    events: [...root.events, event],
  };
  return rootSchema.safeParse(next).success ? { ok: true, root: next } : fail(SAVE_FAILED_TEXT);
}
