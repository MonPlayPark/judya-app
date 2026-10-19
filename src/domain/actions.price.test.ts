// Step 3.3b-1: setPrice, deletePrice and the two new settings. Made-up data only.
import { describe, expect, it } from 'vitest';
import {
  deletePrice,
  deleteShop,
  loadSample,
  removeHouseItem,
  restoreHouseItem,
  setPrice,
  setSettings,
  type HouseContext,
} from './actions';
import { makeBackup, summarizeBackup } from './backup';
import { NOW } from './fixtures';
import { rootWith } from './helpers.test-util';
import { emptyRoot, rootSchema, type HouseItem, type Medication, type Price, type Root, type Shop } from './schema';

const LATER = '2026-10-19T20:00:00+07:00';
let n = 0;
const ctx = (): HouseContext => ({ nowIso: LATER, newId: () => `id${++n}` });

const shopA: Shop = { id: 'sA', name: 'ร้านทดสอบ ก', delivery: { kind: 'pickup' } };
const shopB: Shop = { id: 'sB', name: 'ร้านทดสอบ ข', delivery: { kind: 'deliver', fee: 40, freeOver: 1000 } };
const medX: Medication = { id: 'mX', name: 'ยาทดสอบ เอ 10 mg', unit: 'เม็ด' };
const para: HouseItem = { id: 'h1', name: 'ยาสามัญทดสอบ ก', stock: { qty: 10, unit: 'เม็ด' }, lowAt: 5 };
const base = (): Root => rootWith({ shops: [shopA, shopB], medications: [medX], houseItems: [para] });

const valid = (r: Root) => expect(rootSchema.safeParse(r).success).toBe(true);
const ok = <T extends { ok: boolean }>(res: T): Extract<T, { ok: true }> => {
  if (!res.ok) throw new Error(JSON.stringify(res));
  return res as Extract<T, { ok: true }>;
};

const medInput = { shopId: 'sA', item: { kind: 'med', medicationId: 'mX' } as const, price: 290, sellUnit: 'กล่อง', perSellUnit: 60 };
const houseInput = { shopId: 'sA', item: { kind: 'house', houseItemId: 'h1' } as const, price: 35, sellUnit: 'ขวด' };

