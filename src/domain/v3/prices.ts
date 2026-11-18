// Remembered prices on the v3 model (M4 PR 11.1). Pure: no storage, no clock (`today` is passed in), no UI.
// One row per (shop, item, sell unit). Only regular medicines and house medicines are remembered: a medicine typed
// by hand on an order (`free`) has no place to keep a price, so nothing here accepts one.
import type { IsoDate } from '../calc';
import type { Price } from './schema';

export type PriceItem = Price['item'];
export type PriceField = 'price' | 'sellUnit' | 'perSellUnit';
export type PriceFieldError = 'invalid_price' | 'invalid_sell_unit' | 'per_sell_unit_required' | 'invalid_per_sell_unit';
export type PriceFieldErrors = Partial<Record<PriceField, PriceFieldError>>;

export const sameItem = (a: PriceItem, b: PriceItem): boolean =>
  a.kind === 'med' ? b.kind === 'med' && a.medicationId === b.medicationId : b.kind === 'house' && a.houseItemId === b.houseItemId;

const isPositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** A price is optional: nothing typed (null / undefined) is fine and means "no price". It is checked only when typed:
 * it must be a finite number above 0 (0, negative, NaN and Infinity are refused). */
export function checkEnteredPrice(value: number | null | undefined): { ok: true; value: number | null } | { ok: false; error: 'invalid_price' } {
  if (value === null || value === undefined) return { ok: true, value: null };
  return isPositive(value) ? { ok: true, value } : { ok: false, error: 'invalid_price' };
}

/** What a form hands over for one remembered price. `perSellUnit` = medicine units in 1 sell unit: a regular medicine
 * must give it (> 0); a house medicine is always 1 (it may be left out). */
export interface PriceEntry {
  shopId: string;
  item: PriceItem;
  price: number;
  sellUnit: string;
  perSellUnit?: number | null;
}

export type UpsertResult =
  | { ok: true; prices: Price[]; price: Price; created: boolean }
  | { ok: false; errors: PriceFieldErrors };

/** Remember a price. Same shop + same item + same sell unit (after trimming) -> that row gets the new price, per-unit count and
 * `date = today` (its id stays); otherwise a new row is added with `newId()`. Prices of other sell units stay. Returns a new
 * array; the one passed in is not changed. Every wrong field is reported. The shop is not looked up here (the caller owns that). */
export function upsertPrice(prices: readonly Price[], entry: PriceEntry, today: IsoDate, newId: () => string): UpsertResult {
  const errors: PriceFieldErrors = {};
  if (!isPositive(entry.price)) errors.price = 'invalid_price';
  const sellUnit = typeof entry.sellUnit === 'string' ? entry.sellUnit.trim() : '';
  if (sellUnit === '') errors.sellUnit = 'invalid_sell_unit';

  const given = entry.perSellUnit;
  const missing = given === null || given === undefined;
  let perSellUnit = 1;
  if (entry.item.kind === 'med') {
    if (missing) errors.perSellUnit = 'per_sell_unit_required';
    else if (!isPositive(given)) errors.perSellUnit = 'invalid_per_sell_unit';
    else perSellUnit = given;
  } else if (!missing && given !== 1) {
    errors.perSellUnit = 'invalid_per_sell_unit';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const at = prices.findIndex((p) => p.shopId === entry.shopId && sameItem(p.item, entry.item) && p.sellUnit === sellUnit);
  const existing = at >= 0 ? prices[at] : undefined;
  const price: Price = {
    id: existing?.id ?? newId(),
    shopId: entry.shopId,
    item: entry.item,
    price: entry.price,
    sellUnit,
    perSellUnit,
    date: today,
  };
  const next = existing ? prices.map((p, i) => (i === at ? price : p)) : [...prices, price];
  return { ok: true, prices: next, price, created: existing === undefined };
}

/** The newest of the rows (by date; the same date: the one added later). */
function newest(rows: readonly Price[]): Price | undefined {
  let best: Price | undefined;
  for (const p of rows) if (best === undefined || p.date >= best.date) best = p;
  return best;
}

/** Every remembered price of one shop for one item (any sell unit). */
export const pricesOf = (prices: readonly Price[], shopId: string, item: PriceItem): Price[] =>
  prices.filter((p) => p.shopId === shopId && sameItem(p.item, item));

/** The newest price this shop has for the item. `sellUnit` narrows it to that sell unit. */
export const latestPrice = (prices: readonly Price[], shopId: string, item: PriceItem, sellUnit?: string): Price | undefined =>
  newest(pricesOf(prices, shopId, item).filter((p) => sellUnit === undefined || p.sellUnit === sellUnit));

/** The newest price any shop has for the item (used to pick the sell unit a new order line starts with). */
export const latestPriceAnyShop = (prices: readonly Price[], item: PriceItem): Price | undefined =>
  newest(prices.filter((p) => sameItem(p.item, item)));
