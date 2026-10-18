import { describe, expect, it } from 'vitest';
import {
  defaultForm,
  describeSchedule,
  formProblem,
  formToSchedule,
  intervalPreview,
  sameSchedule,
  scheduleToForm,
  summaryLines,
  type ScheduleForm,
} from './scheduleForm';
import { dailyMeal } from './helpers.test-util';
import { scheduleSchema, type Schedule } from './schema';

const TODAY = '2026-10-18'; // a Sunday

const mealForm = (over: Partial<ScheduleForm> = {}): ScheduleForm => ({ ...defaultForm(), ...over });

describe('form -> schedule', () => {
  it('morning after meal, 1 pill, every day (the starting form)', () => {
    expect(formToSchedule(defaultForm(), TODAY)).toEqual({
      kind: 'meal',
      slots: { morning: { pills: 1, meal: 'after' } },
      days: { kind: 'daily' },
    });
  });

  it('several slots: bedtime has no meal timing, pills 0.5..4 are kept', () => {
    const f = mealForm({
      slots: { morning: true, noon: false, evening: true, bedtime: true },
      meal: { morning: 'before', noon: 'after', evening: 'with' },
      pills: { morning: 0.5, noon: 1, evening: 2, bedtime: 4 },
    });
    expect(formToSchedule(f, TODAY)).toEqual({
      kind: 'meal',
      slots: { morning: { pills: 0.5, meal: 'before' }, evening: { pills: 2, meal: 'with' }, bedtime: { pills: 4 } },
      days: { kind: 'daily' },
    });
  });

  it('every other day counts from today', () => {
    const s = formToSchedule(mealForm({ freq: 'alt' }), TODAY);
    expect(s).toMatchObject({ kind: 'meal', days: { kind: 'alt', anchor: TODAY } });
  });

  it('example 5: picking จ. พ. ศ. (Monday = 0) stores [1, 3, 5] (Sunday = 0) and shows จ. พ. ศ. again', () => {
    const s = formToSchedule(mealForm({ freq: 'days', days: [4, 0, 2] }), TODAY) as Schedule;
    expect(s).toMatchObject({ days: { kind: 'weekdays', days: [1, 3, 5] } });
    const back = scheduleToForm(s);
    expect(back.freq).toBe('days');
    expect(back.days).toEqual([0, 2, 4]);
    expect(describeSchedule(s, 'เม็ด')).toBe('เช้า 1 เม็ด · จ. พ. ศ.');
  });

  it('Sunday is the last day on the screen (canvas 6) and 0 in the model', () => {
    const s = formToSchedule(mealForm({ freq: 'days', days: [6, 3] }), TODAY) as Schedule;
    expect(s).toMatchObject({ days: { kind: 'weekdays', days: [0, 4] } });
    expect(scheduleToForm(s).days).toEqual([3, 6]);
    expect(describeSchedule(s, 'เม็ด')).toBe('เช้า 1 เม็ด · พฤ. อา.');
  });

  it('every X hours: first time, pills, course of days starting today, or ongoing', () => {
    const f = mealForm({ mode: 'interval', every: 8, first: '06:30', ipills: 1.5, course: 'days', courseDays: 7 });
    expect(formToSchedule(f, TODAY)).toEqual({
      kind: 'interval',
      everyHours: 8,
      firstTime: '06:30',
      pills: 1.5,
      course: { kind: 'days', days: 7, startDate: TODAY },
    });
    expect(formToSchedule({ ...f, course: 'ongoing' }, TODAY)).toMatchObject({ course: { kind: 'ongoing' } });
  });

  it('every result passes the data schema', () => {
    for (const f of [
      defaultForm(),
      mealForm({ freq: 'alt', slots: { morning: true, noon: true, evening: true, bedtime: true } }),
      mealForm({ freq: 'days', days: [0, 1, 2, 3, 4, 5, 6] }),
      mealForm({ mode: 'interval', every: 24, courseDays: 90 }),
    ]) {
      expect(scheduleSchema.safeParse(formToSchedule(f, TODAY)).success).toBe(true);
    }
  });
});

describe('what is missing', () => {
  it('no slot, no day, bad time: no schedule and a text that says what to do', () => {
    const none = mealForm({ slots: { morning: false, noon: false, evening: false, bedtime: false } });
    expect(formProblem(none)).toBe('เลือกช่วงเวลาที่ทานอย่างน้อย 1 ช่วง');
    expect(formToSchedule(none, TODAY)).toBeNull();
    expect(summaryLines(none, 'เม็ด')).toEqual([]);

    const noDay = mealForm({ freq: 'days', days: [] });
    expect(formProblem(noDay)).toBe('เลือกวันอย่างน้อย 1 วัน');
    expect(formToSchedule(noDay, TODAY)).toBeNull();

    const noTime = mealForm({ mode: 'interval', first: '' });
    expect(formProblem(noTime)).toBe('ใส่เวลาที่ทานครั้งแรกก่อน');
    expect(intervalPreview(noTime)).toBeNull();
    expect(formProblem(mealForm({ mode: 'interval', first: '25:00' }))).not.toBeNull();
  });

  it('a complete form has no problem', () => {
    expect(formProblem(defaultForm())).toBeNull();
    expect(formProblem(mealForm({ mode: 'interval' }))).toBeNull();
  });
});

