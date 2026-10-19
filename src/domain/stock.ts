// Stock, days left and low-stock logic (BRIEF section 4, Q2). Pure functions; `today` is always passed in.
import { CAP_DAYS, addDays, type IsoDate } from './calc';
import { dosesOn } from './schedule';
import type { Assignment, HouseItem, MedEvent } from './schema';

/** Was the medicine paused (stop with no resume yet) on `date`? A stop is effective from its own date. */
function pausedOn(assignmentId: string, date: IsoDate, events: MedEvent[]): boolean {
  let paused = false;
  const own = events
    .filter((e) => e.assignmentId === assignmentId && (e.type === 'stop' || e.type === 'resume') && e.effectiveOn <= date)
    .sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn) || a.at.localeCompare(b.at));
  for (const e of own) paused = e.type === 'stop';
  return paused;
}

const dosesTaken = (a: Assignment, date: IsoDate, events: MedEvent[]): number =>
  pausedOn(a.id, date, events) ? 0 : dosesOn(a.schedule, date);

/** Quantity at the start of `today` (Q2): counted qty minus the doses of every day from countedOn up to
 * yesterday. Today is not deducted yet. Never below 0. No count or a stopped medicine = null (unknown, not 0). */
export function stockNow(a: Assignment, today: IsoDate, events: MedEvent[] = []): number | null {
  if (a.status === 'stopped' || !a.stock) return null;
  let used = 0;
  for (let day = a.stock.countedOn; day < today; day = addDays(day, 1)) used += dosesTaken(a, day, events);
  return Math.max(a.stock.qty - used, 0);
}

/** Units to take from `today` through `today + orderDays - 1`, day by day with the real schedule and the same stop / resume
 * rule as `stockNow` (never an average). A stopped medicine needs nothing (0). The order page asks for this many. */
export function targetDoses(a: Assignment, today: IsoDate, orderDays: number, events: MedEvent[] = []): number {
  if (a.status === 'stopped') return 0;
  let total = 0;
  for (let i = 0; i < orderDays; i++) total += dosesTaken(a, addDays(today, i), events);
  return total;
}

export type DaysLeft =
  | { status: 'unknown' } // no count, or stopped
  | { status: 'ok'; days: number; depletionDate: IsoDate } // days from today to the first day that cannot be covered
  | { status: 'enough' }; // the stock covers every remaining dose (short course) or more than CAP_DAYS

/** Walks day by day from today with the real schedule (never an average). */
export function daysLeft(a: Assignment, today: IsoDate, events: MedEvent[] = []): DaysLeft {
  const start = stockNow(a, today, events);
  if (start === null) return { status: 'unknown' };
  let left = start;
  for (let i = 0; i < CAP_DAYS; i++) {
    const day = addDays(today, i);
    const need = dosesTaken(a, day, events);
    if (need === 0) continue;
    if (left + 1e-9 < need) return { status: 'ok', days: i, depletionDate: day };
    left -= need;
  }
  return { status: 'enough' };
}

/** Low = days left <= settings.lowStockDays. Unknown or enough is never low. */
export function isLowStock(a: Assignment, today: IsoDate, lowStockDays: number, events: MedEvent[] = []): boolean {
  const d = daysLeft(a, today, events);
  return d.status === 'ok' && d.days <= lowStockDays;
}

export type HouseStatus = 'untracked' | 'ok' | 'low' | 'out';

/** No stock = not counted; qty 0 = out ("หมดแล้ว"); qty <= lowAt = low. */
export function houseStatus(item: HouseItem): HouseStatus {
  if (!item.stock) return 'untracked';
  if (item.stock.qty === 0) return 'out';
  if (item.lowAt !== undefined && item.stock.qty <= item.lowAt) return 'low';
  return 'ok';
}
