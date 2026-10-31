// M4 PR 6b schema additions: bottle pack, house item strength, dose size by kind.
import { describe, expect, it } from 'vitest';
import { blankRootV3, sampleRootV3 } from './fixtures';
import { houseItemSchema, medicationSchema, packSchema, packWord, rootSchema, unitsPerStrip, type Assignment, type Medication, type Root, type Schedule } from './schema';

const med = (kind: Medication['kind'], pack: Medication['pack']): Medication => ({ id: 'mx', name: 'ยาทดสอบ', kind, pack });

describe('bottle pack', () => {
  it('is accepted for tablet and capsule', () => {
    expect(medicationSchema.safeParse(med('tablet', { type: 'bottle', perBottle: 100 })).success).toBe(true);
    expect(medicationSchema.safeParse(med('capsule', { type: 'bottle', perBottle: 30 })).success).toBe(true);
  });
  it('is refused for liquid, cream and sachet', () => {
    for (const kind of ['liquid', 'cream', 'sachet'] as const) {
      expect(medicationSchema.safeParse(med(kind, { type: 'bottle', perBottle: 30 })).success).toBe(false);
    }
  });
  it('needs a whole number above 0', () => {
    expect(packSchema.safeParse({ type: 'bottle', perBottle: 0 }).success).toBe(false);
    expect(packSchema.safeParse({ type: 'bottle', perBottle: 2.5 }).success).toBe(false);
  });
  it('unitsPerStrip gives perBottle and packWord says ขวด', () => {
    expect(unitsPerStrip({ type: 'bottle', perBottle: 60 })).toBe(60);
    expect(packWord({ type: 'bottle', perBottle: 60 })).toBe('ขวด');
    expect(packWord({ type: 'strip', perStrip: 10 })).toBe('แผง');
    expect(packWord({ type: 'box', strips: 3, perStrip: 10 })).toBe('แผง');
    expect(packWord({ type: 'sachetBox', sachets: 10 })).toBe('กล่อง');
  });
  it('a bottle stock counts bottles as strips', () => {
    const r = sampleRootV3();
    const next: Root = {
      ...r,
      medications: r.medications.map((m) => (m.id === 'm1' ? { ...m, pack: { type: 'bottle', perBottle: 30 } } : m)),
    };
    expect(rootSchema.safeParse(next).success).toBe(true);
  });
});

describe('house item strength', () => {
  it('is optional and checked', () => {
    expect(houseItemSchema.safeParse({ id: 'h', name: 'ยาสามัญทดสอบ' }).success).toBe(true);
    expect(houseItemSchema.safeParse({ id: 'h', name: 'ยาสามัญทดสอบ', strength: { value: 500, unit: 'mg' } }).success).toBe(true);
    expect(houseItemSchema.safeParse({ id: 'h', name: 'ยาสามัญทดสอบ', strength: { value: 0, unit: 'mg' } }).success).toBe(false);
  });
});

describe('dose size by kind', () => {
  const rootWith = (kind: Medication['kind'], schedule: Schedule): Root => {
    const m: Medication = { id: 'mx', name: 'ยาทดสอบ', kind, pack: { type: 'none' } };
    const person = { id: 'px', name: 'สมาชิกทดสอบ', relation: 'พ่อ' as const, avatar: 'avatar-01' as const, color: 'blue' as const, selfManaged: false, allergies: { status: 'unknown' as const } };
    const a: Assignment = { id: 'ax', medicationId: 'mx', personId: 'px', schedule, stock: null, status: 'active', createdAt: '2026-10-28T09:00:00+07:00' };
    return { ...blankRootV3(), persons: [person], medications: [m], assignments: [a] };
  };
  const meal = (pills: number): Schedule => ({ kind: 'meal', slots: { morning: { pills, meal: 'after' } }, days: { kind: 'daily' } });
  const interval = (pills: number): Schedule => ({ kind: 'interval', everyHours: 8, firstTime: '08:00', pills, course: { kind: 'ongoing' } });
  const ok = (kind: Medication['kind'], s: Schedule): boolean => rootSchema.safeParse(rootWith(kind, s)).success;

  it('liquid takes multiples of 2.5 from 2.5 to 100', () => {
    for (const v of [2.5, 5, 30, 100]) expect(ok('liquid', meal(v))).toBe(true);
    expect(ok('liquid', interval(7.5))).toBe(true);
  });
  it('liquid refuses 3, 1 and 100.5', () => {
    for (const v of [3, 1, 100.5, 102.5]) expect(ok('liquid', meal(v))).toBe(false);
    expect(ok('liquid', interval(3))).toBe(false);
  });
  it('other kinds stay at 4 or less per time', () => {
    expect(ok('tablet', meal(4))).toBe(true);
    expect(ok('tablet', meal(4.5))).toBe(false);
    expect(ok('capsule', interval(5))).toBe(false);
    expect(ok('sachet', meal(2))).toBe(true);
  });
  it('bedtime follows the same rule', () => {
    const bed = (pills: number): Schedule => ({ kind: 'meal', slots: { bedtime: { pills } }, days: { kind: 'daily' } });
    expect(ok('liquid', bed(10))).toBe(true);
    expect(ok('tablet', bed(5))).toBe(false);
  });
});
