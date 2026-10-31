// Adding a medicine (M4 PR 6b). Pure: takes a root, returns a new root, never touches storage. The form (screens in
// src/pages/v3/AddMedV3.tsx) holds the typed texts in the drafts below; every rule (what is valid, how a form turns into
// Schedule / Pack / Stock) lives here, so the screen only draws. The result is always checked by rootSchema.
import type { IsoDate } from '../calc';
import { MEAL_LABEL, PERIODS, PERIOD_LABEL, formatAmount, type Meal, type Period } from './home';
import { doseTextOf, label } from './medsList';
import { defaultNewId } from './medActions';
import {
  STRENGTH_UNITS,
  rootSchema,
  unitsPerStrip,
  type Assignment,
  type HouseItem,
  type MedEvent,
  type MedKind,
  type Medication,
  type Pack,
  type Person,
  type Root,
  type Schedule,
  type Stock,
} from './schema';
import { daysLeft, stockNow } from './stock';
import { formatDaysLeft, unitFor } from './stockText';

export type StrengthUnit = (typeof STRENGTH_UNITS)[number];

export const NAME_MIN = 2;
export const NAME_MAX = 60;
export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_MAX = 5;
/** A liquid dose above this many ml asks the user to check the label again. */
export const LIQUID_CONFIRM_ML = 30;
export const LIQUID_MAX_ML = 100;
export const COURSE_MAX_DAYS = 90;
export const SAVE_FAILED_TEXT = 'ข้อมูลไม่ถูกต้อง บันทึกไม่ได้ ลองใหม่อีกครั้ง';

const squash = (s: string): string => s.replace(/\s+/g, '').toLowerCase();
const active = (persons: readonly Person[]): Person[] => persons.filter((p) => p.removedAt === undefined);

// ---------- names: suggestions and matches ----------

export type MedType = 'personal' | 'house';
export interface NameSuggestion {
  name: string;
  /** "มีในบ้านแล้ว" for a personal medicine (every name comes from the house's own medicines); none for house. */
  tag: string | null;
}
export const IN_HOUSE_TAG = 'มีในบ้านแล้ว';

/** From 2 typed characters: names that contain the text, at most 5, no repeats. The names come from the data only. */
export function suggestNames(root: Root, type: MedType, text: string): NameSuggestion[] {
  const key = squash(text);
  if ([...text.trim()].length < SUGGEST_MIN_CHARS || key === '') return [];
  const names = type === 'personal' ? root.medications.map((m) => m.name) : root.houseItems.filter((h) => h.removedAt === undefined).map((h) => h.name);
  const seen = new Set<string>();
  const out: NameSuggestion[] = [];
  for (const name of names) {
    const k = squash(name);
    if (!k.includes(key) || seen.has(k)) continue;
    seen.add(k);
    out.push({ name, tag: type === 'personal' ? IN_HOUSE_TAG : null });
    if (out.length === SUGGEST_MAX) break;
  }
  return out;
}

/** The personal medicine with exactly this name (spaces and case ignored). */
export function findMedication(root: Root, name: string): Medication | undefined {
  const key = squash(name);
  return key === '' ? undefined : root.medications.find((m) => squash(m.name) === key);
}

/** Members (not taken out) who already have this medicine, active or stopped. */
export function membersUsing(root: Root, medicationId: string): Person[] {
  const ids = new Set(root.assignments.filter((a) => a.medicationId === medicationId).map((a) => a.personId));
  return active(root.persons).filter((p) => ids.has(p.id));
}

/** The house medicine (not deleted) with exactly this name. */
export function findHouseItem(root: Root, name: string): HouseItem | undefined {
  const key = squash(name);
  return key === '' ? undefined : root.houseItems.find((h) => h.removedAt === undefined && squash(h.name) === key);
}

/** "เพิ่มให้ฉันด้วย" for the member whose relation is ตัวฉัน, else "เพิ่มให้{ชื่อ}ด้วย". */
export const alsoLabel = (p: Person): string => `เพิ่มให้${p.relation === 'ตัวฉัน' ? 'ฉัน' : p.name}ด้วย`;

// ---------- number texts ----------

type Num = { kind: 'empty' } | { kind: 'ok'; value: number } | { kind: 'bad' };
const MAX_NUMBER = 99999;

function parseNum(text: string): Num {
  const t = text.trim();
  if (t === '') return { kind: 'empty' };
  if (!/^\d+(\.\d+)?$/.test(t)) return { kind: 'bad' };
  const value = Number(t);
  return Number.isFinite(value) && value <= MAX_NUMBER ? { kind: 'ok', value } : { kind: 'bad' };
}

// ---------- kinds ----------

export const KIND_ORDER: readonly MedKind[] = ['tablet', 'capsule', 'liquid', 'cream', 'sachet', 'drops', 'other'];
export const KIND_LABEL: Record<MedKind, string> = {
  tablet: 'ยาเม็ด',
  capsule: 'แคปซูล',
  liquid: 'ยาน้ำ',
  cream: 'ครีม',
  sachet: 'ผงชงดื่ม',
  drops: 'ยาหยอด',
  other: 'อื่นๆ',
};

