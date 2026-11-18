// Shops on the v3 model (M4 PR 11.3a): add, edit and delete one shop. Pure: takes a root, returns a new root, never touches
// storage and never throws. The rules for one shop are `validateShop` (domain/shop.ts); the result is checked by rootSchema again.
// "Free delivery over N baht" (`freeOver`) is kept in the data but the screens do not show or ask for it: an edit that does not
// mention it keeps the value the shop already has (`null` clears it).
import { validateShop, type ShopField, type ShopFieldError, type ShopInput } from '../shop';
import { defaultNewId } from './medActions';
import { rootSchema, type Root, type Shop } from './schema';

export type ShopFormError = ShopFieldError | 'duplicate_name';
export type ShopFormErrors = Partial<Record<ShopField, ShopFormError>>;
export type ShopActionError = 'invalid' | 'not_found' | 'invalid_root';

export type ShopActionResult = { ok: true; root: Root; shop: Shop } | { ok: false; error: ShopActionError; fields: ShopFormErrors };
export type DeleteShopResult = { ok: true; root: Root; removedPrices: number } | { ok: false; error: 'not_found' | 'invalid_root' };

export const FEE_DECIMALS = 2;

/** The text under a box for each wrong value (short Thai). */
export const SHOP_ERROR_TEXT: Record<ShopFormError, string> = {
  invalid_shop_name: 'ชื่อร้านต้องยาว 2–40 ตัวอักษร',
  invalid_phone: 'เบอร์โทรใส่ได้เฉพาะตัวเลข เว้นวรรค - และ + ยาว 6–20 ตัว',
  invalid_fee: 'ใส่ค่าส่งเป็นตัวเลข 0 ขึ้นไป (ใส่ 0 ถ้าร้านส่งฟรีเสมอ)',
  invalid_free_over: 'ตัวเลขนี้ไม่ถูกต้อง',
  duplicate_name: 'มีร้านชื่อนี้แล้ว',
};

/** Same name = same after trimming and ignoring case. */
const nameKey = (name: string): string => name.trim().toLowerCase();

const hasMoreDecimals = (n: number): boolean => Math.abs(Math.round(n * 10 ** FEE_DECIMALS) / 10 ** FEE_DECIMALS - n) > 1e-9;

/** validateShop + a fee with at most 2 decimals + a name no other shop has (`selfId` = the shop being edited, skipped). */
function check(root: Root, input: ShopInput, selfId: string | null): { ok: true; value: Omit<Shop, 'id'> } | { ok: false; fields: ShopFormErrors } {
  const base = validateShop(input);
  const fields: ShopFormErrors = base.ok ? {} : { ...base.errors };
  if (input.delivery.kind === 'deliver' && fields.fee === undefined && hasMoreDecimals(input.delivery.fee)) fields.fee = 'invalid_fee';
  const key = nameKey(input.name);
  if (fields.name === undefined && root.shops.some((s) => s.id !== selfId && nameKey(s.name) === key)) fields.name = 'duplicate_name';
  if (!base.ok || Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value: base.value };
}

const invalid = (fields: ShopFormErrors): ShopActionResult => ({ ok: false, error: 'invalid', fields });

export function addShop(root: Root, input: ShopInput, newId: () => string = defaultNewId): ShopActionResult {
  const checked = check(root, input, null);
  if (!checked.ok) return invalid(checked.fields);
  const shop: Shop = { id: newId(), ...checked.value };
  const next: Root = { ...root, shops: [...root.shops, shop] };
  if (!rootSchema.safeParse(next).success) return { ok: false, error: 'invalid_root', fields: {} };
  return { ok: true, root: next, shop };
}

/** Changes the shop in place (same id, same place in the list). Its remembered prices and old orders are not touched. */
export function updateShop(root: Root, shopId: string, input: ShopInput): ShopActionResult {
  const old = root.shops.find((s) => s.id === shopId);
  if (!old) return { ok: false, error: 'not_found', fields: {} };
  // an edit that says nothing about "free over" keeps the value the shop has
  const keepFreeOver = input.delivery.kind === 'deliver' && input.delivery.freeOver === undefined && old.delivery.kind === 'deliver' ? old.delivery.freeOver : undefined;
  const given: ShopInput =
    keepFreeOver !== undefined && input.delivery.kind === 'deliver' ? { ...input, delivery: { ...input.delivery, freeOver: keepFreeOver } } : input;
  const checked = check(root, given, shopId);
  if (!checked.ok) return invalid(checked.fields);
  const shop: Shop = { id: shopId, ...checked.value };
  const next: Root = { ...root, shops: root.shops.map((s) => (s.id === shopId ? shop : s)) };
  if (!rootSchema.safeParse(next).success) return { ok: false, error: 'invalid_root', fields: {} };
  return { ok: true, root: next, shop };
}

/** Removes the shop and the prices remembered for it, in one new root. Old orders stay (they keep `shopName`; an order's shopId
 * is not checked against `shops`), so the result still passes the reference check when it is restored from a backup file. */
export function deleteShop(root: Root, shopId: string): DeleteShopResult {
  if (!root.shops.some((s) => s.id === shopId)) return { ok: false, error: 'not_found' };
  const prices = root.prices.filter((p) => p.shopId !== shopId);
  const next: Root = { ...root, shops: root.shops.filter((s) => s.id !== shopId), prices };
  if (!rootSchema.safeParse(next).success) return { ok: false, error: 'invalid_root' };
  return { ok: true, root: next, removedPrices: root.prices.length - prices.length };
}

/** Second line of a shop in the list: "021234567 · ส่งถึงบ้าน ค่าส่ง ฿40" or "ไปรับเอง". Never talks about free delivery. */
export function shopLine(shop: Shop): string {
  const how = shop.delivery.kind === 'pickup' ? 'ไปรับเอง' : `ส่งถึงบ้าน ค่าส่ง ฿${shop.delivery.fee}`;
  return shop.phone === undefined ? how : `${shop.phone} · ${how}`;
}
