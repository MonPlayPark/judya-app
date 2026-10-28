import { describe, expect, it } from 'vitest';
import { addDays } from '../calc';
import { assignmentSchema, type Assignment, type Medication, type MedEvent, type Schedule, type Stock } from './schema';
import { daysLeft, houseStatus, isLowStock, mergeExpiry, openNewTube, refillStock, stockNow, stockUnits, targetDoses } from './stock';
import { formatDaysLeft, unitFor } from './stockText';

// Made-up data only. TODAY = 2026-10-28 = Wednesday (dow 3). Thu = 4, Mon = 1.
const TODAY = '2026-10-28';
const NOW = '2026-10-28T09:00:00+07:00';

const med = (over: Partial<Medication> = {}): Medication => ({ id: 'm', name: 'ยาตัวอย่าง', kind: 'tablet', pack: { type: 'strip', perStrip: 10 }, ...over });
const sachet = med({ kind: 'sachet', pack: { type: 'sachetBox', sachets: 10 } });
const box = med({ kind: 'capsule', pack: { type: 'box', strips: 3, perStrip: 10 } });
const liquid = med({ kind: 'liquid', pack: { type: 'container', amount: 60, unit: 'ml' } });
const cream = med({ kind: 'cream', pack: { type: 'container', amount: 15, unit: 'g' } });
const noPack = med({ kind: 'other', pack: { type: 'none' } });

type MealDays = Extract<Schedule, { kind: 'meal' }>['days'];
/** Meal schedule: `morning` pills in the morning and `evening` in the evening. */
const meal = (morning: number, evening = 0, days: MealDays = { kind: 'daily' }): Schedule => ({
  kind: 'meal',
  slots: { morning: { pills: morning, meal: 'after' }, ...(evening ? { evening: { pills: evening, meal: 'after' as const } } : {}) },
  days,
});

const count = (strips: number, loose: number, countedOn = TODAY): Stock => ({ kind: 'count', strips, loose, countedOn });
const asg = (stock: Stock | null, schedule: Schedule, extra: Partial<Assignment> = {}): Assignment => ({
  id: 'a', medicationId: 'm', personId: 'p', schedule, stock, status: 'active', createdAt: NOW, ...extra,
});
const ev = (type: 'stop' | 'resume', effectiveOn: string): MedEvent =>
  type === 'stop'
    ? { id: `e-${type}-${effectiveOn}`, assignmentId: 'a', type, reason: 'อื่น ๆ', effectiveOn, at: `${effectiveOn}T08:00:00+07:00` }
    : { id: `e-${type}-${effectiveOn}`, assignmentId: 'a', type, effectiveOn, at: `${effectiveOn}T08:00:00+07:00` };

const days = (a: Assignment, m: Medication, events: MedEvent[] = []) => {
  const d = daysLeft(a, m, TODAY, events);
  return d.status === 'ok' ? d.days : d.status;
};

// ---------- worked examples (hand calculation, step by step) ----------