/** The small unit of a kind in the stock sentences ('เม็ด', 'มล.' ...). */
export const SMALL_UNIT: Record<MedKind, string> = {
  tablet: 'เม็ด',
  capsule: 'แคปซูล',
  liquid: 'มล.',
  cream: 'หลอด',
  sachet: 'ซอง',
  drops: 'ขวด',
  other: 'ชิ้น',
};

export const isTubeKind = (kind: MedKind): boolean => kind === 'cream' || kind === 'drops';

// ---------- strength ----------

export interface StrengthDraft {
  value: string;
  unit: StrengthUnit;
}
export const defaultStrengthUnit = (kind: MedKind): StrengthUnit => (kind === 'liquid' ? 'mg/5 ml' : 'mg');
export const emptyStrength = (kind: MedKind): StrengthDraft => ({ value: '', unit: defaultStrengthUnit(kind) });

/** Empty = no strength. Otherwise a number above 0. */
export function strengthOf(d: StrengthDraft): { ok: true; strength: { value: number; unit: StrengthUnit } | undefined } | { ok: false } {
  const n = parseNum(d.value);
  if (n.kind === 'empty') return { ok: true, strength: undefined };
  if (n.kind === 'bad' || n.value <= 0) return { ok: false };
  return { ok: true, strength: { value: n.value, unit: d.unit } };
}

// ---------- the pack and the stock (table C of the brief) ----------

/** What the medicine was bought as. `bottle` is a pack of its own for pills, and "a bottle" of cream / drops (counted by tube). */
export type BuyAs = 'none' | 'strip' | 'box' | 'bottle' | 'sachetBox' | 'container' | 'tube' | 'loose';

export const BUY_OPTIONS: Record<MedKind, readonly BuyAs[]> = {
  tablet: ['none', 'strip', 'box', 'bottle'],
  capsule: ['none', 'strip', 'box', 'bottle'],
  sachet: ['none', 'sachetBox', 'loose'],
  liquid: ['none', 'container'],
  cream: ['none', 'tube', 'bottle'],
  drops: ['none', 'tube', 'bottle'],
  other: ['none', 'loose'],
};
export const DEFAULT_BUY: Record<MedKind, BuyAs> = {
  tablet: 'box',
  capsule: 'box',
  sachet: 'sachetBox',
  liquid: 'container',
  cream: 'tube',
  drops: 'bottle',
  other: 'loose',
};

/** The tile label of a choice. */
export function buyLabel(kind: MedKind, buy: BuyAs): string {
  switch (buy) {
    case 'none':
      return 'ไม่นับสต็อก';
    case 'strip':
      return 'แผง';
    case 'box':
    case 'sachetBox':
      return 'กล่อง';
    case 'bottle':
      return kind === 'tablet' || kind === 'capsule' ? 'ขวด/กระปุก' : 'ขวด';
    case 'container':
      return 'ขวด';
    case 'tube':
      return 'หลอด';
    case 'loose':
      return kind === 'sachet' ? 'ซองเดี่ยว' : 'นับเป็นชิ้น';
  }
}

/** The question above the tiles. */
export const buyQuestion = (kind: MedKind): string => (isTubeKind(kind) ? 'นับเป็นอะไร' : 'ซื้อมาเป็นอะไร');

export type SizeKey = 'perStrip' | 'stripsPerBox' | 'perBottle' | 'sachetsPerBox' | 'amount';
export type CountKey = 'boxes' | 'strips' | 'loose' | 'total';

export interface SizeField {
  key: SizeKey;
  label: string; // also used in "ต้องกรอก “…” ก่อน"
  unit: string;
  required: boolean;
}
export interface CountField {
  key: CountKey;
  unit: string;
  note: string | null; // the small explanation under the box
}

export interface StockDraft {
  buy: BuyAs;
  size: Record<SizeKey, string>;
  counts: Record<CountKey, string>;
}
export const emptyStockDraft = (kind: MedKind): StockDraft => ({
  buy: DEFAULT_BUY[kind],
  size: { perStrip: '', stripsPerBox: '', perBottle: '', sachetsPerBox: '', amount: '' },
  counts: { boxes: '', strips: '', loose: '', total: '' },
});

