import { describe, expect, it } from 'vitest';
import { blankRootV3, sampleRootV3 } from './fixtures';
import {
  buildHome, careItems, defaultMember, doseKey, formatAmount, headline, homeState, intervalTimes, medicineLabel, memberChips,
  periodOfTime, thaiDateLabel, todayRows, toggleDose, warnings, bangkokToday,
} from './home';
import { DEMO_NAMES, DEMO_TODAY, demoRoot } from './homeDemo';
import { rootSchema, type Root, type Schedule } from './schema';

const T = DEMO_TODAY; // Wednesday 2026-10-28
const daily = (slots: Extract<Schedule, { kind: 'meal' }>['slots']): Schedule => ({ kind: 'meal', slots, days: { kind: 'daily' } });

/** normal demo house with one assignment's schedule replaced. */
function withSchedule(id: string, schedule: Schedule): Root {
  const r = demoRoot('normal');
  return { ...r, assignments: r.assignments.map((a) => (a.id === id ? { ...a, schedule } : a)) };
}

describe('demo houses', () => {
  it.each(DEMO_NAMES)('%s is valid v3 data', (name) => {
    expect(rootSchema.safeParse(demoRoot(name)).success).toBe(true);
  });
  it('gives the six states', () => {
    expect(homeState(demoRoot('empty0'))).toBe('S0');
    expect(homeState(demoRoot('empty1'))).toBe('S1');
    expect(homeState(demoRoot('normal'))).toBe('ready');
    expect(buildHome(demoRoot('normal'), T).warning).toBeNull();
    expect(buildHome(demoRoot('alert'), T).warning?.text).toBe('ยาหมดอายุแล้ว 1 รายการ');
    expect(buildHome(demoRoot('alert'), T).extraWarnings).toBe(3);
    expect(buildHome(demoRoot('notoday'), T).headline.text).toBe('วันนี้ไม่มียาที่ต้องจัด');
    expect(buildHome(demoRoot('backup'), T).warning).toEqual({ kind: 'backup', text: 'ยังไม่ได้สำรองข้อมูล' });
  });
});

describe('todayRows', () => {
  it('groups by period then meal and writes amount, period and meal word', () => {
    const rows = todayRows(demoRoot('normal'), T);
    const p2 = rows.filter((r) => r.personId === 'p2');
    expect(p2.map((r) => [r.periodLabel, r.amountText, r.extra])).toEqual([
      ['เช้า', '1 แคปซูล', 'หลังอาหาร'],
      ['กลางวัน', '1 ซอง', 'ก่อนอาหาร'],
      ['ก่อนนอน', '1 ซอง', null],
    ]);
  });
  it('covers all 4 periods and before / with / after in order', () => {
    const s = daily({ morning: { pills: 1, meal: 'after' }, noon: { pills: 1, meal: 'with' }, evening: { pills: 0.5, meal: 'before' }, bedtime: { pills: 1 } });
    const rows = todayRows(withSchedule('a2', s), T).filter((r) => r.assignmentId === 'a2');
    expect(rows.map((r) => r.period)).toEqual(['morning', 'noon', 'evening', 'bedtime']);
    expect(rows.map((r) => r.extra)).toEqual(['หลังอาหาร', 'พร้อมอาหาร', 'ก่อนอาหาร', null]);
    expect(rows[2]?.amountText).toBe('½ แคปซูล');
  });
  it('puts before-meal ahead of after-meal in the same period', () => {
    const s = daily({ morning: { pills: 1, meal: 'after' } });
    const r = withSchedule('a2', s);
    const rows = todayRows({ ...r, assignments: r.assignments.map((a) => (a.id === 'a5' ? { ...a, schedule: daily({ morning: { pills: 1, meal: 'before' } }) } : a)) }, T);
    expect(rows.filter((x) => x.personId === 'p2').map((x) => x.extra)).toEqual(['ก่อนอาหาร', 'หลังอาหาร']);
  });
  it('skips medicines not taken today (weekday rule, alternate days)', () => {
    const on = (days: Extract<Schedule, { kind: 'meal' }>['days']): Schedule => ({ kind: 'meal', slots: { morning: { pills: 1, meal: 'after' } }, days });
    const monday = on({ kind: 'weekdays', days: [1] });
    const wednesday = on({ kind: 'weekdays', days: [3] });
    expect(todayRows(withSchedule('a2', monday), T).some((r) => r.assignmentId === 'a2')).toBe(false);
    expect(todayRows(withSchedule('a2', wednesday), T).some((r) => r.assignmentId === 'a2')).toBe(true);
    const alt = on({ kind: 'alt', anchor: '2026-10-27' }); // taken 27, 29: not 28
    expect(todayRows(withSchedule('a2', alt), T).some((r) => r.assignmentId === 'a2')).toBe(false);
    expect(todayRows(withSchedule('a2', alt), '2026-10-29').some((r) => r.assignmentId === 'a2')).toBe(true);
  });
  it('skips stopped medicines, removed members and self-managed members', () => {
    const r = demoRoot('normal');
    const stopped = { ...r, assignments: r.assignments.map((a) => (a.id === 'a2' ? { ...a, status: 'stopped' as const } : a)) };
    expect(todayRows(stopped, T).some((x) => x.assignmentId === 'a2')).toBe(false);
    const removed = { ...r, persons: r.persons.map((p) => (p.id === 'p2' ? { ...p, removedAt: '2026-10-01T09:00:00+07:00' } : p)) };
    expect(todayRows(removed, T).some((x) => x.personId === 'p2')).toBe(false);
    const own = { ...r, persons: r.persons.map((p) => (p.id === 'p2' ? { ...p, selfManaged: true } : p)) };
    expect(todayRows(own, T).some((x) => x.personId === 'p2')).toBe(false);
  });
  it('shows interval doses under a period by clock time, with the hours rule', () => {
    const rows = todayRows(demoRoot('normal'), T).filter((r) => r.assignmentId === 'a3');
    expect(rows.map((r) => [r.key, r.period, r.extra])).toEqual([
      ['a3:08:00', 'morning', 'ทุก 8 ชั่วโมง'],
      ['a3:16:00', 'evening', 'ทุก 8 ชั่วโมง'],
      ['a3:00:00', 'bedtime', 'ทุก 8 ชั่วโมง'],
    ]);
  });
  it('does not show an interval course that has ended', () => {
    const ended: Schedule = { kind: 'interval', everyHours: 12, firstTime: '08:00', pills: 1, course: { kind: 'days', days: 3, startDate: '2026-10-01' } };
    expect(todayRows(withSchedule('a2', ended), T).some((r) => r.assignmentId === 'a2')).toBe(false);
  });
  it('marks ticked doses done', () => {
    const rows = todayRows(demoRoot('normal'), T);
    expect(rows.find((r) => r.key === 'a1:morning')?.done).toBe(true);
    expect(rows.find((r) => r.key === 'a1:evening')?.done).toBe(false);
  });
});

