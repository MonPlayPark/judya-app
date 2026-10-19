// What the price screens show and hold as text (step 3.3b-2): the rows per shop, the shared-price count, the form <-> input
// step. Pure: no storage, no clock. The checks are `validatePrice` in price.ts; saving is `setPrice` in actions.ts.
import { formatPills } from './format';
import type { PriceInput } from './price';
import type { Price, Root, Shop } from './schema';

export const PRICE_UNIT_CHIPS = ['กล่อง', 'แผง', 'ขวด', 'ซอง', 'หลอด', 'กระปุก'] as const;

/** The boxes of the price form as typed. `perSellUnit` is only used for a regular medicine. */
export interface PriceForm {
  price: string;
  sellUnit: string;
  perSellUnit: string;
}

/** A new price: the sell unit starts as "กล่อง" like on the board; the other boxes are empty. */
export const blankPriceForm = (): PriceForm => ({ price: '', sellUnit: 'กล่อง', perSellUnit: '' });

export const priceFormFromPrice = (p: Price): PriceForm => ({
  price: String(p.price),
  sellUnit: p.sellUnit,
  perSellUnit: p.item.kind === 'med' ? String(p.perSellUnit) : '',
});

/** Text -> number without inventing anything: an empty or non-number box becomes NaN (then `validatePrice` refuses it). */
const toNumber = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text));

/** A regular medicine with an empty "how many" box gives `null` (-> per_sell_unit_required); a house medicine gives no
 * count at all (it is always 1). */
export function priceFormToInput(kind: Price['item']['kind'], f: PriceForm): PriceInput {
  const base = { price: toNumber(f.price), sellUnit: f.sellUnit };
  return kind === 'med' ? { ...base, perSellUnit: f.perSellUnit.trim() === '' ? null : toNumber(f.perSellUnit) } : base;
}

/** '฿290 ต่อ 1 กล่อง (60 เม็ด)' for a regular medicine (`unit` = its unit), '฿35 ต่อ 1 ขวด' for a house medicine (`unit` null).
 * The numbers are shown as they are stored (12.5 stays 12.5). */
export function priceText(p: Price, unit: string | null): string {
  const base = `฿${p.price} ต่อ 1 ${p.sellUnit}`;
  return p.item.kind === 'med' && unit !== null ? `${base} (${formatPills(p.perSellUnit, unit)})` : base;
}

export interface ShopPriceRow {
  shop: Shop;
  price: Price | undefined;
}

const sameItem = (a: Price['item'], b: Price['item']): boolean =>
  a.kind === 'med' ? b.kind === 'med' && a.medicationId === b.medicationId : b.kind === 'house' && a.houseItemId === b.houseItemId;

/** One row per shop that exists, with its price for this medicine (if any), in the order the shops were added. */
export function shopPriceRows(root: Root, item: Price['item']): ShopPriceRow[] {
  return root.shops.map((shop) => ({ shop, price: root.prices.find((p) => p.shopId === shop.id && sameItem(p.item, item)) }));
}

/** How many members use this medicine now (Q6: one price for all of them): active assignments of members who are not taken out. */
export function priceSharedCount(root: Root, medicationId: string): number {
  const live = new Set(root.persons.filter((p) => p.removedAt === undefined).map((p) => p.id));
  return root.assignments.filter((a) => a.medicationId === medicationId && a.status === 'active' && live.has(a.personId)).length;
}
