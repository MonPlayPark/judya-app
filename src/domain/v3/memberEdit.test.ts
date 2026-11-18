import { afterEach, describe, expect, it, vi } from 'vitest';
import { blankRootV3, sampleRootV3 } from './fixtures';
import { buildMemberDetail, buildMembersList, removeMember, restoreMember, updateMember } from './memberEdit';
import { draftFromPerson, emptyDraft, type MemberDraft } from './members';
import { rootSchema, type Root } from './schema';

afterEach(() => vi.useRealTimers());
const at = (iso: string) => vi.useFakeTimers().setSystemTime(new Date(iso));
const draft = (d: Partial<MemberDraft> = {}): MemberDraft => ({ ...emptyDraft(), name: 'ชื่อใหม่', relation: 'ญาติ', ...d });
const NOW = '2026-11-17T03:00:00.000Z';

describe('draftFromPerson', () => {
  it('fills the form from a member (birth year as text, none = empty text)', () => {
    const s = sampleRootV3();
    expect(draftFromPerson(s.persons[1]!)).toEqual({ name: 'สมาชิก ข', relation: 'แม่', birthYear: '2500', avatar: 'avatar-02', selfManaged: false });
    expect(draftFromPerson(s.persons[4]!).birthYear).toBe('');
  });
});

describe('updateMember coverage (M4 PR 10)', () => {
  it('a third argument changes the coverage; without it the coverage stays; null clears', () => {
    const root = sampleRootV3();
    const same = updateMember(root, 'p4', draft());
    if (!same.ok) throw new Error(same.error);
    expect(same.person.coverage).toEqual({ type: 'private', company: 'บริษัทตัวอย่าง' });
    const changed = updateMember(root, 'p4', draft(), { type: 'social' });
    if (!changed.ok) throw new Error(changed.error);
    expect(changed.person.coverage).toEqual({ type: 'social' });
    const cleared = updateMember(root, 'p4', draft(), null);
    if (!cleared.ok) throw new Error(cleared.error);
    expect('coverage' in cleared.person).toBe(false);
  });
});

describe('updateMember', () => {
  it('changes only the five form fields; coverage, allergies, colour, id and removedAt stay', () => {
    const root = sampleRootV3();
    const r = updateMember(root, 'p3', draft({ name: '  พ่อใหม่ ', relation: 'พ่อ', birthYear: '2496', avatar: 'avatar-07', selfManaged: true }));
    if (!r.ok) throw new Error(r.error);
    expect(rootSchema.safeParse(r.root).success).toBe(true);
    const was = root.persons[2]!;
    expect(r.person).toEqual({ ...was, name: 'พ่อใหม่', birthYearBE: 2496, avatar: 'avatar-07', selfManaged: true });
    expect(r.root.persons.map((p) => p.id)).toEqual(root.persons.map((p) => p.id));
    expect(r.root.assignments).toBe(root.assignments);
  });
  it('an empty birth year takes the year away', () => {
    const r = updateMember(sampleRootV3(), 'p2', draft({ relation: 'แม่', birthYear: '' }));
    if (!r.ok) throw new Error(r.error);
    expect(r.person).not.toHaveProperty('birthYearBE');
  });
  it('same checks as create: empty name, no relation, bad year, unknown id', () => {
    const root = sampleRootV3();
    expect(updateMember(root, 'p2', draft({ name: ' ' })).ok).toBe(false);
    expect(updateMember(root, 'p2', draft({ relation: null })).ok).toBe(false);
    expect(updateMember(root, 'p2', draft({ birthYear: '2399' })).ok).toBe(false);
    expect(updateMember(root, 'nope', draft()).ok).toBe(false);
  });
  it('a removed member cannot be edited', () => {
    const root = removeMember(sampleRootV3(), 'p2', NOW);
    expect(updateMember(root, 'p2', draft()).ok).toBe(false);
  });
  it('the same name warning leaves the person out; another person with the name warns', () => {
    const root = sampleRootV3();
    const own = updateMember(root, 'p2', draft({ name: 'สมาชิก ข', relation: 'แม่' }));
    expect(own.ok && own.duplicateName).toBe(false);
    const other = updateMember(root, 'p2', draft({ name: 'สมาชิก ค', relation: 'แม่' }));
    expect(other.ok && other.duplicateName).toBe(true);
  });
  it('"ตัวฉัน" stays allowed for the person who has it, but not for a second person', () => {
    const root = sampleRootV3(); // p1 is ตัวฉัน
    expect(updateMember(root, 'p1', draft({ name: 'ฉัน', relation: 'ตัวฉัน' })).ok).toBe(true);
    expect(updateMember(root, 'p2', draft({ relation: 'ตัวฉัน' })).ok).toBe(false);
    const gone = removeMember(root, 'p1', NOW);
    expect(updateMember(gone, 'p2', draft({ relation: 'ตัวฉัน' })).ok).toBe(true);
  });
});

