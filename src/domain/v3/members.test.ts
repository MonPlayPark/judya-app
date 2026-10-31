import { afterEach, describe, expect, it, vi } from 'vitest';
import { blankRootV3 } from './fixtures';
import { medsDemoRoot } from './medsListDemo';
import { createMember, defaultSelfManaged, draftState, emptyDraft, hasSelf, isDuplicateName, nextColor, parseBirthYear, type MemberDraft } from './members';
import { PERSON_COLORS, maxBirthYearBE, rootSchema, type Person, type Root } from './schema';
import { loadRoot, saveRoot, type KeyValueStore } from './storage';

const draft = (d: Partial<MemberDraft> = {}): MemberDraft => ({ ...emptyDraft(), name: 'คุณยาย', relation: 'ญาติ', ...d });
const ids = (...list: string[]) => {
  let i = 0;
  return () => list[i++] ?? `x${i}`;
};
const person = (id: string, color: Person['color'], extra: Partial<Person> = {}): Person => ({
  id, name: `สมาชิก ${id}`, relation: 'ญาติ', avatar: 'avatar-01', color, selfManaged: false, allergies: { status: 'unknown' }, ...extra,
});
const withPersons = (persons: Person[]): Root => ({ ...blankRootV3(), persons });

afterEach(() => vi.useRealTimers());

