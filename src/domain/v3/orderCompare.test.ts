import { describe, expect, it } from 'vitest';
import { compareShops, itemOfSource, unpricedText, type CompareLine } from './orderCompare';
import type { Price, Shop } from './schema';

const PICKUP: Shop = { id: 'sp', name: 'ร้านรับเอง', delivery: { kind: 'pickup' } };
const SEND: Shop = { id: 'sd', name: 'ร้านส่ง', delivery: { kind: 'deliver', fee: 40, freeOver: 500 } };
const SEND_NO_LIMIT: Shop = { id: 'sn', name: 'ร้านส่งไม่มีเกณฑ์', delivery: { kind: 'deliver', fee: 30 } };
const SEND_FREE: Shop = { id: 'sf', name: 'ร้านส่งฟรี', delivery: { kind: 'deliver', fee: 0, freeOver: 100 } };

const med = (id: string, over: Partial<CompareLine> = {}): CompareLine => ({
  key: `med:${id}`,
  source: { kind: 'med', medicationId: id, shares: [{ assignmentId: `a-${id}`, qty: 1 }] },
  qtyOrdered: 1,
  sellUnit: 'กล่อง',
  perSellUnit: 30,
  ...over,
});
const house = (id: string, over: Partial<CompareLine> = {}): CompareLine => ({
  key: `house:${id}`,
  source: { kind: 'house', houseItemId: id },
  qtyOrdered: 1,
  sellUnit: 'ขวด',
  ...over,
});
let n = 0;
const price = (shopId: string, medId: string, p: number, sellUnit: string, per: number | undefined, date = '2026-10-01'): Price => ({
  id: `pr${++n}`, shopId, item: { kind: 'med', medicationId: medId }, price: p, sellUnit, ...(per !== undefined ? { perSellUnit: per } : {}), date,
});
const housePrice = (shopId: string, id: string, p: number, sellUnit: string, date = '2026-10-01'): Price => ({
  id: `pr${++n}`, shopId, item: { kind: 'house', houseItemId: id }, price: p, sellUnit, perSellUnit: 1, date,
});
const row = (lines: CompareLine[], shops: Shop[], prices: Price[], ship = true) => compareShops(lines, shops, prices, ship).rows;

describe('compareShops - totals', () => {
  it('prices every line and adds them up (sell units x price)', () => {
    const [r] = row([med('m1', { qtyOrdered: 2 }), med('m2')], [PICKUP], [price('sp', 'm1', 100, 'กล่อง', 30), price('sp', 'm2', 55.5, 'กล่อง', 30)]);
    expect(r).toMatchObject({ itemsTotal: 255.5, total: 255.5, unpricedCount: 0, unpricedText: null });
    expect(r?.lines.map((l) => l.cost)).toEqual([200, 55.5]);
  });

  it('a shop missing some prices still gets a total for the lines it has, and says how many are left out', () => {
    const [r] = row([med('m1'), med('m2'), med('m3')], [PICKUP], [price('sp', 'm1', 100, 'กล่อง', 30)]);
    expect(r).toMatchObject({ itemsTotal: 100, unpricedCount: 2, unpricedKeys: ['med:m2', 'med:m3'], unpricedText: 'ไม่รวม 2 รายการที่ยังไม่มีราคา' });
    expect(unpricedText(1)).toBe('ไม่รวม 1 รายการที่ยังไม่มีราคา');
  });

  it('a shop with no price at all is still listed (nothing counted, no delivery fee), after the others', () => {
    const rows = row([med('m1')], [PICKUP, SEND], [price('sp', 'm1', 100, 'กล่อง', 30)]);
    expect(rows.map((r) => r.shopId)).toEqual(['sp', 'sd']);
    expect(rows[1]).toMatchObject({ lines: [], itemsTotal: 0, shipping: 0, total: 0, unpricedCount: 1 });
  });

  it('totals are rounded to the satang', () => {
    const [r] = row([med('m1'), med('m2')], [PICKUP], [price('sp', 'm1', 0.1, 'กล่อง', 30), price('sp', 'm2', 0.2, 'กล่อง', 30)]);
    expect(r?.itemsTotal).toBe(0.3);
  });

  it('no lines, no shops: empty, not an error', () => {
    expect(compareShops([], [PICKUP], [], true)).toEqual({ rows: [], lineCount: 0 });
    expect(compareShops([med('m1')], [], [], true)).toEqual({ rows: [], lineCount: 1 });
  });

  it('lines that are not ticked or have quantity 0 are left out (and not counted as unpriced)', () => {
    const lines = [med('m1'), med('m2', { ticked: false }), med('m3', { qtyOrdered: 0 })];
    const out = compareShops(lines, [PICKUP], [price('sp', 'm1', 10, 'กล่อง', 30)], true);
    expect(out.lineCount).toBe(1);
    expect(out.rows[0]).toMatchObject({ itemsTotal: 10, unpricedCount: 0 });
  });

  it('a medicine typed by hand never has a price: it is "not counted" in every shop', () => {
    const free: CompareLine = { key: 'free:x', source: { kind: 'free', name: 'ยาพิมพ์เอง' }, qtyOrdered: 1, sellUnit: 'กล่อง' };
    const [r] = row([med('m1'), free], [PICKUP], [price('sp', 'm1', 10, 'กล่อง', 30)]);
    expect(r).toMatchObject({ itemsTotal: 10, unpricedKeys: ['free:x'] });
    expect(itemOfSource(free.source)).toBeNull();
  });
});

