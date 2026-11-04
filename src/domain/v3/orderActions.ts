// Saving an order (M4 PR 11.3b-2b). Pure: no storage, no clock (`today` and `nowIso` are passed in), no UI. The page writes the returned root
// with ONE `saveRoot`, so the new order and the prices typed in the same step are saved together or not at all.
import type { IsoDate } from '../calc';
import { compareShops } from './orderCompare';
import { leftOf } from './orderDraft';
import { needsByMedication, type DraftLine, type KnownDraftLine } from './orderLines';
import { compareLinesOf } from './orderShops';
import { rootSchema, type Order, type OrderLine, type OrderShare, type Root, type Shop } from './schema';

const clean = (n: number): number => Number(n.toFixed(6));

/** The people of a medicine (those with an active assignment, still in the house), the one running out soonest first
 * (`leftOf`: days left, tube out/low first, unknown last; the same stock: the list order). */
export function shortestFirst(root: Root, medicationId: string, today: IsoDate): string[] {
  const m = root.medications.find((x) => x.id === medicationId);
  const needs = needsByMedication(root, today).get(medicationId);
  if (!m || !needs) return [];
  return needs
    .map((n, i) => ({ id: n.assignment.id, rank: leftOf(n.assignment, m, root, today).rank, i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.id);
}

/** Each person's part (medicine units) of a regular medicine line, after the owner may have changed the quantity.
 * Total = qtyOrdered x perSellUnit. Pills / ml: the shares that were suggested stay; extra goes to the person running out soonest; if the
 * owner ordered less, the shares shrink in proportion and the odd rest goes to that person. No shares yet (nothing was needed): all to that person.
 * Tubes / bottles (whole numbers): one at a time to the person running out soonest, so with fewer than people some get none.
 * null = nobody uses the medicine any more. */
export function buildShares(root: Root, line: KnownDraftLine, today: IsoDate): OrderShare[] | null {
  if (line.source.kind !== 'med') return null;
  const { medicationId } = line.source;
  const order = shortestFirst(root, medicationId, today);
  if (order.length === 0) return null;
  const m = root.medications.find((x) => x.id === medicationId);
  const total = clean(line.qtyOrdered * line.perSellUnit);
  if (!(total > 0) || !m) return null;

  const given = new Map(line.source.shares.map((s) => [s.assignmentId, s.qty] as const));
  const asTubes = order.some((id) => {
    const a = root.assignments.find((x) => x.id === id);
    return a?.stock?.kind === 'tubes' || (a?.stock === null && (m.kind === 'cream' || m.kind === 'drops'));
  });
  const wanted = order.filter((id) => (given.get(id) ?? 0) > 0);
  const people = wanted.length > 0 ? wanted : order;

  const out = new Map<string, number>();
  const add = (id: string, qty: number): void => void out.set(id, clean((out.get(id) ?? 0) + qty));
  if (asTubes) {
    const whole = Math.max(Math.round(total), 1);
    for (let i = 0; i < whole; i++) add(people[i % people.length] as string, 1);
  } else {
    const base = people.reduce((sum, id) => sum + (given.get(id) ?? 0), 0);
    if (base <= 0) add(people[0] as string, total);
    else if (total >= base) {
      for (const id of people) add(id, given.get(id) ?? 0);
      add(people[0] as string, total - base);
    } else {
      let used = 0;
      for (const id of people) {
        const part = clean(((given.get(id) ?? 0) * total) / base);
        used += part;
        add(id, part);
      }
      add(people[0] as string, clean(total - used));
    }
  }
  return [...out].filter(([, qty]) => qty > 0).map(([assignmentId, qty]) => ({ assignmentId, qty }));
}

export type BuildOrderError = 'no_shop' | 'no_lines' | 'no_user' | 'invalid_root';
export type BuildOrderResult = { ok: true; root: Root; order: Order } | { ok: false; error: BuildOrderError };

/** The unit price kept on an order line: the shop's remembered price when it is for the same sell unit; when it was converted from another
 * unit, the cost of the line divided by the quantity (so qtyOrdered x unitPrice is what the comparison showed). null = no price. */
function unitPriceOf(cost: number, qty: number, price: number, converted: boolean): number {
  return converted ? Math.round((cost / qty) * 100) / 100 : price;
}

/** Makes the order of the ticked lines for `shop` and returns the root with it added. `root.prices` should already hold any prices typed in
 * the same step (use `saveShopPrices` first and pass its root). Status `waiting`; `shopName`, `shippingFee` (a delivery shop's fee) and
 * `includeShipping` are kept so editing the shop later does not change history. */
export function buildOrder(
  root: Root,
  lines: readonly DraftLine[],
  shop: Shop | undefined,
  includeShipping: boolean,
  today: IsoDate,
  nowIso: string,
  newId: () => string,
): BuildOrderResult {
  if (!shop) return { ok: false, error: 'no_shop' };
  const ticked = lines.filter((l) => l.ticked && l.qtyOrdered > 0);
  if (ticked.length === 0) return { ok: false, error: 'no_lines' };

  const row = compareShops(compareLinesOf(ticked), [shop], root.prices, includeShipping).rows[0];
  const priced = new Map((row?.lines ?? []).map((p) => [p.key, p] as const));

  const orderLines: OrderLine[] = [];
  for (const l of ticked) {
    let source = l.source;
    if (l.source.kind === 'med') {
      const shares = buildShares(root, l as KnownDraftLine, today);
      if (shares === null) return { ok: false, error: 'no_user' };
      source = { kind: 'med', medicationId: l.source.medicationId, shares };
    }
    const p = priced.get(l.key);
    orderLines.push({
      source,
      qtyOrdered: l.qtyOrdered,
      sellUnit: l.sellUnit,
      ...(l.perSellUnit !== undefined ? { perSellUnit: l.perSellUnit } : {}),
      ...(p ? { unitPrice: unitPriceOf(p.cost, l.qtyOrdered, p.price.price, p.converted) } : {}),
      qtyReceived: 0,
      leftover: null,
      ...('addToList' in l && l.addToList !== undefined ? { addToList: l.addToList } : {}),
    });
  }

  const order: Order = {
    id: newId(),
    shopId: shop.id,
    shopName: shop.name,
    createdAt: nowIso,
    status: 'waiting',
    includeShipping,
    ...(shop.delivery.kind === 'deliver' ? { shippingFee: shop.delivery.fee } : {}),
    lines: orderLines,
  };
  const next: Root = { ...root, orders: [...root.orders, order] };
  if (!rootSchema.safeParse(next).success) return { ok: false, error: 'invalid_root' };
  return { ok: true, root: next, order };
}
