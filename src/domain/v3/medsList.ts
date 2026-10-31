// The v3 medicine list (M4 PR 5a): turns the data into what the screen shows. Pure. Stock, days left, low stock and
// expiry are NOT calculated here; they come from stock.ts, stockText.ts and calc.ts (same rules as Home).
import { expiryStatus, type IsoDate } from '../calc';
import { MONTHS, PERIODS, PERIOD_LABEL, formatAmount, intervalTimes, periodOfTime, unitWord, type Period } from './home';
import type { Assignment, HouseItem, MedKind, Medication, MedEvent, Person, Root } from './schema';
import { daysLeft, houseStatus, isLowStock, tubeLevel } from './stock';
import { formatDaysLeft, unitFor } from './stockText';

export type MedsTab = 'mine' | 'house';
export type MedsFilter = 'all' | 'low' | 'expiring';
export type EmptyKind = 'no-member' | 'no-meds' | 'no-house' | 'no-match';
export type Tone = 'ok' | 'low' | 'out';

export interface MedsQuery {
  tab: MedsTab;
  filter: MedsFilter;
  query: string;
}

export interface StatusChip {
  tone: Tone;
  label: string;
}

interface RowBase {
  id: string;
  name: string;
  kind: MedKind;
  chip: StatusChip;
  /** Warning line under the name ("ใกล้หมดอายุ 5 พ.ย. 69"); null = nothing to warn about. */
  expiryNote: string | null;
  /** Out or low: counted by the "order" button. (An expired medicine is not counted.) */
  needsOrder: boolean;
}

export interface MedRow extends RowBase {
  periods: Period[];
  doseText: string; // 'เช้า · เย็น · 1 เม็ด'
  leftText: string | null; // 'เหลือ 14 วัน'
}

export interface HouseRow extends RowBase {
  subText: string; // 'เหลือ 2 ซอง'
  rank: 0 | 1 | 2; // 0 = out / expired, 1 = low / expiring, 2 = fine
}

export interface MemberGroup {
  personId: string;
  name: string;
  avatar: Person['avatar'];
  rows: MedRow[];
  orderCount: number;
}

export interface StoppedRow {
  id: string;
  name: string;
  subText: string; // 'คุณพ่อ · หยุดเมื่อ 3 ก.ย. 69'
}

export interface DeletedRow {
  id: string;
  name: string;
  subText: string; // 'ลบเมื่อ 8 ต.ค. 69'
}

export interface MedsListModel {
  tab: MedsTab;
  counts: { mine: number; house: number };
  filtering: boolean;
  empty: EmptyKind | null;
  groups: MemberGroup[];
  houseRows: HouseRow[];
  houseOrderCount: number;
  stopped: StoppedRow[];
  deleted: DeletedRow[];
  showFab: boolean;
}