describe('worked examples (re-check by hand)', () => {
  it('example 1: strip + loose pills, 2 a day', () => {
    // stock 2 strips of 10 + 3 loose = 2 x 10 + 3 = 23 pills, counted today. Dose 1 + 1 = 2 a day.
    // Today is not deducted: 23 at the start of today. Walk: day 0 -> 21, day 1 -> 19 ... day k -> 23 - 2(k+1).
    // Day 10 starts with 23 - 20 = 3 (>= 2, take) -> 1 left. Day 11 needs 2 but has 1 -> first day not covered = 11.
    const a = asg(count(2, 3), meal(1, 1));
    expect(stockNow(a, med(), TODAY)).toBe(23);
    const d = daysLeft(a, med(), TODAY);
    expect(d).toEqual({ status: 'ok', days: 11, depletionDate: '2026-11-08' }); // 28 Oct + 11 days
  });

  it('example 2: counted 5 days ago, so 5 days are already used', () => {
    // counted 2026-10-23: 23 pills. Used 23 Oct .. 27 Oct = 5 days x 2 = 10 -> 13 at the start of today.
    // Walk: 13 -> 11 -> 9 -> 7 -> 5 -> 3 -> 1 after 6 days (day 0..5). Day 6 needs 2, has 1 -> days = 6.
    const a = asg(count(2, 3, '2026-10-23'), meal(1, 1));
    expect(stockNow(a, med(), TODAY)).toBe(13);
    expect(days(a, med())).toBe(6);
  });

  it('example 3: box of 3 strips (perStrip 10), 3 boxes-strips + 5 loose, 1 a day', () => {
    // box: strips in the stock = number of strips, each perStrip = 10 -> 3 x 10 + 5 = 35 capsules.
    // 1 a day: days 0..34 are covered (35 capsules); day 35 has 0 left -> days = 35.
    const a = asg(count(3, 5), meal(1));
    expect(stockUnits(a, box)).toEqual({ status: 'units', unit: 'count', qty: 35, countedOn: TODAY });
    expect(days(a, box)).toBe(35);
    expect(formatDaysLeft(daysLeft(a, box, TODAY), unitFor(a.schedule))).toBe('35 วัน');
  });

  it('example 4: sachet box of 10, 2 boxes + 4 loose sachets, 3 sachets a day', () => {
    // sachetBox: strips in the stock = boxes, 10 sachets each -> 2 x 10 + 4 = 24 sachets.
    // Dose 1 morning + 1 noon + 1 evening = 3 a day. 24 / 3 = 8 days exactly (8 x 3 = 24).
    // Day 8 has 0 left -> days = 8.
    const s: Schedule = { kind: 'meal', slots: { morning: { pills: 1, meal: 'after' }, noon: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } }, days: { kind: 'daily' } };
    const a = asg(count(2, 4), s);
    expect(stockUnits(a, sachet)).toMatchObject({ qty: 24 });
    expect(days(a, sachet)).toBe(8);
  });

  it('example 5: liquid in ml, every 12 hours 2.5 ml', () => {
    // stock 42 ml. Interval 12 h = 2 doses a day x 2.5 ml = 5 ml a day.
    // Days 0..7 take 8 x 5 = 40 ml -> 2 ml left. Day 8 needs 5, has 2 -> days = 8.
    const s: Schedule = { kind: 'interval', everyHours: 12, firstTime: '08:00', pills: 2.5, course: { kind: 'ongoing' } };
    const a = asg({ kind: 'volume', ml: 42, countedOn: TODAY }, s);
    expect(stockNow(a, liquid, TODAY)).toBe(42);
    expect(days(a, liquid)).toBe(8);
  });

  it('example 6: Thursday only, 2 pills -> day 15 -> "ประมาณ 2 สัปดาห์"', () => {
    // Today is Wednesday. Thursdays are day 1, 8, 15, 22 ... Stock 2 pills, 1 pill each Thursday.
    // Day 1 takes (1 left), day 8 takes (0 left), day 15 needs 1 but has 0 -> days = 15.
    // Not daily -> weeks. 15 > 14, N = round(15 / 7) = round(2.14) = 2 -> "ประมาณ 2 สัปดาห์".
    const a = asg(count(0, 2), meal(1, 0, { kind: 'weekdays', days: [4] }));
    const d = daysLeft(a, med(), TODAY);
    expect(d).toEqual({ status: 'ok', days: 15, depletionDate: addDays(TODAY, 15) });
    expect(formatDaysLeft(d, unitFor(a.schedule))).toBe('ประมาณ 2 สัปดาห์');
  });

  it('example 7: Wednesday only, 2 pills -> day 14 -> "ไม่ถึง 2 สัปดาห์"', () => {
    // Wednesdays are day 0, 7, 14. Stock 2: day 0 takes, day 7 takes, day 14 has 0 -> days = 14.
    // 14 <= 14 -> "ไม่ถึง 2 สัปดาห์" (one day more, example 6, flips to "ประมาณ 2 สัปดาห์").
    const a = asg(count(0, 2), meal(1, 0, { kind: 'weekdays', days: [3] }));
    const d = daysLeft(a, med(), TODAY);
    expect(d).toMatchObject({ status: 'ok', days: 14 });
    expect(formatDaysLeft(d, unitFor(a.schedule))).toBe('ไม่ถึง 2 สัปดาห์');
  });

  it('example 8: Monday only, 3 pills -> 26 days -> rounds UP to 4 weeks', () => {
    // Mondays: day 5, 12, 19, 26. Stock 3 covers day 5, 12, 19. Day 26 has 0 -> days = 26.
    // 26 / 7 = 3.71 -> nearest = 4 -> "ประมาณ 4 สัปดาห์" (rounding down would say 3).
    const a = asg(count(0, 3), meal(1, 0, { kind: 'weekdays', days: [1] }));
    const d = daysLeft(a, med(), TODAY);
    expect(d).toMatchObject({ status: 'ok', days: 26 });
    expect(formatDaysLeft(d, unitFor(a.schedule))).toBe('ประมาณ 4 สัปดาห์');
  });

  it('example 9: stop for 2 days, then resume', () => {
    // 10 pills counted 6 days ago (22 Oct), 1 a day. Stop effective 24 Oct, resume effective 26 Oct.
    // Taken: 22, 23 (2 days) · paused: 24, 25 · taken: 26, 27 (2 days) -> used 4 -> 10 - 4 = 6 at the start of today.
    // Daily from now: 6 pills = days 0..5, day 6 has 0 -> days = 6.
    const a = asg(count(0, 10, '2026-10-22'), meal(1));
    const events = [ev('stop', '2026-10-24'), ev('resume', '2026-10-26')];
    expect(stockNow(a, med(), TODAY, events)).toBe(6);
    expect(days(a, med(), events)).toBe(6);
  });

  it('example 10: refill', () => {
    // 2 strips + 3 loose = 23 pills counted 2 days ago (26 Oct), 2 a day. Used 26, 27 = 4 -> 19 at the start of today.
    // Bought 1 strip + 5 loose = 15 -> 19 + 15 = 34 = 3 strips + 4 loose. countedOn = today.
    // 34 / 2 = 17 days exactly -> day 17 has 0 -> days = 17.
    const a = asg(count(2, 3, '2026-10-26'), meal(1, 1));
    const r = refillStock(a, med(), [], TODAY, { kind: 'count', strips: 1, loose: 5 });
    expect(r.ok && r.assignment.stock).toEqual({ kind: 'count', strips: 3, loose: 4, countedOn: TODAY });
    expect(r.ok && days(r.assignment, med())).toBe(17);
  });

  it('example 11: the nearer expiry date is kept', () => {
    // old expiry 2027-06-30, new box 2027-01-15 -> 2027-01-15 is nearer -> kept.
    const a = asg(count(1, 0), meal(1), { expiry: '2027-06-30' });
    const r = refillStock(a, med(), [], TODAY, { kind: 'count', strips: 1, loose: 0 }, '2027-01-15');
    expect(r.ok && r.assignment.expiry).toBe('2027-01-15');
  });
});

