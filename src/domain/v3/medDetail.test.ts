import { describe, expect, it } from 'vitest';
import { DEMO_TODAY } from './homeDemo';
import { applyRefill, buildMedDetail, fullThaiDate, previewRefill, refillAmount, refillFields } from './medDetail';
import { buildMedsList } from './medsList';
import { medsDemoRoot } from './medsListDemo';
import { buildHouseDetail, refillHouseItem } from './houseDetail';
import { stopMedication } from './medActions';
import type { Root } from './schema';

const T = DEMO_TODAY;
const normal = () => medsDemoRoot('normal');
const detail = (root: Root, id: string) => {
  const d = buildMedDetail(root, id, T);
  if (!d) throw new Error(`no detail for ${id}`);
  return d;
};

describe('fullThaiDate', () => {
  it('four-digit Buddhist year', () => {
    expect(fullThaiDate('2026-10-12')).toBe('12 ต.ค. 2569');
    expect(fullThaiDate('2027-03-15')).toBe('15 มี.ค. 2570');
    expect(fullThaiDate('2026-08-03T09:00:00+07:00')).toBe('3 ส.ค. 2569');
  });
});

describe('buildMedDetail: normal medicine (dad VitaminD)', () => {
  const d = detail(normal(), 'a4');
  it('owner, name, strength, kind, status', () => {
    expect(d).toMatchObject({ personName: 'คุณพ่อ', name: 'VitaminD', strength: '1,000 IU', kind: 'tablet', status: 'active', stoppedLine: null, doseTitle: 'วิธีกิน' });
  });
  it('one dose row per period, with units, meal and days', () => {
    expect(d.doseLines).toEqual([
      { period: 'morning', title: 'เช้า', sub: '1 เม็ด · หลังอาหาร · ทุกวัน' },
      { period: 'evening', title: 'เย็น', sub: '1 เม็ด · หลังอาหาร · ทุกวัน' },
    ]);
    expect(d.startLine).toBe('เริ่มกินเมื่อ 1 มิ.ย. 2569');
  });
  it('stock: 53 pills = 1 box + 2 strips + 3 pills, 26 days, expiry 15 มี.ค. 2570', () => {
    expect(d.stock).toMatchObject({
      mode: 'count',
      big: '53 เม็ด',
      sub: '1 กล่อง + 2 แผง + 3 เม็ด',
      chip: { tone: 'ok', label: 'เพียงพอ' },
      left: { label: 'พอใช้ได้อีก', value: 'ประมาณ 26 วัน' },
      expiry: { text: '15 มี.ค. 2570', chip: null },
      canRefill: true,
      openTube: null,
    });
  });
  it('history: newest first, all four kinds, no refill', () => {
    expect(d.history.map((h) => [h.date, h.title])).toEqual([
      ['20 ก.ย. 2569', 'กลับมากินใหม่'],
      ['5 ก.ย. 2569', 'หยุดยา'],
      ['10 ส.ค. 2569', 'ปรับโดส'],
      ['1 มิ.ย. 2569', 'เริ่มกินยา'],
    ]);
    expect(d.history[0]).toMatchObject({ line2: 'เหตุผล: อาการกลับมาหรือกำเริบ' });
    expect(d.history[1]).toMatchObject({ line2: 'เหตุผล: หมอสั่งหยุด' });
    expect(d.history[2]).toMatchObject({ line1: 'เช้า 1 เม็ด → เช้า 1 เม็ด + เย็น 1 เม็ด', line2: 'เหตุผล: หมอสั่ง' });
  });
});

