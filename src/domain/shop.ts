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

/** How the shop gets the medicine to you, in words: 'ไปรับเองที่ร้าน' / 'ให้ร้านส่ง ค่าส่ง ฿40 · ซื้อครบ ฿1000 ส่งฟรี' / 'ให้ร้านส่ง ส่งฟรี'. */
export function deliveryText(delivery: Shop['delivery']): string {
  if (delivery.kind === 'pickup') return 'ไปรับเองที่ร้าน';
  const fee = delivery.fee > 0 ? `ค่าส่ง ฿${delivery.fee}` : 'ส่งฟรี';
  return delivery.freeOver !== undefined ? `ให้ร้านส่ง ${fee} · ซื้อครบ ฿${delivery.freeOver} ส่งฟรี` : `ให้ร้านส่ง ${fee}`;
}

/** Second line of a shop in the list: phone (or that there is none) and the delivery words. */
export const shopSub = (shop: Shop): string => `${shop.phone ?? 'ยังไม่ใส่เบอร์โทร'} · ${deliveryText(shop.delivery)}`;

/** The shop form: what the boxes hold as text. */
export interface ShopForm {
  name: string;
  phone: string;
  ship: 'pickup' | 'deliver';
  fee: string;
  freeOver: string;
}

export const blankShopForm = (): ShopForm => ({ name: '', phone: '', ship: 'pickup', fee: '', freeOver: '' });

export const shopFormFromShop = (shop: Shop): ShopForm => ({
  name: shop.name,
  phone: shop.phone ?? '',
  ship: shop.delivery.kind,
  fee: shop.delivery.kind === 'deliver' ? String(shop.delivery.fee) : '',
  freeOver: shop.delivery.kind === 'deliver' && shop.delivery.freeOver !== undefined ? String(shop.delivery.freeOver) : '',
});

/** Typed number -> number; empty -> null; text that is not a number -> NaN (the check then refuses it). */
const num = (s: string): number | null => (s.trim() === '' ? null : Number(s.trim()));

export function shopFormToInput(f: ShopForm): ShopInput {
  if (f.ship === 'pickup') return { name: f.name, phone: f.phone, delivery: { kind: 'pickup' } };
  return { name: f.name, phone: f.phone, delivery: { kind: 'deliver', fee: num(f.fee) ?? Number.NaN, freeOver: num(f.freeOver) } };
}