// ---------- (a) total units ----------

describe('stockUnits', () => {
  it('strip: strips x perStrip + loose', () => {
    expect(stockUnits(asg(count(2, 3), meal(1)), med())).toEqual({ status: 'units', unit: 'count', qty: 23, countedOn: TODAY });
  });

  it('sachetBox: boxes x sachets + loose sachets', () => {
    expect(stockUnits(asg(count(2, 4), meal(1)), sachet)).toMatchObject({ qty: 24 });
  });

  it('volume is ml and tubes is not a number of units', () => {
    expect(stockUnits(asg({ kind: 'volume', ml: 45, countedOn: TODAY }, meal(1)), liquid)).toMatchObject({ unit: 'ml', qty: 45 });
    expect(stockUnits(asg({ kind: 'tubes', opened: true, spare: 2 }, meal(1)), cream)).toEqual({ status: 'tubes', opened: true, spare: 2 });
  });

  it('never counted is none', () => {
    expect(stockUnits(asg(null, meal(1)), med())).toEqual({ status: 'none' });
  });

  it('pack none with strips is an error, not a guess; pack none with loose only is fine', () => {
    expect(stockUnits(asg(count(2, 0), meal(1)), noPack).status).toBe('error');
    expect(stockUnits(asg(count(0, 7), meal(1)), noPack)).toMatchObject({ status: 'units', qty: 7 });
  });

  it('a stock that does not fit the kind is an error', () => {
    expect(stockUnits(asg({ kind: 'volume', ml: 5, countedOn: TODAY }, meal(1)), med()).status).toBe('error');
  });

  it('another medicine than the assignment\'s is an error', () => {
    expect(stockUnits(asg(count(1, 0), meal(1)), med({ id: 'other' })).status).toBe('error');
  });
});

