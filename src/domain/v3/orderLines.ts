// The order list on the v3 model (M4 PR 11.1): the lines suggested for the order, and lines typed by hand. Pure: no storage,
// no clock (`today` is passed in), no UI. Quantities: `need` is in medicine units (pills, ml, tubes); `qtyOrdered` is in sell
// units (e.g. 2 boxes), and medicine units = qtyOrdered x perSellUnit. A line never carries a person's name, only assignment ids.
import type { IsoDate } from '../calc';
import { unitWord } from './home';
import { latestPriceAnyShop } from './prices';
import { MED_KINDS, STRENGTH_UNITS, type Assignment, type HouseItem, type MedKind, type Medication, type OrderShare, type OrderSource, type Root, type Strength } from './schema';
import { houseStatus, isLowStock, stockNow, targetDoses, tubeLevel } from './stock';

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, 'th');

/** Why a line is on the list: 'low' = running low (ticked), 'unknown' = no stock count (shown, not ticked), 'typed' = a new medicine
 * typed by hand, 'manual' = a medicine of the app picked by the owner (M4 PR 11.2). */
export type DraftReason = 'low' | 'unknown' | 'typed' | 'manual';

interface DraftBase {
  /** 'med:<medicationId>' / 'house:<houseItemId>' / 'free:<name without spaces, lower case>' */
  key: string;
  name: string;
  /** Medicine unit (เม็ด, มล., หลอด ...). `need` is in this unit. */
  unit: string;
  /** Medicine units needed (the sum of the shares for a regular medicine). */
  need: number;
  /** What the owner buys: `qtyOrdered` x `sellUnit`, each holding `perSellUnit` medicine units. */
  sellUnit: string;
  qtyOrdered: number;
  reason: DraftReason;
  ticked: boolean;
}

/** A regular or house medicine line: the count per sell unit is always known. */
export interface KnownDraftLine extends DraftBase {
  source: Exclude<OrderSource, { kind: 'free' }>;
  perSellUnit: number;
}

/** A line typed by hand: the count per sell unit is only there when the owner gave it (never filled in for them). */
export interface FreeDraftLine extends DraftBase {
  source: Extract<OrderSource, { kind: 'free' }>;
  perSellUnit?: number;
  /** Kind and strength the owner gave for the new medicine (both optional; also kept in `source`). */
  medKind?: MedKind;
  strength?: Strength;
  /** The owner wants to be asked, after it arrives, whether to add it to the medicine list (kept as the order line's `addToList`). */
  addToList?: boolean;
}

export type DraftLine = KnownDraftLine | FreeDraftLine;

const clean = (n: number): number => Number(n.toFixed(6));
const ceilUnits = (n: number): number => Math.ceil(n - 1e-9);

/** Sell units to buy `need` medicine units with `perSellUnit` in each: rounded up, at least 1 when something is needed, else 0. */
export const sellUnitsFor = (need: number, perSellUnit: number): number => (need <= 0 ? 0 : Math.max(ceilUnits(need / perSellUnit), 1));

/** Without a remembered price: cream / drops start in the tube / bottle (not the dose word 'ครั้ง'), a liquid in a bottle when the pack says how
 * many ml it holds; everything else in the medicine's own unit with 1 in each. (M4 PR 11.2: the 11.1 start used the dose word for cream and drops.) */
function startingUnitOf(root: Root, m: Medication): { sellUnit: string; perSellUnit: number } {
  const p = latestPriceAnyShop(root.prices, { kind: 'med', medicationId: m.id });
  if (p) return { sellUnit: p.sellUnit, perSellUnit: p.perSellUnit ?? 1 };
  if (m.kind === 'cream' || m.kind === 'drops') return { sellUnit: m.kind === 'cream' ? 'หลอด' : 'ขวด', perSellUnit: 1 };
  if (m.kind === 'liquid' && m.pack.type === 'container' && m.pack.unit === 'ml') return { sellUnit: 'ขวด', perSellUnit: m.pack.amount };
  return { sellUnit: unitWord(m), perSellUnit: 1 };
}

export interface Need {
  assignment: Assignment;
  need: number;
  low: boolean;
  unknown: boolean;
}

/** One assignment's need. Tubes (cream / drops, or any stock counted by the tube): 1 tube when level is low or out, 0 when there is a spare
 * (never counted: 1 tube, unknown). Otherwise need = max(target - stock now, 0) over `orderDays`, the whole target when the stock is unknown. */