describe('compareShops - delivery', () => {
  const lines = [med('m1')];
  it('pick-up shop: no delivery fee, pickup flag', () => {
    const [r] = row(lines, [PICKUP], [price('sp', 'm1', 100, 'กล่อง', 30)]);
    expect(r).toMatchObject({ pickup: true, shipping: 0, total: 100 });
  });

  it('a "free over" value left in old data is ignored: below it, at it and above it the fee is the same', () => {
    for (const cost of [450, 500, 600]) {
      const [r] = row(lines, [SEND], [price('sd', 'm1', cost, 'กล่อง', 30)]);
      expect(r).toMatchObject({ shipping: 40, total: cost + 40 });
      expect(r).not.toHaveProperty('freeShipping');
      expect(r).not.toHaveProperty('buyMore');
    }
  });

  it('delivery shop with "free over" 500 and items 600: fee 40 still counted, total 640 with the switch on', () => {
    const [r] = row(lines, [SEND], [price('sd', 'm1', 600, 'กล่อง', 30)], true);
    expect(r).toMatchObject({ itemsTotal: 600, shipping: 40, total: 640 });
  });

  it('switch "without delivery": total is items only, the fee is still reported', () => {
    const [r] = row(lines, [SEND], [price('sd', 'm1', 100, 'กล่อง', 30)], false);
    expect(r).toMatchObject({ itemsTotal: 100, shipping: 40, total: 100 });
  });

  it('delivery shop with no free-delivery amount: always the fee', () => {
    const [r] = row(lines, [SEND_NO_LIMIT], [price('sn', 'm1', 900, 'กล่อง', 30)]);
    expect(r).toMatchObject({ shipping: 30, total: 930 });
  });

  it('a delivery shop whose fee is 0 charges no delivery', () => {
    const [r] = row(lines, [SEND_FREE], [price('sf', 'm1', 50, 'กล่อง', 30)]);
    expect(r).toMatchObject({ shipping: 0, total: 50 });
  });

  it('the fee needs at least one priced line, and the unpriced lines are not counted', () => {
    const [r] = row([med('m1'), med('m2')], [SEND], [price('sd', 'm1', 300, 'กล่อง', 30)]);
    expect(r).toMatchObject({ itemsTotal: 300, shipping: 40, unpricedCount: 1 });
  });
});

