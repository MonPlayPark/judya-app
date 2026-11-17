import { describe, expect, it } from 'vitest';
import { addDays } from '../calc';
import { DEMO_TODAY } from './homeDemo';
import { medsDemoRoot } from './medsListDemo';
import {
  applyDoseChange,
  buildDoseSchedule,
  canStep,
  canTurnOff,
  doseAvailability,
  draftFromSchedule,
  isChanged,
  mealStatus,
  mealSub,
  selectedDays,
  setSpoon,
  setTiming,
  stepMeal,
  summarize,
  toggleDay,
  toggleMeal,
  useAltDays,
  type DoseDraft,
} from './doseChange';
import { rootSchema, type Assignment, type Medication, type Root, type Schedule } from './schema';
import { stockNow, stockUnits } from './stock';

const TODAY = DEMO_TODAY; // 2026-10-28, a Wednesday
const NOW = `${TODAY}T10:00:00+07:00`;
const ids = (): (() => string) => {
  let n = 0;
  return () => `new${(n += 1)}`;
};

const base = (): Root => medsDemoRoot('normal');
const asg = (r: Root, id: string): Assignment => {
  const a = r.assignments.find((x) => x.id === id);
  if (!a) throw new Error(`no ${id}`);
  return a;
};
const med = (r: Root, id: string): Medication => {
  const m = r.medications.find((x) => x.id === asg(r, id).medicationId);
  if (!m) throw new Error('no med');
  return m;
};
const draftOf = (r: Root, id: string): DoseDraft => {
  const d = draftFromSchedule(med(r, id).kind, asg(r, id).schedule);
  if (!d) throw new Error('no draft');
  return d;
};
/** One whole unit more in the morning: two presses of + (tablet 1 -> 2, liquid 5 -> 10 ml). */
const raise = (d: DoseDraft): DoseDraft => stepMeal(stepMeal(d, 'morning', 1), 'morning', 1);
const must = (res: ReturnType<typeof applyDoseChange>): Root => {
  if (!res.ok) throw new Error(res.error);
  return res.root;
};
const put = (r: Root, id: string, patch: Partial<Assignment>): Root => ({ ...r, assignments: r.assignments.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

/** A liquid syrup (240 ml, morning + evening 5 ml) for dad, as asg "x1". */
const withLiquid = (r: Root): Root => ({
  ...r,
  medications: [...r.medications, { id: 'mx', name: 'Ambroxol', kind: 'liquid', strength: { value: 15, unit: 'mg/5 ml' }, pack: { type: 'container', amount: 120, unit: 'ml' } }],
  assignments: [
    ...r.assignments,
    {
      id: 'x1', medicationId: 'mx', personId: 'p1', status: 'active', createdAt: NOW,
      schedule: { kind: 'meal', slots: { morning: { pills: 5, meal: 'after' }, evening: { pills: 5, meal: 'after' } }, days: { kind: 'daily' } },
      stock: { kind: 'volume', ml: 240, countedOn: TODAY },
    },
  ],
});

describe('draftFromSchedule', () => {
  it('reads meals, doses, timing and days from the saved schedule', () => {
    const d = draftOf(base(), 'a4');
    expect(d.meals.morning).toEqual({ on: true, amount: 1, timing: 'after' });
    expect(d.meals.evening).toEqual({ on: true, amount: 1, timing: 'after' });
    expect(d.meals.noon.on).toBe(false);
    expect(d.meals.bedtime.on).toBe(false);
    expect(d.days).toEqual({ kind: 'daily' });
  });

  it('keeps "with meal" timing and chosen days; keeps the anchor of every-other-day', () => {
    const s: Schedule = { kind: 'meal', slots: { noon: { pills: 2, meal: 'with' } }, days: { kind: 'alt', anchor: '2026-10-01' } };
    const d = draftFromSchedule('tablet', s);
    expect(d?.meals.noon).toEqual({ on: true, amount: 2, timing: 'with' });
    expect(d?.days).toEqual({ kind: 'alt', anchor: '2026-10-01' });
  });

  it('an interval schedule has no draft (this page cannot change it yet)', () => {
    const s: Schedule = { kind: 'interval', everyHours: 8, firstTime: '08:00', pills: 1, course: { kind: 'ongoing' } };
    expect(draftFromSchedule('tablet', s)).toBeNull();
  });
});

describe('meal tiles', () => {
  it('turning a meal ON gives 1 unit (liquid 5 ml) and "after meal"', () => {
    const t = toggleMeal(draftOf(base(), 'a4'), 'noon');
    expect(t.meals.noon).toEqual({ on: true, amount: 1, timing: 'after' });
    const l = draftOf(withLiquid(base()), 'x1');
    expect(toggleMeal(l, 'noon').meals.noon.amount).toBe(5);
  });

  it('the last meal that is ON cannot be turned off', () => {
    const one = toggleMeal(draftOf(base(), 'a4'), 'evening'); // morning only
    expect(canTurnOff(one, 'morning')).toBe(false);
    expect(toggleMeal(one, 'morning')).toEqual(one);
    expect(canTurnOff(draftOf(base(), 'a4'), 'evening')).toBe(true);
  });
});

describe('stepper', () => {
  it('tablet: step 0.5, min 0.5, max 4 (the limit of the data)', () => {
    let d = draftOf(base(), 'a4');
    d = stepMeal(d, 'morning', -1);
    expect(d.meals.morning.amount).toBe(0.5);
    expect(canStep(d, 'morning', -1)).toBe(false);
    expect(stepMeal(d, 'morning', -1).meals.morning.amount).toBe(0.5);
    for (let i = 0; i < 20; i += 1) d = stepMeal(d, 'morning', 1);
    expect(d.meals.morning.amount).toBe(4);
    expect(canStep(d, 'morning', 1)).toBe(false);
  });

  it('liquid: step 2.5 ml, min 2.5; spoon pills set 5 or 15', () => {
    let d = draftOf(withLiquid(base()), 'x1');
    d = stepMeal(d, 'morning', 1);
    expect(d.meals.morning.amount).toBe(7.5);
    d = stepMeal(stepMeal(stepMeal(d, 'morning', -1), 'morning', -1), 'morning', -1);
    expect(d.meals.morning.amount).toBe(2.5);
    expect(canStep(d, 'morning', -1)).toBe(false);
    expect(setSpoon(d, 'morning', 15).meals.morning.amount).toBe(15);
  });

  it('cream: no stepper, the dose does not move', () => {
    const r = medsDemoRoot('cream');
    const d = draftOf(r, 'a9');
    expect(stepMeal(d, 'morning', 1)).toEqual(d);
    expect(canStep(d, 'morning', 1)).toBe(false);
  });
});

describe('days (shared by every meal)', () => {
  it('all 7 days = daily; one off = chosen days; the last day cannot be taken off', () => {
    let d = draftOf(base(), 'a4');
    d = toggleDay(d, 1); // Monday off
    expect(d.days).toEqual({ kind: 'weekdays', days: [0, 2, 3, 4, 5, 6] });
    d = toggleDay(d, 1);
    expect(d.days).toEqual({ kind: 'daily' });
    let one = d;
    for (const day of [0, 1, 2, 3, 4, 5]) one = toggleDay(one, day);
    expect(one.days).toEqual({ kind: 'weekdays', days: [6] });
    expect(toggleDay(one, 6)).toEqual(one);
  });

  it('every-other-day: choosing a day chip switches to chosen days with only that day', () => {
    const alt = { ...draftOf(base(), 'a4'), days: { kind: 'alt', anchor: '2026-10-01' } } as DoseDraft;
    expect(selectedDays(alt.days)).toEqual([]);
    expect(toggleDay(alt, 3).days).toEqual({ kind: 'weekdays', days: [3] });
    const back = useAltDays(toggleDay(alt, 3), '2026-10-01');
    expect(back.days).toEqual({ kind: 'alt', anchor: '2026-10-01' });
  });
});

describe('isChanged and meal chips', () => {
  it('a fresh draft is not changed; stepping up and back is not changed', () => {
    const o = draftOf(base(), 'a4');
    expect(isChanged(o, o)).toBe(false);
    expect(isChanged(o, stepMeal(stepMeal(o, 'morning', 1), 'morning', -1))).toBe(false);
  });

  it('dose, timing, a meal on / off and days all count', () => {
    const o = draftOf(base(), 'a4');
    expect(isChanged(o, stepMeal(o, 'morning', 1))).toBe(true);
    expect(isChanged(o, setTiming(o, 'evening', 'before'))).toBe(true);
    expect(isChanged(o, toggleMeal(o, 'noon'))).toBe(true);
    expect(isChanged(o, toggleMeal(o, 'evening'))).toBe(true);
    expect(isChanged(o, toggleDay(o, 2))).toBe(true);
  });

  it('chips: new meal, changed meal, untouched meal, and all kept meals when the days change', () => {
    const o = draftOf(base(), 'a4');
    const d = toggleMeal(stepMeal(o, 'morning', 1), 'noon');
    expect(mealStatus(o, d, 'morning')).toBe('changed');
    expect(mealStatus(o, d, 'noon')).toBe('new');
    expect(mealStatus(o, d, 'evening')).toBe('same');
    expect(mealStatus(o, d, 'bedtime')).toBe('off');
    expect(mealStatus(o, toggleDay(o, 1), 'evening')).toBe('changed');
  });

  it('cream: timing is not shown and not compared', () => {
    const r = medsDemoRoot('cream');
    const o = draftOf(r, 'a9');
    expect(isChanged(o, setTiming(o, 'morning', 'before'))).toBe(false);
    expect(mealSub('cream', o, 'morning')).toBe('ทุกวัน');
  });
});

describe('row sub-line', () => {
  it('"timing · days"; bedtime has no timing; chosen days in Monday-first order', () => {
    let d = draftOf(base(), 'a4');
    expect(mealSub('tablet', d, 'morning')).toBe('หลังอาหาร · ทุกวัน');
    d = setTiming(d, 'morning', 'with');
    expect(mealSub('tablet', d, 'morning')).toBe('พร้อมอาหาร · ทุกวัน');
    d = toggleMeal(d, 'bedtime');
    expect(mealSub('tablet', d, 'bedtime')).toBe('ทุกวัน');
    for (const day of [0, 2, 4, 6]) d = toggleDay(d, day);
    expect(mealSub('tablet', d, 'morning')).toBe('พร้อมอาหาร · จ พ ศ');
  });
});

describe('buildDoseSchedule', () => {
  it('writes slots, bedtime without a meal, and passes the root check', () => {
    const r = base();
    let d = draftOf(r, 'a4');
    d = toggleMeal(setTiming(raise(d), 'morning', 'before'), 'bedtime');
    const s = buildDoseSchedule(d);
    expect(s).toEqual({
      kind: 'meal',
      slots: { morning: { pills: 2, meal: 'before' }, evening: { pills: 1, meal: 'after' }, bedtime: { pills: 1 } },
      days: { kind: 'daily' },
    });
    expect(rootSchema.safeParse(put(r, 'a4', { schedule: s })).success).toBe(true);
  });

  it('keeps the saved stand-in dose and timing of a cream; a new cream meal gets 1 and after', () => {
    const r = medsDemoRoot('cream');
    const s = buildDoseSchedule(toggleMeal(draftOf(r, 'a9'), 'evening'));
    expect(s).toMatchObject({ slots: { morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } } });
  });
});

describe('doseAvailability', () => {
  it('active meal schedule = ok; interval = interval; stopped = stopped; unknown = missing', () => {
    const r = base();
    expect(doseAvailability(r, 'a4')).toBe('ok');
    expect(doseAvailability(r, 'a7')).toBe('stopped');
    expect(doseAvailability(r, 'nope')).toBe('missing');
    const iv = put(r, 'a4', { schedule: { kind: 'interval', everyHours: 8, firstTime: '08:00', pills: 1, course: { kind: 'ongoing' } } });
    expect(doseAvailability(iv, 'a4')).toBe('interval');
  });
});

describe('summarize (texts of dose.md section 3)', () => {
  const sum = (r: Root, id: string, edit: (d: DoseDraft) => DoseDraft) => {
    const o = draftOf(r, id);
    const s = summarize(r, id, o, edit(o), TODAY);
    if (!s) throw new Error('no summary');
    return s;
  };

  it('edited: morning 1 -> 2, stock 53, 26 days -> 17 days, enough', () => {
    const s = sum(base(), 'a4', (d) => raise(d));
    expect(s.oldLine).toBe('เช้า 1 เม็ด · เย็น 1 เม็ด (รวม 2 เม็ด/วัน)');
    expect(s.newLine).toBe('เช้า 2 เม็ด · เย็น 1 เม็ด (รวม 3 เม็ด/วัน)');
    expect(s.stockLine).toBe('ยาคงเหลือ 53 เม็ด');
    expect(s.leftLine).toBe('พอใช้ประมาณ 26 วัน → 17 วัน');
    expect(s.chip).toEqual({ tone: 'ok', label: 'เพียงพอ' });
    expect(s.effectiveLine).toBe('มีผลตั้งแต่วันนี้ 28 ต.ค. 2569');
  });

  it('new meal: noon added', () => {
    const s = sum(base(), 'a4', (d) => toggleMeal(d, 'noon'));
    expect(s.newLine).toBe('เช้า 1 เม็ด · กลางวัน 1 เม็ด · เย็น 1 เม็ด (รวม 3 เม็ด/วัน)');
    expect(s.leftLine).toBe('พอใช้ประมาณ 26 วัน → 17 วัน');
  });

  it('removed meal: "เย็น: ตัดออก", 26 days -> 53 days', () => {
    const s = sum(base(), 'a4', (d) => toggleMeal(d, 'evening'));
    expect(s.newLine).toBe('เช้า 1 เม็ด · เย็น: ตัดออก (รวม 1 เม็ด/วัน)');
    expect(s.leftLine).toBe('พอใช้ประมาณ 26 วัน → 53 วัน');
  });

  it('low: stock 40, 20 days -> 13 days, yellow "ใกล้หมด" (the setting lowStockDays = 14)', () => {
    const r = put(base(), 'a4', { stock: { kind: 'count', strips: 0, loose: 40, countedOn: TODAY } });
    const s = sum(r, 'a4', (d) => raise(d));
    expect(s.stockLine).toBe('ยาคงเหลือ 40 เม็ด');
    expect(s.leftLine).toBe('พอใช้ประมาณ 20 วัน → 13 วัน');
    expect(s.chip).toEqual({ tone: 'low', label: 'ใกล้หมด' });
  });

  it('low follows the setting lowStockDays', () => {
    const r = put(base(), 'a4', { stock: { kind: 'count', strips: 0, loose: 40, countedOn: TODAY } });
    const strict: Root = { ...r, settings: { ...r.settings, lowStockDays: 10 } };
    expect(sum(strict, 'a4', (d) => raise(d)).chip).toEqual({ tone: 'ok', label: 'เพียงพอ' });
  });

  it('empty stock: chip "หมด"', () => {
    const r = put(base(), 'a4', { stock: { kind: 'count', strips: 0, loose: 0, countedOn: TODAY } });
    expect(sum(r, 'a4', (d) => raise(d)).chip).toEqual({ tone: 'out', label: 'หมด' });
  });

  it('weeks: chosen days switch BOTH lines to weeks', () => {
    // old: daily 1 + 1 = 14 a week, 26 days = about 3 weeks. new: Mon Wed Fri, morning 2 + evening 1 = 9 a week, 53 pills last 40 days = 5 weeks
    const s = sum(base(), 'a4', (d) => toggleDay(toggleDay(toggleDay(toggleDay(raise(d), 0), 2), 4), 6));
    expect(s.oldLine).toBe('เช้า 1 เม็ด · เย็น 1 เม็ด (รวม 14 เม็ด/สัปดาห์)');
    expect(s.newLine).toBe('เช้า 2 เม็ด · เย็น 1 เม็ด · เฉพาะ จ พ ศ (รวม 9 เม็ด/สัปดาห์)');
    expect(s.leftLine).toBe('พอใช้ประมาณ 3 สัปดาห์ → 5 สัปดาห์');
    expect(s.chip).toEqual({ tone: 'ok', label: 'เพียงพอ' });
  });

  it('weeks: 14 days or less reads "ไม่ถึง 2 สัปดาห์"', () => {
    const r = put(base(), 'a4', { stock: { kind: 'count', strips: 0, loose: 20, countedOn: TODAY } });
    const s = sum(r, 'a4', (d) => toggleDay(d, 1)); // one weekday off
    expect(s.leftLine).toBe('พอใช้ ไม่ถึง 2 สัปดาห์ → ไม่ถึง 2 สัปดาห์');
  });

  it('liquid: 240 ml, 24 days -> 16 days', () => {
    const r = withLiquid(base());
    const s = sum(r, 'x1', (d) => raise(d));
    expect(s.oldLine).toBe('เช้า 5 มล. · เย็น 5 มล. (รวม 10 มล./วัน)');
    expect(s.newLine).toBe('เช้า 10 มล. · เย็น 5 มล. (รวม 15 มล./วัน)');
    expect(s.stockLine).toBe('ยาคงเหลือ 240 มล.');
    expect(s.leftLine).toBe('พอใช้ประมาณ 24 วัน → 16 วัน');
  });

  it('cream: names only, tubes, no days, no chip', () => {
    const r = medsDemoRoot('cream');
    const s = sum(r, 'a9', (d) => toggleMeal(toggleMeal(d, 'evening'), 'bedtime'));
    expect(s.oldLine).toBe('เช้า');
    expect(s.newLine).toBe('เช้า · เย็น · ก่อนนอน');
    expect(s.stockLine).toBe('ยาคงเหลือ สำรอง 2 หลอด');
    expect(s.leftLine).toBeNull();
    expect(s.chip).toBeNull();
    expect(s.note).toBe('ครีมไม่นับวันที่พอใช้');
  });

  it('4 meals: 120 pills, 30 days -> 24 days', () => {
    const r = put(base(), 'a4', {
      stock: { kind: 'count', strips: 0, loose: 120, countedOn: TODAY },
      schedule: { kind: 'meal', slots: { morning: { pills: 1, meal: 'after' }, noon: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' }, bedtime: { pills: 1 } }, days: { kind: 'daily' } },
    });
    const s = sum(r, 'a4', (d) => raise(d));
    expect(s.oldLine).toBe('เช้า 1 เม็ด · กลางวัน 1 เม็ด · เย็น 1 เม็ด · ก่อนนอน 1 เม็ด (รวม 4 เม็ด/วัน)');
    expect(s.newLine).toBe('เช้า 2 เม็ด · กลางวัน 1 เม็ด · เย็น 1 เม็ด · ก่อนนอน 1 เม็ด (รวม 5 เม็ด/วัน)');
    expect(s.leftLine).toBe('พอใช้ประมาณ 30 วัน → 24 วัน');
  });

  it('a medicine never counted: no stock line numbers, no days, no chip', () => {
    const r = put(base(), 'a4', { stock: null });
    const s = sum(r, 'a4', (d) => raise(d));
    expect(s.stockLine).toBe('ยังไม่ได้นับยา');
    expect(s.leftLine).toBeNull();
    expect(s.chip).toBeNull();
  });
});

describe('applyDoseChange', () => {
  const change = (r: Root, id: string, edit: (d: DoseDraft) => DoseDraft, reason: 'doctor' | 'self_or_other' = 'doctor', note = '') =>
    applyDoseChange(r, id, buildDoseSchedule(edit(draftOf(r, id))), reason, note, TODAY, NOW, ids());

  it('writes one adjust event (from / to, today, reason) and the new schedule; the old root is untouched', () => {
    const r = base();
    const before = JSON.stringify(r);
    const out = must(change(r, 'a4', (d) => raise(d)));
    expect(JSON.stringify(r)).toBe(before);
    expect(out.events.length).toBe(r.events.length + 1);
    const e = out.events.at(-1);
    expect(e).toMatchObject({ id: 'new1', assignmentId: 'a4', type: 'adjust', reason: 'doctor', effectiveOn: TODAY, at: NOW });
    expect(e?.type === 'adjust' && e.from.schedule).toEqual(asg(r, 'a4').schedule);
    expect(e?.type === 'adjust' && e.to.schedule).toEqual(asg(out, 'a4').schedule);
    expect(asg(out, 'a4').schedule).toMatchObject({ slots: { morning: { pills: 2 }, evening: { pills: 1 } } });
    expect(rootSchema.safeParse(out).success).toBe(true);
  });

  it('keeps a trimmed note (at most 200); no note key when empty; reason self_or_other', () => {
    const r = base();
    const a = must(change(r, 'a4', (d) => raise(d), 'self_or_other', '  หมอเพิ่มโดสเช้า  '));
    expect(a.events.at(-1)).toMatchObject({ reason: 'self_or_other', note: 'หมอเพิ่มโดสเช้า' });
    const b = must(change(r, 'a4', (d) => raise(d), 'doctor', '   '));
    expect(b.events.at(-1)).not.toHaveProperty('note');
    const tooLong = change(r, 'a4', (d) => raise(d), 'doctor', 'ก'.repeat(201));
    expect(tooLong.ok).toBe(false);
  });

  it('refuses: nothing changed, stopped, interval, unknown, a dose over the limit; nothing is written', () => {
    const r = base();
    expect(change(r, 'a4', (d) => d).ok).toBe(false);
    expect(change(r, 'a7', (d) => raise(d)).ok).toBe(false);
    expect(applyDoseChange(r, 'nope', buildDoseSchedule(draftOf(r, 'a4')), 'doctor', '', TODAY, NOW).ok).toBe(false);
    const iv = put(r, 'a4', { schedule: { kind: 'interval', everyHours: 8, firstTime: '08:00', pills: 1, course: { kind: 'ongoing' } } });
    expect(applyDoseChange(iv, 'a4', buildDoseSchedule(draftOf(r, 'a4')), 'doctor', '', TODAY, NOW).ok).toBe(false);
    const over: Schedule = { kind: 'meal', slots: { morning: { pills: 5, meal: 'after' } }, days: { kind: 'daily' } };
    expect(applyDoseChange(r, 'a4', over, 'doctor', '', TODAY, NOW).ok).toBe(false);
  });

  it('NEVER BACK-DATED: counted 10 days ago, dose raised today -> today unchanged, tomorrow uses the new dose', () => {
    const counted = addDays(TODAY, -10);
    const r = put(base(), 'a4', { stock: { kind: 'count', strips: 10, loose: 0, countedOn: counted } }); // 100 pills, box of 3 x 10, 2 a day
    const a0 = asg(r, 'a4');
    const m = med(r, 'a4');
    expect(stockNow(a0, m, TODAY, r.events)).toBe(80); // ten days at 2 a day have gone

    // what would happen if only the schedule were swapped: the ten days would be re-counted at 3 a day
    const naive = put(r, 'a4', { schedule: buildDoseSchedule(raise(draftOf(r, 'a4'))) });
    expect(stockNow(asg(naive, 'a4'), m, TODAY, naive.events)).toBe(70);

    const out = must(change(r, 'a4', (d) => raise(d)));
    const a1 = asg(out, 'a4');
    expect(stockNow(a1, m, TODAY, out.events)).toBe(80); // today: the same amount
    expect(stockNow(a1, m, addDays(TODAY, 1), out.events)).toBe(77); // tomorrow: one day at the NEW 3 a day
    expect(stockNow(a1, m, addDays(TODAY, 2), out.events)).toBe(74);
    expect(a1.stock).toMatchObject({ kind: 'count', countedOn: TODAY });
    const u = stockUnits(a1, m);
    expect(u.status === 'units' && u.qty).toBe(80);
  });

  it('never back-dated for a dose lowered, and for days / meals changed', () => {
    const counted = addDays(TODAY, -6);
    const r = put(base(), 'a4', { stock: { kind: 'count', strips: 0, loose: 60, countedOn: counted } }); // 60 - 6 x 2 = 48
    const m = med(r, 'a4');
    for (const edit of [(d: DoseDraft) => toggleMeal(d, 'evening'), (d: DoseDraft) => toggleDay(d, 1), (d: DoseDraft) => toggleMeal(d, 'bedtime')]) {
      const out = must(change(r, 'a4', edit));
      expect(stockNow(asg(out, 'a4'), m, TODAY, out.events)).toBe(48);
    }
  });

  it('days stopped in between (stop + resume) are still skipped by the recount', () => {
    const counted = addDays(TODAY, -10);
    let r = put(base(), 'a4', { stock: { kind: 'count', strips: 0, loose: 100, countedOn: counted } });
    r = {
      ...r,
      events: [
        ...r.events.filter((e) => e.assignmentId !== 'a4'),
        { id: 's', assignmentId: 'a4', type: 'stop', reason: 'หมอสั่ง', effectiveOn: addDays(TODAY, -8), at: `${addDays(TODAY, -8)}T09:00:00+07:00` },
        { id: 'u', assignmentId: 'a4', type: 'resume', effectiveOn: addDays(TODAY, -4), at: `${addDays(TODAY, -4)}T09:00:00+07:00` },
      ],
    };
    const m = med(r, 'a4');
    const before = stockNow(asg(r, 'a4'), m, TODAY, r.events); // 4 paused days: 100 - 6 x 2 = 88
    expect(before).toBe(88);
    const out = must(change(r, 'a4', (d) => raise(d)));
    expect(stockNow(asg(out, 'a4'), m, TODAY, out.events)).toBe(88);
  });

  it('a count that was already made today is not rewritten; strips and loose stay as they were', () => {
    const r = base(); // a4: 5 strips + 3 loose, counted today
    const out = must(change(r, 'a4', (d) => raise(d)));
    expect(asg(out, 'a4').stock).toEqual(asg(r, 'a4').stock);
  });

  it('liquid: volume stock is recounted; cream (tubes) and never-counted stock are left alone', () => {
    const r0 = withLiquid(base());
    const r = put(r0, 'x1', { stock: { kind: 'volume', ml: 240, countedOn: addDays(TODAY, -4) } }); // 240 - 4 x 10 = 200
    const out = must(change(r, 'x1', (d) => raise(d)));
    expect(asg(out, 'x1').stock).toEqual({ kind: 'volume', ml: 200, countedOn: TODAY });
    expect(rootSchema.safeParse(out).success).toBe(true);

    const cr = medsDemoRoot('cream');
    const co = must(change(cr, 'a9', (d) => toggleMeal(d, 'evening')));
    expect(asg(co, 'a9').stock).toEqual(asg(cr, 'a9').stock);

    const none = put(base(), 'a4', { stock: null });
    expect(asg(must(change(none, 'a4', (d) => raise(d))), 'a4').stock).toBeNull();
  });

  it('a medicine with no pack size keeps the recount as loose pieces', () => {
    const r = put(base(), 'a3', { stock: { kind: 'count', strips: 0, loose: 38, countedOn: addDays(TODAY, -3) } }); // morning 1 a day: 35
    const out = must(change(r, 'a3', (d) => raise(d)));
    expect(asg(out, 'a3').stock).toEqual({ kind: 'count', strips: 0, loose: 35, countedOn: TODAY });
  });

  it('other assignments, events and the rest of the root are untouched', () => {
    const r = base();
    const out = must(change(r, 'a4', (d) => raise(d)));
    expect(out.assignments.filter((a) => a.id !== 'a4')).toEqual(r.assignments.filter((a) => a.id !== 'a4'));
    expect(out.events.slice(0, r.events.length)).toEqual(r.events);
    expect({ ...out, assignments: [], events: [] }).toEqual({ ...r, assignments: [], events: [] });
  });
});