describe('setPrice', () => {
  it('adds the price of a regular medicine in one shop and returns the new id', () => {
    const res = ok(setPrice(base(), medInput, ctx()));
    valid(res.root);
    expect(res.root.prices).toEqual([
      { id: res.priceId, shopId: 'sA', item: { kind: 'med', medicationId: 'mX' }, price: 290, sellUnit: 'กล่อง', perSellUnit: 60 },
    ]);
  });
  it('adds the price of a house medicine (perSellUnit 1 even when left out)', () => {
    const res = ok(setPrice(base(), houseInput, ctx()));
    valid(res.root);
    expect(res.root.prices[0]).toMatchObject({ item: { kind: 'house', houseItemId: 'h1' }, price: 35, sellUnit: 'ขวด', perSellUnit: 1 });
  });
  it('the same (shop, medicine) twice leaves ONE price: the new value with the old id', () => {
    const first = ok(setPrice(base(), medInput, ctx()));
    const second = ok(setPrice(first.root, { ...medInput, price: 310, sellUnit: 'แผง', perSellUnit: 30 }, ctx()));
    expect(second.priceId).toBe(first.priceId);
    expect(second.root.prices).toHaveLength(1);
    expect(second.root.prices[0]).toMatchObject({ id: first.priceId, price: 310, sellUnit: 'แผง', perSellUnit: 30 });
    valid(second.root);
  });
  it('the same medicine in another shop is a second price; another medicine in the same shop too', () => {
    let root = ok(setPrice(base(), medInput, ctx())).root;
    root = ok(setPrice(root, { ...medInput, shopId: 'sB', price: 240 }, ctx())).root;
    root = ok(setPrice(root, houseInput, ctx())).root;
    expect(root.prices).toHaveLength(3);
    expect(new Set(root.prices.map((p) => p.id)).size).toBe(3);
  });
  it('setting the same values again changes nothing (same root, same id)', () => {
    const first = ok(setPrice(base(), medInput, ctx()));
    const again = ok(setPrice(first.root, medInput, ctx()));
    expect(again.root).toBe(first.root);
    expect(again.priceId).toBe(first.priceId);
  });
  it('a regular medicine price needs perSellUnit (Q: owner decision)', () => {
    const { perSellUnit: _p, ...noPer } = medInput;
    expect(setPrice(base(), noPer, ctx())).toEqual({ ok: false, error: 'per_sell_unit_required' });
    expect(setPrice(base(), { ...medInput, perSellUnit: 0 }, ctx())).toEqual({ ok: false, error: 'invalid_per_sell_unit' });
  });
  it('a house price with perSellUnit 2, price 0 and an empty unit are refused with their own code', () => {
    expect(setPrice(base(), { ...houseInput, perSellUnit: 2 }, ctx())).toEqual({ ok: false, error: 'invalid_per_sell_unit' });
    expect(setPrice(base(), { ...houseInput, price: 0 }, ctx())).toEqual({ ok: false, error: 'invalid_price' });
    expect(setPrice(base(), { ...houseInput, sellUnit: ' ' }, ctx())).toEqual({ ok: false, error: 'invalid_sell_unit' });
  });
  it('a refused change leaves an existing price untouched', () => {
    const first = ok(setPrice(base(), medInput, ctx()));
    expect(setPrice(first.root, { ...medInput, price: -1 }, ctx()).ok).toBe(false);
    expect(first.root.prices[0]?.price).toBe(290);
  });
  it('refuses a shop that does not exist, a medication that does not exist and a house medicine that does not exist', () => {
    expect(setPrice(base(), { ...medInput, shopId: 'nope' }, ctx())).toEqual({ ok: false, error: 'shop_not_found' });
    expect(setPrice(base(), { ...medInput, item: { kind: 'med', medicationId: 'nope' } }, ctx())).toEqual({ ok: false, error: 'medication_not_found' });
    expect(setPrice(base(), { ...houseInput, item: { kind: 'house', houseItemId: 'nope' } }, ctx())).toEqual({ ok: false, error: 'house_item_not_found' });
  });
  it('refuses a house medicine that is deleted (also to change an old price); the old price stays', () => {
    const withPrice = ok(setPrice(base(), houseInput, ctx())).root;
    const hidden = ok(removeHouseItem(withPrice, 'h1', ctx())).root;
    expect(setPrice(hidden, houseInput, ctx())).toEqual({ ok: false, error: 'house_item_removed' });
    expect(setPrice(hidden, { ...houseInput, shopId: 'sB' }, ctx())).toEqual({ ok: false, error: 'house_item_removed' });
    expect(hidden.prices).toEqual(withPrice.prices);
  });
  it('hiding and bringing back a house medicine leaves its prices exactly as they were', () => {
    const withPrice = ok(setPrice(base(), houseInput, ctx())).root;
    const hidden = ok(removeHouseItem(withPrice, 'h1', ctx())).root;
    expect(hidden.prices).toEqual(withPrice.prices);
    const back = ok(restoreHouseItem(hidden, 'h1', ctx())).root;
    expect(back.prices).toEqual(withPrice.prices);
  });
  it('a medicine used by two members has ONE shared price (Q6)', () => {
    const root = rootWith({
      shops: [shopA],
      medications: [medX],
      persons: [
        { id: 'p1', name: 'Test Person A', relation: 'ตัวฉัน', color: 'blue', selfManaged: false, insurance: {} },
        { id: 'p2', name: 'Test Person B', relation: 'แม่', color: 'green', selfManaged: false, insurance: {} },
      ],
    });
    const once = ok(setPrice(root, medInput, ctx()));
    const twice = ok(setPrice(once.root, { ...medInput, price: 300 }, ctx()));
    expect(twice.root.prices).toHaveLength(1);
    expect(twice.root.prices[0]?.item).toEqual({ kind: 'med', medicationId: 'mX' });
  });
  it('while the house is the sample a NEW price is sample_present, changing an existing one is allowed', () => {
    const sample = loadSample(emptyRoot(NOW), '2026-10-19', NOW);
    const med = sample.medications[0];
    // The sample has no shops: add one by hand (the real flow clears the sample first).
    const withShop: Root = { ...sample, shops: [shopA] };
    const input = { shopId: 'sA', item: { kind: 'med', medicationId: med?.id ?? '' } as const, price: 290, sellUnit: 'กล่อง', perSellUnit: 60 };
    expect(med).toBeDefined();
    expect(setPrice(withShop, input, ctx())).toEqual({ ok: false, error: 'sample_present' });
    const existing: Price = { id: 'pr1', shopId: 'sA', item: input.item, price: 290, sellUnit: 'กล่อง', perSellUnit: 60 };
    const changed = ok(setPrice({ ...withShop, prices: [existing] }, { ...input, price: 295 }, ctx()));
    expect(changed.priceId).toBe('pr1');
    expect(changed.root.prices[0]?.price).toBe(295);
    expect(changed.root.meta.isSample).toBe(true);
  });
});

describe('deletePrice', () => {
  it('removes that one price only; the shop and the medicine stay', () => {
    let root = ok(setPrice(base(), medInput, ctx())).root;
    const house = ok(setPrice(root, houseInput, ctx()));
    root = house.root;
    const res = ok(deletePrice(root, house.priceId, ctx()));
    valid(res.root);
    expect(res.root.prices).toHaveLength(1);
    expect(res.root.prices[0]?.item.kind).toBe('med');
    expect(res.root.shops).toEqual(root.shops);
    expect(res.root.houseItems).toEqual(root.houseItems);
  });
  it('an unknown id is price_not_found and nothing changes', () => {
    expect(deletePrice(base(), 'nope', ctx())).toEqual({ ok: false, error: 'price_not_found' });
  });
  it('a price of a deleted house medicine can still be removed', () => {
    const p = ok(setPrice(base(), houseInput, ctx()));
    const hidden = ok(removeHouseItem(p.root, 'h1', ctx())).root;
    expect(ok(deletePrice(hidden, p.priceId, ctx())).root.prices).toEqual([]);
  });
  it('after a delete the pair can get a price again with a new id', () => {
    const p = ok(setPrice(base(), medInput, ctx()));
    const gone = ok(deletePrice(p.root, p.priceId, ctx())).root;
    const again = ok(setPrice(gone, medInput, ctx()));
    expect(again.priceId).not.toBe(p.priceId);
    expect(again.root.prices).toHaveLength(1);
  });
});

