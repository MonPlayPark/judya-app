// Every change to the data goes through a function here: Root -> Root, pure, no storage, no clock
// (BRIEF 3.2). Screens never write storage; the state holder in src/state saves the returned root.
import type { IsoDate } from './calc';
import { cutHouseStock as cutStock, firstHouseError, validateHouseItem, type HouseFieldError, type HouseItemInput } from './house';
import { prunePrep, tickPrep, untickPrep } from './prep';
import { makeSample } from './sample';
import { emptyRoot, rootSchema, type HouseItem, type Root, type Shop } from './schema';
import { firstShopError, validateShop, type ShopFieldError, type ShopInput } from './shop';

/** Nothing at all in the house: no people, medicines or house medicines. */
export const isBlank = (r: Root): boolean =>
  r.persons.length === 0 && r.medications.length === 0 && r.assignments.length === 0 && r.houseItems.length === 0;

/** Tick one dose as prepared today. Also drops tick marks older than 14 days. */
export const tickDose = (root: Root, today: IsoDate, key: string): Root => ({
  ...root,
  prepLog: prunePrep(tickPrep(root.prepLog, today, key), today),
});

export const untickDose = (root: Root, today: IsoDate, key: string): Root => ({
  ...root,
  prepLog: untickPrep(root.prepLog, today, key),
});

/** Fills a blank house with the made-up sample set. Anything else (real data, or the sample already there)
 * is returned unchanged: sample data is never mixed into real data. */
export function loadSample(root: Root, today: IsoDate, nowIso: string): Root {
  if (!isBlank(root)) return root;
  return { ...root, ...makeSample(today, nowIso), meta: { ...root.meta, isSample: true } };
}

/** Removes the whole sample set. Data that is not flagged as sample is never touched. */
export function clearSample(root: Root): Root {
  if (!root.meta.isSample) return root;
  const { createdAt, lastBackupAt } = root.meta;
  const blank = emptyRoot(createdAt);
  return {
    ...blank,
    settings: root.settings,
    meta: lastBackupAt === undefined ? { createdAt } : { createdAt, lastBackupAt },
  };
}

/** Stamps "backed up at nowIso" into the data (used after the backup file was shared or downloaded). */
export const markBackedUp = (root: Root, nowIso: string): Root => ({ ...root, meta: { ...root.meta, lastBackupAt: nowIso } });

export type SettingsError = 'invalid_expiry_days' | 'invalid_low_stock_days';
export interface SettingsPatch {
  expiryWarnDays?: number;
  lowStockDays?: number;
}
export const EXPIRY_DAYS_RANGE = { min: 1, max: 365 } as const;
export const LOW_STOCK_DAYS_RANGE = { min: 1, max: 60 } as const;

const wholeIn = (n: number, r: { min: number; max: number }): boolean => Number.isInteger(n) && n >= r.min && n <= r.max;

/** Changes the two warning thresholds. Each value must be a whole number inside its range (same limits as the schema);
 * a field that is left out stays as it is. If either value is refused nothing is changed. */
export function setSettings(root: Root, patch: SettingsPatch): { ok: true; root: Root } | { ok: false; error: SettingsError } {
  if (patch.expiryWarnDays !== undefined && !wholeIn(patch.expiryWarnDays, EXPIRY_DAYS_RANGE)) return { ok: false, error: 'invalid_expiry_days' };
  if (patch.lowStockDays !== undefined && !wholeIn(patch.lowStockDays, LOW_STOCK_DAYS_RANGE)) return { ok: false, error: 'invalid_low_stock_days' };
  return {
    ok: true,
    root: {
      ...root,
      settings: {
        ...root.settings,
        ...(patch.expiryWarnDays !== undefined && { expiryWarnDays: patch.expiryWarnDays }),
        ...(patch.lowStockDays !== undefined && { lowStockDays: patch.lowStockDays }),
      },
    },
  };
}