/** The pack boxes that must be typed (or may be, for the size of a tube) for a choice. */
export function sizeFields(kind: MedKind, buy: BuyAs): SizeField[] {
  const small = SMALL_UNIT[kind];
  switch (buy) {
    case 'strip':
      return [{ key: 'perStrip', label: `จำนวน${small}ต่อแผง`, unit: small, required: true }];
    case 'box':
      return [
        { key: 'stripsPerBox', label: 'จำนวนแผงต่อกล่อง', unit: 'แผง', required: true },
        { key: 'perStrip', label: `จำนวน${small}ต่อแผง`, unit: small, required: true },
      ];
    case 'bottle':
      return kind === 'tablet' || kind === 'capsule'
        ? [{ key: 'perBottle', label: `จำนวน${small}ต่อขวด`, unit: small, required: true }]
        : [{ key: 'amount', label: `ปริมาณต่อขวด`, unit: kind === 'cream' ? 'กรัม' : 'มล.', required: false }];
    case 'sachetBox':
      return [{ key: 'sachetsPerBox', label: 'จำนวนซองต่อกล่อง', unit: 'ซอง', required: true }];
    case 'container':
      return [{ key: 'amount', label: 'ปริมาณต่อขวด', unit: 'มล.', required: true }];
    case 'tube':
      return [{ key: 'amount', label: 'ปริมาณต่อหลอด', unit: kind === 'cream' ? 'กรัม' : 'มล.', required: false }];
    case 'none':
    case 'loose':
      return [];
  }
}

/** The number boxes of "จำนวนที่มี", by what the medicine was bought as. */
export function countFields(kind: MedKind, buy: BuyAs): CountField[] {
  const small = SMALL_UNIT[kind];
  switch (buy) {
    case 'strip':
      return [{ key: 'strips', unit: 'แผง', note: null }, { key: 'loose', unit: `${small}เศษ`, note: null }];
    case 'box':
      return [{ key: 'boxes', unit: 'กล่อง', note: null }, { key: 'strips', unit: 'แผง', note: null }, { key: 'loose', unit: `${small}เศษ`, note: null }];
    case 'bottle':
      return kind === 'tablet' || kind === 'capsule'
        ? [{ key: 'strips', unit: 'ขวดเต็ม', note: null }, { key: 'loose', unit: small, note: 'ที่เหลือในขวดที่เปิดแล้ว' }]
        : [{ key: 'total', unit: 'ขวด', note: 'จำนวนทั้งหมดที่มี (รวมอันที่เปิดใช้อยู่)' }];
    case 'sachetBox':
      return [{ key: 'boxes', unit: 'กล่อง', note: null }, { key: 'loose', unit: 'ซองเศษ', note: null }];
    case 'container':
      return [{ key: 'strips', unit: 'ขวด', note: 'ที่ยังไม่เปิด' }, { key: 'loose', unit: 'มล.', note: 'ที่เหลือในขวดที่เปิดแล้ว' }];
    case 'tube':
      return [{ key: 'total', unit: 'หลอด', note: 'จำนวนทั้งหมดที่มี (รวมอันที่เปิดใช้อยู่)' }];
    case 'loose':
      return [{ key: 'loose', unit: kind === 'sachet' ? 'ซอง' : kind === 'other' ? 'ชิ้น' : small, note: null }];
    case 'none':
      return [];
  }
}

/** For a medicine that already exists: how its stock is asked, from its own pack (the pack is never changed). */
export function buyOfPack(kind: MedKind, pack: Pack): BuyAs {
  switch (pack.type) {
    case 'strip':
      return 'strip';
    case 'box':
      return 'box';
    case 'bottle':
      return 'bottle';
    case 'sachetBox':
      return 'sachetBox';
    case 'container':
      return kind === 'liquid' ? 'container' : 'tube';
    case 'none':
      return isTubeKind(kind) ? 'tube' : 'loose';
  }
}

/** '1 กล่อง = 3 แผง = 30 เม็ด'; null when the pack has no parts. */
export function packLine(kind: MedKind, pack: Pack): string | null {
  const small = SMALL_UNIT[kind];
  switch (pack.type) {
    case 'strip':
      return `1 แผง = ${pack.perStrip} ${small}`;
    case 'box':
      return `1 กล่อง = ${pack.strips} แผง = ${pack.strips * pack.perStrip} ${small}`;
    case 'bottle':
      return `1 ขวด = ${pack.perBottle} ${small}`;
    case 'sachetBox':
      return `1 กล่อง = ${pack.sachets} ซอง`;
    case 'container':
      return `1 ${kind === 'cream' ? 'หลอด' : 'ขวด'} = ${formatAmount(pack.amount)} ${pack.unit === 'g' ? 'กรัม' : 'มล.'}`;
    case 'none':
      return null;
  }
}

export interface Missing {
  key: SizeKey;
  label: string;
}

export interface StockPlan {
  pack: Pack;
  /** null = not counted (every box empty, or "ไม่นับสต็อก"). `countedOn` is filled with the date given. */
  stock: Stock | null;
  /** Required pack boxes that are empty or 0 / not a whole number. */
  missing: Missing[];
  /** A text in a count box that is not allowed (null = fine). */
  countProblem: string | null;
  /** The sentence above the save button when something is missing; null = ready. */
  blocker: string | null;
  packLine: string | null;
  /** Total in the small unit (pills, sachets, ml); null for tubes, not counted, or while something is missing. */
  total: number | null;
}

