// The order draft screen's rules on the v3 model (M4 PR 11.2). Pure: no storage, no clock (`today` is passed in), no UI.
// The draft lives in the page only; nothing here writes anything. Quantities follow orderLines.ts: `qtyOrdered` is in sell units,
// medicine units = qtyOrdered x perSellUnit.
import type { IsoDate } from '../calc';
import { KIND_LABEL, KIND_ORDER, SMALL_UNIT } from './addMedicine';
import { sellUnitsFor, normalizeName, type DraftLine, type DraftReason, type KnownDraftLine } from './orderLines';
import { label } from './medsList';
import type { Assignment, MedKind, Medication, Root } from './schema';
import { STRENGTH_UNITS } from './schema';
import { daysLeft, houseStatus, tubeLevel } from './stock';

export { KIND_LABEL, KIND_ORDER, STRENGTH_UNITS };

/** The chip that says why a line is on the list (icon + word on the screen, never colour alone). */
export const REASON_LABEL: Record<DraftReason, string> = {
  low: 'ใกล้หมด',
  unknown: 'ไม่ทราบสต็อก',
  typed: 'ยาใหม่ ยังไม่อยู่ในรายการยา',
  manual: 'เลือกเพิ่มเอง',
  repeat: 'สั่งซ้ำ',
};

// ---------- C. the "sell as" choices by kind ----------

/** What a kind can be ordered in (owner's answer). The last unit of tablet / capsule is the pill itself. 'other' has no list: the owner types it. */
export const SELL_UNITS: Record<MedKind, readonly string[]> = {
  tablet: ['กล่อง', 'แผง', 'ขวด', SMALL_UNIT.tablet],
  capsule: ['กล่อง', 'แผง', 'ขวด', SMALL_UNIT.capsule],
  liquid: ['ขวด'],
  cream: ['หลอด'],
  sachet: ['กล่อง', 'ซอง'],
  drops: ['ขวด'],
  other: [],
};

export interface SellUnitChoices {
  /** The pills to choose from. */
  units: readonly string[];
  /** true = the owner types the unit (kind 'other'). */
  custom: boolean;
}

/** The "สั่งเป็น" choices of a kind. `current` (a unit the line already has, e.g. from a remembered price) is kept in the list. */
export function sellUnitChoices(kind: MedKind, current?: string): SellUnitChoices {
  const units = SELL_UNITS[kind];
  const extra = current !== undefined && current.trim() !== '' && kind !== 'other' && !units.includes(current) ? [current] : [];
  return { units: [...units, ...extra], custom: kind === 'other' };
}

/** The word after "ต่อ{หน่วยสั่ง}" for the count in one sell unit (เม็ด, มล., ซอง, ชิ้น ...). */
export const perUnitWord = (kind: MedKind): string => SMALL_UNIT[kind];

/** Is "how many per sell unit" worth asking? Not when the sell unit is itself the smallest unit, and never for cream / drops (counted by the tube). */
export function asksPerSellUnit(kind: MedKind, sellUnit: string): boolean {
  if (kind === 'cream' || kind === 'drops') return false;
  const u = sellUnit.trim();
  return u !== '' && u !== SMALL_UNIT[kind];
}

/** A starting "count per sell unit" read from the medicine's pack, or null when it has to be typed. The owner can change it. */
export function defaultPerSellUnit(m: Pick<Medication, 'kind' | 'pack'>, sellUnit: string): number | null {
  const u = sellUnit.trim();
  if (u === SMALL_UNIT[m.kind]) return 1;
  const p = m.pack;
  switch (m.kind) {
    case 'tablet':
    case 'capsule':
      if (u === 'แผง' && (p.type === 'strip' || p.type === 'box')) return p.perStrip;
      if (u === 'กล่อง' && p.type === 'box') return p.strips * p.perStrip;
      if (u === 'ขวด' && p.type === 'bottle') return p.perBottle;
      return null;
    case 'liquid':
      return u === 'ขวด' && p.type === 'container' && p.unit === 'ml' ? p.amount : null;
    case 'sachet':
      return u === 'กล่อง' && p.type === 'sachetBox' ? p.sachets : null;
    case 'cream':
    case 'drops':
      return 1;
    case 'other':
      return null;
  }
}