describe('removeMember / restoreMember', () => {
  it('sets removedAt and touches nothing else (assignments stay)', () => {
    const root = sampleRootV3();
    const next = removeMember(root, 'p2', NOW);
    expect(next.persons.find((p) => p.id === 'p2')?.removedAt).toBe(NOW);
    expect(next.persons.filter((p) => p.removedAt !== undefined)).toHaveLength(1);
    expect(next.assignments).toBe(root.assignments);
    expect(rootSchema.safeParse(next).success).toBe(true);
  });
  it('an unknown id or one already removed changes nothing', () => {
    const root = sampleRootV3();
    expect(removeMember(root, 'nope', NOW)).toBe(root);
    const once = removeMember(root, 'p2', NOW);
    expect(removeMember(once, 'p2', '2027-01-01T00:00:00.000Z')).toBe(once);
  });
  it('restore clears removedAt', () => {
    const r = restoreMember(removeMember(sampleRootV3(), 'p2', NOW), 'p2');
    if (!r.ok) throw new Error(r.error);
    expect(r.root.persons.find((p) => p.id === 'p2')).not.toHaveProperty('removedAt');
    expect(r.person.name).toBe('สมาชิก ข');
  });
  it('restore is refused when it would make two "ตัวฉัน"', () => {
    let root: Root = removeMember(sampleRootV3(), 'p1', NOW); // the first ตัวฉัน goes
    root = { ...root, persons: root.persons.map((p) => (p.id === 'p2' ? { ...p, relation: 'ตัวฉัน' as const } : p)) };
    const r = restoreMember(root, 'p1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('ตัวฉัน');
  });
  it('restoring a member that is not removed, or unknown, is refused', () => {
    expect(restoreMember(sampleRootV3(), 'p2').ok).toBe(false);
    expect(restoreMember(sampleRootV3(), 'nope').ok).toBe(false);
  });
});

describe('buildMembersList', () => {
  it('one row per active member with age and medicine count; self-managed flag', () => {
    at('2026-11-17T03:00:00Z'); // BE 2569
    const m = buildMembersList(sampleRootV3());
    expect(m.members.map((x) => x.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(m.members[0]).toMatchObject({ name: 'สมาชิก ก', subText: 'อายุ 39 ปี · ยา 1 รายการ', selfManaged: true }); // a7 is stopped: not counted
    expect(m.members[1]?.subText).toBe('อายุ 69 ปี · ยา 2 รายการ');
    expect(m.members[1]?.selfManaged).toBe(false);
  });
  it('no birth year: the age part is left out; no medicine: "ยา 0 รายการ"', () => {
    const m = buildMembersList(sampleRootV3());
    expect(m.members.find((x) => x.id === 'p5')?.subText).toBe('ยา 0 รายการ');
  });
  it('removed members go to their own list with the Thai date, newest first', () => {
    let root = removeMember(sampleRootV3(), 'p2', '2026-10-03T03:00:00.000Z');
    root = removeMember(root, 'p3', '2026-10-20T20:00:00.000Z'); // 21 Oct in Thailand
    const m = buildMembersList(root);
    expect(m.members.map((x) => x.id)).not.toContain('p2');
    expect(m.removed.map((x) => [x.id, x.removedText])).toEqual([['p3', 'นำออกเมื่อ 21 ต.ค. 69'], ['p2', 'นำออกเมื่อ 3 ต.ค. 69']]);
  });
  it('empty house: no members, no removed', () => {
    const m = buildMembersList(blankRootV3());
    expect(m.members).toEqual([]);
    expect(m.removed).toEqual([]);
  });
});

describe('buildMemberDetail', () => {
  it('birth text, medicines (link id, name, dose line) and the allergy line', () => {
    at('2026-11-17T03:00:00Z');
    const d = buildMemberDetail(sampleRootV3(), 'p2');
    if (!d) throw new Error('missing');
    expect(d.name).toBe('สมาชิก ข');
    expect(d.birthText).toBe('พ.ศ. 2500 (อายุ 69 ปี)');
    expect(d.meds.map((x) => x.id)).toEqual(['a2', 'a5']);
    expect(d.meds[0]).toMatchObject({ name: 'ยาตัวอย่าง B 20 mg', subText: 'เช้า · 1 แคปซูล' });
    expect(d.allergyText).toBe('ยืนยันแล้วว่าไม่มีประวัติแพ้ยา (บันทึก 28 ต.ค. 69)');
  });
  it('allergy lines: unknown, listed', () => {
    const s = sampleRootV3();
    expect(buildMemberDetail(s, 'p1')?.allergyText).toBe('ยังไม่ได้บันทึกข้อมูลการแพ้ยา');
    expect(buildMemberDetail(s, 'p3')?.allergyText).toBe('แพ้ยา 1 รายการ');
    expect(buildMemberDetail(s, 'p3')?.allergyItems).toEqual([{ drug: 'ยาตัวอย่าง Z', reaction: 'ผื่นตัวอย่าง' }]);
    expect(buildMemberDetail(s, 'p1')?.allergyItems).toEqual([]);
  });
  it('coverage row text', () => {
    const s = sampleRootV3();
    expect(buildMemberDetail(s, 'p1')?.coverageText).toBe('บัตรทอง');
    expect(buildMemberDetail(s, 'p4')?.coverageText).toBe('ประกันเอกชน (บริษัทตัวอย่าง)');
    expect(buildMemberDetail(s, 'p7')?.coverageText).toBe('ยังไม่ได้ระบุ');
  });
  it('no birth year: "ยังไม่ได้ระบุ"; no medicines: empty list', () => {
    const d = buildMemberDetail(sampleRootV3(), 'p5');
    expect(d?.birthText).toBe('ยังไม่ได้ระบุ');
    expect(d?.meds).toEqual([]);
  });
  it('stopped medicines are not listed; unknown and removed members give null', () => {
    expect(buildMemberDetail(sampleRootV3(), 'p1')?.meds.map((x) => x.id)).toEqual(['a1']);
    expect(buildMemberDetail(sampleRootV3(), 'nope')).toBeNull();
    expect(buildMemberDetail(removeMember(sampleRootV3(), 'p2', NOW), 'p2')).toBeNull();
  });
});