function needOf(a: Assignment, m: Medication, root: Root, today: IsoDate): Need {
  const { orderDays, lowStockDays } = root.settings;
  const tubes = a.stock?.kind === 'tubes' || (a.stock === null && (m.kind === 'cream' || m.kind === 'drops'));
  if (tubes) {
    if (a.stock?.kind !== 'tubes') return { assignment: a, need: 1, low: false, unknown: true };
    const level = tubeLevel(a.stock);
    return { assignment: a, need: level === 'enough' ? 0 : 1, low: level !== 'enough', unknown: false };
  }
  const target = targetDoses(a, today, orderDays, root.events);
  const have = stockNow(a, m, today, root.events);
  if (have === null) return { assignment: a, need: clean(target), low: false, unknown: true };
  return { assignment: a, need: clean(Math.max(target - have, 0)), low: isLowStock(a, m, today, lowStockDays, root.events), unknown: false };
}

/** The suggested order: regular medicines (by name), then house medicines (by name). One line per medicine, however many people use
 * it; `source.shares` holds each person's part in medicine units (people who need nothing are left out).
 * Listed when any user is low or none has a stock count; ticked only when low and something is needed (unknown stock: shown, not
 * ticked). People who were taken out of the house and stopped medicines are left out. House medicine: only when low or out, 1 sell unit
 * in the unit of its stock, ticked. */
export function buildOrderLines(root: Root, today: IsoDate): KnownDraftLine[] {
  const byMed = needsByMedication(root, today);

  const meds: KnownDraftLine[] = [];
  for (const [medicationId, needs] of byMed) {
    const m = root.medications.find((x) => x.id === medicationId);
    if (!m) continue;
    const anyLow = needs.some((n) => n.low);
    if (!anyLow && !needs.some((n) => n.unknown)) continue;
    meds.push(medLine(root, m, needs, anyLow ? 'low' : 'unknown'));
  }
  meds.sort(byName);

  const house: KnownDraftLine[] = [];
  for (const h of root.houseItems) {
    if (h.removedAt !== undefined || !h.stock) continue;
    const status = houseStatus(h);
    if (status === 'low' || status === 'out') house.push(houseLine(h, h.stock.unit));
  }
  house.sort(byName);

  return [...meds, ...house];
}

/** The needs of every medicine that has an active assignment of a person who is still in the house (stopped medicines and people taken
 * out are left out). */
export function needsByMedication(root: Root, today: IsoDate): Map<string, Need[]> {
  const live = new Set(root.persons.filter((p) => p.removedAt === undefined).map((p) => p.id));
  const byMed = new Map<string, Need[]>();
  for (const a of root.assignments) {
    if (a.status !== 'active' || !live.has(a.personId)) continue;
    const m = root.medications.find((x) => x.id === a.medicationId);
    if (!m) continue;
    byMed.set(m.id, [...(byMed.get(m.id) ?? []), needOf(a, m, root, today)]);
  }
  return byMed;
}

/** The line of one regular medicine: one line however many people use it; the shares are each person's need (people who need nothing
 * are left out). Ticked only when low and something is needed. */
function medLine(root: Root, m: Medication, needs: readonly Need[], reason: 'low' | 'unknown'): KnownDraftLine {
  const shares: OrderShare[] = needs.filter((n) => n.need > 0).map((n) => ({ assignmentId: n.assignment.id, qty: n.need }));
  const need = clean(shares.reduce((sum, s) => sum + s.qty, 0));
  const unit = unitWord(m);
  const { sellUnit, perSellUnit } = startingUnitOf(root, m);
  return {
    key: `med:${m.id}`,
    source: { kind: 'med', medicationId: m.id, shares },
    name: m.name,
    unit,
    need,
    sellUnit,
    perSellUnit,
    qtyOrdered: sellUnitsFor(need, perSellUnit),
    reason,
    ticked: reason === 'low' && need > 0,
  };
}

/** A line for a medicine the owner picked from the app by hand (M4 PR 11.2): reason 'manual', ticked, 1 sell unit to start with, in the
 * same starting unit / tube / house-unit rules as the suggested lines. Shares are what the people really need (none when stock is
 * enough; the save step rebuilds them, as for any line). null = no such medicine, the medicine has no active user, or a house medicine
 * whose stock is not counted (its unit is not known). */
export function makeManualLine(root: Root, ref: { kind: 'med'; medicationId: string } | { kind: 'house'; houseItemId: string }, today: IsoDate): KnownDraftLine | null {
  if (ref.kind === 'house') {
    const h = root.houseItems.find((x) => x.id === ref.houseItemId);
    if (!h || h.removedAt !== undefined || !h.stock) return null;
    return { ...houseLine(h, h.stock.unit), reason: 'manual' };
  }
  const m = root.medications.find((x) => x.id === ref.medicationId);
  const needs = needsByMedication(root, today).get(ref.medicationId);
  if (!m || !needs) return null;
  const line = medLine(root, m, needs, 'unknown');
  return { ...line, qtyOrdered: 1, reason: 'manual', ticked: true };
}

