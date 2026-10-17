import { describe, expect, it } from 'vitest';
import { TODAY, assignment, dailyMeal, person, rootWith } from './helpers.test-util';
import { intervalDay, todayDoses, todayInBangkok, todayProgress, type TodayDose } from './today';
import type { Assignment, IntervalSchedule, Schedule } from './schema';

describe('todayInBangkok', () => {
  it('g) 16:59:59 UTC is still 16 Oct in Bangkok; 17:00:00 UTC is already 17 Oct', () => {
    expect(todayInBangkok(new Date('2026-10-16T16:59:59Z'))).toBe('2026-10-16');
    expect(todayInBangkok(new Date('2026-10-16T17:00:00Z'))).toBe('2026-10-17');
  });
});

const morning = dailyMeal({ morning: { pills: 1, meal: 'after' } });
const mk = (id: string, over: Partial<Assignment> = {}): Assignment =>
  assignment({ id, medicationId: `m-${id}`, schedule: morning, ...over });

describe('todayDoses', () => {
  it('lists doses with their keys and tick state', () => {
    const root = rootWith({
      persons: [person()],
      assignments: [mk('a1', { schedule: dailyMeal({ morning: { pills: 1, meal: 'after' }, bedtime: { pills: 2 } }) })],
      prepLog: { [TODAY]: { 'a1:morning': true }, '2026-10-15': { 'a1:bedtime': true } },
    });
    const doses = todayDoses(root, TODAY);
    expect(doses.map((d) => [d.key, d.pills, d.done])).toEqual([
      ['a1:morning', 1, true],
      ['a1:bedtime', 2, false], // yesterday's tick does not count
    ]);
  });

  it('i) leaves out self-managed people, stopped medicines and removed members', () => {
    const root = rootWith({
      persons: [
        person({ id: 'p1' }),
        person({ id: 'p2', selfManaged: true }),
        person({ id: 'p3', removedAt: '2026-10-01T09:00:00+07:00' }),
      ],
      assignments: [
        mk('keep', { personId: 'p1' }),
        mk('self', { personId: 'p2' }),
        mk('stopped', { personId: 'p1', status: 'stopped' }),
        mk('removed', { personId: 'p3' }),
      ],
    });
    expect(todayDoses(root, TODAY).map((d) => d.assignmentId)).toEqual(['keep']);
  });

  it('can be filtered to one member', () => {
    const root = rootWith({
      persons: [person({ id: 'p1' }), person({ id: 'p2' })],
      assignments: [mk('a1', { personId: 'p1' }), mk('a2', { personId: 'p2' })],
    });
    expect(todayDoses(root, TODAY, 'p2').map((d) => d.assignmentId)).toEqual(['a2']);
  });

  it('leaves out medicines that are not taken today (Mon/Wed/Fri on a Friday is taken, Saturday not)', () => {
    const mwf: Schedule = { ...morning, days: { kind: 'weekdays', days: [1, 3, 5] } } as Schedule;
    const root = rootWith({ persons: [person()], assignments: [mk('a1', { schedule: mwf })] });
    expect(todayDoses(root, '2026-10-16')).toHaveLength(1);
    expect(todayDoses(root, '2026-10-17')).toHaveLength(0);
  });

  it('interval medicines give one dose per clock time, key "<id>:<HH:MM>", pills per dose', () => {
    const iv: Schedule = {
      kind: 'interval',
      everyHours: 12,
      firstTime: '08:00',
      pills: 1.5,
      course: { kind: 'days', days: 5, startDate: '2026-10-14' },
    };
    const root = rootWith({ persons: [person()], assignments: [mk('a1', { schedule: iv })] });
    expect(todayDoses(root, TODAY).map((d) => [d.key, d.pills])).toEqual([
      ['a1:08:00', 1.5],
      ['a1:20:00', 1.5],
    ]);
    expect(todayDoses(root, '2026-10-19')).toHaveLength(0); // course is over
  });

  it('orders by time of day, then before / with / after meal', () => {
    const root = rootWith({
      persons: [person()],
      assignments: [
        mk('after', { schedule: dailyMeal({ morning: { pills: 1, meal: 'after' } }) }),
        mk('before', { schedule: dailyMeal({ morning: { pills: 1, meal: 'before' } }) }),
        mk('with', { schedule: dailyMeal({ morning: { pills: 1, meal: 'with' } }) }),
        mk('night', { schedule: dailyMeal({ bedtime: { pills: 1 } }) }),
        mk('eve', { schedule: dailyMeal({ evening: { pills: 1, meal: 'after' } }) }),
        mk('noon', { schedule: dailyMeal({ noon: { pills: 1, meal: 'before' } }) }),
      ],
    });
    expect(todayDoses(root, TODAY).map((d) => d.assignmentId)).toEqual(['before', 'with', 'after', 'noon', 'eve', 'night']);
  });
});

describe('todayProgress', () => {
  const d = (done: boolean) => ({ done }) as TodayDose;
  it('counts done / total and rounds the percent (3 of 11 = 27)', () => {
    const doses = [...Array(3).fill(true), ...Array(8).fill(false)].map(d);
    expect(todayProgress(doses)).toEqual({ done: 3, total: 11, percent: 27 });
  });
  it('nothing to prepare is 0 of 0, 0 percent', () => {
    expect(todayProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });
  it('all done is 100', () => {
    expect(todayProgress([d(true), d(true)]).percent).toBe(100);
  });
});

describe('intervalDay', () => {
  const course = (startDate: string, days: number): IntervalSchedule => ({
    kind: 'interval',
    everyHours: 12,
    firstTime: '08:00',
    pills: 1,
    course: { kind: 'days', days, startDate },
  });
  it('first and last day of a course', () => {
    expect(intervalDay(course(TODAY, 5), TODAY)).toBe('วันที่ 1 จาก 5');
    expect(intervalDay(course('2026-10-12', 5), TODAY)).toBe('วันที่ 5 จาก 5');
  });
  it('ongoing has no total, so no text', () => {
    expect(intervalDay({ ...course(TODAY, 5), course: { kind: 'ongoing' } }, TODAY)).toBeNull();
  });
});
