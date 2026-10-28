import { describe, expect, it } from 'vitest';
import type { Schedule } from './schema';
import type { DaysLeft } from './stock';
import { formatDaysLeft, formatDaysLeftChange, isNotDaily, unitFor } from './stockText';

const ok = (days: number): DaysLeft => ({ status: 'ok', days, depletionDate: '2026-12-31' });
const daily: Schedule = { kind: 'meal', slots: { morning: { pills: 1, meal: 'after' } }, days: { kind: 'daily' } };
const alt: Schedule = { ...daily, days: { kind: 'alt', anchor: '2026-10-28' } } as Schedule;
const weekdays: Schedule = { ...daily, days: { kind: 'weekdays', days: [1] } } as Schedule;
const interval: Schedule = { kind: 'interval', everyHours: 8, firstTime: '08:00', pills: 1, course: { kind: 'ongoing' } };

describe('weeks text (not-daily medicines)', () => {
  it('14 days is "ไม่ถึง 2 สัปดาห์", 15 days is "ประมาณ 2 สัปดาห์"', () => {
    expect(formatDaysLeft(ok(14), 'weeks')).toBe('ไม่ถึง 2 สัปดาห์');
    expect(formatDaysLeft(ok(15), 'weeks')).toBe('ประมาณ 2 สัปดาห์');
  });

  it('0 days and 1 day are also "ไม่ถึง 2 สัปดาห์"', () => {
    expect(formatDaysLeft(ok(0), 'weeks')).toBe('ไม่ถึง 2 สัปดาห์');
    expect(formatDaysLeft(ok(1), 'weeks')).toBe('ไม่ถึง 2 สัปดาห์');
  });

  it('N is days / 7 rounded to the nearest week (17 -> 2, 18 -> 3, 26 -> 4, 28 -> 4)', () => {
    // 17 / 7 = 2.43 -> 2 · 18 / 7 = 2.57 -> 3 · 26 / 7 = 3.71 -> 4 · 28 / 7 = 4
    expect([17, 18, 26, 28].map((d) => formatDaysLeft(ok(d), 'weeks'))).toEqual([
      'ประมาณ 2 สัปดาห์', 'ประมาณ 3 สัปดาห์', 'ประมาณ 4 สัปดาห์', 'ประมาณ 4 สัปดาห์',
    ]);
  });
});

describe('days text and the other statuses', () => {
  it('daily medicine: "N วัน", and 0 days is "ไม่พอสำหรับวันนี้"', () => {
    expect(formatDaysLeft(ok(11), 'days')).toBe('11 วัน');
    expect(formatDaysLeft(ok(0), 'days')).toBe('ไม่พอสำหรับวันนี้');
  });

  it('enough and unknown have their own texts in both units', () => {
    for (const unit of ['days', 'weeks'] as const) {
      expect(formatDaysLeft({ status: 'enough' }, unit)).toBe('พอใช้ตลอดคอร์ส');
      expect(formatDaysLeft({ status: 'unknown' }, unit)).toBe('ยังไม่ได้นับ');
    }
  });

  it('tubes and error never show a number of days', () => {
    expect(formatDaysLeft({ status: 'tubes', opened: true, spare: 1 }, 'days')).toBe('นับเป็นหลอด ไม่คำนวณวัน');
    expect(formatDaysLeft({ status: 'error', message: 'x' }, 'weeks')).toBe('ข้อมูลสต็อกไม่ตรงกับยา');
  });
});

describe('unit choice and before -> after', () => {
  it('only a meal schedule with alt / weekdays is not daily', () => {
    expect([daily, alt, weekdays, interval].map(isNotDaily)).toEqual([false, true, true, false]);
  });

  it('weeks if either side is not daily, days if both are', () => {
    expect(unitFor(daily, daily)).toBe('days');
    expect(unitFor(daily, weekdays)).toBe('weeks');
    expect(unitFor(alt, daily)).toBe('weeks');
    expect(unitFor(interval, daily)).toBe('days');
  });

  it('both sides use the same unit', () => {
    expect(formatDaysLeftChange(ok(30), ok(10), 'days')).toBe('30 วัน → 10 วัน');
    expect(formatDaysLeftChange(ok(30), ok(10), 'weeks')).toBe('ประมาณ 4 สัปดาห์ → ไม่ถึง 2 สัปดาห์');
  });

  it('enough / unknown sides keep their own text inside a change', () => {
    expect(formatDaysLeftChange({ status: 'enough' }, ok(20), 'weeks')).toBe('พอใช้ตลอดคอร์ส → ประมาณ 3 สัปดาห์');
    expect(formatDaysLeftChange({ status: 'unknown' }, { status: 'unknown' }, 'days')).toBe('ยังไม่ได้นับ → ยังไม่ได้นับ');
  });
});
