// The "how to take it" form used by the add-medicine step 2 and by the adjust-dose form (step 3.2b-2).
// Pure: the form state <-> the stored `Schedule`, the problem text when the form is incomplete, and the Thai
// summaries. The design canvas counts weekdays from Monday = 0; the data model from Sunday = 0. The form keeps the
// canvas numbers and converts only here (canvasDayToModelDay / modelDayToCanvasDay).
import type { IsoDate } from './calc';
import { formatPills } from './format';
import { canvasDayToModelDay, intervalTimes, modelDayToCanvasDay } from './schedule';
import type { IntervalSchedule, MealSchedule, Schedule } from './schema';
import type { MealTiming } from './today';

export const SLOT_IDS = ['morning', 'noon', 'evening', 'bedtime'] as const;
export type SlotId = (typeof SLOT_IDS)[number];
export type MealSlotId = Exclude<SlotId, 'bedtime'>;
export const MEAL_SLOT_IDS: MealSlotId[] = ['morning', 'noon', 'evening'];
export const MEAL_TIMINGS: MealTiming[] = ['before', 'with', 'after'];
export const EVERY_HOURS = [4, 6, 8, 12, 24] as const;
export type EveryHours = (typeof EVERY_HOURS)[number];

export const SLOT_LABEL: Record<SlotId, string> = { morning: 'เช้า', noon: 'กลางวัน', evening: 'เย็น', bedtime: 'ก่อนนอน' };
export const MEAL_LABEL: Record<MealTiming, string> = { before: 'ก่อนอาหาร', with: 'พร้อมอาหาร', after: 'หลังอาหาร' };
/** Canvas order, Monday first. */
export const DAY_FULL = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const DAY_SHORT = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

export type Freq = 'daily' | 'alt' | 'days';

export interface ScheduleForm {
  mode: 'meal' | 'interval';
  slots: Record<SlotId, boolean>;
  meal: Record<MealSlotId, MealTiming>;
  pills: Record<SlotId, number>;
  freq: Freq;
  /** canvas numbering, Monday = 0 */
  days: number[];
  every: EveryHours;
  first: string; // HH:MM
  ipills: number;
  course: 'days' | 'ongoing';
  courseDays: number;
}

/** Same start as the design canvas: morning after meal, 1 pill; every 12 h from 08:00, 5 days. */
export const defaultForm = (): ScheduleForm => ({
  mode: 'meal',
  slots: { morning: true, noon: false, evening: false, bedtime: false },
  meal: { morning: 'after', noon: 'after', evening: 'after' },
  pills: { morning: 1, noon: 1, evening: 1, bedtime: 1 },
  freq: 'daily',
  days: [],
  every: 12,
  first: '08:00',
  ipills: 1,
  course: 'days',
  courseDays: 5,
});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => k in b && sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export const sameSchedule = (a: Schedule, b: Schedule): boolean => sameJson(a, b);

/** The form that shows an existing schedule (settings not used by that kind keep the defaults). */
export function scheduleToForm(s: Schedule): ScheduleForm {
  const f = defaultForm();
  if (s.kind === 'interval') {
    return {
      ...f,
      mode: 'interval',
      slots: { morning: false, noon: false, evening: false, bedtime: false },
      every: s.everyHours,
      first: s.firstTime,
      ipills: s.pills,
      course: s.course.kind === 'days' ? 'days' : 'ongoing',
      courseDays: s.course.kind === 'days' ? s.course.days : f.courseDays,
    };
  }
  const out: ScheduleForm = {
    ...f,
    mode: 'meal',
    slots: { morning: false, noon: false, evening: false, bedtime: false },
    meal: { ...f.meal },
    pills: { ...f.pills },
  };
  for (const id of SLOT_IDS) {
    const slot = s.slots[id];
    if (!slot) continue;
    out.slots[id] = true;
    out.pills[id] = slot.pills;
    if (id !== 'bedtime' && 'meal' in slot) out.meal[id] = slot.meal;
  }
  if (s.days.kind === 'alt') out.freq = 'alt';
  if (s.days.kind === 'weekdays') {
    out.freq = 'days';
    out.days = s.days.days.map(modelDayToCanvasDay).sort((a, b) => a - b);
  }
  return out;
}

/** Text saying what is missing, or null when the form is complete. */
export function formProblem(f: ScheduleForm): string | null {
  if (f.mode === 'meal') {
    if (!SLOT_IDS.some((id) => f.slots[id])) return 'เลือกช่วงเวลาที่ทานอย่างน้อย 1 ช่วง';
    if (f.freq === 'days' && f.days.length === 0) return 'เลือกวันอย่างน้อย 1 วัน';
    return null;
  }
  return HHMM.test(f.first) ? null : 'ใส่เวลาที่ทานครั้งแรกก่อน';
}

