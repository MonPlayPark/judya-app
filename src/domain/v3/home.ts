// Pure logic of the v3 Home screen (M4 PR 4): today's doses per member, things that need care, the greeting, the
// warning banner, the empty states. No UI, no storage, no clock: `today` is always passed in (Thai date).
// Stock and expiry rules are NOT written here; they come from stock.ts, stockText.ts, backup.ts and calc.ts.
import { diffDays, expiryStatus, type IsoDate } from '../calc';
import { backupBanner, bangkokDate } from './backup';
import { dosesOn } from './schedule';
import type { Assignment, HouseItem, Medication, Person, Root, Schedule } from './schema';
import { daysLeft, houseStatus, isLowStock } from './stock';
import { formatDaysLeft, unitFor } from './stockText';

export type Period = 'morning' | 'noon' | 'evening' | 'bedtime';
export type Meal = 'before' | 'with' | 'after';

export const PERIODS: readonly Period[] = ['morning', 'noon', 'evening', 'bedtime'];
export const PERIOD_LABEL: Record<Period, string> = { morning: 'เช้า', noon: 'กลางวัน', evening: 'เย็น', bedtime: 'ก่อนนอน' };
export const MEAL_LABEL: Record<Meal, string> = { before: 'ก่อนอาหาร', with: 'พร้อมอาหาร', after: 'หลังอาหาร' };
const MEAL_RANK: Record<Meal, number> = { before: 0, with: 1, after: 2 };
const INTERVAL_MEAL_RANK = 3; // interval doses come after the meal doses of the same period

/** Days of tick marks kept in prepLog (same rule as v2: today and the 14 days before it). */
export const PREP_KEEP_DAYS = 14;
/** The care card lists at most this many rows; the rest is a count. */
export const CARE_ROWS_SHOWN = 3;

/** Thai calendar date of a moment (Asia/Bangkok). */
export const bangkokToday = (now: Date = new Date()): IsoDate => bangkokDate(now.toISOString());

const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
export const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** '2026-10-22' -> 'พฤหัส 22 ต.ค. 2569' (the board writes the short weekday name). */
export function thaiDateLabel(iso: IsoDate): string {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return `${WEEKDAYS[weekday] ?? ''} ${d} ${MONTHS[m - 1] ?? ''} ${y + 543}`;
}

// ---------- amounts and names ----------

const KIND_UNIT: Record<Medication['kind'], string> = {
  tablet: 'เม็ด',
  capsule: 'แคปซูล',
  liquid: 'มล.',
  cream: 'ครั้ง',
  sachet: 'ซอง',
  drops: 'ครั้ง',
  other: 'หน่วย',
};

/** The word after an amount: the medicine's own `unit` text when it has one, else by kind. */
export const unitWord = (m: Medication): string => m.unit ?? KIND_UNIT[m.kind];

/** 1 -> '1', 0.5 -> '½', 1.5 -> '1½' (doses are whole or half units). */
export function formatAmount(n: number): string {
  const whole = Math.floor(n);
  return n - whole === 0.5 ? `${whole > 0 ? whole : ''}½` : String(n);
}

/** Name with the strength next to it: 'ยาตัวอย่าง A 500 mg', 'ยาตัวอย่าง D 1%'. */
export function medicineLabel(m: Medication): string {
  if (!m.strength) return m.name;
  const { value, unit } = m.strength;
  return `${m.name} ${value}${unit === '%' ? '%' : ` ${unit}`}`;
}

// ---------- today's doses ----------

/** Key of one dose in prepLog: `<assignmentId>:<slot>` for meal doses (morning / noon / evening / bedtime) and
 * `<assignmentId>:<HH:MM>` for interval doses. Same shape as v2 and as the PR 1 fixtures ('a1:morning'). */
export const doseKey = (assignmentId: string, slotOrTime: string): string => `${assignmentId}:${slotOrTime}`;