// ---------- house medicines and shops (step 3.3a) ----------
// Same shape as the medicine functions: `fn(root, …, ctx) → { ok: true, root, … } | { ok: false, error }`. Adding something
// asks the owner to clear the sample first (`sample_present`, O5); changing, cutting, hiding or deleting an item that is
// already there stays allowed on the sample, because it can never mix real data into it.

/** What these functions need from the outside: the time stamp and the id maker (`MedicineContext` fits). */
export type HouseContext = { nowIso: string; newId: () => string };

type Fail<E extends string> = { ok: false; error: E };
const fail = <E extends string>(error: E): Fail<E> => ({ ok: false, error });

/** Last safety net: the new root must pass the schema, else nothing is returned as ok. */
const checked = (root: Root): { ok: true; root: Root } | Fail<'invalid_data'> =>
  rootSchema.safeParse(root).success ? { ok: true, root } : fail('invalid_data');

export type AddHouseItemError = 'sample_present' | HouseFieldError | 'invalid_data';
export type EditHouseItemError = 'house_item_not_found' | 'house_item_removed' | HouseFieldError | 'invalid_data';
export type CutHouseStockError =
  | 'house_item_not_found'
  | 'house_item_removed'
  | 'no_stock'
  | 'invalid_cut'
  | 'cut_over_stock' // more than is left: nothing was cut
  | 'invalid_data';
export type RemoveHouseItemError = 'house_item_not_found' | 'house_already_removed' | 'invalid_data';
export type RestoreHouseItemError = 'house_item_not_found' | 'house_not_removed' | 'invalid_data';
export type AddShopError = 'sample_present' | ShopFieldError | 'invalid_data';
export type EditShopError = 'shop_not_found' | ShopFieldError | 'invalid_data';
export type DeleteShopError = 'shop_not_found' | 'invalid_data';

const replaceHouse = (root: Root, next: HouseItem): Root => ({
  ...root,
  houseItems: root.houseItems.map((h) => (h.id === next.id ? next : h)),
});

/** Adds a house medicine (see `validateHouseItem` for the rules). Duplicate names are allowed (the BRIEF has no rule). */
export function addHouseItem(
  root: Root,
  input: HouseItemInput,
  ctx: HouseContext,
): { ok: true; root: Root; houseItemId: string } | Fail<AddHouseItemError> {
  if (root.meta.isSample) return fail('sample_present');
  const check = validateHouseItem(input);
  if (!check.ok) return fail(firstHouseError(check.errors) ?? 'invalid_data');
  const item: HouseItem = { id: ctx.newId(), ...check.value };
  const res = checked({ ...root, houseItems: [...root.houseItems, item] });
  return res.ok ? { ok: true, root: res.root, houseItemId: item.id } : res;
}

/** What may change. Left out (undefined) = untouched; `null` takes stock / lowAt / expiry / note away. Taking `stock` away
 * while `lowAt` stays is refused (`low_at_needs_stock`): send `lowAt: null` with it. A patch that changes nothing is ok. */
export type EditHouseItemPatch = {
  name?: string;
  stock?: { qty: number; unit: string } | null;
  lowAt?: number | null;
  expiry?: string | null;
  note?: string | null;
};

/** Changes a house medicine that is still in the list. */
export function editHouseItem(
  root: Root,
  id: string,
  patch: EditHouseItemPatch,
  _ctx: HouseContext,
): { ok: true; root: Root } | Fail<EditHouseItemError> {
  const current = root.houseItems.find((h) => h.id === id);
  if (!current) return fail('house_item_not_found');
  if (current.removedAt !== undefined) return fail('house_item_removed');
  const check = validateHouseItem({
    name: patch.name ?? current.name,
    stock: patch.stock !== undefined ? patch.stock : (current.stock ?? null),
    lowAt: patch.lowAt !== undefined ? patch.lowAt : (current.lowAt ?? null),
    expiry: patch.expiry !== undefined ? patch.expiry : (current.expiry ?? null),
    note: patch.note !== undefined ? patch.note : (current.note ?? null),
  });
  if (!check.ok) return fail(firstHouseError(check.errors) ?? 'invalid_data');
  const next: HouseItem = { id: current.id, ...check.value, ...(current.removedAt !== undefined ? { removedAt: current.removedAt } : {}) };
  if (JSON.stringify(next) === JSON.stringify(current)) return { ok: true, root };
  return checked(replaceHouse(root, next));
}