const posIntOf = (n: Num): number | null => (n.kind === 'ok' && Number.isInteger(n.value) && n.value > 0 ? n.value : null);

/** Turns the stock part of the form into a Pack and a Stock (table C). */
export function planStock(kind: MedKind, d: StockDraft, today: IsoDate): StockPlan {
  const buy = d.buy;
  const none: StockPlan = { pack: { type: 'none' }, stock: null, missing: [], countProblem: null, blocker: null, packLine: null, total: null };
  if (buy === 'none') return none;

  // ----- pack
  const missing: Missing[] = [];
  const need = (key: SizeKey, label: string): number | null => {
    const v = posIntOf(parseNum(d.size[key]));
    if (v === null) missing.push({ key, label });
    return v;
  };
  let pack: Pack = { type: 'none' };
  if (buy === 'strip') {
    const per = need('perStrip', sizeFields(kind, buy)[0]?.label ?? '');
    if (per !== null) pack = { type: 'strip', perStrip: per };
  } else if (buy === 'box') {
    const f = sizeFields(kind, buy);
    const strips = need('stripsPerBox', f[0]?.label ?? '');
    const per = need('perStrip', f[1]?.label ?? '');
    if (strips !== null && per !== null) pack = { type: 'box', strips, perStrip: per };
  } else if (buy === 'bottle' && (kind === 'tablet' || kind === 'capsule')) {
    const per = need('perBottle', sizeFields(kind, buy)[0]?.label ?? '');
    if (per !== null) pack = { type: 'bottle', perBottle: per };
  } else if (buy === 'sachetBox') {
    const per = need('sachetsPerBox', sizeFields(kind, buy)[0]?.label ?? '');
    if (per !== null) pack = { type: 'sachetBox', sachets: per };
  } else if (buy === 'container') {
    const a = parseNum(d.size.amount);
    if (a.kind === 'ok' && a.value > 0) pack = { type: 'container', amount: a.value, unit: 'ml' };
    else missing.push({ key: 'amount', label: 'ปริมาณต่อขวด' });
  } else if (buy === 'tube' || buy === 'bottle') {
    // cream / drops: the amount is optional; empty = no pack
    const a = parseNum(d.size.amount);
    if (a.kind === 'ok' && a.value > 0) pack = { type: 'container', amount: a.value, unit: kind === 'cream' ? 'g' : 'ml' };
    else if (a.kind !== 'empty') missing.push({ key: 'amount', label: sizeFields(kind, buy)[0]?.label ?? 'ปริมาณ' });
  }

  // ----- stock
  const fields = countFields(kind, buy);
  const nums = fields.map((f) => ({ f, n: parseNum(d.counts[f.key]) }));
  const typed = nums.some((x) => x.n.kind !== 'empty');
  let countProblem: string | null = null;
  const value = (key: CountKey): number => {
    const x = nums.find((y) => y.f.key === key);
    return x && x.n.kind === 'ok' ? x.n.value : 0;
  };
  for (const { f, n } of nums) {
    if (n.kind === 'bad') countProblem = 'ใส่ได้เฉพาะตัวเลข';
    else if (n.kind === 'ok') {
      const half = f.key === 'loose' && (kind === 'tablet' || kind === 'capsule') && (buy === 'strip' || buy === 'box' || buy === 'bottle');
      const decimal = f.key === 'loose' && kind === 'liquid';
      if (!decimal && !(half ? Number.isInteger(n.value * 2) : Number.isInteger(n.value))) {
        countProblem = half ? 'เศษของเม็ดใส่ได้ทีละครึ่งเม็ด เช่น 0.5' : 'ใส่ได้เฉพาะจำนวนเต็ม';
      }
    }
  }

  let stock: Stock | null = null;
  let total: number | null = null;
  if (typed && countProblem === null) {
    if (buy === 'tube' || (buy === 'bottle' && isTubeKind(kind))) {
      const n = value('total');
      stock = { kind: 'tubes', opened: n >= 1, spare: Math.max(n - 1, 0) };
    } else if (buy === 'container') {
      const per = pack.type === 'container' ? pack.amount : 0;
      const ml = value('strips') * per + value('loose');
      stock = { kind: 'volume', ml, countedOn: today };
      if (pack.type === 'container') total = ml;
    } else if (buy === 'loose' && kind === 'liquid') {
      stock = { kind: 'volume', ml: value('loose'), countedOn: today };
      total = value('loose');
    } else {
      const strips = buy === 'box' ? value('boxes') * (pack.type === 'box' ? pack.strips : 0) + value('strips') : buy === 'sachetBox' ? value('boxes') : buy === 'strip' || buy === 'bottle' ? value('strips') : 0;
      stock = { kind: 'count', strips, loose: value('loose'), countedOn: today };
      const per = unitsPerStrip(pack);
      if (per !== null) total = strips * per + value('loose');
      else if (strips === 0) total = value('loose');
    }
  }
  // a stock with strips needs the pack to be complete; the blocker already says so
  if (missing.length > 0) total = null;

  const first = missing[0];
  const blocker = first ? `ต้องกรอก “${first.label}” ก่อนถึงจะบันทึกได้ แอพไม่เดาตัวเลขให้` : countProblem;
  return { pack, stock, missing, countProblem, blocker, packLine: missing.length === 0 ? packLine(kind, pack) : null, total };
}

