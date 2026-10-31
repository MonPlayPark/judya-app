// Stock, days left, low-stock and refill logic on the v3 model. Pure functions; `today` is always passed in.
// Same behaviour as the v2 stock.ts (day by day, never an average), but the quantity comes from `stockUnits`.
import { CAP_DAYS, addDays, type IsoDate } from '../calc';
import { dosesOn } from './schedule';
import { stockProblem, unitsPerStrip, type Assignment, type HouseItem, type Medication, type MedEvent, type Stock } from './schema';

/** Was the medicine paused (stop with no resume yet) on `date`? A stop is effective from its own date. */
function pausedOn(assignmentId: string, date: IsoDate, events: readonly MedEvent[]): boolean {
  let paused = false;
  const own = events
    .filter((e) => e.assignmentId === assignmentId && (e.type === 'stop' || e.type === 'resume') && e.effectiveOn <= date)
    .sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn) || a.at.localeCompare(b.at));
  for (const e of own) paused = e.type === 'stop';
  return paused;
}

const dosesTaken = (a: Assignment, date: IsoDate, events: readonly MedEvent[]): number =>
  pausedOn(a.id, date, events) ? 0 : dosesOn(a.schedule, date);

// ---------- (a) total units ----------

export type StockUnits =
  | { status: 'none' } // never counted
  | { status: 'tubes'; opened: boolean; spare: number } // cream / drops: counted by the tube, no calculation
  | { status: 'units'; unit: 'count' | 'ml'; qty: number; countedOn: IsoDate } // count: pills / sachets; volume: ml
  | { status: 'error'; message: string }; // the data does not fit (never guessed)

/** Total units of an assignment's stock on the morning of `countedOn`. count = strips x units per strip + loose;
 * volume = ml. A count with strips but a pack without a strip size is an error, not a guess. */
export function stockUnits(a: Assignment, medication: Medication): StockUnits {
  if (a.medicationId !== medication.id) return { status: 'error', message: 'ยานี้ไม่ตรงกับข้อมูลยาที่ส่งมา' };
  const { stock } = a;
  if (!stock) return { status: 'none' };
  const problem = stockProblem(medication, stock);
  if (problem) return { status: 'error', message: 'ข้อมูลสต็อกไม่ตรงกับชนิดหรือบรรจุภัณฑ์ของยา' };
  switch (stock.kind) {
    case 'count': {
      const per = unitsPerStrip(medication.pack) ?? 0; // strips are 0 when per is null (checked above)
      return { status: 'units', unit: 'count', qty: stock.strips * per + stock.loose, countedOn: stock.countedOn };
    }
    case 'volume':
      return { status: 'units', unit: 'ml', qty: stock.ml, countedOn: stock.countedOn };
    case 'tubes':
      return { status: 'tubes', opened: stock.opened, spare: stock.spare };
  }
}

// ---------- (b) quantity now, target, days left, low stock ----------

/** Units at the start of `today`: counted units minus the doses of every day from countedOn up to yesterday.
 * Today is not deducted yet. Never below 0. Works for a stopped medicine too (used by refill). */
function walkUsed(a: Assignment, from: IsoDate, qty: number, today: IsoDate, events: readonly MedEvent[]): number {
  let used = 0;
  for (let day = from; day < today; day = addDays(day, 1)) used += dosesTaken(a, day, events);
  return Math.max(qty - used, 0);
}

/** Quantity at the start of `today` (count: units, volume: ml). null = unknown: never counted, stopped, tubes
 * (not calculated) or bad data (`daysLeft` reports that one as an error). */
export function stockNow(a: Assignment, medication: Medication, today: IsoDate, events: readonly MedEvent[] = []): number | null {
  if (a.status === 'stopped') return null;
  const u = stockUnits(a, medication);
  return u.status === 'units' ? walkUsed(a, u.countedOn, u.qty, today, events) : null;
}

/** Units to take from `today` through `today + orderDays - 1`, day by day with the real schedule and the same stop /
 * resume rule as `stockNow` (never an average). A stopped medicine needs nothing (0). */
export function targetDoses(a: Assignment, today: IsoDate, orderDays: number, events: readonly MedEvent[] = []): number {
  if (a.status === 'stopped') return 0;
  let total = 0;
  for (let i = 0; i < orderDays; i++) total += dosesTaken(a, addDays(today, i), events);
  return total;
}

export type DaysLeft =
  | { status: 'unknown' } // no count, or stopped
  | { status: 'tubes'; opened: boolean; spare: number } // counted by the tube: no days
  | { status: 'error'; message: string } // data does not fit
  | { status: 'ok'; days: number; depletionDate: IsoDate } // days from today to the first day that cannot be covered
  | { status: 'enough' }; // the stock covers every remaining dose (short course) or more than CAP_DAYS

/** Walks day by day from today with the real schedule (never an average). A stopped medicine is 'unknown'. */
export function daysLeft(a: Assignment, medication: Medication, today: IsoDate, events: readonly MedEvent[] = []): DaysLeft {
  if (a.status === 'stopped') return { status: 'unknown' };
  const u = stockUnits(a, medication);
  if (u.status === 'none') return { status: 'unknown' };
  if (u.status === 'error') return { status: 'error', message: u.message };
  if (u.status === 'tubes') return { status: 'tubes', opened: u.opened, spare: u.spare };
  let left = walkUsed(a, u.countedOn, u.qty, today, events);
  for (let i = 0; i < CAP_DAYS; i++) {
    const day = addDays(today, i);
    const need = dosesTaken(a, day, events);
    if (need === 0) continue;
    if (left + 1e-9 < need) return { status: 'ok', days: i, depletionDate: day };
    left -= need;
  }
  return { status: 'enough' };
}

