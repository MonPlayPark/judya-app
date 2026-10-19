// Prices per shop (step 3.3b-1): the checks on one price. Pure: no storage, no clock, no UI.
// Setting and deleting a price are `setPrice` / `deletePrice` in actions.ts.
import type { Price } from './schema';

export type PriceKind = Price['item']['kind'];
export type PriceField = 'price' | 'sellUnit' | 'perSellUnit';
export type PriceFieldError = 'invalid_price' | 'invalid_sell_unit' | 'per_sell_unit_required' | 'invalid_per_sell_unit';

/** What a form hands over. `perSellUnit` = how many medicine units are in 1 sell unit (a regular medicine must give it;
 * a house medicine is always 1, so it may be left out). */
export interface PriceInput {
  price: number;
  sellUnit: string;
  perSellUnit?: number | null;
}

/** The checked price without its id, shop and item. */
export type CheckedPrice = Pick<Price, 'price' | 'sellUnit' | 'perSellUnit'>;

export type PriceCheck = { ok: true; value: CheckedPrice } | { ok: false; errors: Partial<Record<PriceField, PriceFieldError>> };

const isPositive = (n: number): boolean => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Price: a number > 0 (not NaN / Infinity). Sell unit: not empty after trimming. A regular medicine (`kind: 'med'`) must give
 * `perSellUnit` > 0 (`per_sell_unit_required` when missing, `invalid_per_sell_unit` when 0, negative or not a number);
 * a house medicine's is 1 when left out and anything else is refused. Every wrong field is reported, not just the first. */
export function validatePrice(kind: PriceKind, input: PriceInput): PriceCheck {
  const errors: Partial<Record<PriceField, PriceFieldError>> = {};

  if (!isPositive(input.price)) errors.price = 'invalid_price';

  const sellUnit = typeof input.sellUnit === 'string' ? input.sellUnit.trim() : '';
  if (sellUnit === '') errors.sellUnit = 'invalid_sell_unit';

  const given = input.perSellUnit;
  const missing = given === null || given === undefined;
  let perSellUnit = 1;
  if (kind === 'med') {
    if (missing) errors.perSellUnit = 'per_sell_unit_required';
    else if (!isPositive(given)) errors.perSellUnit = 'invalid_per_sell_unit';
    else perSellUnit = given;
  } else if (!missing && given !== 1) {
    errors.perSellUnit = 'invalid_per_sell_unit';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { price: input.price, sellUnit, perSellUnit } };
}

/** The first error in a fixed order (price, sell unit, units per sell unit) - for callers that report one code. */
export function firstPriceError(errors: Partial<Record<PriceField, PriceFieldError>>): PriceFieldError | undefined {
  for (const f of ['price', 'sellUnit', 'perSellUnit'] as const) {
    const e = errors[f];
    if (e) return e;
  }
  return undefined;
}
