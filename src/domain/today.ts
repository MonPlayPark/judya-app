// "Today" and today's doses (BRIEF sections 3.2 and 4). Pure: the caller passes `today`.
import { diffDays, type IsoDate } from './calc';
import { doseKey, dosesOn, intervalTimes } from './schedule';
import type { IntervalSchedule, Root } from './schema';

/** Calendar date in Asia/Bangkok (UTC+7, no daylight saving) as 'YYYY-MM-DD'. */
export function todayInBangkok(now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export type DoseSlot = 'morning' | 'noon' | 'evening' | 'bedtime';
export type MealTiming = 'before' | 'with' | 'after';

export interface TodayDose {
  key: string; // key in prepLog
  assignmentId: string;
  personId: string;
  medicationId: string;
  pills: number; // per dose
  when: { kind: 'slot'; slot: DoseSlot; meal?: MealTiming } | { kind: 'time'; time: string };
  done: boolean;
}

const SLOT_ORDER: DoseSlot[] = ['morning', 'noon', 'evening', 'bedtime'];
const MEAL_ORDER: MealTiming[] = ['before', 'with', 'after'];

/** Doses to prepare today. Leaves out: people who manage their own medicine, stopped medicines,
 * removed members, medicines not taken today. Sorted: meal slots by time of day, then before / with / after
 * meal; interval doses after them by clock time. `who` filters to one member. */
export function todayDoses(root: Root, today: IsoDate, who?: string): TodayDose[] {
  const done = root.prepLog[today] ?? {};
  const out: TodayDose[] = [];
  for (const a of root.assignments) {
    if (a.status !== 'active' || (who !== undefined && a.personId !== who)) continue;
    const person = root.persons.find((p) => p.id === a.personId);
    if (!person || person.selfManaged || person.removedAt !== undefined) continue;
    if (dosesOn(a.schedule, today) === 0) continue;
    const base = { assignmentId: a.id, personId: a.personId, medicationId: a.medicationId };

    if (a.schedule.kind === 'interval') {
      for (const time of intervalTimes(a.schedule)) {
        const key = doseKey(a.id, time);
        out.push({ ...base, key, pills: a.schedule.pills, when: { kind: 'time', time }, done: done[key] === true });
      }
      continue;
    }
    for (const slot of SLOT_ORDER) {
      const s = a.schedule.slots[slot];
      if (!s) continue;
      const key = doseKey(a.id, slot);
      const meal = 'meal' in s ? s.meal : undefined;
      out.push({ ...base, key, pills: s.pills, when: meal ? { kind: 'slot', slot, meal } : { kind: 'slot', slot }, done: done[key] === true });
    }
  }
  const rank = (d: TodayDose): [number, number, string] =>
    d.when.kind === 'slot'
      ? [SLOT_ORDER.indexOf(d.when.slot), d.when.meal ? MEAL_ORDER.indexOf(d.when.meal) : 0, '']
      : [SLOT_ORDER.length, 0, d.when.time];
  return out.sort((x, y) => {
    const [a1, a2, a3] = rank(x);
    const [b1, b2, b3] = rank(y);
    return a1 - b1 || a2 - b2 || a3.localeCompare(b3);
  });
}

/** Prepared / total doses and the percent for the progress bar (rounded; 0 when there is nothing to prepare). */
export function todayProgress(doses: TodayDose[]): { done: number; total: number; percent: number } {
  const total = doses.length;
  const done = doses.filter((d) => d.done).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** Course day of an interval medicine: 'วันที่ 2 จาก 5'. An ongoing medicine has no start date, so no text (null). */
export function intervalDay(schedule: IntervalSchedule, today: IsoDate): string | null {
  const { course } = schedule;
  if (course.kind === 'ongoing') return null;
  return `วันที่ ${diffDays(course.startDate, today) + 1} จาก ${course.days}`;
}