/** Low = days left <= lowStockDays. Unknown, tubes, error and enough are never low (tubes: the design has no rule yet). */
export function isLowStock(
  a: Assignment,
  medication: Medication,
  today: IsoDate,
  lowStockDays: number,
  events: readonly MedEvent[] = [],
): boolean {
  const d = daysLeft(a, medication, today, events);
  return d.status === 'ok' && d.days <= lowStockDays;
}

export type TubeLevel = 'enough' | 'low' | 'out';

/** The owner's rule for cream / drops (one place, used by the list and the detail page): a spare tube = enough; no spare
 * but one is open and in use = low; nothing at all = out. */
export function tubeLevel(s: { opened: boolean; spare: number }): TubeLevel {
  return s.spare > 0 ? 'enough' : s.opened ? 'low' : 'out';
}

export type HouseStatus = 'untracked' | 'ok' | 'low' | 'out';

/** No stock = not counted; qty 0 = out ("หมดแล้ว"); qty <= lowAt = low. */
export function houseStatus(item: HouseItem): HouseStatus {
  if (!item.stock) return 'untracked';
  if (item.stock.qty === 0) return 'out';
  if (item.lowAt !== undefined && item.stock.qty <= item.lowAt) return 'low';
  return 'ok';
}

// ---------- (d) refill and open a new tube ----------

/** What was bought: count = strips + loose pieces, volume = ml, tubes = spare tubes. */
export type RefillAmount =
  | { kind: 'count'; strips: number; loose: number }
  | { kind: 'volume'; ml: number }
  | { kind: 'tubes'; spare: number };

export type StockChange = { ok: true; assignment: Assignment } | { ok: false; error: string };

const fail = (error: string): StockChange => ({ ok: false, error });

/** The nearer date wins; one date alone is used; none stays none. */
export function mergeExpiry(oldExpiry: IsoDate | undefined, newExpiry: IsoDate | undefined): IsoDate | undefined {
  if (oldExpiry !== undefined && newExpiry !== undefined) return oldExpiry <= newExpiry ? oldExpiry : newExpiry;
  return oldExpiry ?? newExpiry;
}

const isHalfStep = (v: number): boolean => Number.isFinite(v) && v >= 0 && Number.isInteger(v * 2);

/** Add bought stock on top of what is left at the start of `today`, and set countedOn = today. Returns a new
 * assignment; the old one is not changed, and NO MedEvent is made (history keeps the doctor-side events only).
 * Never counted (stock = null): counting starts from the amount added. */
export function refillStock(
  a: Assignment,
  medication: Medication,
  events: readonly MedEvent[],
  today: IsoDate,
  add: RefillAmount,
  newExpiry?: IsoDate,
): StockChange {
  const expiry = mergeExpiry(a.expiry, newExpiry);
  const withStock = (stock: Stock): StockChange => {
    const problem = stockProblem(medication, stock);
    if (problem) return fail('ข้อมูลที่เติมไม่ตรงกับชนิดหรือบรรจุภัณฑ์ของยา');
    const { expiry: _old, ...rest } = a;
    return { ok: true, assignment: { ...rest, stock, ...(expiry !== undefined ? { expiry } : {}) } };
  };

  const u = stockUnits(a, medication);
  if (u.status === 'error') return fail(u.message);
  if (a.stock && a.stock.kind !== add.kind) return fail('ชนิดสต็อกที่เติมไม่ตรงกับสต็อกเดิม');

  if (add.kind === 'tubes') {
    if (!Number.isInteger(add.spare) || add.spare <= 0) return fail('จำนวนหลอดที่เติมต้องเป็นจำนวนเต็มมากกว่า 0');
    const base = a.stock?.kind === 'tubes' ? a.stock : { kind: 'tubes' as const, opened: false, spare: 0 };
    return withStock({ kind: 'tubes', opened: base.opened, spare: base.spare + add.spare });
  }

  const left = u.status === 'units' ? walkUsed(a, u.countedOn, u.qty, today, events) : null; // null = not counted yet

  if (add.kind === 'volume') {
    if (!Number.isFinite(add.ml) || add.ml <= 0) return fail('ปริมาณที่เติมต้องมากกว่า 0');
    return withStock({ kind: 'volume', ml: (left ?? 0) + add.ml, countedOn: today });
  }

  if (!Number.isInteger(add.strips) || add.strips < 0 || !isHalfStep(add.loose)) return fail('จำนวนที่เติมไม่ถูกต้อง');
  const per = unitsPerStrip(medication.pack);
  if (add.strips > 0 && per === null) return fail('ยานี้ไม่มีขนาดต่อแผง จึงเติมเป็นแผงไม่ได้');
  const added = add.strips * (per ?? 0) + add.loose;
  if (added <= 0) return fail('จำนวนที่เติมต้องมากกว่า 0');
  if (left === null) return withStock({ kind: 'count', strips: add.strips, loose: add.loose, countedOn: today });
  const total = left + added;
  if (per === null) return withStock({ kind: 'count', strips: 0, loose: total, countedOn: today });
  const strips = Math.floor(total / per);
  return withStock({ kind: 'count', strips, loose: total - strips * per, countedOn: today });
}

/** Open a new tube: spare - 1 and opened = true. No spare tube = a readable error, never a negative number. */
export function openNewTube(a: Assignment): StockChange {
  const { stock } = a;
  if (!stock || stock.kind !== 'tubes') return fail('ยานี้ไม่ได้นับเป็นหลอด');
  if (stock.spare <= 0) return fail('ไม่มีหลอดสำรองให้เปิด');
  return { ok: true, assignment: { ...a, stock: { kind: 'tubes', opened: true, spare: stock.spare - 1 } } };
}