/** The clock times of an interval schedule inside one day, sorted ('08:00', '16:00', '00:00' -> 00:00 first). */
export function intervalTimes(everyHours: number, firstTime: string): string[] {
  const [h = 0, m = 0] = firstTime.split(':').map(Number);
  const first = h * 60 + m;
  const step = everyHours * 60;
  const minutes: number[] = [];
  for (let t = first; t < first + 24 * 60; t += step) minutes.push(t % (24 * 60));
  return minutes
    .sort((a, b) => a - b)
    .map((t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
}

/** Which of the 4 periods an interval dose is shown under (the screen never shows clock times):
 * 04:00-10:59 เช้า · 11:00-15:59 กลางวัน · 16:00-20:59 เย็น · 21:00-03:59 ก่อนนอน. */
export function periodOfTime(hhmm: string): Period {
  const hour = Number(hhmm.slice(0, 2));
  if (hour >= 4 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'noon';
  if (hour >= 16 && hour < 21) return 'evening';
  return 'bedtime';
}

export interface DoseRow {
  key: string; // key in prepLog
  assignmentId: string;
  personId: string;
  name: string; // medicine name with strength
  period: Period;
  periodLabel: string;
  amountText: string; // '1 เม็ด', '½ เม็ด'
  extra: string | null; // 'หลังอาหาร' | 'ทุก 8 ชั่วโมง' | null (bedtime)
  done: boolean;
}

type SortableRow = DoseRow & { sort: [number, number, string, string] };

/** The rows of one medicine for `today`; none when its day rule / course does not include today (schedule.ts). */
function rowsOfAssignment(a: Assignment, m: Medication, today: IsoDate, done: Record<string, true>): SortableRow[] {
  if (dosesOn(a.schedule, today) === 0) return [];
  const unit = unitWord(m);
  const name = medicineLabel(m);
  const base = { assignmentId: a.id, personId: a.personId, name };
  const schedule: Schedule = a.schedule;
  if (schedule.kind === 'interval') {
    return intervalTimes(schedule.everyHours, schedule.firstTime).map((time): SortableRow => {
      const key = doseKey(a.id, time);
      const period = periodOfTime(time);
      return {
        ...base,
        key,
        period,
        periodLabel: PERIOD_LABEL[period],
        amountText: `${formatAmount(schedule.pills)} ${unit}`,
        extra: `ทุก ${schedule.everyHours} ชั่วโมง`,
        done: done[key] === true,
        sort: [PERIODS.indexOf(period), INTERVAL_MEAL_RANK, time, name],
      };
    });
  }
  const out: SortableRow[] = [];
  for (const period of PERIODS) {
    const slot = schedule.slots[period];
    if (!slot) continue;
    const key = doseKey(a.id, period);
    const meal = 'meal' in slot ? slot.meal : undefined;
    out.push({
      ...base,
      key,
      period,
      periodLabel: PERIOD_LABEL[period],
      amountText: `${formatAmount(slot.pills)} ${unit}`,
      extra: meal ? MEAL_LABEL[meal] : null,
      done: done[key] === true,
      sort: [PERIODS.indexOf(period), meal ? MEAL_RANK[meal] : 0, '', name],
    });
  }
  return out;
}

const activePeople = (root: Root): Person[] => root.persons.filter((p) => p.removedAt === undefined);

/** Every dose to prepare today, for everybody, in time order (period, then before / with / after meal, then interval
 * doses). Left out: members who manage their own medicine (selfManaged), removed members, stopped medicines and
 * medicines not taken today (day rule or finished course). */
export function todayRows(root: Root, today: IsoDate): DoseRow[] {
  const done = root.prepLog[today] ?? {};
  const people = new Map(activePeople(root).map((p) => [p.id, p]));
  const medications = new Map(root.medications.map((m) => [m.id, m]));
  const rows: SortableRow[] = [];
  for (const a of root.assignments) {
    if (a.status !== 'active') continue;
    const person = people.get(a.personId);
    const medication = medications.get(a.medicationId);
    if (!person || person.selfManaged || !medication) continue;
    rows.push(...rowsOfAssignment(a, medication, today, done));
  }
  rows.sort((x, y) => x.sort[0] - y.sort[0] || x.sort[1] - y.sort[1] || x.sort[2].localeCompare(y.sort[2]) || x.sort[3].localeCompare(y.sort[3], 'th'));
  return rows.map(({ sort: _sort, ...row }) => row);
}

/** Ticks or unticks one dose of `today` (a copy of the root). Ticks older than 14 days are dropped (as in v2). */
export function toggleDose(root: Root, today: IsoDate, key: string): Root {
  const day = root.prepLog[today] ?? {};
  const nextDay: Record<string, true> = { ...day };
  if (key in nextDay) delete nextDay[key];
  else nextDay[key] = true;
  const log = { ...root.prepLog };
  if (Object.keys(nextDay).length > 0) log[today] = nextDay;
  else delete log[today];
  const kept = Object.fromEntries(Object.entries(log).filter(([date]) => diffDays(date, today) <= PREP_KEEP_DAYS));
  return { ...root, prepLog: kept };
}

// ---------- members ----------

export interface MemberChip {
  id: string;
  name: string;
  avatar: Person['avatar'];
  selfManaged: boolean;
  count: number; // doses today (0 for a member who manages their own medicine)
  countText: string; // 'N รายการ' | 'จัดยาเอง'
}

export function memberChips(root: Root, rows: readonly DoseRow[]): MemberChip[] {
  return activePeople(root).map((p) => {
    const count = rows.filter((r) => r.personId === p.id).length;
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      selfManaged: p.selfManaged,
      count,
      countText: p.selfManaged ? 'จัดยาเอง' : `${count} รายการ`,
    };
  });
}

/** The member shown first: the first one with doses today, else the first one who does not manage their own
 * medicine, else the first one. null = nobody. */
export function defaultMember(chips: readonly MemberChip[]): string | null {
  return (chips.find((c) => c.count > 0) ?? chips.find((c) => !c.selfManaged) ?? chips[0])?.id ?? null;
}

// ---------- care list ----------

export type CareKind = 'expired' | 'out' | 'low' | 'expiring';
const CARE_RANK: Record<CareKind, number> = { expired: 0, out: 1, low: 2, expiring: 3 };
const CARE_REASON: Record<CareKind, string> = {
  expired: 'หมดอายุแล้ว',
  out: 'หมดแล้ว',
  low: 'ยาใกล้หมด',
  expiring: 'ใกล้หมดอายุ',
};
const CARE_WARNING = (kind: CareKind, n: number): string =>
  ({
    expired: `ยาหมดอายุแล้ว ${n} รายการ`,
    out: `ยาหมดแล้ว ${n} รายการ`,
    low: `ยาใกล้หมด ${n} รายการ`,
    expiring: `ยาใกล้หมดอายุ ${n} รายการ`,
  })[kind];

export const HOUSE_LABEL = 'ยาสามัญ';

export interface CareItem {
  key: string; // 'a:<assignmentId>' | 'h:<houseItemId>'
  kind: CareKind;
  name: string;
  who: string; // member name, or 'ยาสามัญ'
  reason: string; // 'ยาใกล้หมด'
  chip: string; // 'เลิกใช้', '3 วัน', 'หมดแล้ว'
  sortDays: number;
}

const expiryChip = (days: number): string => (days === 0 ? 'วันนี้' : `${days} วัน`);

function careOfAssignment(a: Assignment, root: Root, today: IsoDate): CareItem | null {
  const person = root.persons.find((p) => p.id === a.personId);
  const m = root.medications.find((x) => x.id === a.medicationId);
  if (a.status !== 'active' || !person || person.removedAt !== undefined || !m) return null;
  const base = { key: `a:${a.id}`, name: medicineLabel(m), who: person.name };
  const expiry = expiryStatus(a.expiry, today, root.settings.expiryWarnDays);
  if (expiry.status === 'expired') {
    return { ...base, kind: 'expired', reason: CARE_REASON.expired, chip: 'เลิกใช้', sortDays: a.expiry ? diffDays(today, a.expiry) : 0 };
  }
  if (isLowStock(a, m, today, root.settings.lowStockDays, root.events)) {
    const d = daysLeft(a, m, today, root.events);
    return { ...base, kind: 'low', reason: CARE_REASON.low, chip: formatDaysLeft(d, unitFor(a.schedule)), sortDays: d.status === 'ok' ? d.days : 0 };
  }
  if (expiry.status === 'soon' && expiry.days !== null) {
    return { ...base, kind: 'expiring', reason: CARE_REASON.expiring, chip: expiryChip(expiry.days), sortDays: expiry.days };
  }
  return null;
}

function careOfHouse(h: HouseItem, root: Root, today: IsoDate): CareItem | null {
  if (h.removedAt !== undefined) return null;
  const base = { key: `h:${h.id}`, name: h.name, who: HOUSE_LABEL };
  const expiry = expiryStatus(h.expiry, today, root.settings.expiryWarnDays);
  if (expiry.status === 'expired') {
    return { ...base, kind: 'expired', reason: CARE_REASON.expired, chip: 'เลิกใช้', sortDays: h.expiry ? diffDays(today, h.expiry) : 0 };
  }
  const status = houseStatus(h);
  if (status === 'out') return { ...base, kind: 'out', reason: CARE_REASON.out, chip: 'หมดแล้ว', sortDays: 0 };
  if (status === 'low' && h.stock) {
    return { ...base, kind: 'low', reason: CARE_REASON.low, chip: `เหลือ ${h.stock.qty} ${h.stock.unit}`, sortDays: h.stock.qty };
  }
  if (expiry.status === 'soon' && expiry.days !== null) {
    return { ...base, kind: 'expiring', reason: CARE_REASON.expiring, chip: expiryChip(expiry.days), sortDays: expiry.days };
  }
  return null;
}

/** Medicines that need care, worst first: expired, out, low stock, expiring soon (fewest days first). A medicine is
 * listed once, under its worst problem. Cream / drops are not warned about low stock yet (stock.ts decides).
 * Stopped medicines and removed members are left out. */
export function careItems(root: Root, today: IsoDate): CareItem[] {
  const items: CareItem[] = [];
  for (const a of root.assignments) {
    const item = careOfAssignment(a, root, today);
    if (item) items.push(item);
  }
  for (const h of root.houseItems) {
    const item = careOfHouse(h, root, today);
    if (item) items.push(item);
  }
  return items.sort((x, y) => CARE_RANK[x.kind] - CARE_RANK[y.kind] || x.sortDays - y.sortDays || x.name.localeCompare(y.name, 'th'));
}

// ---------- warnings, greeting, state ----------

export interface Warning {
  kind: CareKind | 'backup';
  text: string;
}

/** All warnings in order: one line per kind of care problem (with the count), then the backup banner from
 * backup.ts. The Home shows the first one and "+N เรื่อง" for the rest. */
export function warnings(root: Root, today: IsoDate, items: readonly CareItem[] = careItems(root, today)): Warning[] {
  const out: Warning[] = [];
  for (const kind of ['expired', 'out', 'low', 'expiring'] as const) {
    const n = items.filter((i) => i.kind === kind).length;
    if (n > 0) out.push({ kind, text: CARE_WARNING(kind, n) });
  }
  const banner = backupBanner(root, today);
  if (banner) out.push({ kind: 'backup', text: banner.text });
  return out;
}

/** S0 = no member yet; S1 = members but no medicine at all; ready = at least one member and one medicine. */
export type HomeState = 'S0' | 'S1' | 'ready';

export function homeState(root: Root): HomeState {
  if (activePeople(root).length === 0) return 'S0';
  return root.assignments.length === 0 ? 'S1' : 'ready';
}

export interface Headline {
  text: string;
  done: boolean; // everything prepared: shown in the success colour
}

export function headline(state: HomeState, rows: readonly DoseRow[]): Headline {
  if (state !== 'ready') return { text: 'มาเริ่มจัดยากันเลย', done: false };
  if (rows.length === 0) return { text: 'วันนี้ไม่มียาที่ต้องจัด', done: false };
  const pending = rows.filter((r) => !r.done).length;
  return pending === 0 ? { text: 'จัดยาครบแล้ววันนี้', done: true } : { text: `วันนี้มี ${pending} รายการที่ต้องจัดยา`, done: false };
}

export interface HomeModel {
  state: HomeState;
  dateText: string;
  headline: Headline;
  warning: Warning | null; // the first warning
  extraWarnings: number; // the "+N เรื่อง"
  members: MemberChip[];
  selectedId: string | null;
  selectedName: string;
  selectedRows: DoseRow[];
  firstMemberName: string | null; // S1: the member that was added
  showMembers: boolean;
  showToday: boolean;
  showTiles: boolean;
  care: CareItem[];
  careShown: CareItem[];
  careMore: number;
}

/** Everything the Home screen shows, for one moment. `selectedId` is the member picked by the user; an unknown or
 * removed id falls back to the default member. */
export function buildHome(root: Root, today: IsoDate, selectedId?: string | null): HomeModel {
  const state = homeState(root);
  const rows = todayRows(root, today);
  const members = memberChips(root, rows);
  const selected = members.find((m) => m.id === selectedId) ?? members.find((m) => m.id === defaultMember(members));
  const care = state === 'ready' ? careItems(root, today) : [];
  const warns = state === 'ready' ? warnings(root, today, care) : [];
  return {
    state,
    dateText: thaiDateLabel(today),
    headline: headline(state, rows),
    warning: warns[0] ?? null,
    extraWarnings: Math.max(warns.length - 1, 0),
    members,
    selectedId: selected?.id ?? null,
    selectedName: selected?.name ?? '',
    selectedRows: selected ? rows.filter((r) => r.personId === selected.id) : [],
    firstMemberName: members[0]?.name ?? null,
    showMembers: state !== 'S0',
    showToday: state === 'ready',
    showTiles: state === 'ready',
    care,
    careShown: care.slice(0, CARE_ROWS_SHOWN),
    careMore: Math.max(care.length - CARE_ROWS_SHOWN, 0),
  };
}
