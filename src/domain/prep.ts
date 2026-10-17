// Tick marks for "ยาวันนี้" (Q10): kept per day, kept for the last 14 days. Pure functions on `prepLog`.
import { diffDays, type IsoDate } from './calc';
import type { Root } from './schema';

export type PrepLog = Root['prepLog'];

export const PREP_KEEP_DAYS = 14;

export function tickPrep(log: PrepLog, date: IsoDate, key: string): PrepLog {
  return { ...log, [date]: { ...log[date], [key]: true } };
}

/** Removes a tick; a day left with no ticks is dropped. */
export function untickPrep(log: PrepLog, date: IsoDate, key: string): PrepLog {
  const day = log[date];
  if (!day || !(key in day)) return log;
  const { [key]: _removed, ...rest } = day;
  const { [date]: _day, ...others } = log;
  return Object.keys(rest).length > 0 ? { ...others, [date]: rest as PrepLog[string] } : others;
}

/** Keeps today and the 14 days before it (age 14 stays, age 15 goes). */
export function prunePrep(log: PrepLog, today: IsoDate): PrepLog {
  return Object.fromEntries(Object.entries(log).filter(([date]) => diffDays(date, today) <= PREP_KEEP_DAYS));
}