// ---------- the schedule ----------

export interface DoseRules {
  step: number;
  min: number;
  max: number;
  unit: string;
  hint: string; // 'เพิ่ม/ลดทีละครึ่งเม็ด'
}

/** Dose size by kind. null = cream / drops (no dose size; reminders only). */
export function doseRules(kind: MedKind): DoseRules | null {
  switch (kind) {
    case 'tablet':
      return { step: 0.5, min: 0.5, max: 4, unit: 'เม็ด', hint: 'เพิ่ม/ลดทีละครึ่งเม็ด' };
    case 'capsule':
      return { step: 0.5, min: 0.5, max: 4, unit: 'แคปซูล', hint: 'เพิ่ม/ลดทีละครึ่งแคปซูล' };
    case 'other':
      return { step: 0.5, min: 0.5, max: 4, unit: 'หน่วย', hint: 'เพิ่ม/ลดทีละครึ่งหน่วย' };
    case 'sachet':
      return { step: 1, min: 1, max: 4, unit: 'ซอง', hint: 'เพิ่ม/ลดทีละ 1 ซอง' };
    case 'liquid':
      return { step: 2.5, min: 2.5, max: LIQUID_MAX_ML, unit: 'มล.', hint: 'กดทีละ 2.5 มล.' };
    case 'cream':
    case 'drops':
      return null;
  }
}

export const defaultAmount = (kind: MedKind): number => (kind === 'liquid' ? 5 : (doseRules(kind)?.min ?? 1) < 1 ? 1 : (doseRules(kind)?.min ?? 1));

/** One press of − or +: one step, never below the minimum or above the maximum. */
export function stepAmount(kind: MedKind, current: number, dir: 1 | -1): number {
  const r = doseRules(kind);
  if (!r) return current;
  const next = Math.round((current + dir * r.step) * 100) / 100;
  return Math.min(r.max, Math.max(r.min, next));
}

/** The amount as text ('½ เม็ด', '7.5 มล.'). */
export function amountText(kind: MedKind, amount: number): string {
  const r = doseRules(kind);
  return `${formatAmount(amount)} ${r?.unit ?? ''}`.trim();
}

export const QUICK_ML = [
  { label: '1 ช้อนชา = 5 มล.', ml: 5 },
  { label: '1 ช้อนโต๊ะ = 15 มล.', ml: 15 },
] as const;

export type FreqKind = 'daily' | 'alt' | 'weekdays';
export const EVERY_HOURS = [4, 6, 8, 12, 24] as const;
export type EveryHours = (typeof EVERY_HOURS)[number];
/** Chips of the weekday choice, Monday first; `value` follows the data (0 = Sunday). */
export const WEEKDAY_CHIPS: readonly { value: number; label: string }[] = [
  { value: 1, label: 'จ' },
  { value: 2, label: 'อ' },
  { value: 3, label: 'พ' },
  { value: 4, label: 'พฤ' },
  { value: 5, label: 'ศ' },
  { value: 6, label: 'ส' },
  { value: 0, label: 'อา' },
];

export interface SlotDraft {
  meal: Meal;
  amount: number;
}
export interface ScheduleDraft {
  mode: 'meal' | 'interval';
  periods: Period[]; // chosen ones, at least 1
  slots: Record<Period, SlotDraft>;
  freq: FreqKind;
  weekdays: number[];
  everyHours: EveryHours;
  firstTime: string;
  amount: number; // interval dose
  course: 'ongoing' | 'days';
  courseDays: string;
}

export function emptyScheduleDraft(kind: MedKind): ScheduleDraft {
  const a = defaultAmount(kind);
  const slot: SlotDraft = { meal: 'after', amount: a };
  return {
    mode: 'meal',
    periods: ['morning'],
    slots: { morning: { ...slot }, noon: { ...slot }, evening: { ...slot }, bedtime: { ...slot } },
    freq: 'daily',
    weekdays: [],
    everyHours: 12,
    firstTime: '08:00',
    amount: a,
    course: 'ongoing',
    courseDays: '',
  };
}

/** Why the schedule part cannot go on (null = fine). */
export function scheduleBlocker(d: ScheduleDraft): string | null {
  if (d.mode === 'meal') {
    if (d.periods.length === 0) return 'เลือกอย่างน้อย 1 ช่วงเวลา';
    if (d.freq === 'weekdays' && d.weekdays.length === 0) return 'เลือกอย่างน้อย 1 วัน';
    return null;
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.firstTime)) return 'ใส่เวลาครั้งแรกให้ถูกต้อง';
  if (d.course === 'days') {
    const n = parseNum(d.courseDays);
    if (n.kind !== 'ok' || !Number.isInteger(n.value) || n.value < 1 || n.value > COURSE_MAX_DAYS) return `ใส่จำนวนวันที่กิน 1 ถึง ${COURSE_MAX_DAYS} วัน`;
  }
  return null;
}

