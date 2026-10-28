import { describe, expect, it } from 'vitest';
import { dosesOn, takesOn } from './schedule';
import type { Schedule } from './schema';

// 2026-10-28 is a Wednesday (dow 3). Made-up data only.
const meal = (days: Extract<Schedule, { kind: 'meal' }>['days'], morning = 1, evening = 0): Schedule => ({
  kind: 'meal',
  slots: { morning: { pills: morning, meal: 'after' }, ...(evening ? { evening: { pills: evening, meal: 'after' as const } } : {}) },
  days,
});

describe('v3 dosesOn', () => {
  it('meal: the slots are summed', () => {
    const s: Schedule = {
      kind: 'meal',
      slots: { morning: { pills: 1, meal: 'after' }, noon: { pills: 0.5, meal: 'with' }, evening: { pills: 1, meal: 'after' }, bedtime: { pills: 2 } },
      days: { kind: 'daily' },
    };
    expect(dosesOn(s, '2026-10-28')).toBe(4.5);
  });

  it('interval: (24 / everyHours) x pills; 8 h x 1.5 = 4.5 a day', () => {
    const s: Schedule = { kind: 'interval', everyHours: 8, firstTime: '08:00', pills: 1.5, course: { kind: 'ongoing' } };
    expect(dosesOn(s, '2026-10-28')).toBe(4.5);
  });

  it('interval with a course: only inside startDate .. startDate + days - 1', () => {
    const s: Schedule = { kind: 'interval', everyHours: 12, firstTime: '08:00', pills: 1, course: { kind: 'days', days: 3, startDate: '2026-10-28' } };
    expect([takesOn(s, '2026-10-27'), takesOn(s, '2026-10-28'), takesOn(s, '2026-10-30'), takesOn(s, '2026-10-31')]).toEqual([false, true, true, false]);
  });

  it('alt-day: every second day from the anchor, never before it', () => {
    const s = meal({ kind: 'alt', anchor: '2026-10-28' });
    expect([dosesOn(s, '2026-10-26'), dosesOn(s, '2026-10-28'), dosesOn(s, '2026-10-29'), dosesOn(s, '2026-10-30')]).toEqual([0, 1, 0, 1]);
  });

  it('weekdays use 0 = Sunday', () => {
    const s = meal({ kind: 'weekdays', days: [0, 3] }); // Sunday and Wednesday
    expect([dosesOn(s, '2026-10-28'), dosesOn(s, '2026-10-29'), dosesOn(s, '2026-11-01')]).toEqual([1, 0, 1]);
  });
});
