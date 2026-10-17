import { describe, expect, it } from 'vitest';
import { expiryStatus } from './calc';
import { TODAY, assignment, dailyMeal, resumeEvent, stopEvent } from './helpers.test-util';
import { daysLeft, houseStatus, isLowStock, stockNow } from './stock';
import type { Schedule } from './schema';

const twoPerDay = dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } });
const monWedFri: Schedule = {
  kind: 'meal',
  slots: { morning: { pills: 1, meal: 'after' } },
  days: { kind: 'weekdays', days: [1, 3, 5] },
};

describe('stockNow / daysLeft (walk day by day, never an average)', () => {
  it('a) daily morning 1 + evening 1, 20 counted on 10 Oct: 6 days used -> 8 left, lasts 4 more days', () => {
    const a = assignment({ schedule: twoPerDay, stock: { qty: 20, countedOn: '2026-10-10' } });
    expect(stockNow(a, TODAY)).toBe(8);
    expect(daysLeft(a, TODAY)).toEqual({ status: 'ok', days: 4, depletionDate: '2026-10-20' });
  });

  it('b) Mon/Wed/Fri 1 pill, 12 counted today: still 12, lasts 28 days (runs out 13 Nov)', () => {
    const a = assignment({ schedule: monWedFri, stock: { qty: 12, countedOn: TODAY } });
    expect(stockNow(a, TODAY)).toBe(12);
    expect(daysLeft(a, TODAY)).toEqual({ status: 'ok', days: 28, depletionDate: '2026-11-13' });
  });

  it('e) 0.5 morning + 1.5 bedtime (2/day), 3 counted 15 Oct: 1 left, 0 days, low stock', () => {
    const a = assignment({
      schedule: dailyMeal({ morning: { pills: 0.5, meal: 'with' }, bedtime: { pills: 1.5 } }),
      stock: { qty: 3, countedOn: '2026-10-15' },
    });
    expect(stockNow(a, TODAY)).toBe(1);
    expect(daysLeft(a, TODAY)).toMatchObject({ status: 'ok', days: 0 });
    expect(isLowStock(a, TODAY, 7)).toBe(true);
  });

  it('f) counted today: nothing is deducted', () => {
    const a = assignment({ schedule: twoPerDay, stock: { qty: 20, countedOn: TODAY } });
    expect(stockNow(a, TODAY)).toBe(20);
  });

  it('f) counted in the future: nothing is deducted and never negative', () => {
    const a = assignment({ schedule: twoPerDay, stock: { qty: 20, countedOn: '2026-10-20' } });
    expect(stockNow(a, TODAY)).toBe(20);
  });

  it('never goes below 0', () => {
    const a = assignment({ schedule: twoPerDay, stock: { qty: 3, countedOn: '2026-10-01' } });
    expect(stockNow(a, TODAY)).toBe(0);
  });

  it('f) no stock recorded is unknown (null), not 0; low-stock is not claimed', () => {
    const a = assignment({ schedule: twoPerDay, stock: null });
    expect(stockNow(a, TODAY)).toBeNull();
    expect(daysLeft(a, TODAY)).toEqual({ status: 'unknown' });
    expect(isLowStock(a, TODAY, 7)).toBe(false);
  });

  it('f) a stopped medicine is unknown', () => {
    const a = assignment({ schedule: twoPerDay, stock: { qty: 20, countedOn: '2026-10-10' }, status: 'stopped' });
    expect(stockNow(a, TODAY)).toBeNull();
    expect(daysLeft(a, TODAY)).toEqual({ status: 'unknown' });
    expect(isLowStock(a, TODAY, 7)).toBe(false);
  });

  it('days while the medicine was stopped are not deducted', () => {
    const a = assignment({ schedule: twoPerDay, stock: { qty: 20, countedOn: '2026-10-10' } });
    // stopped 12 Oct, resumed 15 Oct: 12, 13, 14 not deducted -> 10, 11, 15 used = 6
    const events = [stopEvent('a1', '2026-10-12'), resumeEvent('a1', '2026-10-15')];
    expect(stockNow(a, TODAY, events)).toBe(14);
    // events of another assignment do not matter
    expect(stockNow(a, TODAY, [stopEvent('zz', '2026-10-12')])).toBe(8);
  });

  it('a short course that ends before the stock does never runs out', () => {
    const a = assignment({
      schedule: {
        kind: 'interval',
        everyHours: 12,
        firstTime: '08:00',
        pills: 1,
        course: { kind: 'days', days: 5, startDate: '2026-10-14' },
      },
      stock: { qty: 20, countedOn: '2026-10-14' },
    });
    expect(stockNow(a, TODAY)).toBe(16); // 14 and 15 Oct used 4
    expect(daysLeft(a, TODAY)).toEqual({ status: 'enough' }); // 16-18 Oct need 6
    expect(isLowStock(a, TODAY, 7)).toBe(false);
  });

  it('isLowStock follows the days-left threshold (<= lowStockDays)', () => {
    const a = assignment({ schedule: twoPerDay, stock: { qty: 20, countedOn: '2026-10-10' } }); // 4 days left
    expect(isLowStock(a, TODAY, 4)).toBe(true);
    expect(isLowStock(a, TODAY, 3)).toBe(false);
  });
});

describe('expiryStatus with the warning days from settings', () => {
  it('no date is unknown', () => {
    expect(expiryStatus(undefined, TODAY, 15)).toEqual({ status: 'unknown', days: null });
    expect(expiryStatus(null, TODAY, 15)).toEqual({ status: 'unknown', days: null });
  });

  it('default setting 15: 15 days is soon, 16 is ok, yesterday is expired, today is soon', () => {
    expect(expiryStatus('2026-10-31', TODAY, 15)).toEqual({ status: 'soon', days: 15 });
    expect(expiryStatus('2026-11-01', TODAY, 15)).toEqual({ status: 'ok', days: 16 });
    expect(expiryStatus('2026-10-15', TODAY, 15)).toEqual({ status: 'expired', days: -1 });
    expect(expiryStatus(TODAY, TODAY, 15)).toEqual({ status: 'soon', days: 0 });
  });

  it('limits 1 and 365', () => {
    expect(expiryStatus('2026-10-17', TODAY, 1).status).toBe('soon');
    expect(expiryStatus('2026-10-18', TODAY, 1).status).toBe('ok');
    expect(expiryStatus('2027-10-16', TODAY, 365).status).toBe('soon'); // exactly 365 days
    expect(expiryStatus('2027-10-17', TODAY, 365).status).toBe('ok');
  });
});

describe('houseStatus', () => {
  it('no stock = not counted', () => {
    expect(houseStatus({ id: 'h1', name: 'House Item' })).toBe('untracked');
  });
  it('qty <= lowAt is low; above is ok', () => {
    expect(houseStatus({ id: 'h', name: 'xx', stock: { qty: 3, unit: 'กล่อง' }, lowAt: 3 })).toBe('low');
    expect(houseStatus({ id: 'h', name: 'xx', stock: { qty: 4, unit: 'กล่อง' }, lowAt: 3 })).toBe('ok');
    expect(houseStatus({ id: 'h', name: 'xx', stock: { qty: 4, unit: 'กล่อง' } })).toBe('ok');
  });
  it('qty 0 is out ("หมดแล้ว"), even without lowAt', () => {
    expect(houseStatus({ id: 'h', name: 'xx', stock: { qty: 0, unit: 'กล่อง' }, lowAt: 3 })).toBe('out');
    expect(houseStatus({ id: 'h', name: 'xx', stock: { qty: 0, unit: 'กล่อง' } })).toBe('out');
  });
});