export type ScheduleResult = { ok: true; schedule: Schedule } | { ok: false; error: string };

/** The Schedule of the data. Cream / drops keep the stand-in dose 1 and 'after' (they have no dose size). */
export function buildSchedule(kind: MedKind, d: ScheduleDraft, today: IsoDate): ScheduleResult {
  const blocker = scheduleBlocker(d);
  if (blocker) return { ok: false, error: blocker };
  const tube = isTubeKind(kind);
  const amountOf = (n: number): number => (tube ? 1 : n);
  if (d.mode === 'interval') {
    return {
      ok: true,
      schedule: {
        kind: 'interval',
        everyHours: d.everyHours,
        firstTime: d.firstTime,
        pills: amountOf(d.amount),
        course: d.course === 'days' ? { kind: 'days', days: Number(d.courseDays), startDate: today } : { kind: 'ongoing' },
      },
    };
  }
  const slotOf = (p: Period): { pills: number; meal: Meal } => ({ pills: amountOf(d.slots[p].amount), meal: tube ? 'after' : d.slots[p].meal });
  const slots: Extract<Schedule, { kind: 'meal' }>['slots'] = {};
  if (d.periods.includes('morning')) slots.morning = slotOf('morning');
  if (d.periods.includes('noon')) slots.noon = slotOf('noon');
  if (d.periods.includes('evening')) slots.evening = slotOf('evening');
  if (d.periods.includes('bedtime')) slots.bedtime = { pills: amountOf(d.slots.bedtime.amount) }; // bedtime has no meal
  const days: Extract<Schedule, { kind: 'meal' }>['days'] =
    d.freq === 'daily' ? { kind: 'daily' } : d.freq === 'alt' ? { kind: 'alt', anchor: today } : { kind: 'weekdays', days: [...d.weekdays].sort((a, b) => a - b) };
  return { ok: true, schedule: { kind: 'meal', slots, days } };
}

/** A liquid dose over 30 ml: the screen shows a yellow box, and a confirm sheet when saving. */
export function isBigDose(kind: MedKind, amount: number): boolean {
  return kind === 'liquid' && amount > LIQUID_CONFIRM_ML;
}
export function hasBigDose(kind: MedKind, d: ScheduleDraft): boolean {
  if (kind !== 'liquid') return false;
  return d.mode === 'interval' ? isBigDose(kind, d.amount) : d.periods.some((p) => isBigDose(kind, d.slots[p].amount));
}

/** One line under the schedule: 'เช้า/เย็น · หลังอาหาร · ครั้งละ 1 เม็ด · ทุกวัน'. Periods, never clock times. */
export function scheduleSummary(kind: MedKind, d: ScheduleDraft): string {
  const rules = doseRules(kind);
  const parts: string[] = [];
  if (d.mode === 'interval') {
    parts.push(`ทุก ${d.everyHours} ชั่วโมง`);
    if (rules) parts.push(`ครั้งละ ${amountText(kind, d.amount)}`);
    parts.push(d.course === 'days' && d.courseDays.trim() !== '' ? `กิน ${d.courseDays.trim()} วัน` : 'กินต่อเนื่อง');
    return parts.join(' · ');
  }
  const chosen = PERIODS.filter((p) => d.periods.includes(p));
  parts.push(chosen.map((p) => PERIOD_LABEL[p]).join('/'));
  if (!isTubeKind(kind)) {
    const meals = [...new Set(chosen.filter((p) => p !== 'bedtime').map((p) => d.slots[p].meal))];
    if (meals.length === 1 && meals[0]) parts.push(MEAL_LABEL[meals[0]]);
    else if (meals.length > 1) parts.push('มื้อต่างกันตามช่วง');
  }
  if (rules) {
    const amounts = [...new Set(chosen.map((p) => d.slots[p].amount))];
    parts.push(amounts.length === 1 && amounts[0] !== undefined ? `ครั้งละ ${amountText(kind, amounts[0])}` : 'ขนาดต่างกันตามช่วง');
  }
  parts.push(d.freq === 'daily' ? 'ทุกวัน' : d.freq === 'alt' ? 'วันเว้นวัน' : WEEKDAY_CHIPS.filter((w) => d.weekdays.includes(w.value)).map((w) => w.label).join(' '));
  return parts.join(' · ');
}

// ---------- the drafts and the two add functions ----------

export interface PersonalDraft {
  name: string;
  kind: MedKind;
  strength: StrengthDraft;
  personId: string | null;
  /** Set = "เพิ่มให้ … ด้วย": that Medication is used as it is (pack, kind and strength are not changed). */
  reuseMedicationId: string | null;
  schedule: ScheduleDraft;
  stock: StockDraft;
  expiry: string; // '' or 'YYYY-MM-DD'
}

