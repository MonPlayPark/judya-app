// Shops (step 3.3a): the checks on one shop. Pure. Prices per shop are step 3.3b; deleting a shop (which also
// deletes its prices) is `deleteShop` in actions.ts.
import type { Shop } from './schema';

export const SHOP_NAME = { min: 2, max: 40 } as const;
export const PHONE_PATTERN = /^[0-9 +-]{6,20}$/; // digits, spaces, - and +; 6..20 characters

export type ShopField = 'name' | 'phone' | 'fee' | 'freeOver';
export type ShopFieldError = 'invalid_shop_name' | 'invalid_phone' | 'invalid_fee' | 'invalid_free_over';

/** What a form hands over. `fee: 0` is free delivery. `freeOver` empty / null = no free-delivery limit. */
export interface ShopInput {
  name: string;
  /** Empty / null = no phone number. */
  phone?: string | null;
  delivery: { kind: 'pickup' } | { kind: 'deliver'; fee: number; freeOver?: number | null };
}

export type ShopCheck =
  | { ok: true; value: Omit<Shop, 'id'> }
  | { ok: false; errors: Partial<Record<ShopField, ShopFieldError>> };

/** Name 2..40 after trimming; phone optional, if given digits / spaces / - / + and 6..20 long; delivering needs a fee >= 0
 * (0 = free); the free-delivery limit is optional but, if given, > 0. Pick-up shops keep no fee. */
export function validateShop(input: ShopInput): ShopCheck {
  const errors: Partial<Record<ShopField, ShopFieldError>> = {};

  const name = input.name.trim();
  if (name.length < SHOP_NAME.min || name.length > SHOP_NAME.max) errors.name = 'invalid_shop_name';

  const phone = input.phone?.trim() ?? '';
  if (phone !== '' && !PHONE_PATTERN.test(phone)) errors.phone = 'invalid_phone';

  let delivery: Shop['delivery'] = { kind: 'pickup' };
  if (input.delivery.kind === 'deliver') {
    const { fee, freeOver } = input.delivery;
    if (!Number.isFinite(fee) || fee < 0) errors.fee = 'invalid_fee';
    const hasLimit = freeOver !== null && freeOver !== undefined;
    if (hasLimit && !(Number.isFinite(freeOver) && freeOver > 0)) errors.freeOver = 'invalid_free_over';
    if (errors.fee === undefined && errors.freeOver === undefined) {
      delivery = hasLimit ? { kind: 'deliver', fee, freeOver } : { kind: 'deliver', fee };
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, ...(phone !== '' ? { phone } : {}), delivery } };
}

export function firstShopError(errors: Partial<Record<ShopField, ShopFieldError>>): ShopFieldError | undefined {
  for (const f of ['name', 'phone', 'fee', 'freeOver'] as const) {
    const e = errors[f];
    if (e) return e;
  }
  return undefined;
}
