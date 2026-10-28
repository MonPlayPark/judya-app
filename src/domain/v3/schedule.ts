// Pure schedule logic on the v3 model: "how many units on this day". Same idea as the v2 schedule.ts, v3 types.
// No UI, no storage, no clock: the date is always passed in. Only the date helpers of calc.ts are shared with v2.
import { dow, diffDays, type IsoDate } from '../calc';
import type { Schedule } from './schema';

/** Does the course / day rule of this schedule include `date`? */
export function takesOn(schedule: Schedule, date: IsoDate): boolean {
  if (schedule.kind === 'interval') {
    const { course } = schedule;
    if (course.kind === 'ongoing') return true;
    const k = diffDays(course.startDate, date);
    return k >= 0 && k < course.days;
  }
  const { days } = schedule;
  switch (days.kind) {
    case 'daily':
      return true;
    case 'alt': {
      const k = diffDays(days.anchor, date);
      return k >= 0 && k % 2 === 0; // never before the anchor
    }
    case 'weekdays':
      return days.days.includes(dow(date)); // 0 = Sunday
  }
}

/** Units taken on `date` (pills, or ml for a liquid): meal = sum of the slots; interval = (24 / everyHours) x pills. */
export function dosesOn(schedule: Schedule, date: IsoDate): number {
  if (!takesOn(schedule, date)) return 0;
  if (schedule.kind === 'interval') return (24 / schedule.everyHours) * schedule.pills;
  const { morning, noon, evening, bedtime } = schedule.slots;
  return (morning?.pills ?? 0) + (noon?.pills ?? 0) + (evening?.pills ?? 0) + (bedtime?.pills ?? 0);
}