function build(f: ScheduleForm, anchor: IsoDate, startDate: IsoDate): Schedule | null {
  if (formProblem(f) !== null) return null;
  if (f.mode === 'interval') {
    const s: IntervalSchedule = {
      kind: 'interval',
      everyHours: f.every,
      firstTime: f.first,
      pills: f.ipills,
      course: f.course === 'days' ? { kind: 'days', days: f.courseDays, startDate } : { kind: 'ongoing' },
    };
    return s;
  }
  const slots: MealSchedule['slots'] = {};
  for (const id of MEAL_SLOT_IDS) {
    if (f.slots[id]) slots[id] = { pills: f.pills[id], meal: f.meal[id] };
  }
  if (f.slots.bedtime) slots.bedtime = { pills: f.pills.bedtime };
  const days: MealSchedule['days'] =
    f.freq === 'daily'
      ? { kind: 'daily' }
      : f.freq === 'alt'
        ? { kind: 'alt', anchor }
        : { kind: 'weekdays', days: f.days.map(canvasDayToModelDay).sort((a, b) => a - b) };
  return { kind: 'meal', slots, days };
}

/** The schedule the form describes, or null while it is incomplete. "Every other day" counts from today and a
 * course of days starts today. When `original` is given and nothing but those two dates differs, the original is
 * returned unchanged (so the dates of a medicine already running do not move when nothing was changed). */
export function formToSchedule(f: ScheduleForm, today: IsoDate, original?: Schedule): Schedule | null {
  const fresh = build(f, today, today);
  if (!fresh) return null;
  if (original && original.kind === fresh.kind) {
    const anchor = original.kind === 'meal' && original.days.kind === 'alt' ? original.days.anchor : today;
    const start = original.kind === 'interval' && original.course.kind === 'days' ? original.course.startDate : today;
    const same = build(f, anchor, start);
    if (same && sameSchedule(same, original)) return original;
  }
  return fresh;
}

const daysText = (days: number[]): string =>
  days
    .map(modelDayToCanvasDay)
    .sort((a, b) => a - b)
    .map((d) => DAY_SHORT[d] ?? '')
    .join(' ');

/** One line: 'เช้า 1 เม็ด · เย็น 1 เม็ด · จ. พ. ศ.' / 'ทุก 12 ชม. · 1 เม็ด'. With `full` the meal timing, first time and
 * course are added ('เช้า หลังอาหาร 1 เม็ด', 'ทุก 12 ชม. · 1 เม็ด · เริ่ม 08:00 · 5 วัน'). */
export function describeSchedule(s: Schedule, unit: string, full = false): string {
  if (s.kind === 'interval') {
    const parts = [`ทุก ${s.everyHours} ชม.`, formatPills(s.pills, unit)];
    if (full) {
      parts.push(`เริ่ม ${s.firstTime}`);
      parts.push(s.course.kind === 'days' ? `${s.course.days} วัน` : 'ทานต่อเนื่อง');
    }
    return parts.join(' · ');
  }
  const parts: string[] = [];
  for (const id of SLOT_IDS) {
    const slot = s.slots[id];
    if (!slot) continue;
    const meal = full && 'meal' in slot ? ` ${MEAL_LABEL[slot.meal]}` : '';
    parts.push(`${SLOT_LABEL[id]}${meal} ${formatPills(slot.pills, unit)}`);
  }
  if (s.days.kind === 'alt') parts.push('วันเว้นวัน');
  if (s.days.kind === 'weekdays') parts.push(daysText(s.days.days));
  return parts.join(' · ');
}

/** The "สรุป" lines of the form. Empty while the form is incomplete. */
export function summaryLines(f: ScheduleForm, unit: string): string[] {
  if (formProblem(f) !== null) return [];
  if (f.mode === 'interval') {
    const total = (24 / f.every) * f.courseDays;
    return [
      `ทุก ${f.every} ชั่วโมง · ${formatPills(f.ipills, unit)} · เริ่ม ${f.first}`,
      f.course === 'days' ? `ทาน ${f.courseDays} วัน (รวม ${total} ครั้ง)` : 'ทานต่อเนื่อง ไม่กำหนดวันสิ้นสุด',
    ];
  }
  const lines: string[] = [];
  for (const id of SLOT_IDS) {
    if (!f.slots[id]) continue;
    const meal = id === 'bedtime' ? '' : ` · ${MEAL_LABEL[f.meal[id]]}`;
    lines.push(`${SLOT_LABEL[id]}${meal} · ${formatPills(f.pills[id], unit)}`);
  }
  lines.push(
    f.freq === 'daily'
      ? 'ความถี่: ทุกวัน'
      : f.freq === 'alt'
        ? 'ความถี่: วันเว้นวัน (เริ่มวันนี้)'
        : `ความถี่: ${[...f.days]
            .sort((a, b) => a - b)
            .map((d) => DAY_SHORT[d] ?? '')
            .join(' ')}`,
  );
  return lines;
}

/** 'เวลาที่ต้องทานในแต่ละวัน' for the every-X-hours form: '08:00 · 20:00'. */
export function intervalPreview(f: ScheduleForm): string | null {
  if (!HHMM.test(f.first)) return null;
  const s: IntervalSchedule = {
    kind: 'interval',
    everyHours: f.every,
    firstTime: f.first,
    pills: f.ipills,
    course: { kind: 'ongoing' },
  };
  return intervalTimes(s).join(' · ');
}