// ---------- (b) quantity now, days left, target, low ----------

describe('stockNow / daysLeft behave like v2', () => {
  it('today is not deducted yet', () => {
    expect(stockNow(asg(count(0, 10), meal(1)), med(), TODAY)).toBe(10);
  });

  it('never below 0', () => {
    expect(stockNow(asg(count(0, 3, '2026-09-28'), meal(1)), med(), TODAY)).toBe(0); // 30 days used, only 3 pills
  });

  it('a stopped medicine and a medicine never counted are unknown, not 0', () => {
    expect(stockNow(asg(count(0, 5), meal(1), { status: 'stopped' }), med(), TODAY)).toBeNull();
    expect(daysLeft(asg(count(0, 5), meal(1), { status: 'stopped' }), med(), TODAY)).toEqual({ status: 'unknown' });
    expect(stockNow(asg(null, meal(1)), med(), TODAY)).toBeNull();
    expect(daysLeft(asg(null, meal(1)), med(), TODAY)).toEqual({ status: 'unknown' });
  });

  it('every other day: the anchor day takes, the day after does not', () => {
    // anchor today, 1 pill, 7 pills: takes day 0, 2, 4, 6, 8, 10, 12 (7 pills) -> day 14 has 0 -> days = 14.
    const a = asg(count(0, 7), meal(1, 0, { kind: 'alt', anchor: TODAY }));
    expect(days(a, med())).toBe(14);
  });

  it('every other day with an anchor in the future: nothing is taken before it', () => {
    // anchor in 3 days, 1 pill: day 3 takes, day 5 has 0 -> days = 5.
    const a = asg(count(0, 1), meal(1, 0, { kind: 'alt', anchor: addDays(TODAY, 3) }));
    expect(days(a, med())).toBe(5);
  });

  it('a short course covered by the stock is "enough"', () => {
    // 3 days x (24 / 8) x 1 = 9 pills needed; stock 20.
    const s: Schedule = { kind: 'interval', everyHours: 8, firstTime: '08:00', pills: 1, course: { kind: 'days', days: 3, startDate: TODAY } };
    expect(daysLeft(asg(count(0, 20), s), med(), TODAY)).toEqual({ status: 'enough' });
    // stock 5: day 0 takes 3 (2 left), day 1 needs 3 -> days = 1.
    expect(daysLeft(asg(count(0, 5), s), med(), TODAY)).toMatchObject({ status: 'ok', days: 1 });
  });

  it('more than CAP_DAYS (3650) is "enough"', () => {
    // 5000 strips x 10 = 50000 pills, 1 a day = 50000 days.
    expect(daysLeft(asg(count(5000, 0), meal(1)), med(), TODAY)).toEqual({ status: 'enough' });
  });

  it('stop and resume follow the events, a stop is effective from its own date', () => {
    const a = asg(count(0, 10), meal(1));
    expect(days(a, med(), [ev('stop', TODAY)])).toBe('enough'); // paused from today: nothing is taken, nothing runs out
    expect(days(a, med(), [ev('stop', TODAY), ev('resume', addDays(TODAY, 3))])).toBe(13); // 3 days paused, then 10 pills
  });

  it('events of another assignment are ignored', () => {
    const other: MedEvent = { ...ev('stop', '2026-10-01'), assignmentId: 'other' };
    expect(days(asg(count(0, 10), meal(1)), med(), [other])).toBe(10);
  });
});