describe('compareShops - sell units', () => {
  it('same sell unit: the quantity is used as it is', () => {
    const [r] = row([med('m1', { qtyOrdered: 3 })], [PICKUP], [price('sp', 'm1', 10, 'กล่อง', 30)]);
    expect(r?.lines[0]).toMatchObject({ sellUnits: 3, converted: false, cost: 30 });
  });

  it('a different sell unit is converted through perSellUnit and rounded UP in the shop unit', () => {
    // line: 4 strips of 10 = 40 pills; shop sells boxes of 30 -> 2 boxes
    const line = med('m1', { qtyOrdered: 4, sellUnit: 'แผง', perSellUnit: 10 });
    const [r] = row([line], [PICKUP], [price('sp', 'm1', 100, 'กล่อง', 30)]);
    expect(r?.lines[0]).toMatchObject({ sellUnits: 2, sellUnit: 'กล่อง', converted: true, cost: 200 });
  });

  it('a conversion that comes out even is not rounded up', () => {
    const line = med('m1', { qtyOrdered: 3, sellUnit: 'แผง', perSellUnit: 10 });
    const [r] = row([line], [PICKUP], [price('sp', 'm1', 100, 'กล่อง', 30)]);
    expect(r?.lines[0]).toMatchObject({ sellUnits: 1, cost: 100 });
  });

  it('a unit smaller than the shop unit still buys at least 1', () => {
    const line = med('m1', { qtyOrdered: 1, sellUnit: 'เม็ด', perSellUnit: 1 });
    const [r] = row([line], [PICKUP], [price('sp', 'm1', 100, 'กล่อง', 30)]);
    expect(r?.lines[0]).toMatchObject({ sellUnits: 1, cost: 100 });
  });

  it('a unit that cannot be converted counts as no price: the line has no perSellUnit and the unit names differ', () => {
    const line = med('m1', { sellUnit: 'แผง' });
    delete line.perSellUnit;
    const [r] = row([line], [PICKUP], [price('sp', 'm1', 100, 'กล่อง', 30)]);
    expect(r).toMatchObject({ lines: [], unpricedCount: 1 });
  });

  it('a unit that cannot be converted counts as no price: the shop price has no perSellUnit', () => {
    const [r] = row([med('m1', { sellUnit: 'แผง', perSellUnit: 10 })], [PICKUP], [price('sp', 'm1', 100, 'กล่อง', undefined)]);
    expect(r?.unpricedCount).toBe(1);
  });

  it('a house medicine only matches the same sell unit name', () => {
    const rows = row([house('h1')], [PICKUP, SEND], [housePrice('sp', 'h1', 35, 'ขวด'), housePrice('sd', 'h1', 20, 'แผง')]);
    expect(rows.find((r) => r.shopId === 'sp')).toMatchObject({ itemsTotal: 35, unpricedCount: 0 });
    expect(rows.find((r) => r.shopId === 'sd')).toMatchObject({ lines: [], unpricedCount: 1 });
  });

  it('the price with the same unit wins even when a price in another unit is newer', () => {
    const line = med('m1', { qtyOrdered: 2, sellUnit: 'แผง', perSellUnit: 10 });
    const prices = [price('sp', 'm1', 40, 'แผง', 10, '2026-09-01'), price('sp', 'm1', 100, 'กล่อง', 30, '2026-10-20')];
    const [r] = row([line], [PICKUP], prices);
    expect(r?.lines[0]).toMatchObject({ sellUnit: 'แผง', cost: 80, converted: false });
  });

  it('no price in the same unit: the newest price is used (converted)', () => {
    const line = med('m1', { qtyOrdered: 6, sellUnit: 'แผง', perSellUnit: 10 });
    const prices = [price('sp', 'm1', 90, 'กล่อง', 30, '2026-08-01'), price('sp', 'm1', 400, 'ขวด', 100, '2026-10-20')];
    const [r] = row([line], [PICKUP], prices);
    expect(r?.lines[0]).toMatchObject({ sellUnit: 'ขวด', sellUnits: 1, cost: 400, converted: true });
  });

  it('two prices in the same unit: the newer date wins', () => {
    const prices = [price('sp', 'm1', 90, 'กล่อง', 30, '2026-08-01'), price('sp', 'm1', 120, 'กล่อง', 30, '2026-10-01')];
    const [r] = row([med('m1')], [PICKUP], prices);
    expect(r?.lines[0]?.cost).toBe(120);
  });

  it('same unit name but a different count per unit: converted, not taken as it is', () => {
    const line = med('m1', { qtyOrdered: 2, sellUnit: 'กล่อง', perSellUnit: 30 }); // 60 pills
    const [r] = row([line], [PICKUP], [price('sp', 'm1', 150, 'กล่อง', 100)]);
    expect(r?.lines[0]).toMatchObject({ sellUnits: 1, cost: 150, converted: true });
  });

  it('only the shop\'s own prices are used', () => {
    const [r] = row([med('m1')], [PICKUP], [price('sd', 'm1', 10, 'กล่อง', 30)]);
    expect(r?.unpricedCount).toBe(1);
  });
});

describe('compareShops - order of the shops', () => {
  it('complete shops by total, then shops missing some prices (fewer missing first), then shops with none', () => {
    const shops: Shop[] = [
      { id: 'a', name: 'ก', delivery: { kind: 'pickup' } },
      { id: 'b', name: 'ข', delivery: { kind: 'pickup' } },
      { id: 'c', name: 'ค', delivery: { kind: 'pickup' } },
      { id: 'd', name: 'ง', delivery: { kind: 'pickup' } },
      { id: 'e', name: 'จ', delivery: { kind: 'pickup' } },
    ];
    const lines = [med('m1'), med('m2'), med('m3')];
    const prices = [
      ...['m1', 'm2', 'm3'].map((m) => price('a', m, 100, 'กล่อง', 30)), // complete, 300
      ...['m1', 'm2', 'm3'].map((m) => price('b', m, 50, 'กล่อง', 30)), // complete, 150
      price('c', 'm1', 1, 'กล่อง', 30), // 2 missing, very cheap
      price('d', 'm1', 80, 'กล่อง', 30), price('d', 'm2', 80, 'กล่อง', 30), // 1 missing
    ];
    expect(row(lines, shops, prices).map((r) => r.shopId)).toEqual(['b', 'a', 'd', 'c', 'e']);
  });

  it('the same total: by shop name', () => {
    const shops: Shop[] = [
      { id: 'z', name: 'ร้านข', delivery: { kind: 'pickup' } },
      { id: 'y', name: 'ร้านก', delivery: { kind: 'pickup' } },
    ];
    const prices = [price('z', 'm1', 10, 'กล่อง', 30), price('y', 'm1', 10, 'กล่อง', 30)];
    expect(row([med('m1')], shops, prices).map((r) => r.shopId)).toEqual(['y', 'z']);
  });

  it('the delivery switch changes the order of the shops', () => {
    const prices = [price('sd', 'm1', 100, 'กล่อง', 30), price('sp', 'm1', 120, 'กล่อง', 30)];
    expect(row([med('m1')], [SEND, PICKUP], prices, true).map((r) => r.shopId)).toEqual(['sp', 'sd']); // 120 vs 140
    expect(row([med('m1')], [SEND, PICKUP], prices, false).map((r) => r.shopId)).toEqual(['sd', 'sp']); // 100 vs 120
  });
});