describe('same limits as the list', () => {
  it('chip and days agree with the list for every active medicine', () => {
    const root = normal();
    const list = buildMedsList(root, T, { tab: 'mine', filter: 'all', query: '' });
    for (const g of list.groups) {
      for (const row of g.rows) {
        const d = detail(root, row.id);
        if (row.chip.label === 'ใกล้หมด') expect(d.stock.chip?.label, row.name).toBe('ใกล้หมด');
        if (row.chip.label === 'หมด') expect(d.stock.chip?.label, row.name).toBe('หมด');
        if (row.chip.label === 'ปกติ' || row.chip.label === 'หมดอายุแล้ว') expect(['เพียงพอ'], row.name).toContain(d.stock.chip?.label);
        if (row.expiryNote?.startsWith('ใกล้หมดอายุ')) expect(d.stock.expiry.chip?.label).toBe('ใกล้หมดอายุ');
      }
    }
  });
  it('expiry limit = settings.expiryWarnDays (15): 15 days warns, 16 does not; past = expired; none = not given', () => {
    const base = normal();
    const withExpiry = (expiry: string | undefined): Root => ({ ...base, assignments: base.assignments.map((a) => (a.id === 'a4' ? { ...a, expiry } : a)) });
    expect(detail(withExpiry('2026-11-12'), 'a4').stock.expiry.chip).toEqual({ tone: 'low', label: 'ใกล้หมดอายุ' });
    expect(detail(withExpiry('2026-11-13'), 'a4').stock.expiry.chip).toBeNull();
    expect(detail(withExpiry('2026-10-27'), 'a4').stock.expiry.chip).toEqual({ tone: 'out', label: 'หมดอายุแล้ว' });
    const none = withExpiry(undefined);
    expect(detail({ ...none, assignments: none.assignments.map((a) => (a.id === 'a4' ? (({ expiry: _e, ...r }) => r)(a) : a)) }, 'a4').stock.expiry).toEqual({ text: 'ไม่ได้ระบุ', chip: null });
  });
  it('low and out chips (dad Simvastatin 3 days, Metformin 14 days)', () => {
    expect(detail(normal(), 'a1').stock).toMatchObject({ chip: { tone: 'low', label: 'ใกล้หมด' }, left: { value: 'ประมาณ 3 วัน' } });
    expect(detail(normal(), 'a2').stock.chip).toEqual({ tone: 'low', label: 'ใกล้หมด' });
    const empty = { ...normal(), assignments: normal().assignments.map((a) => (a.id === 'a1' ? { ...a, stock: { kind: 'count' as const, strips: 0, loose: 0, countedOn: T } } : a)) };
    expect(detail(empty, 'a1').stock).toMatchObject({ big: '0 เม็ด', sub: 'ไม่มียาเหลือ', chip: { tone: 'out', label: 'หมด' } });
  });
});

describe('not taken every day: weeks', () => {
  const d = detail(medsDemoRoot('notdaily'), 'a10');
  it('rows say which days; the time left is in weeks', () => {
    expect(d.doseLines).toEqual([{ period: 'morning', title: 'เช้า', sub: '1 เม็ด · หลังอาหาร · เฉพาะวันจันทร์ พุธ ศุกร์' }]);
    expect(d.stock.left?.value).toMatch(/^ประมาณ \d+ สัปดาห์$/);
    expect(d.stock.left?.value).not.toContain('วัน');
  });
});

describe('cream counted by the tube', () => {
  const d = detail(medsDemoRoot('cream'), 'a9');
  it('spare tubes, no days, no automatic deduction', () => {
    expect(d.startLine).toBe('เริ่มใช้เมื่อ 1 มิ.ย. 2569');
    expect(d.stock).toMatchObject({
      mode: 'tubes', big: 'สำรอง 2 หลอด', sub: 'กำลังใช้หลอดที่เปิดอยู่', note: 'ไม่ตัดสต็อกอัตโนมัติ', left: null,
      chip: { tone: 'ok', label: 'เพียงพอ' }, openTube: { label: 'เปิดหลอดใหม่', disabled: false }, canRefill: true,
    });
  });
  it('no spare = near-empty while a tube is open, empty when nothing is open; the open button is off', () => {
    const root = medsDemoRoot('cream');
    const set = (opened: boolean, spare: number): Root => ({ ...root, assignments: root.assignments.map((a) => (a.id === 'a9' ? { ...a, stock: { kind: 'tubes' as const, opened, spare } } : a)) });
    expect(detail(set(true, 0), 'a9').stock).toMatchObject({ chip: { label: 'ใกล้หมด' }, openTube: { disabled: true } });
    expect(detail(set(false, 0), 'a9').stock).toMatchObject({ chip: { label: 'หมด' }, sub: 'ยังไม่ได้เปิดหลอด' });
  });
  it('drops say ขวด', () => {
    const root = medsDemoRoot('cream');
    const drops: Root = {
      ...root,
      medications: root.medications.map((m) => (m.id === 'm8' ? { ...m, kind: 'drops' as const } : m)),
    };
    expect(detail(drops, 'a9').stock).toMatchObject({ big: 'สำรอง 2 ขวด', sub: 'กำลังใช้ขวดที่เปิดอยู่', openTube: { label: 'เปิดขวดใหม่' } });
  });
});