describe('deleting a shop with three prices', () => {
  it('all prices of that shop go, the other shop keeps its own', () => {
    let root = base();
    root = ok(setPrice(root, medInput, ctx())).root; // A med
    root = ok(setPrice(root, houseInput, ctx())).root; // A house
    root = ok(setPrice(root, { ...medInput, shopId: 'sB', price: 240, sellUnit: 'แผง', perSellUnit: 30 }, ctx())).root; // B med
    root = ok(setPrice(root, { ...houseInput, shopId: 'sB', price: 40 }, ctx())).root; // B house
    expect(root.prices).toHaveLength(4);
    const withThird = ok(setPrice({ ...root, houseItems: [...root.houseItems, { id: 'h2', name: 'ยาสามัญทดสอบ ข' }] }, { ...houseInput, item: { kind: 'house', houseItemId: 'h2' } }, ctx())).root;
    expect(withThird.prices.filter((p) => p.shopId === 'sA')).toHaveLength(3);
    const res = ok(deleteShop(withThird, 'sA', ctx()));
    expect(res.pricesRemoved).toBe(3);
    expect(res.root.prices.every((p) => p.shopId === 'sB')).toBe(true);
    expect(res.root.prices).toHaveLength(2);
    valid(res.root);
  });
});

describe('setSettings: order days and order text', () => {
  const apply = (patch: Parameters<typeof setSettings>[1], root: Root = rootWith({})) => ok(setSettings(root, patch)).root;

  it('orderDays accepts 7 and 90 and 30, refuses 6, 91, 0, 1.5, NaN and Infinity', () => {
    for (const d of [7, 30, 90]) expect(apply({ orderDays: d }).settings.orderDays).toBe(d);
    for (const d of [6, 91, 0, -7, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(setSettings(rootWith({}), { orderDays: d })).toEqual({ ok: false, error: 'invalid_order_days' });
    }
  });
  it('orderTemplate takes any text, also empty (= the default text)', () => {
    expect(apply({ orderTemplate: 'ขอสั่งยา {ร้าน}\n{รายการ}' }).settings.orderTemplate).toBe('ขอสั่งยา {ร้าน}\n{รายการ}');
    expect(apply({ orderTemplate: '' }, apply({ orderTemplate: 'x' })).settings.orderTemplate).toBe('');
    expect(apply({ orderTemplate: '  ' }).settings.orderTemplate).toBe('  ');
  });
  it('a left-out field stays; a refused field changes nothing at all (the old rules hold)', () => {
    const root = apply({ orderTemplate: 'ข้อความเดิม', orderDays: 45 });
    const next = apply({ lowStockDays: 14 }, root);
    expect(next.settings).toEqual({ ...root.settings, lowStockDays: 14 });
    expect(setSettings(root, { orderTemplate: 'ข้อความใหม่', orderDays: 3 }).ok).toBe(false);
    expect(root.settings.orderTemplate).toBe('ข้อความเดิม');
    expect(setSettings(root, { orderDays: 60, lowStockDays: 99 })).toEqual({ ok: false, error: 'invalid_low_stock_days' });
  });
  it('the result passes the schema', () => {
    valid(apply({ orderDays: 90, orderTemplate: 'x', expiryWarnDays: 30, lowStockDays: 14 }));
  });
});

describe('prices, shops and settings go through a backup file', () => {
  it('shops, prices of both kinds and the new settings come back unchanged', () => {
    let root = base();
    root = ok(setPrice(root, medInput, ctx())).root;
    root = ok(setPrice(root, houseInput, ctx())).root;
    root = ok(setSettings(root, { orderDays: 45, orderTemplate: 'สั่งยา {ร้าน}\n{รายการ}' })).root;
    const check = summarizeBackup(makeBackup(root, LATER).text);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.root.shops).toEqual(root.shops);
    expect(check.root.prices).toEqual(root.prices);
    expect(check.root.settings).toEqual(root.settings);
  });
  it('an old backup without any price still restores and prices can be added to it', () => {
    const oldRoot = base();
    const check = summarizeBackup(makeBackup(oldRoot, LATER).text);
    expect(check.ok && check.root.prices).toEqual([]);
    if (check.ok) expect(setPrice(check.root, medInput, ctx()).ok).toBe(true);
  });
});