/** "ใช้ยาไป ตัดจำนวนออก": takes `n` (a whole number >= 1) off the quantity. More than is left is refused with
 * `cut_over_stock` and the quantity stays; it never goes below 0. */
export function cutHouseStock(
  root: Root,
  id: string,
  n: number,
  _ctx: HouseContext,
): { ok: true; root: Root; left: number } | Fail<CutHouseStockError> {
  const current = root.houseItems.find((h) => h.id === id);
  if (!current) return fail('house_item_not_found');
  if (current.removedAt !== undefined) return fail('house_item_removed');
  const cut = cutStock(current, n);
  if (cut.status === 'rejected') return fail(cut.error);
  if (cut.status === 'warn') return fail('cut_over_stock');
  const res = checked(replaceHouse(root, cut.item));
  return res.ok ? { ok: true, root: res.root, left: cut.item.stock?.qty ?? 0 } : res;
}

/** Hides a house medicine (`removedAt`); nothing is deleted, so "นำกลับ" brings it back as it was. */
export function removeHouseItem(root: Root, id: string, ctx: HouseContext): { ok: true; root: Root } | Fail<RemoveHouseItemError> {
  const current = root.houseItems.find((h) => h.id === id);
  if (!current) return fail('house_item_not_found');
  if (current.removedAt !== undefined) return fail('house_already_removed');
  return checked(replaceHouse(root, { ...current, removedAt: ctx.nowIso }));
}

export function restoreHouseItem(root: Root, id: string, _ctx: HouseContext): { ok: true; root: Root } | Fail<RestoreHouseItemError> {
  const current = root.houseItems.find((h) => h.id === id);
  if (!current) return fail('house_item_not_found');
  if (current.removedAt === undefined) return fail('house_not_removed');
  const { removedAt: _removed, ...rest } = current;
  return checked(replaceHouse(root, rest));
}

/** Adds a shop (see `validateShop`). */
export function addShop(root: Root, input: ShopInput, ctx: HouseContext): { ok: true; root: Root; shopId: string } | Fail<AddShopError> {
  if (root.meta.isSample) return fail('sample_present');
  const check = validateShop(input);
  if (!check.ok) return fail(firstShopError(check.errors) ?? 'invalid_data');
  const shop: Shop = { id: ctx.newId(), ...check.value };
  const res = checked({ ...root, shops: [...root.shops, shop] });
  return res.ok ? { ok: true, root: res.root, shopId: shop.id } : res;
}

/** Replaces the details of a shop (the whole form is sent). The prices of the shop stay. */
export function editShop(root: Root, id: string, input: ShopInput, _ctx: HouseContext): { ok: true; root: Root } | Fail<EditShopError> {
  const current = root.shops.find((s) => s.id === id);
  if (!current) return fail('shop_not_found');
  const check = validateShop(input);
  if (!check.ok) return fail(firstShopError(check.errors) ?? 'invalid_data');
  const next: Shop = { id: current.id, ...check.value };
  if (JSON.stringify(next) === JSON.stringify(current)) return { ok: true, root };
  return checked({ ...root, shops: root.shops.map((s) => (s.id === id ? next : s)) });
}

/** Deletes a shop for good, and every price of that shop with it (BRIEF section 2). The screen asks first. */
export function deleteShop(root: Root, id: string, _ctx: HouseContext): { ok: true; root: Root; pricesRemoved: number } | Fail<DeleteShopError> {
  if (!root.shops.some((s) => s.id === id)) return fail('shop_not_found');
  const prices = root.prices.filter((p) => p.shopId !== id);
  const res = checked({ ...root, shops: root.shops.filter((s) => s.id !== id), prices });
  return res.ok ? { ok: true, root: res.root, pricesRemoved: root.prices.length - prices.length } : res;
}