// ---------- the quantity of a line, as the screen shows it ----------

export interface QtyText {
  /** The big number: pills (or sachets ...) when they are known, otherwise the number of sell units. */
  big: number;
  bigUnit: string;
  /** "= 2 กล่อง (60 เม็ด)" when the big number is not in sell units, else null. */
  note: string | null;
}

const clean = (n: number): number => Number(n.toFixed(6));

/** How to show a line's quantity. House medicine, liquid, cream and drops show their own sell unit and no note. Pills, sachets and other
 * kinds show the count in the small unit when it is known (n x perSellUnit), with a note that gives the sell units. */
export function qtyText(line: DraftLine, kind: MedKind | null): QtyText {
  const n = line.qtyOrdered;
  const per = line.perSellUnit;
  const own: QtyText = { big: n, bigUnit: line.sellUnit, note: null };
  if (line.source.kind === 'house' || kind === null || kind === 'liquid' || kind === 'cream' || kind === 'drops') return own;
  if (per === undefined || !(per > 0)) return own;
  const base = SMALL_UNIT[kind];
  if (line.sellUnit === base || (per === 1 && line.sellUnit === line.unit)) return own;
  const big = clean(n * per);
  return { big, bigUnit: base, note: `= ${n} ${line.sellUnit} (${big} ${base})` };
}

/** + / − one sell unit, never below 1. A + also ticks the line (the owner wants it); a − keeps the tick as it is. */
export function stepLine<L extends DraftLine>(line: L, delta: 1 | -1): L {
  const qtyOrdered = Math.max(1, Math.round(line.qtyOrdered) + delta);
  return { ...line, qtyOrdered, ticked: delta > 0 ? true : line.ticked };
}

export const hasLine = (lines: readonly DraftLine[], key: string): boolean => lines.some((l) => l.key === key);

// ---------- E. change the sell unit of a medicine of the app ----------

export type UnitChange =
  | { ok: true; line: KnownDraftLine }
  | { ok: false; error: 'house_locked' | 'not_in_app' | 'invalid'; errors: Partial<Record<'sellUnit' | 'perSellUnit', 'invalid_sell_unit' | 'invalid_per_sell_unit'>> };

export const SELL_UNIT_MAX = 20;

/** Change "สั่งเป็น" and "count per sell unit" of one line, for this order only: returns a new line and never touches the root. The amount of
 * medicine stays the same (qty x per before = about the same after, rounded up, at least 1 sell unit). A house medicine is ordered in the unit
 * its stock is counted in, so it is refused; a typed medicine is not a medicine of the app, so it is refused too. */
export function changeSellUnit(line: DraftLine, input: { sellUnit: string; perSellUnit: number }): UnitChange {
  if (line.source.kind === 'house') return { ok: false, error: 'house_locked', errors: {} };
  if (line.source.kind === 'free') return { ok: false, error: 'not_in_app', errors: {} };
  const sellUnit = input.sellUnit.trim();
  const errors: Partial<Record<'sellUnit' | 'perSellUnit', 'invalid_sell_unit' | 'invalid_per_sell_unit'>> = {};
  if (sellUnit === '' || sellUnit.length > SELL_UNIT_MAX) errors.sellUnit = 'invalid_sell_unit';
  if (!(typeof input.perSellUnit === 'number' && Number.isFinite(input.perSellUnit) && input.perSellUnit > 0)) errors.perSellUnit = 'invalid_per_sell_unit';
  if (Object.keys(errors).length > 0) return { ok: false, error: 'invalid', errors };
  const oldPer = line.perSellUnit ?? 1;
  const amount = line.qtyOrdered * oldPer;
  const known = line as KnownDraftLine;
  return { ok: true, line: { ...known, sellUnit, perSellUnit: input.perSellUnit, qtyOrdered: Math.max(sellUnitsFor(amount, input.perSellUnit), 1) } };
}

// ---------- B. the medicines to pick from ----------

