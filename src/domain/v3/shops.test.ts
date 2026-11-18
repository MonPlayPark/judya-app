import { describe, expect, it } from 'vitest';
import type { ShopInput } from '../shop';
import { makeBackup, summarizeBackup } from './backup';
import { NOW, blankRootV3, sampleRootV3 } from './fixtures';
import { rootSchema, type Root } from './schema';
import { addShop, deleteShop, shopLine, updateShop } from './shops';
import { shopsDemoRoot } from './shopsDemo';
import { PREV_KEY, STORAGE_KEY, loadRoot, restoreRoot, saveRoot, startFresh, type KeyValueStore } from './storage';

const ids = (): (() => string) => {
  let n = 0;
  return () => `new${(n += 1)}`;
};
const deliver = (name: string, fee = 40, extra: Partial<ShopInput> = {}): ShopInput => ({ name, delivery: { kind: 'deliver', fee }, ...extra });
const pickup = (name: string): ShopInput => ({ name, delivery: { kind: 'pickup' } });

class FakeStore implements KeyValueStore {
  data = new Map<string, string>();
  failQuota = false;
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem(k: string, v: string): void {
    if (this.failQuota) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem = (k: string): void => void this.data.delete(k);
}

describe('addShop', () => {
  it('adds a delivery shop at the end with a new id', () => {
    const r = addShop(blankRootV3(), { name: '  ร้านทดสอบ ก ', phone: ' 021234567 ', delivery: { kind: 'deliver', fee: 40 } }, ids());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shop).toEqual({ id: 'new1', name: 'ร้านทดสอบ ก', phone: '021234567', delivery: { kind: 'deliver', fee: 40 } });
    expect(r.root.shops).toEqual([r.shop]);
    expect(rootSchema.safeParse(r.root).success).toBe(true);
  });
  it('adds a pick-up shop with no fee and no phone', () => {
    const r = addShop(blankRootV3(), pickup('ร้านทดสอบ ข'), ids());
    expect(r.ok && r.shop).toEqual({ id: 'new1', name: 'ร้านทดสอบ ข', delivery: { kind: 'pickup' } });
  });
  it('a pick-up shop keeps no fee even if a fee was typed first', () => {
    const r = addShop(blankRootV3(), { name: 'ร้านทดสอบ ก', delivery: { kind: 'pickup' } }, ids());
    expect(r.ok && r.shop.delivery).toEqual({ kind: 'pickup' });
  });
  it('fee 0 is allowed (the shop always delivers free)', () => {
    const r = addShop(blankRootV3(), deliver('ร้านทดสอบ ก', 0), ids());
    expect(r.ok && r.shop.delivery).toEqual({ kind: 'deliver', fee: 0 });
  });
  it('a fee with satang is allowed', () => {
    const r = addShop(blankRootV3(), deliver('ร้านทดสอบ ก', 40.5), ids());
    expect(r.ok && r.shop.delivery).toEqual({ kind: 'deliver', fee: 40.5 });
  });
  it('refuses a name shorter than 2 and longer than 40 (after trimming)', () => {
    expect(addShop(blankRootV3(), pickup(' ก '))).toMatchObject({ ok: false, error: 'invalid', fields: { name: 'invalid_shop_name' } });
    expect(addShop(blankRootV3(), pickup(''))).toMatchObject({ ok: false, fields: { name: 'invalid_shop_name' } });
    expect(addShop(blankRootV3(), pickup('ก'.repeat(41)))).toMatchObject({ ok: false, fields: { name: 'invalid_shop_name' } });
    expect(addShop(blankRootV3(), pickup('ก'.repeat(40)), ids()).ok).toBe(true);
    expect(addShop(blankRootV3(), pickup('กข'), ids()).ok).toBe(true);
  });
  it('refuses a phone in the wrong format, accepts the allowed signs', () => {
    expect(addShop(blankRootV3(), { ...pickup('ร้านทดสอบ ก'), phone: 'abc123' })).toMatchObject({ ok: false, fields: { phone: 'invalid_phone' } });
    expect(addShop(blankRootV3(), { ...pickup('ร้านทดสอบ ก'), phone: '12345' })).toMatchObject({ ok: false, fields: { phone: 'invalid_phone' } });
    expect(addShop(blankRootV3(), { ...pickup('ร้านทดสอบ ก'), phone: '+66 2-123 4567' }, ids()).ok).toBe(true);
    expect(addShop(blankRootV3(), { ...pickup('ร้านทดสอบ ก'), phone: '   ' }, ids())).toMatchObject({ ok: true });
  });
  it('refuses a missing, negative, not-a-number or 3-decimal fee', () => {
    for (const fee of [Number.NaN, -1, -0.5, Number.POSITIVE_INFINITY, 40.123]) {
      expect(addShop(blankRootV3(), deliver('ร้านทดสอบ ก', fee))).toMatchObject({ ok: false, fields: { fee: 'invalid_fee' } });
    }
  });
  it('reports every wrong field at once', () => {
    const r = addShop(blankRootV3(), { name: 'ก', phone: 'x', delivery: { kind: 'deliver', fee: -1 } });
    expect(r).toMatchObject({ ok: false, fields: { name: 'invalid_shop_name', phone: 'invalid_phone', fee: 'invalid_fee' } });
  });
  it('refuses the same name in another case or with spaces around it', () => {
    const root = shopsDemoRoot('normal');
    const withLatin = addShop(root, pickup('Test Shop'), ids());
    if (!withLatin.ok) throw new Error('setup');
    expect(addShop(withLatin.root, pickup('  test shop '))).toMatchObject({ ok: false, fields: { name: 'duplicate_name' } });
    expect(addShop(root, pickup(' ร้านทดสอบ ก '))).toMatchObject({ ok: false, error: 'invalid', fields: { name: 'duplicate_name' } });
  });
  it('does not change the root it was given', () => {
    const root = blankRootV3();
    const copy = structuredClone(root);
    addShop(root, pickup('ร้านทดสอบ ก'), ids());
    expect(root).toEqual(copy);
  });
  it('adds to a house that already has shops, orders and prices', () => {
    const r = addShop(sampleRootV3(), pickup('ร้านทดสอบ ใหม่'), ids());
    expect(r.ok && r.root.shops.length).toBe(sampleRootV3().shops.length + 1);
  });
});

