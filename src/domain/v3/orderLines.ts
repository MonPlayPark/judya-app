// The order list on the v3 model (M4 PR 11.1): the lines suggested for the order, and lines typed by hand. Pure: no storage,
// no clock (`today` is passed in), no UI. Quantities: `need` is in medicine units (pills, ml, tubes); `qtyOrdered` is in sell
// units (e.g. 2 boxes), and medicine units = qtyOrdered x perSellUnit. A line never carries a person's name, only assignment ids.
import type { IsoDate } from '../calc';
import { unitWord } from './home';
import { latestPriceAnyShop } from './prices';
import type { Assignment, HouseItem, Medication, OrderShare, OrderSource, Root } from './schema';
import { houseStatus, isLowStock, stockNow, targetDoses, tubeLevel } from './stock';

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, 'th');

/** Why a line is on the list: 'low' = running low (ticked), 'unknown' = no stock count (shown, not ticked), 'typed' = added by hand. */
export type DraftReason = 'low' | 'unknown' | 'typed';

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
}

export type DraftLine = KnownDraftLine | FreeDraftLine;

const clean = (n: number): number => Number(n.toFixed(6));
const ceilUnits = (n: number): number => Math.ceil(n - 1e-9);

/** Sell units to buy `need` medicine units with `perSellUnit` in each: rounded up, at least 1 when something is needed, else 0. */
export const sellUnitsFor = (need: number, perSellUnit: number): number => (need <= 0 ? 0 : Math.max(ceilUnits(need / perSellUnit), 1));

/** Sell unit a new line starts with: the unit of the newest remembered price of that item in any shop, else the medicine's own unit. */
function startingUnit(root: Root, item: Parameters<typeof latestPriceAnyShop>[1], unit: string): { sellUnit: string; perSellUnit: number } {
  const p = latestPriceAnyShop(root.prices, item);
  return p ? { sellUnit: p.sellUnit, perSellUnit: p.perSellUnit ?? 1 } : { sellUnit: unit, perSellUnit: 1 };
}

interface Need {
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
  const live = new Set(root.persons.filter((p) => p.removedAt === undefined).map((p) => p.id));
  const byMed = new Map<string, Need[]>();
  for (const a of root.assignments) {
    if (a.status !== 'active' || !live.has(a.personId)) continue;
    const m = root.medications.find((x) => x.id === a.medicationId);
    if (!m) continue;
    byMed.set(m.id, [...(byMed.get(m.id) ?? []), needOf(a, m, root, today)]);
  }

  const meds: KnownDraftLine[] = [];
  for (const [medicationId, needs] of byMed) {
    const m = root.medications.find((x) => x.id === medicationId);
    if (!m) continue;
    const anyLow = needs.some((n) => n.low);
    if (!anyLow && !needs.some((n) => n.unknown)) continue;
    const shares: OrderShare[] = needs.filter((n) => n.need > 0).map((n) => ({ assignmentId: n.assignment.id, qty: n.need }));
    const need = clean(shares.reduce((sum, s) => sum + s.qty, 0));
    const unit = unitWord(m);
    const { sellUnit, perSellUnit } = startingUnit(root, { kind: 'med', medicationId }, unit);
    meds.push({
      key: `med:${medicationId}`,
      source: { kind: 'med', medicationId, shares },
      name: m.name,
      unit,
      need,
      sellUnit,
      perSellUnit,
      qtyOrdered: sellUnitsFor(need, perSellUnit),
      reason: anyLow ? 'low' : 'unknown',
      ticked: anyLow && need > 0,
    });
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

export type FreeLineError = 'invalid_name' | 'invalid_qty' | 'invalid_sell_unit' | 'invalid_per_sell_unit';
export type FreeLineResult =
  | { ok: true; line: FreeDraftLine; clash: NameClash | null }
  | { ok: false; errors: Partial<Record<'name' | 'qty' | 'sellUnit' | 'perSellUnit', FreeLineError>> };

/** A line for a medicine typed by hand: name 1..60 after trimming (inner spaces squeezed to one), quantity > 0, a sell unit. Ticked. Its price
 * is never remembered. `clash` says when the name is already a medicine in the app (the screen then offers that one instead). */
export function makeFreeLine(root: Root, input: { name: string; qty: number; sellUnit: string; perSellUnit?: number | null }): FreeLineResult {
  const errors: Partial<Record<'name' | 'qty' | 'sellUnit' | 'perSellUnit', FreeLineError>> = {};
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 60) errors.name = 'invalid_name';
  if (!(typeof input.qty === 'number' && Number.isFinite(input.qty) && input.qty > 0)) errors.qty = 'invalid_qty';
  const sellUnit = input.sellUnit.trim();
  if (sellUnit === '') errors.sellUnit = 'invalid_sell_unit';
  const per = input.perSellUnit;
  const hasPer = per !== undefined && per !== null;
  if (hasPer && !(typeof per === 'number' && Number.isFinite(per) && per > 0)) errors.perSellUnit = 'invalid_per_sell_unit';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    clash: findNameClash(root, name),
    line: {
      key: `free:${normalizeName(name)}`,
      source: { kind: 'free', name },
      name,
      unit: sellUnit,
      need: input.qty,
      sellUnit,
      ...(hasPer ? { perSellUnit: per } : {}),
      qtyOrdered: input.qty,
      reason: 'typed',
      ticked: true,
    },
  };
}

