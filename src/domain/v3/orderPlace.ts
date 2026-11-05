// Placing an order (M4 PR 11.3b-2b): the ticked lines + the chosen shop become ONE `waiting` order, and the prices typed in the same step are
// remembered through `upsertPrice` (inside `saveShopPrices`). Pure: no storage, no clock (`now` is passed in), no UI. The page writes the returned
// root with one `saveRoot`, so the order and the prices are saved together or not at all.
import type { IsoDate } from '../calc';
import { compareShops } from './orderCompare';
import { leftOf } from './orderDraft';
import { needsByMedication, type DraftLine, type KnownDraftLine } from './orderLines';
import { compareLinesOf, saveShopPrices } from './orderShops';
import { rootSchema, type Order, type OrderLine, type OrderShare, type Root, type Shop } from './schema';

const clean = (n: number): number => Number(n.toFixed(6));

/** The assignment of the person whose stock of this medicine runs out first (`leftOf`: days left; tube out, then in use; unknown last).
 * The same stock: the person who comes first in the app's member list. null = nobody uses it any more. */
export function shortestAssignmentId(root: Root, medicationId: string, today: IsoDate): string | null {
  const m = root.medications.find((x) => x.id === medicationId);
  const needs = needsByMedication(root, today).get(medicationId);
  if (!m || !needs || needs.length === 0) return null;
  const order = (personId: string): number => root.persons.findIndex((p) => p.id === personId);
  const ranked = needs
    .map((n) => ({ id: n.assignment.id, rank: leftOf(n.assignment, m, root, today).rank, person: order(n.assignment.personId) }))
    .sort((a, b) => a.rank - b.rank || a.person - b.person);
  return ranked[0]?.id ?? null;
}

export type PlaceError = 'no_shop' | 'no_lines' | 'no_user' | 'invalid_price' | 'invalid_root';
export type PlaceResult =
  | { ok: true; root: Root; order: Order }
  | { ok: false; error: PlaceError; /** by line key, for `invalid_price` */ errors: Record<string, 'invalid_price'> };

const fail = (error: PlaceError, errors: Record<string, 'invalid_price'> = {}): PlaceResult => ({ ok: false, error, errors });

/** Adds one order for the ticked lines (quantity above 0) to the root.
 * - `typedPrices`: box text by line key ('' = skip). A wrong value (0, text) refuses everything with `invalid_price` and the keys. A good one is
 *   remembered for this shop, for one unit of the line's order unit, and becomes the line's `unitPrice`.
 * - `unitPrice` otherwise: the shop's remembered price the comparison used, when it is for the line's own order unit; none when there is none or
 *   it had to be converted from another unit. A typed (`free`) line has none.
 * - `shares`: a medicine line that already has shares keeps them. An empty one (stock was enough / added by hand) gets ONE share of
 *   qtyOrdered x perSellUnit for the person who runs out first.
 * - `shippingFee` = the shop's fee for a delivery shop even when the switch is off; a pick-up shop has none. `perSellUnit` of a typed medicine
 *   is kept only when it was typed. */
export function placeOrder(
  root: Root,
  lines: readonly DraftLine[],
  shop: Shop | undefined,
  includeShipping: boolean,
  typedPrices: Readonly<Record<string, string>>,
  now: { today: IsoDate; iso: string },
  newId: () => string,
): PlaceResult {
  if (!shop || !root.shops.some((s) => s.id === shop.id)) return fail('no_shop');
  const ticked = lines.filter((l) => l.ticked && l.qtyOrdered > 0);
  if (ticked.length === 0) return fail('no_lines');

  // 1. prices typed in the sheet (only lines that can hold a price)
  let base = root;
  const priceable = ticked.filter((l): l is KnownDraftLine => l.source.kind !== 'free');
  const saved = saveShopPrices(root, shop.id, priceable, typedPrices, now.today, newId);
  if (saved.ok) base = saved.root;
  else if (saved.error === 'invalid') return fail('invalid_price', saved.errors);
  else if (saved.error === 'invalid_root') return fail('invalid_root');

  // 2. the lines
  const row = compareShops(compareLinesOf(ticked), [shop], base.prices, includeShipping).rows[0];
  const priced = new Map((row?.lines ?? []).map((p) => [p.key, p] as const));
  const orderLines: OrderLine[] = [];
  for (const l of ticked) {
    let source = l.source;
    if (l.source.kind === 'med' && l.source.shares.length === 0) {
      const assignmentId = shortestAssignmentId(base, l.source.medicationId, now.today);
      if (assignmentId === null) return fail('no_user');
      const share: OrderShare = { assignmentId, qty: clean(l.qtyOrdered * (l as KnownDraftLine).perSellUnit) };
      source = { kind: 'med', medicationId: l.source.medicationId, shares: [share] };
    }
    const p = priced.get(l.key);
    orderLines.push({
      source,
      qtyOrdered: l.qtyOrdered,
      sellUnit: l.sellUnit,
      ...(l.perSellUnit !== undefined ? { perSellUnit: l.perSellUnit } : {}),
      ...(p && !p.converted ? { unitPrice: p.price.price } : {}),
      qtyReceived: 0,
      leftover: null,
      ...('addToList' in l && l.addToList !== undefined ? { addToList: l.addToList } : {}),
    });
  }

  const order: Order = {
    id: newId(),
    shopId: shop.id,
    shopName: shop.name,
    createdAt: now.iso,
    status: 'waiting',
    includeShipping,
    ...(shop.delivery.kind === 'deliver' ? { shippingFee: shop.delivery.fee } : {}),
    lines: orderLines,
  };
  const next: Root = { ...base, orders: [...base.orders, order] };
  if (!rootSchema.safeParse(next).success) return fail('invalid_root');
  return { ok: true, root: next, order };
}
