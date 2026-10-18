import { describe, expect, it } from 'vitest';
import { assignment, dailyMeal, person, resumeEvent, rootWith, stopEvent } from './helpers.test-util';
import { NOW } from './fixtures';
import { detailBadges, expiryBlock, historyEntries, listBadges, medsByMember, shownQty, stockBlock } from './medView';
import type { Assignment, MedEvent, Root } from './schema';

const TODAY = '2026-10-18'; // Sunday
const TWICE = dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } });

const house = (a: Partial<Assignment> = {}, over: Partial<Root> = {}): Root =>
  rootWith({
    persons: [person()],
    medications: [{ id: 'm1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด' }],
    assignments: [assignment({ schedule: TWICE, stock: { qty: 20, countedOn: '2026-10-15' }, ...a })],
    ...over,
  });
const a0 = (r: Root): Assignment => r.assignments[0] as Assignment;

describe('example 1: 20 counted on 15 Oct, 2 a day, today 18 Oct', () => {
  it('shows 14 left, enough for 7 days (to 24 Oct)', () => {
    const r = house();
    expect(shownQty(r, a0(r), TODAY)).toBe(14);
    expect(stockBlock(r, a0(r), 'เม็ด', TODAY)).toEqual({ value: '14 เม็ด', sub: 'พอทาน 7 วัน (ถึง 24 ต.ค. 2569)' });
  });

  it('7 days is on the border of lowStockDays = 7: "ใกล้หมด"; with 6 it is "สต๊อกพอ"', () => {
    const r = house();
    expect(r.settings.lowStockDays).toBe(7);
    expect(listBadges(r, a0(r), TODAY)).toEqual(['low']);
    const six = { ...r, settings: { ...r.settings, lowStockDays: 6 } };
    expect(listBadges(six, a0(six), TODAY)).toEqual(['ok']);
  });
});

describe('badges', () => {
  it('no count: "ไม่ได้ใส่จำนวน", and the stock block never says 0', () => {
    const r = house({ stock: null });
    expect(listBadges(r, a0(r), TODAY)).toEqual(['noStock']);
    expect(stockBlock(r, a0(r), 'เม็ด', TODAY)).toEqual({ value: 'ไม่ได้ใส่จำนวนคงเหลือ', sub: '' });
  });

  it('expired / expiring use settings.expiryWarnDays (15): 15 days away is soon, 16 is fine, yesterday is expired', () => {
    const at = (expiry: string) => {
      const r = house({ stock: { qty: 500, countedOn: TODAY }, expiry });
      return listBadges(r, a0(r), TODAY);
    };
    expect(at('2026-11-02')).toEqual(['soon']); // 15 days
    expect(at('2026-11-03')).toEqual(['ok']); // 16 days
    expect(at('2026-10-17')).toEqual(['expired']);
    expect(at('2026-10-18')).toEqual(['soon']); // today
  });

  it('low and expiring are both shown (a warning is never hidden)', () => {
    const r = house({ expiry: '2026-10-25' });
    expect(listBadges(r, a0(r), TODAY)).toEqual(['low', 'soon']);
  });

  it('stopped medicine: only "หยุดใช้แล้ว" in the list; the detail adds an expiry warning but never low stock', () => {
    const r = house({ status: 'stopped', expiry: '2026-10-10' }, { events: [stopEvent('a1', '2026-10-17')] });
    expect(listBadges(r, a0(r), TODAY)).toEqual(['stopped']);
    expect(detailBadges(r, a0(r), TODAY)).toEqual(['stopped', 'expired']);
    const active = house();
    expect(detailBadges(active, a0(active), TODAY)).toEqual(['active', 'low']);
  });
});