describe('updateShop', () => {
  const root = shopsDemoRoot('normal');
  it('changes the shop in place and keeps its place in the list', () => {
    const r = updateShop(root, 's2', { name: 'ร้านทดสอบ ข2', phone: '029999999', delivery: { kind: 'deliver', fee: 25 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.root.shops.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(r.root.shops[1]).toEqual({ id: 's2', name: 'ร้านทดสอบ ข2', phone: '029999999', delivery: { kind: 'deliver', fee: 25 } });
  });
  it('can keep its own name (not a duplicate of itself)', () => {
    expect(updateShop(root, 's1', { name: 'ร้านทดสอบ ก', delivery: { kind: 'deliver', fee: 55 } }).ok).toBe(true);
    expect(updateShop(root, 's1', { name: ' ร้านทดสอบ ก ', delivery: { kind: 'deliver', fee: 55 } }).ok).toBe(true);
  });
  it('refuses another shop\'s name', () => {
    expect(updateShop(root, 's1', pickup('ร้านทดสอบ ข'))).toMatchObject({ ok: false, fields: { name: 'duplicate_name' } });
  });
  it('removes the phone when the box is emptied', () => {
    const r = updateShop(root, 's1', { name: 'ร้านทดสอบ ก', phone: '', delivery: { kind: 'deliver', fee: 40 } });
    expect(r.ok && 'phone' in r.shop).toBe(false);
  });
  it('keeps the "free over" value of the shop when the edit does not mention it', () => {
    const r = updateShop(root, 's3', { name: 'ร้านทดสอบ ค', delivery: { kind: 'deliver', fee: 35 } });
    expect(r.ok && r.shop.delivery).toEqual({ kind: 'deliver', fee: 35, freeOver: 500 });
  });
  it('an edit that only renames the shop keeps the stored "free over" value', () => {
    const r = updateShop(root, 's3', { name: 'ร้านทดสอบ ค ใหม่', delivery: { kind: 'deliver', fee: 30 } });
    expect(r.ok && r.shop.delivery).toEqual({ kind: 'deliver', fee: 30, freeOver: 500 });
  });
  it('keeps it when the form hands the same value back, and null clears it', () => {
    const same = updateShop(root, 's3', { name: 'ร้านทดสอบ ค', delivery: { kind: 'deliver', fee: 35, freeOver: 500 } });
    expect(same.ok && same.shop.delivery).toEqual({ kind: 'deliver', fee: 35, freeOver: 500 });
    const cleared = updateShop(root, 's3', { name: 'ร้านทดสอบ ค', delivery: { kind: 'deliver', fee: 35, freeOver: null } });
    expect(cleared.ok && cleared.shop.delivery).toEqual({ kind: 'deliver', fee: 35 });
  });
  it('a shop that becomes pick-up drops fee and "free over"', () => {
    const r = updateShop(root, 's3', pickup('ร้านทดสอบ ค'));
    expect(r.ok && r.shop.delivery).toEqual({ kind: 'pickup' });
  });
  it('does not touch prices, orders or other shops', () => {
    const sample = sampleRootV3();
    const r = updateShop(sample, 's2', { name: 'ร้านตัวอย่าง 2 ใหม่', delivery: { kind: 'deliver', fee: 45 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.root.prices).toEqual(sample.prices);
    expect(r.root.orders).toEqual(sample.orders);
    expect(r.root.shops[0]).toEqual(sample.shops[0]);
    expect(r.root.orders.find((o) => o.id === 'o2')?.shippingFee).toBe(40); // history does not change with the shop
  });
  it('says not_found for an unknown id and still checks the fields', () => {
    expect(updateShop(root, 'nope', pickup('ร้านทดสอบ ก'))).toMatchObject({ ok: false, error: 'not_found' });
    expect(updateShop(root, 's1', pickup('ก'))).toMatchObject({ ok: false, error: 'invalid', fields: { name: 'invalid_shop_name' } });
  });
});

describe('deleteShop', () => {
  it('removes the shop and only the prices remembered for it, in one new root', () => {
    const sample = sampleRootV3();
    const r = deleteShop(sample, 's1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.root.shops.map((s) => s.id)).toEqual(['s2', 's3']);
    expect(r.root.prices.map((p) => p.id)).toEqual(['pr2']);
    expect(r.removedPrices).toBe(2);
    expect(sample.shops).toHaveLength(3); // the old root is unchanged
  });
  it('keeps old orders of the shop, with the name they were made under', () => {
    const sample = sampleRootV3();
    const r = deleteShop(sample, 's1');
    if (!r.ok) throw new Error('setup');
    expect(r.root.orders).toEqual(sample.orders);
    expect(r.root.orders.filter((o) => o.shopId === 's1').map((o) => o.shopName)).toEqual(['ร้านตัวอย่าง 1', 'ร้านตัวอย่าง 1']);
  });
  it('a shop with no prices and no orders is removed alone', () => {
    const r = deleteShop(shopsDemoRoot('normal'), 's2');
    expect(r.ok && r.root.shops.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(r.ok && r.removedPrices).toBe(0);
  });
  it('says not_found for an unknown id', () => {
    expect(deleteShop(blankRootV3(), 'nope')).toEqual({ ok: false, error: 'not_found' });
  });
  it('the result survives backup -> wipe -> restore (reference check passes)', () => {
    const r = deleteShop(sampleRootV3(), 's1');
    if (!r.ok) throw new Error('setup');
    const file = makeBackup(r.root, NOW);
    const check = summarizeBackup(file.text);
    expect(check.ok).toBe(true);
    const store = new FakeStore();
    expect(saveRoot(r.root, store)).toEqual({ ok: true });
    expect(startFresh(NOW, store)).toEqual({ ok: true });
    expect(loadRoot(store)).toMatchObject({ status: 'ok', root: { shops: [] } });
    if (!check.ok) return;
    expect(restoreRoot(check.root, store)).toEqual({ ok: true });
    const back = loadRoot(store);
    expect(back.status).toBe('ok');
    if (back.status === 'ok') {
      expect(back.root.shops.map((s) => s.id)).toEqual(['s2', 's3']);
      expect(back.root.orders).toHaveLength(4);
    }
  });
});

describe('saving a shop', () => {
  const store = (root: Root): FakeStore => {
    const s = new FakeStore();
    expect(saveRoot(root, s)).toEqual({ ok: true });
    return s;
  };
  it('a save that fails (storage full) keeps the old data and only the two v3 keys exist', () => {
    const old = shopsDemoRoot('normal');
    const s = store(old);
    const before = s.getItem(STORAGE_KEY);
    const made = addShop(old, deliver('ร้านทดสอบ ง'), ids());
    if (!made.ok) throw new Error('setup');
    s.failQuota = true;
    expect(saveRoot(made.root, s)).toMatchObject({ ok: false, reason: 'quota' });
    expect(s.getItem(STORAGE_KEY)).toBe(before);
    expect([...s.data.keys()].filter((k) => k !== STORAGE_KEY && k !== PREV_KEY)).toEqual([]);
  });
  it('an added shop is read back after a save', () => {
    const s = store(blankRootV3());
    const made = addShop(blankRootV3(), pickup('ร้านทดสอบ ก'), ids());
    if (!made.ok) throw new Error('setup');
    expect(saveRoot(made.root, s)).toEqual({ ok: true });
    expect(loadRoot(s)).toMatchObject({ status: 'ok', root: { shops: [{ name: 'ร้านทดสอบ ก' }] } });
  });
});

describe('shopLine', () => {
  it('says phone and how, and never talks about free delivery', () => {
    expect(shopLine({ id: 'a', name: 'ร้านทดสอบ ก', phone: '021234567', delivery: { kind: 'deliver', fee: 40 } })).toBe('021234567 · ส่งถึงบ้าน ค่าส่ง ฿40');
    expect(shopLine({ id: 'a', name: 'ร้านทดสอบ ข', delivery: { kind: 'pickup' } })).toBe('ไปรับเอง');
    const withLimit = shopLine({ id: 'a', name: 'ร้านทดสอบ ค', delivery: { kind: 'deliver', fee: 30, freeOver: 500 } });
    expect(withLimit).toBe('ส่งถึงบ้าน ค่าส่ง ฿30');
    expect(withLimit).not.toContain('ฟรี');
    expect(shopLine({ id: 'a', name: 'ร้านทดสอบ ง', delivery: { kind: 'deliver', fee: 0 } })).not.toContain('ฟรี');
  });
});
