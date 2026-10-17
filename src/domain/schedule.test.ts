import { describe, expect, it } from 'vitest';
import { dailyMeal } from './helpers.test-util';
import {
  canvasDayToModelDay,
  doseKey,
  dosesOn,
  intervalTimes,
  modelDayToCanvasDay,
} from './schedule';
import type { IntervalSchedule, MealSchedule } from './schema';

const interval = (over: Partial<IntervalSchedule> = {}): IntervalSchedule => ({
  kind: 'interval',
  everyHours: 12,
  firstTime: '08:00',
  pills: 1,
  course: { kind: 'days', days: 5, startDate: '2026-10-14' },
  ...over,
});

describe('weekday numbers: canvas Monday=0 <-> model Sunday=0 (BRIEF section 2)', () => {
  it('canvas Monday (0) is model 1; canvas Sunday (6) is model 0', () => {
    expect(canvasDayToModelDay(0)).toBe(1);
    expect(canvasDayToModelDay(6)).toBe(0);
    expect(modelDayToCanvasDay(1)).toBe(0);
    expect(modelDayToCanvasDay(0)).toBe(6);
  });

  it('converting there and back gives the same value for every day 0-6, both directions', () => {
    for (let d = 0; d <= 6; d++) {
      expect(modelDayToCanvasDay(canvasDayToModelDay(d))).toBe(d);
      expect(canvasDayToModelDay(modelDayToCanvasDay(d))).toBe(d);
    }
  });
});

describe('dosesOn', () => {
  it('meal: sum of the pills of every slot, on every day when daily', () => {
    const s = dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } });
    expect(dosesOn(s, '2026-10-16')).toBe(2);
    expect(dosesOn(s, '2026-10-17')).toBe(2);
  });

  it('meal: half pills add up (0.5 morning + 1.5 bedtime = 2)', () => {
    const s = dailyMeal({ morning: { pills: 0.5, meal: 'with' }, bedtime: { pills: 1.5 } });
    expect(dosesOn(s, '2026-10-16')).toBe(2);
  });

  it('weekdays use the model numbering (0 = Sunday): Mon/Wed/Fri = 1,3,5', () => {
    const s: MealSchedule = {
      kind: 'meal',
      slots: { morning: { pills: 1, meal: 'after' } },
      days: { kind: 'weekdays', days: [1, 3, 5] },
    };
    expect(dosesOn(s, '2026-10-16')).toBe(1); // Friday
    expect(dosesOn(s, '2026-10-17')).toBe(0); // Saturday
    expect(dosesOn(s, '2026-10-18')).toBe(0); // Sunday
    expect(dosesOn(s, '2026-10-19')).toBe(1); // Monday
  });

  it('alt (every other day) counts from the anchor and never before it', () => {
    const s: MealSchedule = {
      kind: 'meal',
      slots: { morning: { pills: 1, meal: 'after' } },
      days: { kind: 'alt', anchor: '2026-10-14' },
    };
    expect(dosesOn(s, '2026-10-12')).toBe(0);
    expect(dosesOn(s, '2026-10-14')).toBe(1);
    expect(dosesOn(s, '2026-10-15')).toBe(0);
    expect(dosesOn(s, '2026-10-16')).toBe(1);
  });

  it('interval every 12 h, 1 pill, 5-day course from 14 Oct: 2 inside, 0 before and after', () => {
    const s = interval();
    expect(dosesOn(s, '2026-10-16')).toBe(2);
    expect(dosesOn(s, '2026-10-13')).toBe(0);
    expect(dosesOn(s, '2026-10-14')).toBe(2); // first day of the course
    expect(dosesOn(s, '2026-10-18')).toBe(2); // last day of the course
    expect(dosesOn(s, '2026-10-19')).toBe(0);
  });

  it('interval: (24 / everyHours) x pills, ongoing course has no end', () => {
    expect(dosesOn(interval({ everyHours: 8, pills: 1.5, course: { kind: 'ongoing' } }), '2030-01-01')).toBe(4.5);
    expect(dosesOn(interval({ everyHours: 24, course: { kind: 'ongoing' } }), '2030-01-01')).toBe(1);
  });
});

describe('dose keys (tick marks)', () => {
  it('meal key is "<assignmentId>:<slot>"', () => {
    expect(doseKey('a1', 'morning')).toBe('a1:morning');
    expect(doseKey('a1', 'bedtime')).toBe('a1:bedtime');
  });

  it('interval key is "<assignmentId>:<HH:MM>"', () => {
    expect(doseKey('a1', '08:00')).toBe('a1:08:00');
  });

  it('interval clock times start at firstTime and repeat every N hours, wrapping past midnight', () => {
    expect(intervalTimes(interval({ everyHours: 12, firstTime: '08:00' }))).toEqual(['08:00', '20:00']);
    expect(intervalTimes(interval({ everyHours: 12, firstTime: '22:00' }))).toEqual(['10:00', '22:00']);
    expect(intervalTimes(interval({ everyHours: 6, firstTime: '06:30' }))).toEqual(['00:30', '06:30', '12:30', '18:30']);
    expect(intervalTimes(interval({ everyHours: 24, firstTime: '07:00' }))).toEqual(['07:00']);
  });
});
