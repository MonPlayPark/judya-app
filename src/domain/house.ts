// House medicines (step 3.3a): the checks on one item, its status words, and cutting stock. Pure: no storage,
// no clock, no UI. `houseStatus` itself lives in stock.ts (the care list already uses it).
import { z } from 'zod';
import type { HouseItem } from './schema';
import type { HouseStatus } from './stock';

export const HOUSE_NAME = { min: 2, max: 60 } as const;

/** The words shown for each status. A status is always an icon AND these words (never colour alone). */
export const HOUSE_STATUS_TEXT: Record<HouseStatus, string> = {
  untracked: 'ไม่นับ',
  ok: 'ปกติ',
  low: 'ใกล้หมด',
  out: 'หมดแล้ว',
};

export type HouseField = 'name' | 'qty' | 'unit' | 'lowAt' | 'expiry';
export type HouseFieldError =
  | 'invalid_house_name'
  | 'invalid_house_qty'
  | 'invalid_house_unit'
  | 'invalid_low_at'
  | 'low_at_needs_stock'
  | 'invalid_expiry';

/** What a form hands over. `null` / left out = not given (no stock = "ไม่นับสต๊อก"). */
export interface HouseItemInput {
  name: string;
  stock?: { qty: number; unit: string } | null;
  /** Warn when the stock is at or below this. Only allowed together with `stock`. */
  lowAt?: number | null;
  expiry?: string | null;
  note?: string | null;
}

/** The checked item without its id (and without `removedAt`, which only remove / restore touch). */
export type CheckedHouseItem = Omit<HouseItem, 'id' | 'removedAt'>;

export type HouseCheck =
  | { ok: true; value: CheckedHouseItem }
  | { ok: false; errors: Partial<Record<HouseField, HouseFieldError>> };

const isCount = (n: number): boolean => Number.isFinite(n) && n >= 0;
const isDate = (s: string): boolean => z.iso.date().safeParse(s).success;

/** Name 2..60 (after trimming); stock needs a quantity >= 0 and a unit; lowAt (>= 0) only with stock; expiry, if given,
 * is a real 'YYYY-MM-DD' date; a blank note is no note. Every wrong field is reported, not just the first. */
export function validateHouseItem(input: HouseItemInput): HouseCheck {
  const errors: Partial<Record<HouseField, HouseFieldError>> = {};

  const name = input.name.trim();
  if (name.length < HOUSE_NAME.min || name.length > HOUSE_NAME.max) errors.name = 'invalid_house_name';

  let stock: CheckedHouseItem['stock'];
  if (input.stock) {
    const unit = input.stock.unit.trim();
    if (!isCount(input.stock.qty)) errors.qty = 'invalid_house_qty';
    if (unit === '') errors.unit = 'invalid_house_unit';
    if (errors.qty === undefined && errors.unit === undefined) stock = { qty: input.stock.qty, unit };
  }

  let lowAt: number | undefined;
  if (input.lowAt !== null && input.lowAt !== undefined) {
    if (!isCount(input.lowAt)) errors.lowAt = 'invalid_low_at';
    else if (!input.stock) errors.lowAt = 'low_at_needs_stock';
    else lowAt = input.lowAt;
  }

  let expiry: string | undefined;
  const rawExpiry = input.expiry?.trim();
  if (rawExpiry) {
    if (isDate(rawExpiry)) expiry = rawExpiry;
    else errors.expiry = 'invalid_expiry';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const note = input.note?.trim();
  return {
    ok: true,
    value: {
      name,
      ...(stock ? { stock } : {}),
      ...(lowAt !== undefined ? { lowAt } : {}),
      ...(expiry ? { expiry } : {}),
      ...(note ? { note } : {}),
    },
  };
}

/** The first error in a fixed order (name, quantity, unit, warn level, expiry) - for callers that report one code. */
export function firstHouseError(errors: Partial<Record<HouseField, HouseFieldError>>): HouseFieldError | undefined {
  for (const f of ['name', 'qty', 'unit', 'lowAt', 'expiry'] as const) {
    const e = errors[f];
    if (e) return e;
  }
  return undefined;
}

export type CutResult =
  | { status: 'cut'; item: HouseItem } // the new quantity is in `item.stock.qty`
  | { status: 'warn'; item: HouseItem } // more than is left: nothing is cut, `item` is the same as given
  | { status: 'rejected'; error: 'no_stock' | 'invalid_cut' };

/** Uses up `n` units. `n` must be a whole number >= 1. More than is left is a warning and the quantity stays
 * (it never goes below 0). An item that does not count its stock cannot be cut. */
export function cutHouseStock(item: HouseItem, n: number): CutResult {
  if (!item.stock) return { status: 'rejected', error: 'no_stock' };
  if (!Number.isInteger(n) || n < 1) return { status: 'rejected', error: 'invalid_cut' };
  if (n > item.stock.qty) return { status: 'warn', item };
  return { status: 'cut', item: { ...item, stock: { ...item.stock, qty: item.stock.qty - n } } };
}