describe('helpers', () => {
  it('interval times and periods', () => {
    expect(intervalTimes(8, '08:00')).toEqual(['00:00', '08:00', '16:00']);
    expect(intervalTimes(24, '07:30')).toEqual(['07:30']);
    expect(['04:00', '10:59', '11:00', '15:59', '16:00', '20:59', '21:00', '03:59'].map(periodOfTime)).toEqual([
      'morning', 'morning', 'noon', 'noon', 'evening', 'evening', 'bedtime', 'bedtime',
    ]);
  });
  it('formats halves, dose keys and names', () => {
    expect([1, 0.5, 1.5, 2].map(formatAmount)).toEqual(['1', '½', '1½', '2']);
    expect(doseKey('a1', 'morning')).toBe('a1:morning');
    const m = sampleRootV3().medications;
    expect(medicineLabel(m[0]!)).toBe('ยาตัวอย่าง A 500 mg');
    expect(medicineLabel(m[3]!)).toBe('ยาตัวอย่าง D 1%');
    expect(medicineLabel(m[4]!)).toBe('ยาตัวอย่าง E');
  });
  it('writes the Thai date and uses Bangkok time', () => {
    expect(thaiDateLabel('2026-10-22')).toBe('พฤหัส 22 ต.ค. 2569');
    expect(bangkokToday(new Date('2026-10-27T18:30:00Z'))).toBe('2026-10-28'); // 01:30 in Bangkok
  });
});

describe('toggleDose', () => {
  it('ticks, unticks and drops an empty day', () => {
    const r = blankRootV3();
    const on = toggleDose(r, T, 'a1:morning');
    expect(on.prepLog).toEqual({ [T]: { 'a1:morning': true } });
    expect(toggleDose(on, T, 'a1:morning').prepLog).toEqual({});
  });
  it('drops ticks older than 14 days and keeps the other root fields', () => {
    const r = { ...blankRootV3(), prepLog: { '2026-10-13': { x: true as const }, '2026-10-14': { y: true as const } } };
    const next = toggleDose(r, T, 'z');
    expect(Object.keys(next.prepLog)).toEqual(['2026-10-14', T]);
    expect(next.persons).toBe(r.persons);
  });
});

describe('members and default', () => {
  it('counts rows and says จัดยาเอง for self-managed', () => {
    const r = demoRoot('normal');
    const own = { ...r, persons: r.persons.map((p) => (p.id === 'p2' ? { ...p, selfManaged: true } : p)) };
    const chips = memberChips(own, todayRows(own, T));
    expect(chips.map((c) => c.countText)).toEqual(['2 รายการ', 'จัดยาเอง', '3 รายการ']);
  });
  it('default member = first with rows, else first not self-managed', () => {
    const chip = (id: string, count: number, selfManaged = false) => ({ id, name: id, avatar: 'avatar-01' as const, selfManaged, count, countText: '' });
    expect(defaultMember([chip('a', 0, true), chip('b', 0), chip('c', 2)])).toBe('c');
    expect(defaultMember([chip('a', 0, true), chip('b', 0)])).toBe('b');
    expect(defaultMember([])).toBeNull();
  });
  it('an unknown or removed selected id falls back to the default', () => {
    expect(buildHome(demoRoot('normal'), T, 'nobody').selectedId).toBe('p1');
    expect(buildHome(demoRoot('normal'), T, 'p2').selectedName).toBe('สมาชิก ข');
  });
});