export interface HouseDraft {
  name: string;
  kind: MedKind;
  strength: StrengthDraft;
  stock: StockDraft;
  expiry: string;
}

export function emptyPersonalDraft(): PersonalDraft {
  return {
    name: '',
    kind: 'tablet',
    strength: emptyStrength('tablet'),
    personId: null,
    reuseMedicationId: null,
    schedule: emptyScheduleDraft('tablet'),
    stock: emptyStockDraft('tablet'),
    expiry: '',
  };
}

export type AddPersonalResult = { ok: true; root: Root; assignmentId: string; medicationId: string } | { ok: false; error: string };
export type AddHouseResult = { ok: true; root: Root; item: HouseItem } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function nameProblem(name: string): string | null {
  const t = name.trim();
  if ([...t].length < NAME_MIN) return `ชื่อยาต้องมีอย่างน้อย ${NAME_MIN} ตัวอักษร`;
  if ([...t].length > NAME_MAX) return `ชื่อยายาวเกิน ${NAME_MAX} ตัวอักษร`;
  return null;
}

const validDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Adds a personal medicine to a member: a Medication (new, or `reuseMedicationId`) + an Assignment + one `start` event. */
export function addPersonalMedication(
  root: Root,
  draft: PersonalDraft,
  today: IsoDate,
  nowIso: string,
  newId: () => string = defaultNewId,
): AddPersonalResult {
  const person = draft.personId ? active(root.persons).find((p) => p.id === draft.personId) : undefined;
  if (!person) return fail('เลือกว่ายานี้ของใครก่อน');

  let medication: Medication | undefined;
  let medications = root.medications;
  let stock: Stock | null;
  if (draft.reuseMedicationId !== null) {
    // "เพิ่มให้ … ด้วย": the existing Medication is used as it is; its own pack reads the count boxes
    medication = root.medications.find((m) => m.id === draft.reuseMedicationId);
    if (!medication) return fail('ไม่พบยานี้ในบ้าน');
    const reused = medication;
    if (root.assignments.some((a) => a.medicationId === reused.id && a.personId === person.id)) return fail(`${person.name} ใช้ยานี้อยู่แล้ว`);
    const own = stockWithPack(reused.kind, reused.pack, draft.stock, today);
    if (!own.ok) return fail(own.error);
    stock = own.stock;
  } else {
    const problem = nameProblem(draft.name);
    if (problem) return fail(problem);
    const plan = planStock(draft.kind, draft.stock, today);
    if (plan.blocker) return fail(plan.blocker);
    const s = strengthOf(draft.strength);
    if (!s.ok) return fail('ความแรงต้องเป็นตัวเลขมากกว่า 0');
    medication = { id: newId(), name: draft.name.trim(), kind: draft.kind, ...(s.strength ? { strength: s.strength } : {}), pack: plan.pack };
    medications = [...root.medications, medication];
    stock = plan.stock;
  }
  return finishPersonal(root, medications, medication, person, draft, stock, today, nowIso, newId);
}

/** The stock of a medicine whose pack is already known: the count boxes are read with that pack. */
export function stockWithPack(kind: MedKind, pack: Pack, d: StockDraft, today: IsoDate): { ok: true; stock: Stock | null } | { ok: false; error: string } {
  const size: StockDraft['size'] = { perStrip: '', stripsPerBox: '', perBottle: '', sachetsPerBox: '', amount: '' };
  switch (pack.type) {
    case 'strip':
      size.perStrip = String(pack.perStrip);
      break;
    case 'box':
      size.perStrip = String(pack.perStrip);
      size.stripsPerBox = String(pack.strips);
      break;
    case 'bottle':
      size.perBottle = String(pack.perBottle);
      break;
    case 'sachetBox':
      size.sachetsPerBox = String(pack.sachets);
      break;
    case 'container':
      size.amount = String(pack.amount);
      break;
    case 'none':
      break;
  }
  const plan = planStock(kind, { buy: buyOfPack(kind, pack), size, counts: d.counts }, today);
  return plan.blocker ? { ok: false, error: plan.blocker } : { ok: true, stock: plan.stock };
}

function finishPersonal(
  root: Root,
  medications: Medication[],
  medication: Medication,
  person: Person,
  draft: PersonalDraft,
  stock: Stock | null,
  today: IsoDate,
  nowIso: string,
  newId: () => string,
): AddPersonalResult {
  const built = buildSchedule(medication.kind, draft.schedule, today);
  if (!built.ok) return fail(built.error);
  if (draft.expiry !== '' && !validDate(draft.expiry)) return fail('วันหมดอายุไม่ถูกต้อง');
  const assignment: Assignment = {
    id: newId(),
    medicationId: medication.id,
    personId: person.id,
    schedule: built.schedule,
    stock,
    ...(draft.expiry !== '' ? { expiry: draft.expiry } : {}),
    status: 'active',
    createdAt: nowIso,
  };
  const start: MedEvent = { id: newId(), assignmentId: assignment.id, type: 'start', effectiveOn: today, at: nowIso, to: { schedule: built.schedule } };
  const next: Root = { ...root, medications, assignments: [...root.assignments, assignment], events: [...root.events, start] };
  if (!rootSchema.safeParse(next).success) return fail(SAVE_FAILED_TEXT);
  return { ok: true, root: next, assignmentId: assignment.id, medicationId: medication.id };
}

