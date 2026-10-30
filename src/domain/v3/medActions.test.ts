import { describe, expect, it } from 'vitest';
import { blankRootV3, NOW } from './fixtures';
import { medsDemoRoot } from './medsListDemo';
import { resumeMedication, stopMedication } from './medActions';
import { rootSchema } from './schema';
import { daysLeft, stockNow } from './stock';

const TODAY = '2026-10-28';
const root = () => medsDemoRoot('normal');
let n = 0;
const id = () => `new-${++n}`;

describe('stopMedication', () => {
  it('stops an active medicine: new stop event at the end, status stopped, nothing else changed', () => {
    const before = root();
    const res = stopMedication(before, 'a1', { reason: 'แพ้ยา', note: ' ผื่นคัน ' }, TODAY, NOW, id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const after = res.root;
    expect(after.events).toHaveLength(before.events.length + 1);
    expect(after.events.at(-1)).toEqual({ id: expect.any(String), assignmentId: 'a1', type: 'stop', reason: 'แพ้ยา', note: 'ผื่นคัน', effectiveOn: TODAY, at: NOW });
    const a = after.assignments.find((x) => x.id === 'a1')!;
    const old = before.assignments.find((x) => x.id === 'a1')!;
    expect(a.status).toBe('stopped');
    expect({ ...a, status: 'active' }).toEqual(old); // stock, expiry, schedule untouched
    expect(after.assignments.filter((x) => x.id !== 'a1')).toEqual(before.assignments.filter((x) => x.id !== 'a1'));
    expect(rootSchema.safeParse(after).success).toBe(true);
    expect(before.assignments.find((x) => x.id === 'a1')!.status).toBe('active'); // input not mutated
  });
  it('drops a note that does not belong to the reason', () => {
    const res = stopMedication(root(), 'a1', { reason: 'หมอสั่ง', note: 'อะไรก็ได้' }, TODAY, NOW, id);
    expect(res.ok && res.root.events.at(-1)).not.toHaveProperty('note');
  });
  it('อื่น ๆ without a note is refused in Thai', () => {
    const res = stopMedication(root(), 'a1', { reason: 'อื่น ๆ', note: '  ' }, TODAY, NOW, id);
    expect(res).toEqual({ ok: false, error: 'กรุณาพิมพ์เหตุผล' });
  });
  it('a second stop, or a missing medicine, is refused', () => {
    const first = stopMedication(root(), 'a1', { reason: 'หมอสั่ง' }, TODAY, NOW, id);
    if (!first.ok) throw new Error('setup');
    expect(stopMedication(first.root, 'a1', { reason: 'หมอสั่ง' }, TODAY, NOW, id)).toEqual({ ok: false, error: 'ยานี้หยุดไปแล้ว' });
    expect(stopMedication(root(), 'zzz', { reason: 'หมอสั่ง' }, TODAY, NOW, id)).toEqual({ ok: false, error: 'ไม่พบยานี้' });
    expect(stopMedication(blankRootV3(), 'a1', { reason: 'หมอสั่ง' }, TODAY, NOW, id).ok).toBe(false);
  });
  it('writes nothing into the member allergies', () => {
    const before = root();
    const res = stopMedication(before, 'a1', { reason: 'แพ้ยา', note: 'ผื่น' }, TODAY, NOW, id);
    expect(res.ok && res.root.persons).toEqual(before.persons);
  });
});

describe('resumeMedication', () => {
  it('resumes a stopped medicine with a reason; stock is not changed', () => {
    const before = root();
    const res = resumeMedication(before, 'a7', { reason: 'ซื้อยาได้แล้ว' }, TODAY, NOW, id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.root.events.at(-1)).toEqual({ id: expect.any(String), assignmentId: 'a7', type: 'resume', reason: 'ซื้อยาได้แล้ว', effectiveOn: TODAY, at: NOW });
    const a = res.root.assignments.find((x) => x.id === 'a7')!;
    expect(a.status).toBe('active');
    expect(a.stock).toEqual(before.assignments.find((x) => x.id === 'a7')!.stock);
    expect(rootSchema.safeParse(res.root).success).toBe(true);
  });
  it('อื่น ๆ keeps its note and needs one', () => {
    expect(resumeMedication(root(), 'a7', { reason: 'อื่น ๆ' }, TODAY, NOW, id).ok).toBe(false);
    const ok = resumeMedication(root(), 'a7', { reason: 'อื่น ๆ', note: 'หมอนัดใหม่' }, TODAY, NOW, id);
    expect(ok.ok && ok.root.events.at(-1)).toMatchObject({ reason: 'อื่น ๆ', note: 'หมอนัดใหม่' });
  });
  it('an active medicine cannot be resumed', () => {
    expect(resumeMedication(root(), 'a1', { reason: 'ซื้อยาได้แล้ว' }, TODAY, NOW, id)).toEqual({ ok: false, error: 'ยานี้กำลังใช้อยู่แล้ว' });
  });
});

describe('stop then resume keeps the stock rule of stock.ts', () => {
  it('paused days are not deducted', () => {
    const r0 = root();
    const med = (r: ReturnType<typeof root>) => r.medications.find((m) => m.id === r.assignments.find((a) => a.id === 'a2')!.medicationId)!;
    const asg = (r: ReturnType<typeof root>) => r.assignments.find((a) => a.id === 'a2')!;
    // count on 2026-10-20 so that days pass
    const counted = { ...r0, assignments: r0.assignments.map((a) => (a.id === 'a2' ? { ...a, stock: { kind: 'count' as const, strips: 0, loose: 100, countedOn: '2026-10-20' } } : a)) };
    const stopped = stopMedication(counted, 'a2', { reason: 'หมอสั่ง' }, '2026-10-22', NOW, id);
    if (!stopped.ok) throw new Error('setup');
    const resumed = resumeMedication(stopped.root, 'a2', { reason: 'หมอสั่งให้กลับมากิน' }, '2026-10-26', NOW, id);
    if (!resumed.ok) throw new Error('setup');
    // 2 pills a day: 20..21 (2 days) + 26..27 (2 days) = 4 days x 2 = 8 deducted, not 8 days x 2
    expect(stockNow(asg(resumed.root), med(resumed.root), TODAY, resumed.root.events)).toBe(92);
    expect(daysLeft(asg(resumed.root), med(resumed.root), TODAY, resumed.root.events).status).toBe('ok');
  });
});