describe('care list and warnings', () => {
  it('orders expired, out, low, expiring and counts each once', () => {
    const items = careItems(demoRoot('alert'), T);
    expect(items.map((i) => [i.kind, i.chip])).toEqual([['expired', 'เลิกใช้'], ['out', 'หมดแล้ว'], ['low', '7 วัน'], ['expiring', '8 วัน']]);
    expect(items.map((i) => i.who)).toEqual(['สมาชิก ก', 'ยาสามัญ', 'สมาชิก ข', 'สมาชิก ข']);
  });
  it('is empty when nothing needs care, and ignores stopped medicines', () => {
    expect(careItems(demoRoot('normal'), T)).toEqual([]);
    const a = demoRoot('alert');
    const stopped = { ...a, assignments: a.assignments.map((x) => (x.id === 'a1' ? { ...x, status: 'stopped' as const } : x)) };
    expect(careItems(stopped, T).some((i) => i.kind === 'expired')).toBe(false);
  });
  it('does not warn about low stock for cream or drops (tubes)', () => {
    const s = sampleRootV3();
    expect(careItems(s, T).some((i) => i.key === 'a:a4' || i.key === 'a:a6')).toBe(false);
  });
  it('lists house medicines that are low', () => {
    const r = demoRoot('normal');
    const low = { ...r, houseItems: r.houseItems.map((h) => (h.id === 'h1' && h.stock ? { ...h, stock: { ...h.stock, qty: 1 } } : h)) };
    expect(careItems(low, T)[0]).toMatchObject({ kind: 'low', chip: 'เหลือ 1 แผง', who: 'ยาสามัญ' });
  });
  it('warns with one line per kind, then the backup banner from backup.ts', () => {
    const r = demoRoot('alert');
    expect(warnings(r, T).map((w) => w.text)).toEqual([
      'ยาหมดอายุแล้ว 1 รายการ', 'ยาหมดแล้ว 1 รายการ', 'ยาใกล้หมด 1 รายการ', 'ยาใกล้หมดอายุ 1 รายการ',
    ]);
    const never = { ...r, meta: { createdAt: r.meta.createdAt } };
    expect(warnings(never, T).at(-1)).toEqual({ kind: 'backup', text: 'ยังไม่ได้สำรองข้อมูล' });
    const old = { ...r, meta: { ...r.meta, lastBackupAt: '2026-10-01T09:00:00+07:00' } };
    expect(warnings(old, T).at(-1)).toEqual({ kind: 'backup', text: 'ไม่ได้สำรองข้อมูลมา 27 วันแล้ว' });
  });
  it('caps the care rows shown and counts the rest', () => {
    const r = demoRoot('alert');
    const many = { ...r, houseItems: [...r.houseItems, { id: 'h9', name: 'ยาสามัญตัวอย่าง ค', stock: { qty: 0, unit: 'ขวด' } }, { id: 'h8', name: 'ยาสามัญตัวอย่าง ง', stock: { qty: 0, unit: 'ขวด' } }] };
    const m = buildHome(many, T);
    expect(m.careShown).toHaveLength(3);
    expect(m.careMore).toBe(m.care.length - 3);
  });
});

describe('headline', () => {
  it('follows the state', () => {
    expect(headline('S0', [])).toEqual({ text: 'มาเริ่มจัดยากันเลย', done: false });
    expect(headline('S1', [])).toEqual({ text: 'มาเริ่มจัดยากันเลย', done: false });
    expect(headline('ready', [])).toEqual({ text: 'วันนี้ไม่มียาที่ต้องจัด', done: false });
    const rows = todayRows(demoRoot('normal'), T);
    expect(headline('ready', rows).text).toBe('วันนี้มี 7 รายการที่ต้องจัดยา');
    expect(headline('ready', rows.map((r) => ({ ...r, done: true })))).toEqual({ text: 'จัดยาครบแล้ววันนี้', done: true });
  });
  it('shows no medicine card or tiles in the empty states', () => {
    for (const n of ['empty0', 'empty1'] as const) {
      const m = buildHome(demoRoot(n), T);
      expect([m.showToday, m.showTiles, m.care.length]).toEqual([false, false, 0]);
    }
    expect(buildHome(demoRoot('empty0'), T).showMembers).toBe(false);
    expect(buildHome(demoRoot('empty1'), T)).toMatchObject({ showMembers: true, firstMemberName: 'สมาชิก ก' });
  });
});