describe('texts', () => {
  const evening: Schedule = dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } });

  it('row summary and the full text', () => {
    expect(describeSchedule(evening, 'เม็ด')).toBe('เช้า 1 เม็ด · เย็น 1 เม็ด');
    expect(describeSchedule(evening, 'เม็ด', true)).toBe('เช้า หลังอาหาร 1 เม็ด · เย็น หลังอาหาร 1 เม็ด');
    expect(describeSchedule(dailyMeal({ bedtime: { pills: 0.5 } }), 'ซอง')).toBe('ก่อนนอน ½ ซอง');
  });

  it('every X hours', () => {
    const s = formToSchedule(mealForm({ mode: 'interval' }), TODAY) as Schedule;
    expect(describeSchedule(s, 'เม็ด')).toBe('ทุก 12 ชม. · 1 เม็ด');
    expect(describeSchedule(s, 'เม็ด', true)).toBe('ทุก 12 ชม. · 1 เม็ด · เริ่ม 08:00 · 5 วัน');
    expect(describeSchedule({ ...s, course: { kind: 'ongoing' } } as Schedule, 'เม็ด', true)).toBe(
      'ทุก 12 ชม. · 1 เม็ด · เริ่ม 08:00 · ทานต่อเนื่อง',
    );
  });

  it('every other day in the row text', () => {
    const s = formToSchedule(mealForm({ freq: 'alt' }), TODAY) as Schedule;
    expect(describeSchedule(s, 'เม็ด')).toBe('เช้า 1 เม็ด · วันเว้นวัน');
  });

  it('summary lines follow the canvas (slot · meal · amount) and add the frequency', () => {
    const f = mealForm({ slots: { morning: true, noon: false, evening: false, bedtime: true } });
    expect(summaryLines(f, 'เม็ด')).toEqual(['เช้า · หลังอาหาร · 1 เม็ด', 'ก่อนนอน · 1 เม็ด', 'ความถี่: ทุกวัน']);
    expect(summaryLines(mealForm({ freq: 'days', days: [0, 2, 4] }), 'เม็ด').at(-1)).toBe('ความถี่: จ. พ. ศ.');
    expect(summaryLines(mealForm({ freq: 'alt' }), 'เม็ด').at(-1)).toBe('ความถี่: วันเว้นวัน (เริ่มวันนี้)');
  });

  it('interval summary: 12 hours for 5 days = 10 doses; ongoing has no end', () => {
    const f = mealForm({ mode: 'interval' });
    expect(summaryLines(f, 'เม็ด')).toEqual(['ทุก 12 ชั่วโมง · 1 เม็ด · เริ่ม 08:00', 'ทาน 5 วัน (รวม 10 ครั้ง)']);
    expect(summaryLines({ ...f, course: 'ongoing' }, 'เม็ด')[1]).toBe('ทานต่อเนื่อง ไม่กำหนดวันสิ้นสุด');
    expect(summaryLines({ ...f, every: 6, courseDays: 3 }, 'เม็ด')[1]).toBe('ทาน 3 วัน (รวม 12 ครั้ง)');
  });

  it('times of the day wrap past midnight and start from the first time', () => {
    expect(intervalPreview(mealForm({ mode: 'interval', every: 12, first: '08:00' }))).toBe('08:00 · 20:00');
    expect(intervalPreview(mealForm({ mode: 'interval', every: 8, first: '22:00' }))).toBe('06:00 · 14:00 · 22:00');
    expect(intervalPreview(mealForm({ mode: 'interval', every: 24, first: '09:15' }))).toBe('09:15');
  });
});

describe('editing an existing schedule', () => {
  it('schedule -> form -> schedule gives the same schedule back', () => {
    const originals: Schedule[] = [
      dailyMeal({ morning: { pills: 1, meal: 'before' }, noon: { pills: 2, meal: 'with' }, bedtime: { pills: 0.5 } }),
      { kind: 'meal', slots: { evening: { pills: 1, meal: 'after' } }, days: { kind: 'weekdays', days: [0, 3, 6] } },
      { kind: 'interval', everyHours: 6, firstTime: '07:00', pills: 2, course: { kind: 'ongoing' } },
    ];
    for (const s of originals) {
      expect(sameSchedule(formToSchedule(scheduleToForm(s), TODAY, s) as Schedule, s)).toBe(true);
    }
  });

  it('dates of a running medicine do not move when nothing changed; they restart when something changed', () => {
    const alt: Schedule = { kind: 'meal', slots: { morning: { pills: 1, meal: 'after' } }, days: { kind: 'alt', anchor: '2026-10-10' } };
    expect(formToSchedule(scheduleToForm(alt), TODAY, alt)).toBe(alt);
    const changed = formToSchedule({ ...scheduleToForm(alt), pills: { ...defaultForm().pills, morning: 2 } }, TODAY, alt);
    expect(changed).toMatchObject({ days: { kind: 'alt', anchor: TODAY } });

    const course: Schedule = {
      kind: 'interval', everyHours: 12, firstTime: '08:00', pills: 1,
      course: { kind: 'days', days: 5, startDate: '2026-10-16' },
    };
    expect(formToSchedule(scheduleToForm(course), TODAY, course)).toBe(course);
    expect(formToSchedule({ ...scheduleToForm(course), every: 8 }, TODAY, course)).toMatchObject({
      everyHours: 8,
      course: { startDate: TODAY },
    });
  });

  it('switching the kind keeps the other kind\'s settings in the form', () => {
    const f = { ...defaultForm(), pills: { ...defaultForm().pills, morning: 3 } };
    const toInterval = { ...f, mode: 'interval' as const };
    const back = { ...toInterval, mode: 'meal' as const };
    expect(formToSchedule(back, TODAY)).toMatchObject({ slots: { morning: { pills: 3 } } });
  });
});