/** The unit written on a house item's quantity, by kind (and by the choice for cream / drops). */
export function houseUnit(kind: MedKind, buy: BuyAs): string {
  if (isTubeKind(kind)) return buy === 'bottle' || kind === 'drops' ? 'ขวด' : 'หลอด';
  return SMALL_UNIT[kind];
}

/** Adds a house medicine: name, kind, strength, a total in the smallest unit (or none), expiry. No dose, no low-stock mark. */
export function addHouseItem(root: Root, draft: HouseDraft, today: IsoDate, newId: () => string = defaultNewId): AddHouseResult {
  const problem = nameProblem(draft.name);
  if (problem) return fail(problem);
  const s = strengthOf(draft.strength);
  if (!s.ok) return fail('ความแรงต้องเป็นตัวเลขมากกว่า 0');
  if (draft.expiry !== '' && !validDate(draft.expiry)) return fail('วันหมดอายุไม่ถูกต้อง');
  const plan = planStock(draft.kind, draft.stock, today);
  if (plan.blocker) return fail(plan.blocker);
  const qty = ((): number | null => {
    const st = plan.stock;
    if (!st) return null;
    if (st.kind === 'tubes') return (st.opened ? 1 : 0) + st.spare;
    if (st.kind === 'volume') return st.ml;
    const per = unitsPerStrip(plan.pack);
    return st.strips * (per ?? 0) + st.loose;
  })();
  const item: HouseItem = {
    id: newId(),
    name: draft.name.trim(),
    kind: draft.kind,
    ...(s.strength ? { strength: s.strength } : {}),
    ...(qty !== null ? { stock: { qty, unit: houseUnit(draft.kind, draft.stock.buy) } } : {}),
    ...(draft.expiry !== '' ? { expiry: draft.expiry } : {}),
  };
  const next: Root = { ...root, houseItems: [...root.houseItems, item] };
  if (!rootSchema.safeParse(next).success) return fail(SAVE_FAILED_TEXT);
  return { ok: true, root: next, item };
}

// ---------- texts for the screen ----------

/** 'พอใช้ประมาณ …' for a not yet saved medicine; uses daysLeft + formatDaysLeft + unitFor (never its own formula).
 * null = nothing to say (not counted, tubes). */
export function leftTextFor(kind: MedKind, pack: Pack, schedule: Schedule, stock: Stock | null, today: IsoDate): string | null {
  if (!stock || stock.kind === 'tubes') return null;
  const m: Medication = { id: 'tmp-m', name: 'tmp', kind, pack };
  const a: Assignment = { id: 'tmp-a', medicationId: 'tmp-m', personId: 'tmp-p', schedule, stock, status: 'active', createdAt: `${today}T00:00:00+07:00` };
  return formatDaysLeft(daysLeft(a, m, today, []), unitFor(schedule));
}

export interface UserCard {
  personId: string;
  name: string;
  avatar: Person['avatar'];
  status: 'active' | 'stopped';
  stockText: string; // 'เหลือ 28 เม็ด' | 'ยังไม่ได้นับ' | 'สำรอง 1 หลอด'
  doseText: string; // 'เช้า · เย็น · 1 เม็ด'
  expiry: string | null;
}

/** What each member who has the medicine already uses (for the "มีในบ้านแล้ว" card). */
export function userCards(root: Root, medicationId: string, today: IsoDate): UserCard[] {
  const m = root.medications.find((x) => x.id === medicationId);
  if (!m) return [];
  return root.assignments.flatMap((a) => {
    const p = active(root.persons).find((x) => x.id === a.personId);
    if (a.medicationId !== medicationId || !p) return [];
    let stockText = 'ยังไม่ได้นับ';
    if (a.stock?.kind === 'tubes') stockText = `สำรอง ${a.stock.spare} ${SMALL_UNIT[m.kind]}`;
    else if (a.stock) {
      const now = a.status === 'active' ? stockNow(a, m, today, root.events) : null;
      stockText = now === null ? 'ยังไม่ได้นับ' : `เหลือ ${formatAmount(now)} ${SMALL_UNIT[m.kind]}`;
    }
    return [{ personId: p.id, name: p.name, avatar: p.avatar, status: a.status, stockText, doseText: doseTextOf(a, m), expiry: a.expiry ?? null }];
  });
}

/** The headline of the "มีในบ้านแล้ว" card: 'Name 500 mg'. */
export const medicationLabel = (m: Medication): string => label(m);