/** '2026-11-05' -> '5 พ.ย. 69' */
export function shortThaiDate(iso: string): string {
  const [y = 0, m = 1, d = 1] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1] ?? ''} ${String(y + 543).slice(-2)}`;
}

/** Name with the strength next to it; thousands get a comma ('VitaminD 1,000 IU'). */
export function label(m: Medication): string {
  if (!m.strength) return m.name;
  const { value, unit } = m.strength;
  const v = value.toLocaleString('en-US');
  return `${m.name} ${v}${unit === '%' ? '%' : ` ${unit}`}`;
}

const CHIP_OK: StatusChip = { tone: 'ok', label: 'ปกติ' };

function expiryNoteOf(expiry: IsoDate | undefined, today: IsoDate, warnDays: number): { note: string | null; expired: boolean } {
  const e = expiryStatus(expiry, today, warnDays);
  if (e.status === 'expired' && expiry) return { note: `หมดอายุ ${shortThaiDate(expiry)}`, expired: true };
  if (e.status === 'soon' && expiry) return { note: `ใกล้หมดอายุ ${shortThaiDate(expiry)}`, expired: false };
  return { note: null, expired: false };
}

function periodsOf(a: Assignment): Period[] {
  const s = a.schedule;
  if (s.kind === 'interval') {
    const set = new Set(intervalTimes(s.everyHours, s.firstTime).map(periodOfTime));
    return PERIODS.filter((p) => set.has(p));
  }
  return PERIODS.filter((p) => s.slots[p] !== undefined);
}

function doseTextOf(a: Assignment, m: Medication): string {
  const unit = unitWord(m);
  const s = a.schedule;
  if (s.kind === 'interval') return `ทุก ${s.everyHours} ชั่วโมง · ${formatAmount(s.pills)} ${unit}`;
  const slots = PERIODS.flatMap((p) => {
    const slot = s.slots[p];
    return slot ? [{ p, pills: slot.pills }] : [];
  });
  if (slots.every((x) => x.pills === slots[0]?.pills)) {
    return `${slots.map((x) => PERIOD_LABEL[x.p]).join(' · ')} · ${formatAmount(slots[0]?.pills ?? 0)} ${unit}`;
  }
  return slots.map((x) => `${PERIOD_LABEL[x.p]} ${formatAmount(x.pills)} ${unit}`).join(' · ');
}

function medRow(a: Assignment, m: Medication, root: Root, today: IsoDate): MedRow {
  const d = daysLeft(a, m, today, root.events);
  const { note, expired } = expiryNoteOf(a.expiry, today, root.settings.expiryWarnDays);
  // creams / drops: the owner's rule from `tubeLevel` (same as the detail page); everything else: days left
  const level = d.status === 'tubes' ? tubeLevel(d) : null;
  const out = level === 'out' || (d.status === 'ok' && d.days === 0);
  const low = level === 'low' || isLowStock(a, m, today, root.settings.lowStockDays, root.events);
  const chip: StatusChip = expired
    ? { tone: 'out', label: 'หมดอายุแล้ว' }
    : out
      ? { tone: 'out', label: 'หมด' }
      : low
        ? { tone: 'low', label: 'ใกล้หมด' }
        : CHIP_OK;
  let leftText: string | null;
  if (d.status === 'tubes') leftText = `สำรอง ${d.spare} ${m.kind === 'drops' ? 'ขวด' : 'หลอด'}`;
  else if (d.status === 'ok' && d.days > 0) leftText = `เหลือ ${formatDaysLeft(d, unitFor(a.schedule))}`;
  else leftText = formatDaysLeft(d, unitFor(a.schedule));
  return {
    id: a.id,
    name: label(m),
    kind: m.kind,
    chip,
    expiryNote: note,
    needsOrder: !expired && (out || low),
    periods: periodsOf(a),
    doseText: doseTextOf(a, m),
    leftText,
  };
}

function houseRow(h: HouseItem, root: Root, today: IsoDate): HouseRow {
  const kind: MedKind = h.kind ?? 'other';
  const { note, expired } = expiryNoteOf(h.expiry, today, root.settings.expiryWarnDays);
  const status = houseStatus(h);
  const soon = note !== null && !expired;
  let chip: StatusChip;
  let rank: 0 | 1 | 2;
  if (expired) [chip, rank] = [{ tone: 'out', label: 'หมดอายุแล้ว' }, 0];
  else if (status === 'out') [chip, rank] = [{ tone: 'out', label: 'หมดแล้ว' }, 0];
  else if (status === 'low') [chip, rank] = [{ tone: 'low', label: 'ใกล้หมด' }, 1];
  else if (soon) [chip, rank] = [{ tone: 'low', label: 'ใกล้หมดอายุ' }, 1];
  else [chip, rank] = [CHIP_OK, 2];
  let subText: string;
  if (!h.stock) subText = 'ไม่นับจำนวน';
  else if (status === 'out') subText = 'ไม่มีในบ้าน';
  else if (kind === 'cream' || kind === 'drops') subText = `สำรอง ${h.stock.qty} ${h.stock.unit}`;
  else subText = `เหลือ ${h.stock.qty} ${h.stock.unit}`;
  return {
    id: h.id,
    name: h.name,
    kind,
    chip,
    expiryNote: note,
    needsOrder: chip.label === 'หมดแล้ว' || chip.label === 'ใกล้หมด',
    subText,
    rank,
  };
}

const matches = (name: string, q: string): boolean => name.toLowerCase().includes(q);
const LOW_LABELS: readonly string[] = ['หมด', 'หมดแล้ว', 'ใกล้หมด'];
const passes = (row: RowBase, filter: MedsFilter): boolean =>
  filter === 'all' ? true : filter === 'low' ? LOW_LABELS.includes(row.chip.label) : row.expiryNote !== null;

function stopDate(events: readonly MedEvent[], assignmentId: string): IsoDate | null {
  const stops = events.filter((e) => e.assignmentId === assignmentId && e.type === 'stop').map((e) => e.effectiveOn);
  return stops.length === 0 ? null : stops.sort().at(-1) ?? null;
}

export function buildMedsList(root: Root, today: IsoDate, q: MedsQuery): MedsListModel {
  const needle = q.query.trim().toLowerCase();
  const filtering = q.filter !== 'all' || needle !== '';
  const people = root.persons.filter((p) => p.removedAt === undefined);
  const medOf = (a: Assignment): Medication | undefined => root.medications.find((m) => m.id === a.medicationId);

  // ----- own medicines
  const mineAll = people.map((p) => ({
    person: p,
    rows: root.assignments.flatMap((a) => {
      const m = medOf(a);
      return a.personId === p.id && a.status === 'active' && m ? [medRow(a, m, root, today)] : [];
    }),
  }));
  const mineCount = mineAll.reduce((n, g) => n + g.rows.length, 0);
  const groups: MemberGroup[] = mineAll
    .map(({ person, rows }) => {
      const shown = rows.filter((r) => passes(r, q.filter) && matches(r.name, needle));
      return { personId: person.id, name: person.name, avatar: person.avatar, rows: shown, orderCount: shown.filter((r) => r.needsOrder).length };
    })
    .filter((g) => g.rows.length > 0);

  const stopped: StoppedRow[] = root.assignments
    .flatMap((a) => {
      const m = medOf(a);
      const person = people.find((p) => p.id === a.personId);
      if (a.status !== 'stopped' || !m || !person) return [];
      const date = stopDate(root.events, a.id);
      return [{ date: date ?? '', row: { id: a.id, name: label(m), subText: `${person.name} · ${date ? `หยุดเมื่อ ${shortThaiDate(date)}` : 'หยุดแล้ว'}` } }];
    })
    .sort((x, y) => y.date.localeCompare(x.date))
    .map((x) => x.row);

  // ----- house medicines
  const houseAll = root.houseItems.filter((h) => h.removedAt === undefined).map((h) => houseRow(h, root, today));
  const houseRows = houseAll
    .filter((r) => passes(r, q.filter) && matches(r.name, needle))
    .map((r, i) => ({ r, i }))
    .sort((x, y) => x.r.rank - y.r.rank || x.i - y.i) // same rank keeps the saved order
    .map((x) => x.r);
  const deleted: DeletedRow[] = root.houseItems
    .filter((h) => h.removedAt !== undefined)
    .map((h) => ({ at: h.removedAt ?? '', row: { id: h.id, name: h.name, subText: `ลบเมื่อ ${shortThaiDate(h.removedAt ?? '')}` } }))
    .sort((x, y) => y.at.localeCompare(x.at))
    .map((x) => x.row);

  let empty: EmptyKind | null = null;
  if (q.tab === 'mine') {
    if (people.length === 0) empty = 'no-member';
    else if (mineCount === 0) empty = 'no-meds';
    else if (groups.length === 0) empty = 'no-match';
  } else if (houseAll.length === 0) empty = 'no-house';
  else if (houseRows.length === 0) empty = 'no-match';

  return {
    tab: q.tab,
    counts: { mine: mineCount, house: houseAll.length },
    filtering,
    empty,
    groups: q.tab === 'mine' ? groups : [],
    houseRows: q.tab === 'house' ? houseRows : [],
    houseOrderCount: houseRows.filter((r) => r.needsOrder).length,
    stopped: q.tab === 'mine' && !filtering ? stopped : [],
    deleted: q.tab === 'house' && !filtering ? deleted : [],
    showFab: empty === null || empty === 'no-match',
  };
}
