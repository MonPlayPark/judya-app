// The owner's example house for step 3.4 (today = 2026-10-20). Made-up names only. Used by the domain test and the screen test.
import { NOW } from './fixtures';
import { assignment, dailyMeal, person, rootWith } from './helpers.test-util';
import type { MedEvent, Root, Schedule } from './schema';

export const TODAY = '2026-10-20';
export const ONE_ONE = dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } });
export const TWO_TWO = dailyMeal({ morning: { pills: 2, meal: 'after' }, evening: { pills: 2, meal: 'after' } });
export const MORNING_1 = dailyMeal({ morning: { pills: 1, meal: 'after' } });
export const MORNING_2 = dailyMeal({ morning: { pills: 2, meal: 'after' } });
export const HOW_11 = 'เช้า หลังอาหาร 1 เม็ด · เย็น หลังอาหาร 1 เม็ด';
export const HOW_22 = 'เช้า หลังอาหาร 2 เม็ด · เย็น หลังอาหาร 2 เม็ด';
export const SIDE = 'ใช้ยาไม่ได้ / ผลข้างเคียง';

let n = 0;
export const ev = (assignmentId: string, type: MedEvent['type'], effectiveOn: string, extra: Partial<MedEvent> = {}): MedEvent => ({
  id: `e${++n}`,
  assignmentId,
  type,
  effectiveOn,
  at: NOW,
  ...extra,
});
export const start = (id: string, on: string, s: Schedule) => ev(id, 'start', on, { to: { schedule: s } });
export const adjust = (id: string, on: string, from: Schedule, to: Schedule, reason: MedEvent['reason']) =>
  ev(id, 'adjust', on, { from: { schedule: from }, to: { schedule: to }, reason });
export const stop = (id: string, on: string, reason: MedEvent['reason']) => ev(id, 'stop', on, { reason });

const names = ['เอ', 'บี', 'ซี', 'ดี', 'อี', 'เอฟ', 'จี', 'เอช'];
export const idOf = (k: string) => `a-${k}`;

/** The owner's example house. Another member (pB) has a medicine that must never show up. */
export function house(): Root {
  const med = (k: string) => ({ id: `m-${k}`, name: `ยาทดสอบ ${k}`, unit: 'เม็ด' });
  const asg = (k: string, over: Parameters<typeof assignment>[0]) =>
    assignment({ id: idOf(k), medicationId: `m-${k}`, personId: 'pA', ...over });
  return rootWith({
    persons: [
      person({ id: 'pA', name: 'สมาชิกทดสอบ ก', insurance: { health: 'ประกันลับ ก' }, relation: 'พ่อ' }),
      person({ id: 'pB', name: 'สมาชิกทดสอบ ข', relation: 'แม่' }),
      person({ id: 'pR', name: 'สมาชิกทดสอบ ค', removedAt: NOW }),
    ],
    medications: [...names.map(med), med('อื่น'), med('ของคนที่ออก')],
    assignments: [
      asg('เอ', { schedule: ONE_ONE, stock: { qty: 777, countedOn: TODAY } }),
      asg('บี', { schedule: MORNING_1 }),
      asg('ซี', { schedule: MORNING_1, status: 'stopped' }),
      asg('ดี', { schedule: MORNING_1, status: 'stopped' }),
      asg('อี', { schedule: MORNING_1, status: 'stopped' }),
      asg('เอฟ', { schedule: MORNING_1 }),
      asg('จี', { schedule: MORNING_1 }),
      asg('เอช', { schedule: MORNING_1 }),
      assignment({ id: idOf('อื่น'), medicationId: 'm-อื่น', personId: 'pB', schedule: MORNING_1 }),
      assignment({ id: idOf('ของคนที่ออก'), medicationId: 'm-ของคนที่ออก', personId: 'pR', schedule: MORNING_1 }),
    ],
    events: [
      start(idOf('เอ'), '2026-08-01', ONE_ONE),
      adjust(idOf('เอ'), '2026-09-10', ONE_ONE, TWO_TWO, 'หมอสั่ง'),
      adjust(idOf('เอ'), '2026-10-01', TWO_TWO, ONE_ONE, SIDE),
      start(idOf('บี'), '2026-09-15', MORNING_1),
      start(idOf('ซี'), '2026-06-01', MORNING_1),
      stop(idOf('ซี'), '2026-08-10', 'แพ้ยา'),
      start(idOf('ดี'), '2026-06-01', MORNING_1),
      stop(idOf('ดี'), '2026-07-22', 'หมอสั่ง'),
      start(idOf('อี'), '2026-06-01', MORNING_1),
      stop(idOf('อี'), '2026-07-21', 'หมอสั่ง'),
      // เอฟ: no start event at all
      start(idOf('จี'), '2026-06-01', MORNING_1),
      adjust(idOf('จี'), '2026-07-01', MORNING_1, MORNING_2, 'หมอสั่ง'),
      adjust(idOf('จี'), '2026-08-01', MORNING_2, MORNING_1, 'หมอสั่ง'),
      adjust(idOf('จี'), '2026-09-01', MORNING_1, MORNING_2, 'หมอสั่ง'),
      adjust(idOf('จี'), '2026-10-01', MORNING_2, MORNING_1, 'หมอสั่ง'),
      start(idOf('เอช'), '2026-08-20', MORNING_1),
      stop(idOf('เอช'), '2026-09-05', SIDE),
      ev(idOf('เอช'), 'resume', '2026-10-10'),
    ],
  });
}

