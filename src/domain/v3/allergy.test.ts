import { describe, expect, it } from 'vitest';
import {
  addAllergyItem,
  allergyStateText,
  allergyWarning,
  clearNoneConfirmed,
  confirmNoAllergy,
  coverageText,
  deleteAllergyItem,
  setCoverage,
  setSideEffects,
  updateAllergyItem,
  COVERAGE_LABEL,
} from './allergy';
import { sampleRootV3 } from './fixtures';
import { COVERAGE_TYPES, coverageSchema, rootSchema, type Root } from './schema';

const person = (r: Root, id: string) => r.persons.find((p) => p.id === id)!;
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

describe('S1 unknown wording', () => {
  it('unknown is exactly this text and never says "ไม่แพ้" or "ไม่มีประวัติแพ้"', () => {
    const t = allergyStateText({ status: 'unknown' });
    expect(t).toBe('ยังไม่ได้บันทึกข้อมูลการแพ้ยา');
    expect(t).not.toMatch(/ไม่แพ้|ไม่มีประวัติแพ้|ไม่พบ/);
  });
});

describe('S2 none_confirmed', () => {
  it('text has the saved date', () => {
    expect(allergyStateText({ status: 'none_confirmed', confirmedAt: '2026-11-17' })).toBe('ยืนยันแล้วว่าไม่มีประวัติแพ้ยา (บันทึก 17 พ.ย. 69)');
  });
  it('is set only by confirmNoAllergy, from unknown, with today', () => {
    const r = ok(confirmNoAllergy(sampleRootV3(), 'p1', '2026-11-17'));
    expect(person(r.root, 'p1').allergies).toEqual({ status: 'none_confirmed', confirmedAt: '2026-11-17' });
    expect(rootSchema.safeParse(r.root).success).toBe(true);
  });
  it('is refused while items are listed (p3)', () => {
    expect(confirmNoAllergy(sampleRootV3(), 'p3', '2026-11-17').ok).toBe(false);
  });
  it('cancel goes back to unknown, and only from none_confirmed', () => {
    const r = ok(clearNoneConfirmed(sampleRootV3(), 'p2'));
    expect(person(r.root, 'p2').allergies).toEqual({ status: 'unknown' });
    expect(clearNoneConfirmed(sampleRootV3(), 'p1').ok).toBe(false);
  });
  it('no other function ever produces none_confirmed (add, delete, update)', () => {
    const s = sampleRootV3();
    const a = ok(addAllergyItem(s, 'p1', { drug: 'ก', reaction: 'ข' }));
    const d = ok(deleteAllergyItem(a.root, 'p1', 0));
    expect(person(d.root, 'p1').allergies.status).toBe('unknown');
  });
});

describe('S3 listed', () => {
  it('first item switches unknown to listed, and none_confirmed to listed', () => {
    const s = sampleRootV3();
    for (const id of ['p1', 'p2']) {
      const r = ok(addAllergyItem(s, id, { drug: '  ยาตัวอย่าง A ', reaction: ' ผื่น ' }));
      expect(person(r.root, id).allergies).toEqual({ status: 'listed', items: [{ drug: 'ยาตัวอย่าง A', reaction: 'ผื่น' }] });
    }
  });
  it('adds to an existing list; both fields are required; limits come from the schema', () => {
    const s = sampleRootV3();
    const r = ok(addAllergyItem(s, 'p3', { drug: 'ยา B', reaction: 'บวม' }));
    expect(r.person.allergies).toMatchObject({ status: 'listed', items: [{ drug: 'ยาตัวอย่าง Z' }, { drug: 'ยา B' }] });
    expect(addAllergyItem(s, 'p3', { drug: ' ', reaction: 'x' }).ok).toBe(false);
    expect(addAllergyItem(s, 'p3', { drug: 'x', reaction: '' }).ok).toBe(false);
    expect(addAllergyItem(s, 'p3', { drug: 'x'.repeat(61), reaction: 'x' }).ok).toBe(false);
    expect(addAllergyItem(s, 'nope', { drug: 'x', reaction: 'x' }).ok).toBe(false);
  });
  it('edits one item', () => {
    const r = ok(updateAllergyItem(sampleRootV3(), 'p3', 0, { drug: 'ยาใหม่', reaction: 'คัน' }));
    expect(r.person.allergies).toEqual({ status: 'listed', items: [{ drug: 'ยาใหม่', reaction: 'คัน' }] });
    expect(updateAllergyItem(sampleRootV3(), 'p3', 5, { drug: 'a', reaction: 'b' }).ok).toBe(false);
  });
  it('deleting the last item returns to unknown, never to none_confirmed', () => {
    const r = ok(deleteAllergyItem(sampleRootV3(), 'p3', 0));
    expect(r.person.allergies).toEqual({ status: 'unknown' });
    expect(rootSchema.safeParse(r.root).success).toBe(true);
  });
  it('deleting one of two keeps listed', () => {
    const two = ok(addAllergyItem(sampleRootV3(), 'p3', { drug: 'ยา B', reaction: 'บวม' }));
    const r = ok(deleteAllergyItem(two.root, 'p3', 0));
    expect(r.person.allergies).toEqual({ status: 'listed', items: [{ drug: 'ยา B', reaction: 'บวม' }] });
  });
});