describe('createMember', () => {
  it('adds a valid member to an empty house (a new user) and the result passes rootSchema', () => {
    const r = createMember(blankRootV3(), draft({ birthYear: '2503', selfManaged: true }), ids('m1'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(rootSchema.safeParse(r.root).success).toBe(true);
    expect(r.person).toEqual({
      id: 'm1', name: 'คุณยาย', relation: 'ญาติ', birthYearBE: 2503, avatar: 'avatar-01', color: 'blue', selfManaged: true, allergies: { status: 'unknown' },
    });
    expect(r.person).not.toHaveProperty('coverage');
    expect(r.root.persons).toHaveLength(1);
  });
  it('trims the name, leaves the birth year out when empty, keeps the other members and the rest of the root', () => {
    const base = medsDemoRoot('normal');
    const r = createMember(base, draft({ name: '  คุณป้า  ' }), ids('new1'));
    if (!r.ok) throw new Error(r.error);
    expect(r.person.name).toBe('คุณป้า');
    expect(r.person).not.toHaveProperty('birthYearBE');
    expect(r.root.persons.slice(0, 2)).toEqual(base.persons);
    expect(r.root.assignments).toBe(base.assignments);
  });
  it('makes a fresh id with the default generator', () => {
    const a = createMember(blankRootV3(), draft());
    const b = createMember(blankRootV3(), draft());
    if (!a.ok || !b.ok) throw new Error('should be ok');
    expect(a.person.id).toMatch(/^[0-9a-z]{12}$/);
    expect(a.person.id).not.toBe(b.person.id);
  });
  it('refuses an empty / too long name, no relation and a bad birth year', () => {
    expect(createMember(blankRootV3(), draft({ name: '   ' })).ok).toBe(false);
    expect(createMember(blankRootV3(), draft({ name: 'ก'.repeat(41) })).ok).toBe(false);
    expect(createMember(blankRootV3(), draft({ name: 'ก'.repeat(40) })).ok).toBe(true);
    expect(createMember(blankRootV3(), draft({ relation: null })).ok).toBe(false);
    expect(createMember(blankRootV3(), draft({ birthYear: '2399' })).ok).toBe(false);
  });
  it('refuses a second active "ตัวฉัน" but allows it when the first one was taken out', () => {
    const one = createMember(blankRootV3(), draft({ name: 'ฉัน', relation: 'ตัวฉัน' }), ids('s1'));
    if (!one.ok) throw new Error(one.error);
    const second = createMember(one.root, draft({ name: 'อีกคน', relation: 'ตัวฉัน' }));
    expect(second.ok).toBe(false);
    const gone: Root = { ...one.root, persons: one.root.persons.map((p) => ({ ...p, removedAt: '2026-10-01T09:00:00+07:00' })) };
    expect(createMember(gone, draft({ name: 'อีกคน', relation: 'ตัวฉัน' })).ok).toBe(true);
  });
  it('a duplicate name only warns: it is added and flagged', () => {
    const base = withPersons([person('a', 'blue', { name: 'คุณแม่' })]);
    const r = createMember(base, draft({ name: ' คุณ แม่ ' }), ids('d1'));
    expect(r.ok && r.duplicateName).toBe(true);
    expect(r.ok && r.root.persons).toHaveLength(2);
    const fresh = createMember(base, draft({ name: 'คุณพ่อ' }));
    expect(fresh.ok && fresh.duplicateName).toBe(false);
  });
  it('can be written by saveRoot and read back', () => {
    const data = new Map<string, string>();
    const store: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
    const r = createMember(blankRootV3(), draft(), ids('m1'));
    if (!r.ok) throw new Error(r.error);
    expect(saveRoot(r.root, store).ok).toBe(true);
    const back = loadRoot(store);
    expect(back.status === 'ok' && back.root.persons[0]?.name).toBe('คุณยาย');
    expect([...data.keys()]).toEqual(['judya.v3']);
  });
});

describe('nextColor', () => {
  it('takes the first colour nobody uses, in the order of PERSON_COLORS', () => {
    expect(nextColor([])).toBe('blue');
    expect(nextColor([person('a', 'blue')])).toBe('green');
    expect(nextColor([person('a', 'blue'), person('b', 'yellow')])).toBe('green');
    expect(nextColor([person('a', 'green')])).toBe('blue');
  });
  it('starts again from the top when all four are used (member count modulo 4)', () => {
    const four = PERSON_COLORS.map((c, i) => person(`p${i}`, c));
    expect(nextColor(four)).toBe('blue');
    expect(nextColor([...four, person('p5', 'blue')])).toBe('green');
  });
  it('ignores members that were taken out', () => {
    expect(nextColor([person('a', 'blue', { removedAt: '2026-10-01T09:00:00+07:00' })])).toBe('blue');
  });
});

describe('parseBirthYear', () => {
  it('empty is fine; 4 digits between 2400 and this Buddhist year are fine and give the age', () => {
    expect(parseBirthYear('')).toEqual({ kind: 'empty' });
    expect(parseBirthYear('  ')).toEqual({ kind: 'empty' });
    const max = maxBirthYearBE();
    expect(parseBirthYear('2400')).toEqual({ kind: 'ok', year: 2400, age: max - 2400 });
    expect(parseBirthYear(String(max))).toEqual({ kind: 'ok', year: max, age: 0 });
    expect(parseBirthYear('2503')).toMatchObject({ kind: 'ok', age: max - 2503 });
  });
  it('rejects 2399, next year, other lengths and non-digits', () => {
    const max = maxBirthYearBE();
    for (const bad of ['2399', String(max + 1), '250', '25030', '25a3', '-2503', '2503.5', '๒๕๐๓']) expect(parseBirthYear(bad).kind).toBe('bad');
  });
  it('follows the clock the same way personSchema does', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-03-01T00:00:00Z'));
    expect(maxBirthYearBE()).toBe(2570);
    expect(parseBirthYear('2570')).toMatchObject({ kind: 'ok', age: 0 });
    expect(parseBirthYear('2571').kind).toBe('bad');
    const r = createMember(blankRootV3(), draft({ birthYear: '2570' }));
    expect(r.ok).toBe(true);
    expect(createMember(blankRootV3(), draft({ birthYear: '2571' })).ok).toBe(false);
  });
});

describe('draftState', () => {
  const none: Person[] = [];
  it('gives the reason in the order: both missing, name, relation, birth year; null when ready', () => {
    expect(draftState(emptyDraft(), none).blocker).toBe('พิมพ์ชื่อและเลือกความสัมพันธ์ก่อน');
    expect(draftState({ ...emptyDraft(), relation: 'แม่' }, none).blocker).toBe('พิมพ์ชื่อก่อน');
    expect(draftState({ ...emptyDraft(), name: 'ก' }, none).blocker).toBe('เลือกความสัมพันธ์ก่อน');
    expect(draftState(draft({ birthYear: '12' }), none).blocker).toBe('แก้ปีเกิดให้ถูกต้องก่อน');
    expect(draftState(draft(), none).blocker).toBeNull();
    expect(draftState(draft({ birthYear: '2503' }), none).blocker).toBeNull();
  });
  it('"ตัวฉัน" does not count as chosen when one already exists', () => {
    const s = draftState(draft({ relation: 'ตัวฉัน' }), [person('a', 'blue', { relation: 'ตัวฉัน' })]);
    expect(s.relationOk).toBe(false);
    expect(s.blocker).toBe('เลือกความสัมพันธ์ก่อน');
  });
});

describe('small helpers', () => {
  it('hasSelf only counts active members', () => {
    expect(hasSelf([person('a', 'blue', { relation: 'ตัวฉัน' })])).toBe(true);
    expect(hasSelf([person('a', 'blue', { relation: 'ตัวฉัน', removedAt: '2026-10-01T09:00:00+07:00' })])).toBe(false);
  });
  it('isDuplicateName ignores case and spaces', () => {
    const list = [person('a', 'blue', { name: 'Anna Bee' })];
    expect(isDuplicateName(list, ' annabee ')).toBe(true);
    expect(isDuplicateName(list, 'Anna')).toBe(false);
    expect(isDuplicateName(list, '   ')).toBe(false);
  });
  it('the self-managed default is on only for "ตัวฉัน"', () => {
    expect(defaultSelfManaged('ตัวฉัน')).toBe(true);
    expect(defaultSelfManaged('แม่')).toBe(false);
    expect(defaultSelfManaged(null)).toBe(false);
  });
});