describe('blocks', () => {
  it('stopped: the frozen count is shown, not 0 and not null', () => {
    const r = house({ status: 'stopped', stock: { qty: 14, countedOn: TODAY } });
    expect(stockBlock(r, a0(r), 'เม็ด', TODAY)).toEqual({ value: '14 เม็ด', sub: 'หยุดใช้อยู่ ไม่หักสต๊อก' });
  });

  it('empty and not enough for today', () => {
    const empty = house({ stock: { qty: 0, countedOn: TODAY } });
    expect(stockBlock(empty, a0(empty), 'เม็ด', TODAY).sub).toBe('หมดแล้ว');
    const one = house({ stock: { qty: 1, countedOn: TODAY } });
    expect(stockBlock(one, a0(one), 'เม็ด', TODAY).sub).toBe('ไม่พอสำหรับวันนี้');
  });

  it('a short course that the stock covers: enough', () => {
    const r = house({
      schedule: { kind: 'interval', everyHours: 12, firstTime: '08:00', pills: 1, course: { kind: 'days', days: 3, startDate: TODAY } },
      stock: { qty: 50, countedOn: TODAY },
    });
    expect(stockBlock(r, a0(r), 'เม็ด', TODAY).sub).toBe('พอทานตามวิธีกินที่ตั้งไว้');
    expect(listBadges(r, a0(r), TODAY)).toEqual(['ok']);
  });

  it('expiry: date and distance, or "ไม่ระบุ"', () => {
    expect(expiryBlock(house(), a0(house()), TODAY)).toEqual({ value: 'ไม่ระบุ', sub: '' });
    const r = house({ expiry: '2026-11-02' });
    expect(expiryBlock(r, a0(r), TODAY)).toEqual({ value: '2 พ.ย. 2569', sub: 'อีก 15 วัน' });
    const gone = house({ expiry: '2026-10-15' });
    expect(expiryBlock(gone, a0(gone), TODAY)).toEqual({ value: '15 ต.ค. 2569', sub: 'หมดอายุแล้ว (เกิน 3 วัน)' });
    const now = house({ expiry: TODAY });
    expect(expiryBlock(now, a0(now), TODAY).sub).toBe('วันนี้');
  });
});

describe('members and history', () => {
  it('removed members are left out; active and stopped are split', () => {
    const r = rootWith({
      persons: [person(), person({ id: 'p2', name: 'Test Person B', removedAt: NOW })],
      medications: [{ id: 'm1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด' }],
      assignments: [assignment({ schedule: TWICE }), assignment({ id: 'a2', personId: 'p2', schedule: TWICE }), assignment({ id: 'a3', schedule: TWICE, status: 'stopped' })],
    });
    const rows = medsByMember(r);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.active.map((a) => a.id)).toEqual(['a1']);
    expect(rows[0]?.stopped.map((a) => a.id)).toEqual(['a3']);
  });

  it('history: newest first with Thai dates, from -> to, reason and note', () => {
    const events: MedEvent[] = [
      { id: 'e1', assignmentId: 'a1', type: 'start', effectiveOn: '2026-10-10', at: NOW, to: { schedule: TWICE } },
      {
        id: 'e2', assignmentId: 'a1', type: 'adjust', effectiveOn: TODAY, at: NOW, reason: 'หมอสั่ง', note: 'ลดยา',
        from: { schedule: TWICE }, to: { schedule: dailyMeal({ morning: { pills: 2, meal: 'after' }, evening: { pills: 2, meal: 'after' } }) },
      },
      { id: 'e3', assignmentId: 'other', type: 'resume', effectiveOn: TODAY, at: NOW },
      {
        id: 'e4', assignmentId: 'a1', type: 'edit', effectiveOn: TODAY, at: NOW,
        from: { name: 'ยาตัวอย่าง ก', stockQty: 14, expiry: null, note: null },
        to: { name: 'ยาตัวอย่าง ข', stockQty: null, expiry: '2027-01-31', note: 'เก็บในตู้' },
      },
      resumeEvent('a1', TODAY),
      stopEvent('a1', '2026-10-17'),
    ];
    const r = house({}, { events });
    const h = historyEntries(r, 'a1', 'ยาตัวอย่าง ก', 'เม็ด');
    expect(h.map((x) => x.type)).toEqual(['stop', 'resume', 'edit', 'adjust', 'start']);
    expect(h[0]).toMatchObject({ title: 'หยุดยา', date: '17 ต.ค. 2569', reason: 'หมอสั่ง', lines: ['หยุดทาน ยาตัวอย่าง ก'] });
    expect(h[2]?.lines).toEqual([
      'ชื่อ: ยาตัวอย่าง ก → ยาตัวอย่าง ข',
      'จำนวนที่เหลือ: 14 เม็ด → ไม่ได้ใส่',
      'วันหมดอายุ: ไม่ระบุ → 31 ม.ค. 2570',
      'บันทึก: ไม่มี → “เก็บในตู้”',
    ]);
    expect(h[3]).toMatchObject({
      title: 'ปรับโดส',
      reason: 'หมอสั่ง',
      note: 'ลดยา',
      lines: ['จาก เช้า หลังอาหาร 1 เม็ด · เย็น หลังอาหาร 1 เม็ด', 'เป็น เช้า หลังอาหาร 2 เม็ด · เย็น หลังอาหาร 2 เม็ด'],
    });
    expect(h[4]).toMatchObject({ title: 'เริ่มใช้ยา', date: '10 ต.ค. 2569' });
  });
});
