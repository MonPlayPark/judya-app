import { describe, expect, it } from 'vitest';
import { checkEnteredPrice, latestPrice, latestPriceAnyShop, pricesOf, sameItem, upsertPrice } from './prices';
import type { Price } from './schema';

const M1 = { kind: 'med', medicationId: 'm1' } as const;
const H1 = { kind: 'house', houseItemId: 'h1' } as const;
const ids = () => { let i = 0; return () => `new${++i}`; };
const base: Price[] = [{ id: 'pr1', shopId: 's1', item: M1, price: 100, sellUnit: 'กล่อง', perSellUnit: 30, date: '2026-09-01' }];

describe('upsertPrice', () => {
  it('adds a new row with date = today', () => {
    const r = upsertPrice([], { shopId: 's1', item: M1, price: 120, sellUnit: ' กล่อง ', perSellUnit: 30 }, '2026-10-28', ids());
    expect(r).toMatchObject({ ok: true, created: true });
    expect(r.ok && r.prices).toEqual([{ id: 'new1', shopId: 's1', item: M1, price: 120, sellUnit: 'กล่อง', perSellUnit: 30, date: '2026-10-28' }]);
  });

  it('same shop + item + sell unit: the row is updated in place (id kept, date = today)', () => {
    const r = upsertPrice(base, { shopId: 's1', item: M1, price: 130, sellUnit: 'กล่อง', perSellUnit: 30 }, '2026-10-28', ids());
    expect(r.ok && r.created).toBe(false);
    expect(r.ok && r.prices).toEqual([{ ...base[0], price: 130, date: '2026-10-28' }]);
  });

  it('another sell unit, another shop or another item makes a new row', () => {
    const t = '2026-10-28';
    expect(upsertPrice(base, { shopId: 's1', item: M1, price: 50, sellUnit: 'แผง', perSellUnit: 10 }, t, ids()).ok && 'x').toBe('x');
    for (const entry of [
      { shopId: 's1', item: M1, price: 50, sellUnit: 'แผง', perSellUnit: 10 },
      { shopId: 's2', item: M1, price: 50, sellUnit: 'กล่อง', perSellUnit: 30 },
      { shopId: 's1', item: { kind: 'med', medicationId: 'm2' } as const, price: 50, sellUnit: 'กล่อง', perSellUnit: 30 },
    ]) {
      const r = upsertPrice(base, entry, t, ids());
      expect(r.ok && r.prices).toHaveLength(2);
    }
  });

  it('does not change the array passed in', () => {
    const copy = structuredClone(base);
    upsertPrice(base, { shopId: 's1', item: M1, price: 130, sellUnit: 'กล่อง', perSellUnit: 30 }, '2026-10-28', ids());
    expect(base).toEqual(copy);
  });

  it('refuses a price that is 0, negative, NaN or Infinity; a blank sell unit; a regular medicine without perSellUnit', () => {
    const t = '2026-10-28';
    for (const price of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(upsertPrice([], { shopId: 's1', item: M1, price, sellUnit: 'กล่อง', perSellUnit: 30 }, t, ids())).toEqual({ ok: false, errors: { price: 'invalid_price' } });
    }
    expect(upsertPrice([], { shopId: 's1', item: M1, price: 1, sellUnit: '  ', perSellUnit: 30 }, t, ids())).toEqual({ ok: false, errors: { sellUnit: 'invalid_sell_unit' } });
    expect(upsertPrice([], { shopId: 's1', item: M1, price: 1, sellUnit: 'กล่อง' }, t, ids())).toEqual({ ok: false, errors: { perSellUnit: 'per_sell_unit_required' } });
    expect(upsertPrice([], { shopId: 's1', item: M1, price: 1, sellUnit: 'กล่อง', perSellUnit: 0 }, t, ids())).toEqual({ ok: false, errors: { perSellUnit: 'invalid_per_sell_unit' } });
  });

  it('a house medicine is always 1 per sell unit (left out = 1, anything else refused)', () => {
    const t = '2026-10-28';
    const ok = upsertPrice([], { shopId: 's1', item: H1, price: 35, sellUnit: 'ขวด' }, t, ids());
    expect(ok.ok && ok.price.perSellUnit).toBe(1);
    expect(upsertPrice([], { shopId: 's1', item: H1, price: 35, sellUnit: 'ขวด', perSellUnit: 2 }, t, ids())).toEqual({ ok: false, errors: { perSellUnit: 'invalid_per_sell_unit' } });
  });
});

describe('checkEnteredPrice (a price is optional; checked only when typed)', () => {
  it('nothing typed is fine', () => {
    expect(checkEnteredPrice(null)).toEqual({ ok: true, value: null });
    expect(checkEnteredPrice(undefined)).toEqual({ ok: true, value: null });
  });
  it('typed: must be above 0', () => {
    expect(checkEnteredPrice(12.5)).toEqual({ ok: true, value: 12.5 });
    for (const v of [0, -1, Number.NaN]) expect(checkEnteredPrice(v)).toEqual({ ok: false, error: 'invalid_price' });
  });
});

describe('looking prices up', () => {
  const rows: Price[] = [
    { id: 'a', shopId: 's1', item: M1, price: 100, sellUnit: 'กล่อง', perSellUnit: 30, date: '2026-09-01' },
    { id: 'b', shopId: 's1', item: M1, price: 40, sellUnit: 'แผง', perSellUnit: 10, date: '2026-10-01' },
    { id: 'c', shopId: 's2', item: M1, price: 90, sellUnit: 'กล่อง', perSellUnit: 30, date: '2026-10-15' },
    { id: 'd', shopId: 's1', item: H1, price: 35, sellUnit: 'ขวด', perSellUnit: 1, date: '2026-10-02' },
  ];
  it('latest price per shop per medicine, any unit or one unit', () => {
    expect(latestPrice(rows, 's1', M1)?.id).toBe('b');
    expect(latestPrice(rows, 's1', M1, 'กล่อง')?.id).toBe('a');
    expect(latestPrice(rows, 's1', M1, 'ซอง')).toBeUndefined();
    expect(latestPrice(rows, 's3', M1)).toBeUndefined();
  });
  it('latest in any shop; same date: the later row', () => {
    expect(latestPriceAnyShop(rows, M1)?.id).toBe('c');
    expect(latestPriceAnyShop([...rows, { ...rows[0]!, id: 'e', date: '2026-10-15' }], M1)?.id).toBe('e');
  });
  it('items are told apart by kind and id', () => {
    expect(pricesOf(rows, 's1', H1).map((p) => p.id)).toEqual(['d']);
    expect(sameItem(M1, H1)).toBe(false);
    expect(sameItem(M1, { kind: 'med', medicationId: 'm1' })).toBe(true);
  });
});