export type CandidateRef = { kind: 'med'; medicationId: string } | { kind: 'house'; houseItemId: string };

export interface Candidate {
  /** Same key as the line it would make: 'med:<id>' / 'house:<id>'. */
  key: string;
  ref: CandidateRef;
  name: string;
  kind: MedKind;
  /** "เหลือ 3 วัน · คุณพ่อ", "ไม่ทราบสต็อก · คุณแม่", "สำรอง 2 หลอด · คุณพ่อ, คุณแม่" or "ยาสามัญ · เหลือ 2 ซอง". */
  sub: string;
}

export interface Left {
  rank: number;
  text: string;
}

const NOT_KNOWN = 'ไม่ทราบสต็อก';
const UNKNOWN_RANK = 2_000_000;
const ENOUGH_RANK = 1_000_000;

/** How near to empty one person's stock of a medicine is: lower = sooner. Tubes: out first, then the one in use. */
export function leftOf(a: Assignment, m: Medication, root: Root, today: IsoDate): Left {
  const d = daysLeft(a, m, today, root.events);
  switch (d.status) {
    case 'ok':
      return { rank: d.days, text: `เหลือ ${d.days} วัน` };
    case 'enough':
      return { rank: ENOUGH_RANK, text: 'พอใช้ตลอดคอร์ส' };
    case 'tubes': {
      const level = tubeLevel(d);
      return { rank: level === 'out' ? -2 : level === 'low' ? -1 : ENOUGH_RANK, text: `สำรอง ${d.spare} ${SMALL_UNIT[m.kind]}` };
    }
    case 'unknown':
    case 'error':
      return { rank: UNKNOWN_RANK, text: NOT_KNOWN };
  }
}

/** The medicines the owner can add by hand, nearest to empty first (then by name). One row per medicine however many people use it (the row
 * shows the person who runs out first, and the names of everyone); stopped medicines, people taken out of the house, removed house medicines and
 * house medicines whose stock is not counted (their unit is not known) are left out, and so is every medicine already in the draft
 * (`inDraft` = the line keys). `query` keeps the names that contain it (case and all spaces ignored). */
export function orderCandidates(root: Root, today: IsoDate, inDraft: Iterable<string>, query = ''): Candidate[] {
  const skip = new Set(inDraft);
  const want = normalizeName(query);
  const live = new Map(root.persons.filter((p) => p.removedAt === undefined).map((p) => [p.id, p.name]));
  const rows: (Candidate & { rank: number })[] = [];

  for (const m of root.medications) {
    const key = `med:${m.id}`;
    if (skip.has(key)) continue;
    const users = root.assignments.filter((a) => a.medicationId === m.id && a.status === 'active' && live.has(a.personId));
    const first = users
      .map((a) => leftOf(a, m, root, today))
      .reduce<Left | null>((best, l) => (best === null || l.rank < best.rank ? l : best), null);
    if (first === null) continue;
    const names = [...new Set(users.map((a) => live.get(a.personId) ?? ''))].join(', ');
    rows.push({ key, ref: { kind: 'med', medicationId: m.id }, name: label(m), kind: m.kind, sub: `${first.text} · ${names}`, rank: first.rank });
  }

  for (const h of root.houseItems) {
    const key = `house:${h.id}`;
    if (skip.has(key) || h.removedAt !== undefined || !h.stock) continue;
    const status = houseStatus(h);
    const kind: MedKind = h.kind ?? 'other';
    const text = status === 'out' ? 'ไม่มีในบ้าน' : `${kind === 'cream' || kind === 'drops' ? 'สำรอง' : 'เหลือ'} ${h.stock.qty} ${h.stock.unit}`;
    rows.push({ key, ref: { kind: 'house', houseItemId: h.id }, name: label(h), kind, sub: `ยาสามัญ · ${text}`, rank: status === 'out' ? -2 : status === 'low' ? -1 : ENOUGH_RANK });
  }

  return rows
    .filter((r) => want === '' || normalizeName(r.name).includes(want))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'th'))
    .map(({ rank: _rank, ...c }) => c);
}
