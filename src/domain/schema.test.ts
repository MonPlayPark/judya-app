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

  describe('event snapshots (O1)', () => {
    const daily = (pills: number) => ({
      kind: 'meal' as const,
      slots: { morning: { pills, meal: 'after' as const } },
      days: { kind: 'daily' as const },
    });
    const ev = { id: 'e2', assignmentId: 'a1', effectiveOn: '2026-10-17', at: NOW };
    const ok = (e: Record<string, unknown>) =>
      rootSchema.safeParse({ ...sampleRoot(), events: [{ ...ev, ...e }] }).success;

    it('start: to = { schedule } and no from', () => {
      expect(ok({ type: 'start', to: { schedule: daily(1) } })).toBe(true);
      expect(ok({ type: 'start' })).toBe(false);
      expect(ok({ type: 'start', from: { schedule: daily(1) }, to: { schedule: daily(2) } })).toBe(false);
      expect(ok({ type: 'start', to: { schedule: daily(1), name: 'Sample Med' } })).toBe(false);
    });

    it('adjust: from and to both carry a schedule and the two differ', () => {
      const e = { type: 'adjust', reason: 'หมอสั่ง' };
      expect(ok({ ...e, from: { schedule: daily(1) }, to: { schedule: daily(2) } })).toBe(true);
      expect(ok({ ...e, from: { schedule: daily(1) }, to: { schedule: daily(1) } })).toBe(false);
      expect(ok({ ...e, from: { schedule: daily(1) } })).toBe(false);
      expect(ok({ ...e, to: { schedule: daily(2) } })).toBe(false);
      expect(ok({ ...e, from: { name: 'Sample Med' }, to: { name: 'Sample Med 2' } })).toBe(false);
    });

    it('adjust: two schedules with the same content but different key order are the same', () => {
      const a = { kind: 'meal', slots: { morning: { pills: 1, meal: 'after' } }, days: { kind: 'daily' } };
      const b = { days: { kind: 'daily' }, slots: { morning: { meal: 'after', pills: 1 } }, kind: 'meal' };
      expect(ok({ type: 'adjust', reason: 'หมอสั่ง', from: { schedule: a }, to: { schedule: b } })).toBe(false);
    });

    it('edit: same keys on both sides, only changed fields, at least one', () => {
      expect(ok({ type: 'edit', from: { stockQty: 10, note: null }, to: { stockQty: 12, note: 'new' } })).toBe(true);
      expect(ok({ type: 'edit', from: { expiry: null }, to: { expiry: '2027-01-31' } })).toBe(true);
      expect(ok({ type: 'edit', from: {}, to: {} })).toBe(false); // no field
      expect(ok({ type: 'edit', from: { stockQty: 10 }, to: { note: 'x' } })).toBe(false); // different keys
      expect(ok({ type: 'edit', from: { stockQty: 10, note: 'x' }, to: { stockQty: 12 } })).toBe(false);
      expect(ok({ type: 'edit', from: { stockQty: 10 }, to: { stockQty: 10 } })).toBe(false); // unchanged value
      expect(ok({ type: 'edit', to: { stockQty: 12 } })).toBe(false);
    });

    it('stop and resume carry no from / to', () => {
      expect(ok({ type: 'stop', reason: 'หมอสั่ง' })).toBe(true);
      expect(ok({ type: 'stop', reason: 'หมอสั่ง', from: { note: 'a' }, to: { note: 'b' } })).toBe(false);
      expect(ok({ type: 'resume' })).toBe(true);
      expect(ok({ type: 'resume', to: { schedule: daily(1) } })).toBe(false);
    });

    it('snapshot values are checked: name length, stock steps, date format, unknown keys', () => {
      const edit = (from: Record<string, unknown>, to: Record<string, unknown>) => ok({ type: 'edit', from, to });
      expect(edit({ name: 'Sample Med' }, { name: 'S' })).toBe(false);
      expect(edit({ stockQty: 1 }, { stockQty: 2.25 })).toBe(false);
      expect(edit({ stockQty: 1 }, { stockQty: null })).toBe(true);
      expect(edit({ expiry: '2027-01-31' }, { expiry: '31/01/2027' })).toBe(false);
      expect(edit({ colour: 'a' }, { colour: 'b' })).toBe(false);
    });
  });
});
