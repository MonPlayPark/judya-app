// Step 3.3a: the actions that change house medicines and shops. Made-up data only.
import { describe, expect, it } from 'vitest';
import {
  addHouseItem,
  addShop,
  clearSample,
  cutHouseStock,
  deleteShop,
  editHouseItem,
  editShop,
  loadSample,
  removeHouseItem,
  restoreHouseItem,
  type HouseContext,
} from './actions';
import { makeBackup, summarizeBackup } from './backup';
import { careItems } from './care';
import { NOW } from './fixtures';
import { rootWith } from './helpers.test-util';
import { emptyRoot, rootSchema, type HouseItem, type Price, type Root, type Shop } from './schema';

const D19 = '2026-10-19';
const LATER = '2026-10-19T20:00:00+07:00';
let n = 0;
const ctx = (): HouseContext => ({ nowIso: LATER, newId: () => `id${++n}` });

const para: HouseItem = { id: 'h1', name: 'ยาสามัญทดสอบ ก', stock: { qty: 10, unit: 'เม็ด' }, lowAt: 5, expiry: '2027-09-30' };
const eye: HouseItem = { id: 'h2', name: 'ยาสามัญทดสอบ ข' };
const withItems = (): Root => rootWith({ houseItems: [para, eye] });

/** Every ok root is valid data (the functions check it themselves; this is the second look). */
const valid = (r: Root) => expect(rootSchema.safeParse(r).success).toBe(true);