describe('stopped medicine', () => {
  const d = detail(normal(), 'a7');
  it('title, stopped line with reason and symptom, no chip, no days, no buttons, expiry still shown', () => {
    expect(d.status).toBe('stopped');
    expect(d.doseTitle).toBe('วิธีกินก่อนหยุด');
    expect(d.stoppedLine).toBe('หยุดเมื่อ 3 ก.ย. 2569 · เหตุผล: แพ้ยา · อาการ: ผื่นคัน');
    expect(d.stock).toMatchObject({ chip: null, left: null, canRefill: false, openTube: null, expiry: { text: 'ไม่ได้ระบุ' } });
    expect(d.history[0]).toMatchObject({ title: 'หยุดยา', line2: 'เหตุผล: แพ้ยา · อาการ: ผื่นคัน' });
  });
  it('อื่น ๆ shows only the typed reason', () => {
    const res = stopMedication(normal(), 'a1', { reason: 'อื่น ๆ', note: 'ย้ายบ้าน' }, T, '2026-10-28T10:00:00+07:00');
    if (!res.ok) throw new Error('setup');
    const x = detail(res.root, 'a1');
    expect(x.stoppedLine).toBe('หยุดเมื่อ 28 ต.ค. 2569 · เหตุผล: ย้ายบ้าน');
    expect(x.history[0]).toMatchObject({ line2: 'เหตุผล: ย้ายบ้าน' });
  });
  it('a resume without a reason (older data) has no reason line', () => {
    const root = normal();
    const old: Root = { ...root, events: [...root.events, { id: 'old', assignmentId: 'a2', type: 'resume', effectiveOn: '2026-10-01', at: '2026-10-01T09:00:00+07:00' }] };
    expect(detail(old, 'a2').history.find((h) => h.id === 'old')).toMatchObject({ title: 'กลับมากินใหม่', line2: null });
  });
});

describe('missing', () => {
  it('unknown id = null', () => {
    expect(buildMedDetail(normal(), 'nope', T)).toBeNull();
  });
});