// A house medicine is ordered in the unit its stock is counted in (decision of the owner), one sell unit to start with.
const houseLine = (h: HouseItem, unit: string): KnownDraftLine => ({
  key: `house:${h.id}`,
  source: { kind: 'house', houseItemId: h.id },
  name: h.name,
  unit,
  need: 1,
  sellUnit: unit,
  perSellUnit: 1,
  qtyOrdered: 1,
  reason: 'low',
  ticked: true,
});

// ---------- medicine typed by hand ----------

/** Name for comparing: trimmed, all spaces removed, lower case. */
export const normalizeName = (name: string): string => name.normalize('NFC').replace(/\s+/g, '').toLowerCase();

export type NameClash = { kind: 'med'; medicationId: string; name: string } | { kind: 'house'; houseItemId: string; name: string };

/** The medicine in the app (regular, or house and not removed) that has the same name as a typed one, ignoring case and spaces. null = none. */
export function findNameClash(root: Root, typed: string): NameClash | null {
  const want = normalizeName(typed);
  if (want === '') return null;
  const m = root.medications.find((x) => normalizeName(x.name) === want);
  if (m) return { kind: 'med', medicationId: m.id, name: m.name };
  const h = root.houseItems.find((x) => x.removedAt === undefined && normalizeName(x.name) === want);
  return h ? { kind: 'house', houseItemId: h.id, name: h.name } : null;
}

export type FreeLineError = 'invalid_name' | 'invalid_qty' | 'invalid_sell_unit' | 'invalid_per_sell_unit' | 'invalid_kind' | 'invalid_strength';
export type FreeLineField = 'name' | 'qty' | 'sellUnit' | 'perSellUnit' | 'medKind' | 'strength';
export type FreeLineResult = { ok: true; line: FreeDraftLine; clash: NameClash | null } | { ok: false; errors: Partial<Record<FreeLineField, FreeLineError>> };

/** A line for a medicine typed by hand: name 1..60 after trimming (inner spaces squeezed to one), quantity > 0, a sell unit. Ticked. Its price
 * is never remembered. `clash` says when the name is already a medicine in the app (the screen then offers that one instead). */
export function makeFreeLine(
  root: Root,
  input: { name: string; qty: number; sellUnit: string; perSellUnit?: number | null; medKind?: MedKind | null; strength?: { value: number; unit: string } | null; addToList?: boolean },
): FreeLineResult {
  const errors: Partial<Record<FreeLineField, FreeLineError>> = {};
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 60) errors.name = 'invalid_name';
  if (!(typeof input.qty === 'number' && Number.isFinite(input.qty) && input.qty > 0)) errors.qty = 'invalid_qty';
  const sellUnit = input.sellUnit.trim();
  if (sellUnit === '') errors.sellUnit = 'invalid_sell_unit';
  const per = input.perSellUnit;
  const hasPer = per !== undefined && per !== null;
  if (hasPer && !(typeof per === 'number' && Number.isFinite(per) && per > 0)) errors.perSellUnit = 'invalid_per_sell_unit';
  // kind and strength are optional; when given they must be right (a strength is a number above 0 with one of the schema's units)
  const kindGiven = input.medKind !== undefined && input.medKind !== null;
  if (kindGiven && !(MED_KINDS as readonly string[]).includes(input.medKind as string)) errors.medKind = 'invalid_kind';
  const str = input.strength;
  const strengthGiven = str !== undefined && str !== null;
  if (strengthGiven && !(Number.isFinite(str.value) && str.value > 0 && (STRENGTH_UNITS as readonly string[]).includes(str.unit))) errors.strength = 'invalid_strength';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const medKind = kindGiven ? (input.medKind as MedKind) : undefined;
  const strength = strengthGiven ? ({ value: str.value, unit: str.unit } as Strength) : undefined;
  return {
    ok: true,
    clash: findNameClash(root, name),
    line: {
      key: `free:${normalizeName(name)}`,
      source: { kind: 'free', name, ...(medKind ? { medKind } : {}), ...(strength ? { strength } : {}) },
      name,
      unit: sellUnit,
      need: input.qty,
      sellUnit,
      ...(hasPer ? { perSellUnit: per } : {}),
      ...(medKind ? { medKind } : {}),
      ...(strength ? { strength } : {}),
      ...(input.addToList === undefined ? {} : { addToList: input.addToList }),
      qtyOrdered: input.qty,
      reason: 'typed',
      ticked: true,
    },
  };
}

