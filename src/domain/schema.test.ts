import { describe, expect, it } from 'vitest';
import { NOW, sampleRoot } from './fixtures';
import { emptyRoot, rootSchema } from './schema';

describe('schema (data version 2)', () => {
  it('accepts a blank house and the sample data', () => {
    expect(rootSchema.safeParse(emptyRoot(NOW)).success).toBe(true);
    expect(rootSchema.safeParse(sampleRoot()).success).toBe(true);
  });

  it('blank house uses the BRIEF defaults (15 days, 7 days, 30 days)', () => {
    const s = emptyRoot(NOW).settings;
    expect([s.expiryWarnDays, s.lowStockDays, s.orderDays]).toEqual([15, 7, 30]);
  });

  it('rejects another version number', () => {
    expect(rootSchema.safeParse({ ...emptyRoot(NOW), version: 1 }).success).toBe(false);
  });

  it('adjust and stop events need a reason', () => {
    const base = { ...sampleRoot(), events: [] };
    const ev = { id: 'e2', assignmentId: 'a1', effectiveOn: '2026-10-17', at: NOW };
    expect(rootSchema.safeParse({ ...base, events: [{ ...ev, type: 'adjust' }] }).success).toBe(false);
    expect(rootSchema.safeParse({ ...base, events: [{ ...ev, type: 'stop' }] }).success).toBe(false);
    expect(rootSchema.safeParse({ ...base, events: [{ ...ev, type: 'stop', reason: 'หมอสั่ง' }] }).success).toBe(true);
    expect(rootSchema.safeParse({ ...base, events: [{ ...ev, type: 'resume' }] }).success).toBe(true);
  });

  it('pills must be 0.5-4 in steps of 0.5; stock must be 0-9999 in steps of 0.5', () => {
    const withPills = (pills: number) => {
      const r = sampleRoot();
      r.assignments[0]!.schedule = { kind: 'meal', slots: { morning: { pills, meal: 'after' } }, days: { kind: 'daily' } };
      return r;
    };
    expect(rootSchema.safeParse(withPills(1.5)).success).toBe(true);
    expect(rootSchema.safeParse(withPills(0.3)).success).toBe(false);
    expect(rootSchema.safeParse(withPills(4.5)).success).toBe(false);

    const withQty = (qty: number) => {
      const r = sampleRoot();
      r.assignments[0]!.stock = { qty, countedOn: '2026-10-16' };
      return r;
    };
    expect(rootSchema.safeParse(withQty(9999)).success).toBe(true);
    expect(rootSchema.safeParse(withQty(10000)).success).toBe(false);
    expect(rootSchema.safeParse(withQty(2.25)).success).toBe(false);
  });

  it('prices: house items always 1 per sell unit; shops: free-over must be positive', () => {
    const r = sampleRoot();
    r.shops = [{ id: 's1', name: 'Shop One', delivery: { kind: 'deliver', fee: 0, freeOver: 300 } }];
    r.houseItems = [{ id: 'h1', name: 'House Item' }];
    r.prices = [{ id: 'pr1', shopId: 's1', item: { kind: 'house', houseItemId: 'h1' }, price: 20, sellUnit: 'กล่อง', perSellUnit: 1 }];
    expect(rootSchema.safeParse(r).success).toBe(true);
    expect(rootSchema.safeParse({ ...r, prices: [{ ...r.prices[0]!, perSellUnit: 10 }] }).success).toBe(false);
    expect(rootSchema.safeParse({ ...r, shops: [{ ...r.shops[0]!, delivery: { kind: 'deliver', fee: 0, freeOver: 0 } }] }).success).toBe(false);
  });
});