describe('refill', () => {
  const root = normal();
  const a = (id: string) => root.assignments.find((x) => x.id === id)!;
  const m = (id: string) => root.medications.find((x) => x.id === a(id).medicationId)!;

  it('boxes / strips / pills by pack', () => {
    expect(refillFields(a('a4'), m('a4')).map((f) => f.unit)).toEqual(['กล่อง', 'แผง', 'เม็ด']);
    expect(refillFields(a('a1'), m('a1')).map((f) => f.unit)).toEqual(['เม็ด']);
    const cream = medsDemoRoot('cream');
    expect(refillFields(cream.assignments.find((x) => x.id === 'a9')!, cream.medications.find((x) => x.id === 'm8')!).map((f) => f.unit)).toEqual(['หลอด']);
  });
  it('a box is turned into strips (3 per box); empty and zero = nothing yet; letters = error', () => {
    expect(refillAmount(a('a4'), m('a4'), { boxes: '1', strips: '2', loose: '3' })).toEqual({ kind: 'count', strips: 5, loose: 3 });
    expect(refillAmount(a('a4'), m('a4'), { boxes: '', strips: '0' })).toBeNull();
    expect(refillAmount(a('a4'), m('a4'), { boxes: 'x' })).toEqual({ error: 'ใส่ได้เฉพาะตัวเลข' });
  });
  it('preview shows total and days before -> after; expiry keeps the nearer date', () => {
    const add = refillAmount(a('a4'), m('a4'), { loose: '30' });
    if (!add || 'error' in add) throw new Error('setup');
    const res = previewRefill(root, 'a4', add, '2027-01-01', T);
    expect(res.ok && res.preview.rows).toEqual([
      { label: 'จำนวนรวม', value: '53 เม็ด → 83 เม็ด' },
      { label: 'พอใช้ประมาณ', value: '26 วัน → 41 วัน' },
    ]);
    expect(res.ok && res.preview.expiry).toBe('2027-01-01'); // nearer than 2027-03-15
  });
  it('refill makes no event and keeps the schedule and status', () => {
    const add = refillAmount(a('a4'), m('a4'), { strips: '1' });
    if (!add || 'error' in add) throw new Error('setup');
    const res = previewRefill(root, 'a4', add, undefined, T);
    if (!res.ok) throw new Error('setup');
    const applied = applyRefill(root, 'a4', res.preview.assignment);
    expect(applied.ok && applied.root.events).toEqual(root.events);
    expect(applied.ok && applied.root.assignments.find((x) => x.id === 'a4')).toMatchObject({ status: 'active', schedule: a('a4').schedule });
  });
  it('cream preview shows only spare tubes', () => {
    const cream = medsDemoRoot('cream');
    const res = previewRefill(cream, 'a9', { kind: 'tubes', spare: 1 }, undefined, T);
    expect(res.ok && res.preview.rows).toEqual([{ label: 'จำนวนหลอดสำรอง', value: '2 หลอด → 3 หลอด' }]);
  });
  it('a refill that refillStock refuses gives its Thai error', () => {
    expect(previewRefill(root, 'a1', { kind: 'count', strips: 2, loose: 0 }, undefined, T)).toEqual({ ok: false, error: 'ยานี้ไม่มีขนาดต่อแผง จึงเติมเป็นแผงไม่ได้' });
    expect(previewRefill(root, 'a1', { kind: 'count', strips: 0, loose: 0 }, undefined, T).ok).toBe(false);
  });
});

describe('house item sheet', () => {
  const root = normal();
  it('detail: counted item', () => {
    expect(buildHouseDetail(root, 'h3', T)).toMatchObject({ name: 'ผงเกลือแร่ ORS', subtitle: 'ยาสามัญประจำบ้าน · ผงชงดื่ม', chip: { label: 'ใกล้หมด' }, big: '2 ซอง', counted: true, expiry: { text: 'ไม่ได้ระบุ' } });
    expect(buildHouseDetail(root, 'h1', T)).toMatchObject({ chip: { label: 'หมดแล้ว' }, big: '0 อัน' });
    expect(buildHouseDetail(root, 'h2', T)?.expiry).toEqual({ text: '30 ก.ย. 2569', chip: { tone: 'out', label: 'หมดอายุแล้ว' } });
  });
  it('detail: not counted; deleted and unknown = null', () => {
    expect(buildHouseDetail(root, 'h4', T)).toMatchObject({ counted: false, big: null, chip: { tone: 'off', label: 'ไม่ได้ใส่จำนวน' } });
    expect(buildHouseDetail(root, 'h6', T)).toBeNull();
    expect(buildHouseDetail(root, 'zz', T)).toBeNull();
  });
  it('refill adds the number, merges expiry, makes no event', () => {
    const res = refillHouseItem(root, 'h3', 3, '2027-01-01');
    if (!res.ok) throw new Error('setup');
    expect(res.refill.total).toBe('2 ซอง → 5 ซอง');
    expect(res.refill.root.houseItems.find((h) => h.id === 'h3')).toMatchObject({ stock: { qty: 5, unit: 'ซอง' }, expiry: '2027-01-01' });
    expect(res.refill.root.events).toEqual(root.events);
    const near = refillHouseItem(root, 'h2', 1, '2030-01-01');
    expect(near.ok && near.refill.root.houseItems.find((h) => h.id === 'h2')?.expiry).toBe('2026-09-30'); // old date is nearer
  });
  it('refused: not counted, zero, unknown', () => {
    expect(refillHouseItem(root, 'h4', 1, undefined)).toEqual({ ok: false, error: 'ยานี้ไม่ได้นับจำนวน' });
    expect(refillHouseItem(root, 'h3', 0, undefined).ok).toBe(false);
    expect(refillHouseItem(root, 'zz', 1, undefined)).toEqual({ ok: false, error: 'ไม่พบยานี้' });
  });
});