describe('tubes', () => {
  const t = asg({ kind: 'tubes', opened: true, spare: 2 }, meal(1));

  it('daysLeft gives status tubes with opened and spare, no days', () => {
    expect(daysLeft(t, cream, TODAY)).toEqual({ status: 'tubes', opened: true, spare: 2 });
  });

  it('stockNow is null and it is never low, even with a huge threshold', () => {
    expect(stockNow(t, cream, TODAY)).toBeNull();
    expect(isLowStock(t, cream, TODAY, 60)).toBe(false);
  });
});

describe('volume (ml)', () => {
  it('ml are deducted day by day from countedOn', () => {
    // 45 ml counted yesterday, 3 ml a day (8 h x 1 ml): used 3 -> 42 ml now.
    const s: Schedule = { kind: 'interval', everyHours: 8, firstTime: '08:00', pills: 1, course: { kind: 'ongoing' } };
    expect(stockNow(asg({ kind: 'volume', ml: 45, countedOn: addDays(TODAY, -1) }, s), liquid, TODAY)).toBe(42);
  });
});

describe('error data', () => {
  it('pack none with strips: daysLeft is an error with a readable message and it is never low', () => {
    const a = asg(count(2, 0), meal(1));
    const d = daysLeft(a, noPack, TODAY);
    expect(d.status).toBe('error');
    expect(isLowStock(a, noPack, TODAY, 60)).toBe(false);
    expect(stockNow(a, noPack, TODAY)).toBeNull();
  });
});

describe('isLowStock', () => {
  const a = asg(count(0, 11), meal(1)); // 11 days
  it('low when days left <= threshold (the boundary counts)', () => {
    expect([isLowStock(a, med(), TODAY, 14), isLowStock(a, med(), TODAY, 11), isLowStock(a, med(), TODAY, 10)]).toEqual([true, true, false]);
  });
  it('unknown and enough are never low', () => {
    expect(isLowStock(asg(null, meal(1)), med(), TODAY, 60)).toBe(false);
    expect(isLowStock(asg(count(5000, 0), meal(1)), med(), TODAY, 60)).toBe(false);
  });
});

describe('targetDoses', () => {
  it('daily 2 a day over 30 days = 60', () => {
    expect(targetDoses(asg(null, meal(1, 1)), TODAY, 30)).toBe(60);
  });
  it('Wednesday only from a Wednesday: day 0, 7, 14, 21, 28 = 5', () => {
    expect(targetDoses(asg(null, meal(1, 0, { kind: 'weekdays', days: [3] })), TODAY, 30)).toBe(5);
  });
  it('a stop in the window removes the paused days; a stopped medicine needs 0', () => {
    expect(targetDoses(asg(null, meal(1, 0, { kind: 'weekdays', days: [3] })), TODAY, 30, [ev('stop', addDays(TODAY, 10))])).toBe(2);
    expect(targetDoses(asg(null, meal(1), { status: 'stopped' }), TODAY, 30)).toBe(0);
  });
});

describe('houseStatus', () => {
  it('untracked / out / low / ok', () => {
    expect(houseStatus({ id: 'h', name: 'ยาสามัญตัวอย่าง' })).toBe('untracked');
    expect(houseStatus({ id: 'h', name: 'ยาสามัญตัวอย่าง', stock: { qty: 0, unit: 'แผง' }, lowAt: 1 })).toBe('out');
    expect(houseStatus({ id: 'h', name: 'ยาสามัญตัวอย่าง', stock: { qty: 1, unit: 'แผง' }, lowAt: 1 })).toBe('low');
    expect(houseStatus({ id: 'h', name: 'ยาสามัญตัวอย่าง', stock: { qty: 2, unit: 'แผง' }, lowAt: 1 })).toBe('ok');
  });
});

// ---------- (d) refill and open a new tube ----------

describe('mergeExpiry', () => {
  it('nearer wins; one alone is used; none stays none', () => {
    expect(mergeExpiry('2027-06-30', '2027-01-15')).toBe('2027-01-15');
    expect(mergeExpiry('2027-01-15', '2027-06-30')).toBe('2027-01-15');
    expect(mergeExpiry(undefined, '2027-01-15')).toBe('2027-01-15');
    expect(mergeExpiry('2027-01-15', undefined)).toBe('2027-01-15');
    expect(mergeExpiry(undefined, undefined)).toBeUndefined();
  });
});

