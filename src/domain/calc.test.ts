// Ported from reference/calc.test.mjs of MonPlayPark/JudYa (commit 8245a01): same 18 cases, same numbers.
// Only change: medicine-specific ids/comments were made neutral (itemA/itemB) — no medicine data in this repo.
import { describe, expect, it } from 'vitest';
import * as c from './calc';
import type { DaySchedule, Doses, Pharmacy, PriceItem, ShopLine } from './calc';

const T = '2026-10-08'; // a Thursday
const d1: Doses = { morning: 1, noon: 0, evening: 0, bedtime: 0 };

describe('calc (ported reference tests)', () => {
  it('dates: Thursday, month length, no UTC drift', () => {
    expect(c.dow(T)).toBe(4);
    expect(c.daysInMonth(2026, 2)).toBe(28);
    expect(c.addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(c.diffDays('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('isTakeDay weekdays Mon/Wed/Fri', () => {
    const s: DaySchedule = { kind: 'weekdays', days: [1, 3, 5] };
    expect(c.isTakeDay(s, '2026-10-09')).toBe(true);
    expect(c.isTakeDay(s, T)).toBe(false);
  });

  it('every other day counts from anchor, no two days in a row at month end (DS-3)', () => {
    const s: DaySchedule = { kind: 'interval', everyNDays: 2, anchorDate: '2026-10-07' };
    const take: boolean[] = [];
    for (let i = 0; i < 40; i++) take.push(c.isTakeDay(s, c.addDays('2026-10-01', i)));
    for (let i = 1; i < take.length; i++) expect(take[i] && take[i - 1]).toBe(false);
    expect(c.isTakeDay(s, '2026-10-06')).toBe(false); // before anchor
  });

  it('month days skip short months, not moved (DS-4)', () => {
    const s: DaySchedule = { kind: 'monthDays', days: [31] };
    expect(c.isTakeDay(s, '2026-11-30')).toBe(false);
    expect(c.isTakeDay(s, '2026-12-31')).toBe(true);
  });

  it('validateSchedule', () => {
    expect(c.validateSchedule({ kind: 'daily' })).toBe(true);
    expect(c.validateSchedule({ kind: 'weekdays', days: [] })).toBe(false);
    expect(c.validateSchedule({ kind: 'interval', everyNDays: 1, anchorDate: T })).toBe(false);
    expect(c.validateSchedule({ kind: 'monthDays', days: [32] })).toBe(false);
  });

  it('DS-7 daily: 10 tablets, 1/day => 10 days (same as old formula)', () => {
    const r = c.stockWalk({ stock: 10, doses: d1, schedule: { kind: 'daily' }, today: T });
    expect(r.daysRemaining).toBe(10);
    expect(r.depletionDate).toBe('2026-10-18');
  });

  it('DS-7 Mon/Wed/Fri: 12 tablets => about 28 days, not 12', () => {
    const r = c.stockWalk({ stock: 12, doses: d1, schedule: { kind: 'weekdays', days: [1, 3, 5] }, today: T });
    expect(r.daysRemaining).toBeGreaterThanOrEqual(26);
    expect(r.daysRemaining).toBeLessThanOrEqual(30);
  });

  it('DS-7 every other day: 10 tablets => about 20 days, not 10', () => {
    const r = c.stockWalk({ stock: 10, doses: d1, schedule: { kind: 'interval', everyNDays: 2, anchorDate: T }, today: T });
    expect(r.daysRemaining).toBe(20); // takes on days 0,2,..,18 (10 tablets); first uncovered take-day is day 20
  });

  it('missing data is reported, never invented (L-10)', () => {
    const none: Doses = { morning: 0, noon: 0, evening: 0, bedtime: 0 };
    expect(c.stockWalk({ stock: 5, doses: none, schedule: { kind: 'daily' }, today: T }).status).toBe('noDose');
    expect(c.stockWalk({ stock: null, doses: d1, schedule: { kind: 'daily' }, today: T }).status).toBe('noStock');
    expect(c.stockWalk({ stock: 9999, doses: d1, schedule: { kind: 'daily' }, today: T, cap: 30 }).status).toBe('beyondCap');
  });

  it('half doses (1/2, 1 1/2) are exact', () => {
    const r = c.stockWalk({ stock: 3, doses: { morning: 1.5, noon: 0, evening: 0, bedtime: 0 }, schedule: { kind: 'daily' }, today: T });
    expect(r.daysRemaining).toBe(2);
  });

  it('reorderDate = depletion - lead days', () => {
    expect(c.reorderDate('2026-10-18', 7)).toBe('2026-10-11');
  });

  it('DS-8 target quantity and L-6 purchase plan', () => {
    const q = c.targetQuantity({ doses: { morning: 1, noon: 0, evening: 1, bedtime: 0 }, schedule: { kind: 'daily' }, today: T, targetDays: 30 });
    expect(q).toBe(60);
    expect(c.purchasePlan({ target: 60, stock: 12, packageSize: 10 })).toEqual({ additional: 48, packages: 5, actual: 50 });
    expect(c.purchasePlan({ target: 60, stock: 12, packageSize: null })).toEqual({ additional: 48, packages: null, actual: 48 });
    expect(c.purchasePlan({ target: 10, stock: 12, packageSize: 10 })).toEqual({ additional: 0, packages: 0, actual: 0 });
  });

  // ---- pharmacy comparison: the same numbers as the approved prototype demo (review round 5) ----
  const itemA: PriceItem = { baseUnit: 'เม็ด', packUnit: 'แผง', packSize: 10 };
  const itemB: PriceItem = { baseUnit: 'เม็ด', packUnit: 'แผง', packSize: 10 };
  const lines: ShopLine[] = [
    { id: 'itemA', item: itemA, qtyBase: 30, prices: [{ pharmacyId: 'a', price: 35, unit: 'แผง' }, { pharmacyId: 'b', price: 3.2, unit: 'เม็ด' }] },
    { id: 'itemB', item: itemB, qtyBase: 60, prices: [{ pharmacyId: 'a', price: 60, unit: 'แผง' }, { pharmacyId: 'b', price: 5.5, unit: 'เม็ด' }, { pharmacyId: 'c', price: 58, unit: 'แผง' }] },
  ];
  const phs: Pharmacy[] = [
    { id: 'a', name: 'สุขใจ', shipping: 40, freeOver: 500 },
    { id: 'b', name: 'เภสัช', shipping: 30, freeOver: null },
    { id: 'c', name: 'ออนไลน์', shipping: 60, freeOver: 300 },
  ];

  it('compareShops: totals incl. shipping, cheapest valid first, incomplete shops not ranked', () => {
    const r = c.compareShops(lines, phs);
    const by = (id: string) => {
      const row = r.rows.find((x) => x.pharmacy.id === id);
      if (!row) throw new Error(`no row ${id}`);
      return row;
    };
    expect(by('a').sub).toBe(105 + 360);
    expect(by('a').total).toBe(465 + 40); // 505
    expect(by('b').sub).toBe(96 + 330);
    expect(by('b').total).toBe(426 + 30); // 456
    expect(by('c').ok).toBe(false);
    expect(by('c').missing).toEqual(['itemA']); // itemA unpriced at c
    expect(r.best?.pharmacy.id).toBe('b');
    expect((r.next?.total ?? 0) - (r.best?.total ?? 0)).toBe(49);
  });

  it('free shipping threshold and unknown shipping', () => {
    const r = c.compareShops(lines, [
      { id: 'a', name: 'a', shipping: 40, freeOver: 400 },
      { id: 'b', name: 'b', shipping: null, freeOver: null },
    ]);
    expect(r.rows[0]?.fee).toBe(0);
    expect(r.rows[1]?.ok).toBe(false);
    expect(r.rows[1]?.fee).toBeNull();
  });

  it('price unit must match base or pack unit, else null (no guessing)', () => {
    expect(c.lineCost(itemA, { price: 100, unit: 'ขวด' }, 30)).toBeNull();
    expect(c.lineCost({ baseUnit: 'เม็ด', packUnit: 'แผง', packSize: null }, { price: 35, unit: 'แผง' }, 30)).toBeNull();
  });

  it('expiry status (house medicines)', () => {
    expect(c.expiryStatus('2026-10-31', T)).toEqual({ status: 'soon', days: 23 });
    expect(c.expiryStatus('2026-10-01', T).status).toBe('expired');
    expect(c.expiryStatus('2027-03-01', T).status).toBe('ok');
    expect(c.expiryStatus('', T).status).toBe('unknown');
  });

  it('allergy matches generic name across brands', () => {
    const al = [{ drug: 'Penicillin' }];
    expect(c.allergyHits('penicillin v', al)).toHaveLength(1);
    expect(c.allergyHits('Pe', al)).toHaveLength(0);
    expect(c.allergyHits('Aspirin', al)).toHaveLength(0);
  });

  it('diffSchedule', () => {
    const a = { schedule: { kind: 'daily' } as DaySchedule, doses: { morning: 1 } };
    const b = { schedule: { kind: 'weekdays', days: [1] } as DaySchedule, doses: { morning: 1.5 } };
    expect(c.diffSchedule(a, b)).toHaveLength(2);
    expect(c.diffSchedule(a, a)).toHaveLength(0);
  });
});
