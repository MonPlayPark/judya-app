// Pure schedule logic on the data-v2 model (BRIEF section 4). No UI, no storage, no clock:
// the date is always passed in.
import { dow, diffDays, type IsoDate } from './calc';
import type { IntervalSchedule, Schedule } from './schema';

/** The design canvas counts weekdays from Monday = 0; the data model from Sunday = 0 (like `dow`). */
export const canvasDayToModelDay = (day: number): number => (day + 1) % 7;
export const modelDayToCanvasDay = (day: number): number => (day + 6) % 7;

/** Does the course / day rule of this schedule include `date`? */
function takesOn(schedule: Schedule, date: IsoDate): boolean {
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
      return days.days.includes(dow(date)); // model numbering, 0 = Sunday
  }
}

/** Pills (or other units) taken on `date`: meal = sum of the slots; interval = (24 / everyHours) x pills. */
export function dosesOn(schedule: Schedule, date: IsoDate): number {
  if (!takesOn(schedule, date)) return 0;
  if (schedule.kind === 'interval') return (24 / schedule.everyHours) * schedule.pills;
  const { morning, noon, evening, bedtime } = schedule.slots;
  return (morning?.pills ?? 0) + (noon?.pills ?? 0) + (evening?.pills ?? 0) + (bedtime?.pills ?? 0);
}

/** Key of one tick mark in `prepLog`: meal = "<assignmentId>:<slot>", interval = "<assignmentId>:<HH:MM>". */
export const doseKey = (assignmentId: string, slotOrTime: string): string => `${assignmentId}:${slotOrTime}`;

/** Clock times of an interval medicine over one day, earliest first (firstTime, +N h, +2N h ... wrapping past midnight). */
export function intervalTimes(schedule: IntervalSchedule): string[] {
  const [h = 0, m = 0] = schedule.firstTime.split(':').map(Number);
  const first = h * 60 + m;
  const step = schedule.everyHours * 60;
  const times: number[] = [];
  for (let t = first; t < first + 24 * 60; t += step) times.push(t % (24 * 60));
  return times
    .sort((a, b) => a - b)
    .map((t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
}