describe('S4 allergyWarning', () => {
  const s = sampleRootV3(); // p3: ยาตัวอย่าง Z / ผื่นตัวอย่าง
  it('matches case and spaces ignored, either contains the other', () => {
    expect(allergyWarning(s, 'p3', 'ยาตัวอย่างZ')).toBe('ระวัง: ยาตัวอย่างZ มีบันทึกแพ้ยา ยาตัวอย่าง Z (ผื่นตัวอย่าง) ตรวจกับแพทย์หรือเภสัชกรก่อน');
    expect(allergyWarning(s, 'p3', 'ยาตัวอย่าง z 500 mg')).not.toBeNull(); // medicine contains drug
    expect(allergyWarning(s, 'p3', 'ตัวอย่าง')).not.toBeNull(); // drug contains medicine
  });
  it('no warning for another drug, empty / too short name, other person, or non-listed states', () => {
    expect(allergyWarning(s, 'p3', 'พาราเซตามอล')).toBeNull();
    expect(allergyWarning(s, 'p3', '  ')).toBeNull();
    expect(allergyWarning(s, 'p3', 'ย')).toBeNull();
    expect(allergyWarning(s, 'p1', 'ยาตัวอย่าง Z')).toBeNull();
    expect(allergyWarning(s, 'p2', 'ยาตัวอย่าง Z')).toBeNull();
    expect(allergyWarning(s, 'nope', 'ยาตัวอย่าง Z')).toBeNull();
  });
});

describe('coverage (S5: only type + company)', () => {
  it('has the six types with Thai labels and the schema accepts no number field', () => {
    expect(COVERAGE_TYPES.map((t) => COVERAGE_LABEL[t])).toEqual(['บัตรทอง', 'ประกันสังคม', 'ข้าราชการ', 'ประกันเอกชน', 'จ่ายเอง', 'อื่นๆ']);
    expect(coverageSchema.safeParse({ type: 'private', company: 'ก', policyNo: '1' }).success).toBe(false);
    expect(coverageSchema.safeParse({ type: 'government', idCard: '1' }).success).toBe(false);
  });
  it('sets a type; company kept only for private; null clears', () => {
    const s = sampleRootV3();
    expect(ok(setCoverage(s, 'p1', { type: 'social' })).person.coverage).toEqual({ type: 'social' });
    expect(ok(setCoverage(s, 'p1', { type: 'private', company: ' บ. ก ' })).person.coverage).toEqual({ type: 'private', company: 'บ. ก' });
    expect(ok(setCoverage(s, 'p1', { type: 'private', company: '  ' })).person.coverage).toEqual({ type: 'private' });
    expect(ok(setCoverage(s, 'p4', { type: 'self_pay', company: 'ควรถูกทิ้ง' })).person.coverage).toEqual({ type: 'self_pay' });
    expect('coverage' in ok(setCoverage(s, 'p4', null)).person).toBe(false);
    expect(setCoverage(s, 'p1', { type: 'private', company: 'x'.repeat(61) }).ok).toBe(false);
  });
  it('text: label (+ company) or not given', () => {
    expect(coverageText(undefined)).toBe('ยังไม่ได้ระบุ');
    expect(coverageText({ type: 'government' })).toBe('บัตรทอง');
    expect(coverageText({ type: 'private', company: 'บริษัทตัวอย่าง' })).toBe('ประกันเอกชน (บริษัทตัวอย่าง)');
    expect(coverageText({ type: 'private' })).toBe('ประกันเอกชน');
  });
});

describe('side effects', () => {
  it('saves text on the assignment, trims, empty removes it, and makes no event', () => {
    const s = sampleRootV3();
    const r = ok(setSideEffects(s, 'a2', '  ผื่น  '));
    expect(r.root.assignments.find((a) => a.id === 'a2')?.sideEffects).toBe('ผื่น');
    expect(r.root.events).toBe(s.events);
    const gone = ok(setSideEffects(r.root, 'a2', ' '));
    expect('sideEffects' in gone.root.assignments.find((a) => a.id === 'a2')!).toBe(false);
  });
  it('refuses over 500 characters and an unknown assignment', () => {
    expect(setSideEffects(sampleRootV3(), 'a1', 'x'.repeat(501)).ok).toBe(false);
    expect(setSideEffects(sampleRootV3(), 'zzz', 'x').ok).toBe(false);
  });
});