describe('refillStock', () => {
  it('adds on top of the quantity at the start of today and sets countedOn = today', () => {
    // volume: 45 ml counted yesterday, 3 ml a day -> 42 now, +100 -> 142.
    const s: Schedule = { kind: 'interval', everyHours: 8, firstTime: '08:00', pills: 1, course: { kind: 'ongoing' } };
    const a = asg({ kind: 'volume', ml: 45, countedOn: addDays(TODAY, -1) }, s);
    const r = refillStock(a, liquid, [], TODAY, { kind: 'volume', ml: 100 });
    expect(r.ok && r.assignment.stock).toEqual({ kind: 'volume', ml: 142, countedOn: TODAY });
  });

  it('returns a new assignment, the old one is unchanged, and no event is made', () => {
    const a = asg(count(1, 0), meal(1), { expiry: '2027-06-30' });
    const before = structuredClone(a);
    const events: MedEvent[] = [];
    const r = refillStock(a, med(), events, TODAY, { kind: 'count', strips: 1, loose: 0 }, '2027-01-15');
    expect(a).toEqual(before);
    expect(events).toEqual([]);
    expect(r.ok && r.assignment).not.toBe(a);
  });

  it('never counted (stock = null): counting starts from the amount added', () => {
    const r = refillStock(asg(null, meal(1)), med(), [], TODAY, { kind: 'count', strips: 2, loose: 3 });
    expect(r.ok && r.assignment.stock).toEqual({ kind: 'count', strips: 2, loose: 3, countedOn: TODAY });
    const v = refillStock(asg(null, meal(1)), liquid, [], TODAY, { kind: 'volume', ml: 60 });
    expect(v.ok && v.assignment.stock).toEqual({ kind: 'volume', ml: 60, countedOn: TODAY });
  });

  it('expiry: the nearer of old and new', () => {
    const old = asg(count(1, 0), meal(1), { expiry: '2027-06-30' });
    const add = { kind: 'count', strips: 1, loose: 0 } as const;
    const nearerNew = refillStock(old, med(), [], TODAY, add, '2027-01-15');
    const nearerOld = refillStock(old, med(), [], TODAY, add, '2028-01-15');
    expect(nearerNew.ok && nearerNew.assignment.expiry).toBe('2027-01-15');
    expect(nearerOld.ok && nearerOld.assignment.expiry).toBe('2027-06-30');
  });

  it('old had no expiry: the new one is used; new has none: the old one stays; neither: none', () => {
    const add = { kind: 'count', strips: 1, loose: 0 } as const;
    const a = refillStock(asg(count(1, 0), meal(1)), med(), [], TODAY, add, '2027-01-15');
    const b = refillStock(asg(count(1, 0), meal(1), { expiry: '2027-06-30' }), med(), [], TODAY, add);
    const c = refillStock(asg(count(1, 0), meal(1)), med(), [], TODAY, add);
    expect(a.ok && a.assignment.expiry).toBe('2027-01-15');
    expect(b.ok && b.assignment.expiry).toBe('2027-06-30');
    expect(c.ok && 'expiry' in c.assignment).toBe(false);
  });

  it('loose pieces roll over into strips, half pieces are kept', () => {
    // 1 strip of 10 + 9.5 loose = 19.5; + 1 loose = 20.5 -> 2 strips + 0.5 loose.
    const r = refillStock(asg(count(1, 9.5), meal(1)), med(), [], TODAY, { kind: 'count', strips: 0, loose: 1 });
    expect(r.ok && r.assignment.stock).toEqual({ kind: 'count', strips: 2, loose: 0.5, countedOn: TODAY });
  });

  it('sachet box: boxes and loose sachets', () => {
    // 1 box (10) + 8 loose = 18, + 1 box + 5 loose (15) = 33 -> 3 boxes + 3 loose.
    const r = refillStock(asg(count(1, 8), meal(1)), sachet, [], TODAY, { kind: 'count', strips: 1, loose: 5 });
    expect(r.ok && r.assignment.stock).toEqual({ kind: 'count', strips: 3, loose: 3, countedOn: TODAY });
  });

  it('a stopped medicine can be refilled; the stop event is respected', () => {
    // counted 24 Oct, 10 pills, 1 a day, stopped from 26 Oct: used 24, 25 = 2 -> 8; +5 = 13.
    const a = asg(count(0, 10, '2026-10-24'), meal(1), { status: 'stopped' });
    const r = refillStock(a, med(), [ev('stop', '2026-10-26')], TODAY, { kind: 'count', strips: 0, loose: 5 });
    expect(r.ok && r.assignment.stock).toEqual({ kind: 'count', strips: 1, loose: 3, countedOn: TODAY });
    expect(r.ok && r.assignment.status).toBe('stopped');
  });

  it('tubes: spare tubes are added, opened stays; never counted starts with opened = false', () => {
    const r = refillStock(asg({ kind: 'tubes', opened: true, spare: 1 }, meal(1)), cream, [], TODAY, { kind: 'tubes', spare: 2 });
    expect(r.ok && r.assignment.stock).toEqual({ kind: 'tubes', opened: true, spare: 3 });
    const n = refillStock(asg(null, meal(1)), cream, [], TODAY, { kind: 'tubes', spare: 2 });
    expect(n.ok && n.assignment.stock).toEqual({ kind: 'tubes', opened: false, spare: 2 });
  });

  it('the result passes the assignment schema', () => {
    const r = refillStock(asg(count(1, 3), meal(1)), med(), [], TODAY, { kind: 'count', strips: 1, loose: 5 }, '2027-01-15');
    expect(r.ok && assignmentSchema.safeParse(r.assignment).success).toBe(true);
  });

  it('errors (readable text, nothing changed): wrong kind, zero, strips on a pack of none, bad data', () => {
    const a = asg(count(1, 0), meal(1));
    const bad = [
      refillStock(a, med(), [], TODAY, { kind: 'volume', ml: 10 }), // count stock, volume added
      refillStock(a, med(), [], TODAY, { kind: 'count', strips: 0, loose: 0 }), // nothing added
      refillStock(a, med(), [], TODAY, { kind: 'count', strips: -1, loose: 0 }),
      refillStock(a, med(), [], TODAY, { kind: 'count', strips: 0, loose: 0.3 }),
      refillStock(asg(count(0, 5), meal(1)), noPack, [], TODAY, { kind: 'count', strips: 1, loose: 0 }), // pack none + strips
      refillStock(asg(count(2, 0), meal(1)), noPack, [], TODAY, { kind: 'count', strips: 0, loose: 1 }), // existing data already wrong
      refillStock(asg(null, meal(1)), cream, [], TODAY, { kind: 'count', strips: 0, loose: 1 }), // cream cannot hold a count
    ];
    for (const r of bad) {
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.length).toBeGreaterThan(0);
    }
  });

  it('pack none with loose pieces only works', () => {
    const r = refillStock(asg(count(0, 5), meal(1)), noPack, [], TODAY, { kind: 'count', strips: 0, loose: 4 });
    expect(r.ok && r.assignment.stock).toEqual({ kind: 'count', strips: 0, loose: 9, countedOn: TODAY });
  });
});

describe('openNewTube', () => {
  it('spare - 1 and opened = true', () => {
    const r = openNewTube(asg({ kind: 'tubes', opened: false, spare: 2 }, meal(1)));
    expect(r.ok && r.assignment.stock).toEqual({ kind: 'tubes', opened: true, spare: 1 });
  });

  it('spare 0 is a readable error, never a negative number; the assignment is unchanged', () => {
    const a = asg({ kind: 'tubes', opened: true, spare: 0 }, meal(1));
    const r = openNewTube(a);
    expect(r).toEqual({ ok: false, error: 'ไม่มีหลอดสำรองให้เปิด' });
    expect(a.stock).toEqual({ kind: 'tubes', opened: true, spare: 0 });
  });

  it('a medicine that is not counted by the tube cannot open a tube', () => {
    expect(openNewTube(asg(count(1, 0), meal(1))).ok).toBe(false);
    expect(openNewTube(asg(null, meal(1))).ok).toBe(false);
  });
});