describe('addHouseItem', () => {
  it('adds an item with a new id, stock, warn level, expiry and note', () => {
    const res = addHouseItem(
      emptyRoot(NOW),
      { name: ' ยาสามัญทดสอบ ก ', stock: { qty: 10, unit: 'เม็ด' }, lowAt: 5, expiry: '2027-09-30', note: 'ตู้ชั้นล่าง' },
      ctx(),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    valid(res.root);
    expect(res.root.houseItems).toEqual([
      { id: res.houseItemId, name: 'ยาสามัญทดสอบ ก', stock: { qty: 10, unit: 'เม็ด' }, lowAt: 5, expiry: '2027-09-30', note: 'ตู้ชั้นล่าง' },
    ]);
  });
  it('a name only is enough (no stock = not counted)', () => {
    const res = addHouseItem(emptyRoot(NOW), { name: 'ยาสามัญทดสอบ' }, ctx());
    expect(res.ok && res.root.houseItems[0]).toMatchObject({ name: 'ยาสามัญทดสอบ' });
    expect(res.ok && res.root.houseItems[0]?.stock).toBeUndefined();
  });
  it('lowAt without stock is refused and nothing is added', () => {
    expect(addHouseItem(emptyRoot(NOW), { name: 'ยาสามัญทดสอบ', lowAt: 5 }, ctx())).toEqual({ ok: false, error: 'low_at_needs_stock' });
  });
  it('a short name, a bad quantity and a missing unit are refused with their own code', () => {
    expect(addHouseItem(emptyRoot(NOW), { name: 'ก' }, ctx())).toEqual({ ok: false, error: 'invalid_house_name' });
    expect(addHouseItem(emptyRoot(NOW), { name: 'ยาสามัญทดสอบ', stock: { qty: -1, unit: 'เม็ด' } }, ctx())).toEqual({ ok: false, error: 'invalid_house_qty' });
    expect(addHouseItem(emptyRoot(NOW), { name: 'ยาสามัญทดสอบ', stock: { qty: 1, unit: '' } }, ctx())).toEqual({ ok: false, error: 'invalid_house_unit' });
  });
  it('is refused with sample_present while the sample is there (nothing is cleared silently); works after clearing', () => {
    const sample = loadSample(emptyRoot(NOW), D19, NOW);
    expect(addHouseItem(sample, { name: 'ยาสามัญทดสอบ' }, ctx())).toEqual({ ok: false, error: 'sample_present' });
    const cleared = addHouseItem(clearSample(sample), { name: 'ยาสามัญทดสอบ' }, ctx());
    expect(cleared.ok).toBe(true);
  });
  it('does not change the root it was given', () => {
    const before = emptyRoot(NOW);
    addHouseItem(before, { name: 'ยาสามัญทดสอบ' }, ctx());
    expect(before.houseItems).toEqual([]);
  });
});

describe('editHouseItem', () => {
  it('changes only the fields given', () => {
    const res = editHouseItem(withItems(), 'h1', { name: 'ชื่อใหม่ทดสอบ', note: 'โน้ต' }, ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    valid(res.root);
    expect(res.root.houseItems[0]).toEqual({ ...para, name: 'ชื่อใหม่ทดสอบ', note: 'โน้ต' });
    expect(res.root.houseItems[1]).toEqual(eye);
  });
  it('null takes a field away; stock and lowAt can go together', () => {
    const res = editHouseItem(withItems(), 'h1', { stock: null, lowAt: null, expiry: null }, ctx());
    expect(res.ok && res.root.houseItems[0]).toEqual({ id: 'h1', name: 'ยาสามัญทดสอบ ก' });
  });
  it('taking stock away while lowAt stays is refused', () => {
    expect(editHouseItem(withItems(), 'h1', { stock: null }, ctx())).toEqual({ ok: false, error: 'low_at_needs_stock' });
  });
  it('setting lowAt on an item without stock is refused; with stock in the same patch it works', () => {
    expect(editHouseItem(withItems(), 'h2', { lowAt: 3 }, ctx())).toEqual({ ok: false, error: 'low_at_needs_stock' });
    const res = editHouseItem(withItems(), 'h2', { stock: { qty: 4, unit: 'ขวด' }, lowAt: 3 }, ctx());
    expect(res.ok && res.root.houseItems[1]).toEqual({ id: 'h2', name: 'ยาสามัญทดสอบ ข', stock: { qty: 4, unit: 'ขวด' }, lowAt: 3 });
  });
  it('a patch that changes nothing is ok and returns the same root', () => {
    const root = withItems();
    const res = editHouseItem(root, 'h1', { name: 'ยาสามัญทดสอบ ก' }, ctx());
    expect(res.ok && res.root).toBe(root);
  });
  it('an unknown id, a hidden item and a wrong value are refused', () => {
    expect(editHouseItem(withItems(), 'nope', { name: 'ชื่อใหม่ทดสอบ' }, ctx())).toEqual({ ok: false, error: 'house_item_not_found' });
    const hidden = removeHouseItem(withItems(), 'h1', ctx());
    expect(hidden.ok && editHouseItem(hidden.root, 'h1', { name: 'ชื่อใหม่ทดสอบ' }, ctx())).toEqual({ ok: false, error: 'house_item_removed' });
    expect(editHouseItem(withItems(), 'h1', { name: 'ก' }, ctx())).toEqual({ ok: false, error: 'invalid_house_name' });
    expect(editHouseItem(withItems(), 'h1', { expiry: '2027-13-01' }, ctx())).toEqual({ ok: false, error: 'invalid_expiry' });
  });
  it('is allowed on the sample (it can never mix real data into it) and the house stays a sample', () => {
    const sample = loadSample(emptyRoot(NOW), D19, NOW);
    const id = sample.houseItems[0]?.id ?? '';
    const res = editHouseItem(sample, id, { note: 'ทดลอง' }, ctx());
    expect(res.ok && res.root.meta.isSample).toBe(true);
  });
});

describe('cutHouseStock action', () => {
  it('10 cut 3 -> 7 left; 10 cut 10 -> 0 left', () => {
    const a = cutHouseStock(withItems(), 'h1', 3, ctx());
    expect(a.ok && a.left).toBe(7);
    expect(a.ok && a.root.houseItems[0]?.stock?.qty).toBe(7);
    const b = cutHouseStock(withItems(), 'h1', 10, ctx());
    expect(b.ok && b.left).toBe(0);
    b.ok && valid(b.root);
  });
  it('10 cut 11 -> refused with cut_over_stock; the caller still holds 10', () => {
    const root = withItems();
    expect(cutHouseStock(root, 'h1', 11, ctx())).toEqual({ ok: false, error: 'cut_over_stock' });
    expect(root.houseItems[0]?.stock?.qty).toBe(10);
  });
  it('0, 1.5 and -1 are refused', () => {
    for (const bad of [0, 1.5, -1]) {
      expect(cutHouseStock(withItems(), 'h1', bad, ctx())).toEqual({ ok: false, error: 'invalid_cut' });
    }
  });
  it('an item without stock, an unknown id and a hidden item are refused', () => {
    expect(cutHouseStock(withItems(), 'h2', 1, ctx())).toEqual({ ok: false, error: 'no_stock' });
    expect(cutHouseStock(withItems(), 'nope', 1, ctx())).toEqual({ ok: false, error: 'house_item_not_found' });
    const hidden = removeHouseItem(withItems(), 'h1', ctx());
    expect(hidden.ok && cutHouseStock(hidden.root, 'h1', 1, ctx())).toEqual({ ok: false, error: 'house_item_removed' });
  });
  it('after cutting to the warn level the care list shows it', () => {
    const res = cutHouseStock(withItems(), 'h1', 5, ctx()); // 10 -> 5 = lowAt
    expect(res.ok && careItems(res.root, D19).lowStock.map((i) => i.name)).toEqual(['ยาสามัญทดสอบ ก']);
  });
});

describe('removeHouseItem / restoreHouseItem (hide, never delete)', () => {
  it('remove sets removedAt, keeps the item, and the care list stops showing it', () => {
    const low = cutHouseStock(withItems(), 'h1', 10, ctx());
    if (!low.ok) throw new Error('setup');
    expect(careItems(low.root, D19).count).toBe(1);
    const res = removeHouseItem(low.root, 'h1', ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    valid(res.root);
    expect(res.root.houseItems).toHaveLength(2);
    expect(res.root.houseItems[0]?.removedAt).toBe(LATER);
    expect(careItems(res.root, D19).count).toBe(0);
  });
  it('restore brings the item back exactly as it was', () => {
    const removed = removeHouseItem(withItems(), 'h1', ctx());
    if (!removed.ok) throw new Error('setup');
    const back = restoreHouseItem(removed.root, 'h1', ctx());
    expect(back.ok && back.root.houseItems).toEqual([para, eye]);
  });
  it('removing twice, restoring one that is not hidden and unknown ids are refused', () => {
    const removed = removeHouseItem(withItems(), 'h1', ctx());
    if (!removed.ok) throw new Error('setup');
    expect(removeHouseItem(removed.root, 'h1', ctx())).toEqual({ ok: false, error: 'house_already_removed' });
    expect(restoreHouseItem(withItems(), 'h1', ctx())).toEqual({ ok: false, error: 'house_not_removed' });
    expect(removeHouseItem(withItems(), 'nope', ctx())).toEqual({ ok: false, error: 'house_item_not_found' });
    expect(restoreHouseItem(withItems(), 'nope', ctx())).toEqual({ ok: false, error: 'house_item_not_found' });
  });
  it('removing keeps the prices of the item (they come back with it)', () => {
    const price: Price = { id: 'pr1', shopId: 's1', item: { kind: 'house', houseItemId: 'h1' }, price: 35, sellUnit: 'แผง', perSellUnit: 1 };
    const root = rootWith({ houseItems: [para], shops: [{ id: 's1', name: 'ร้านทดสอบ ก', delivery: { kind: 'pickup' } }], prices: [price] });
    const res = removeHouseItem(root, 'h1', ctx());
    expect(res.ok && res.root.prices).toEqual([price]);
  });
});

describe('shops', () => {
  const shopA: Shop = { id: 'sA', name: 'ร้านทดสอบ ก', delivery: { kind: 'pickup' } };
  const shopB: Shop = { id: 'sB', name: 'ร้านทดสอบ ข', phone: '081-234-5678', delivery: { kind: 'deliver', fee: 40, freeOver: 500 } };
  const price = (id: string, shopId: string, houseItemId: string): Price => ({
    id,
    shopId,
    item: { kind: 'house', houseItemId },
    price: 35,
    sellUnit: 'แผง',
    perSellUnit: 1,
  });
  // shop A has 3 prices, shop B has 2
  const twoShops = (): Root =>
    rootWith({
      houseItems: [para, eye],
      shops: [shopA, shopB],
      prices: [price('p1', 'sA', 'h1'), price('p2', 'sA', 'h2'), { ...price('p3', 'sA', 'x'), item: { kind: 'med', medicationId: 'm1' }, perSellUnit: 10 }, price('p4', 'sB', 'h1'), price('p5', 'sB', 'h2')],
      medications: [{ id: 'm1', name: 'ยาทดสอบ 5 mg', unit: 'เม็ด' }],
    });

  it('addShop adds a valid shop with a new id; delivery and phone are kept', () => {
    const res = addShop(emptyRoot(NOW), { name: ' ร้านทดสอบ ข ', phone: '081-234-5678', delivery: { kind: 'deliver', fee: 0 } }, ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    valid(res.root);
    expect(res.root.shops).toEqual([{ id: res.shopId, name: 'ร้านทดสอบ ข', phone: '081-234-5678', delivery: { kind: 'deliver', fee: 0 } }]);
  });
  it('addShop refuses wrong values with their own code and is refused on the sample', () => {
    expect(addShop(emptyRoot(NOW), { name: ' ก ', delivery: { kind: 'pickup' } }, ctx())).toEqual({ ok: false, error: 'invalid_shop_name' });
    expect(addShop(emptyRoot(NOW), { name: 'ร้านทดสอบ', phone: '12', delivery: { kind: 'pickup' } }, ctx())).toEqual({ ok: false, error: 'invalid_phone' });
    expect(addShop(emptyRoot(NOW), { name: 'ร้านทดสอบ', delivery: { kind: 'deliver', fee: -1 } }, ctx())).toEqual({ ok: false, error: 'invalid_fee' });
    expect(addShop(emptyRoot(NOW), { name: 'ร้านทดสอบ', delivery: { kind: 'deliver', fee: 0, freeOver: 0 } }, ctx())).toEqual({ ok: false, error: 'invalid_free_over' });
    expect(addShop(loadSample(emptyRoot(NOW), D19, NOW), { name: 'ร้านทดสอบ', delivery: { kind: 'pickup' } }, ctx())).toEqual({ ok: false, error: 'sample_present' });
  });
  it('editShop changes the details and keeps the prices of that shop', () => {
    const res = editShop(twoShops(), 'sA', { name: 'ร้านทดสอบ ใหม่', delivery: { kind: 'deliver', fee: 30 } }, ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    valid(res.root);
    expect(res.root.shops[0]).toEqual({ id: 'sA', name: 'ร้านทดสอบ ใหม่', delivery: { kind: 'deliver', fee: 30 } });
    expect(res.root.prices).toHaveLength(5);
  });
  it('editShop: an untouched form is ok (same root); wrong values and unknown ids are refused', () => {
    const root = twoShops();
    const same = editShop(root, 'sB', { name: 'ร้านทดสอบ ข', phone: '081-234-5678', delivery: { kind: 'deliver', fee: 40, freeOver: 500 } }, ctx());
    expect(same.ok && same.root).toBe(root);
    expect(editShop(root, 'sA', { name: 'ก', delivery: { kind: 'pickup' } }, ctx())).toEqual({ ok: false, error: 'invalid_shop_name' });
    expect(editShop(root, 'nope', { name: 'ร้านทดสอบ', delivery: { kind: 'pickup' } }, ctx())).toEqual({ ok: false, error: 'shop_not_found' });
  });
  it('deleteShop: 2 shops, A has 3 prices, B has 2 -> delete A leaves 2 prices, all of B', () => {
    const res = deleteShop(twoShops(), 'sA', ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    valid(res.root);
    expect(res.pricesRemoved).toBe(3);
    expect(res.root.shops).toEqual([shopB]);
    expect(res.root.prices.map((p) => p.id)).toEqual(['p4', 'p5']);
    expect(res.root.prices.every((p) => p.shopId === 'sB')).toBe(true);
  });
  it('deleteShop: house medicines and medicines stay; an unknown shop is refused', () => {
    const res = deleteShop(twoShops(), 'sB', ctx());
    expect(res.ok && res.root.houseItems).toHaveLength(2);
    expect(res.ok && res.root.medications).toHaveLength(1);
    expect(deleteShop(twoShops(), 'nope', ctx())).toEqual({ ok: false, error: 'shop_not_found' });
  });
  it('deleting the last shop leaves no price at all', () => {
    const root = rootWith({ shops: [shopA], prices: [price('p1', 'sA', 'h1')], houseItems: [para] });
    const res = deleteShop(root, 'sA', ctx());
    expect(res.ok && res.root.prices).toEqual([]);
  });
});

describe('a backup with house medicines, shops and prices (no schema change)', () => {
  it('an existing backup file still restores: house items, shops and prices come back unchanged', () => {
    const shop: Shop = { id: 'sA', name: 'ร้านทดสอบ ก', phone: '081-234-5678', delivery: { kind: 'deliver', fee: 40, freeOver: 500 } };
    const price: Price = { id: 'p1', shopId: 'sA', item: { kind: 'house', houseItemId: 'h1' }, price: 35, sellUnit: 'แผง', perSellUnit: 1 };
    const removed: HouseItem = { ...eye, removedAt: LATER };
    const root = rootWith({ houseItems: [para, removed], shops: [shop], prices: [price] });
    const check = summarizeBackup(makeBackup(root, LATER).text);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.root.houseItems).toEqual([para, removed]);
      expect(check.root.shops).toEqual([shop]);
      expect(check.root.prices).toEqual([price]);
    }
  });
  it('a blank house and the sample both still pass the schema after the new actions exist', () => {
    valid(emptyRoot(NOW));
    valid(loadSample(emptyRoot(NOW), D19, NOW));
  });
});
