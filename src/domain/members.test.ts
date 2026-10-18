// Step 3.2c logic: add / edit / remove / restore a member, and what the members screens read. Made-up data only.
// The numbers are the owner's hand examples 1-6 (today = 2026-10-18 = พ.ศ. 2569).
import { describe, expect, it } from 'vitest';
import { summarizeRoot } from './backup';
import { careItems, memberCards, memberStock } from './care';
import { NOW } from './fixtures';
import { assignment, dailyMeal, person, rootWith } from './helpers.test-util';
import { medsByMember } from './medView';
import {
  addPerson,
  buddhistYear,
  checkBirthYear,
  editPerson,
  nextPersonColor,
  removePerson,
  restorePerson,
  type MedicineContext,
  type PersonContext,
} from './medicine';
import { findMember, memberSummary, membersInHouse, removedMembers } from './memberView';
import { rootSchema, type Root } from './schema';
import { daysLeft, stockNow } from './stock';
import { todayDoses } from './today';

const D18 = '2026-10-18'; // Sunday, พ.ศ. 2569
const LATER = '2026-10-18T20:00:00+07:00';
let n = 0;
const ctx = (today = D18, nowIso = LATER): MedicineContext => ({ today, nowIso, newId: () => `id${++n}` });
const pctx = (today = D18, nowIso = LATER): PersonContext => ({ today, nowIso });

const house = (): Root => rootWith({ persons: [person({ id: 'p1', name: 'สมาชิกทดสอบ ก' })] });
const errOf = (res: { ok: boolean; error?: string }): string => (res.ok ? 'ok' : (res.error ?? '?'));
const okRoot = (res: { ok: boolean; root?: Root }): Root => {
  expect(res.ok).toBe(true);
  expect(rootSchema.safeParse(res.root).success).toBe(true);
  return res.root as Root;
};

describe('example 1: birth year (พ.ศ.)', () => {
  it('the current Buddhist year of 2026-10-18 is 2569', () => {
    expect(buddhistYear('2026-10-18')).toBe(2569);
  });

  it.each([
    [2399, false],
    [2400, true],
    [2569, true],
    [2570, false],
    ['25a0', false],
    [2500.5, false],
    ['2500.5', false],
    ['٢٥٠٠', false],
    [' 2510 ', true],
    ['', true],
    ['   ', true],
    [null, true],
    [undefined, true],
  ])('editPerson birthYearBE %j -> %s', (value, passes) => {
    const res = editPerson(house(), 'p1', { birthYearBE: value }, pctx());
    expect(errOf(res)).toBe(passes ? 'ok' : 'invalid_birth_year');
  });

  it('empty means "not given" in checkBirthYear; a number is kept as a number', () => {
    expect(checkBirthYear('', D18)).toEqual({ ok: true, value: null });
    expect(checkBirthYear(' 2510', D18)).toEqual({ ok: true, value: 2510 });
    expect(checkBirthYear(2510, D18)).toEqual({ ok: true, value: 2510 });
  });

  it('the upper limit follows the date: on 2027-01-01 2570 passes, 2569 passes, 2571 does not', () => {
    const t = '2027-01-01';
    expect(errOf(editPerson(house(), 'p1', { birthYearBE: 2570 }, pctx(t)))).toBe('ok');
    expect(errOf(editPerson(house(), 'p1', { birthYearBE: 2569 }, pctx(t)))).toBe('ok');
    expect(errOf(editPerson(house(), 'p1', { birthYearBE: 2571 }, pctx(t)))).toBe('invalid_birth_year');
  });

  it('addPerson uses the same rule and keeps a valid year; no year = no key', () => {
    const base = { name: 'สมาชิกทดสอบ ข', relation: 'แม่', selfManaged: false } as const;
    expect(errOf(addPerson(house(), { ...base, birthYearBE: 2570 }, ctx()))).toBe('invalid_birth_year');
    expect(errOf(addPerson(house(), { ...base, birthYearBE: 2399 }, ctx()))).toBe('invalid_birth_year');
    expect(errOf(addPerson(house(), { ...base, birthYearBE: '25a0' }, ctx()))).toBe('invalid_birth_year');
    const withYear = okRoot(addPerson(house(), { ...base, birthYearBE: '2510' }, ctx()));
    expect(withYear.persons.at(-1)?.birthYearBE).toBe(2510);
    const without = okRoot(addPerson(house(), base, ctx()));
    expect('birthYearBE' in (without.persons.at(-1) ?? {})).toBe(false);
  });
});

describe('example 2: editPerson', () => {
  it('trims the name; blank is refused; 40 characters pass and 41 do not', () => {
    const r = okRoot(editPerson(house(), 'p1', { name: '  สมาชิกทดสอบ ก  ' }, pctx()));
    expect(r.persons[0]?.name).toBe('สมาชิกทดสอบ ก');
    expect(errOf(editPerson(house(), 'p1', { name: '     ' }, pctx()))).toBe('invalid_name');
    expect(errOf(editPerson(house(), 'p1', { name: '' }, pctx()))).toBe('invalid_name');
    expect(errOf(editPerson(house(), 'p1', { name: 'ก'.repeat(41) }, pctx()))).toBe('invalid_name');
    expect(okRoot(editPerson(house(), 'p1', { name: 'ก'.repeat(40) }, pctx())).persons[0]?.name).toHaveLength(40);
    expect(okRoot(editPerson(house(), 'p1', { name: ` ${'ก'.repeat(40)} ` }, pctx())).persons[0]?.name).toHaveLength(40);
  });

  it('a patch with only the colour changes nothing else (whole person compared as JSON)', () => {
    const before = rootWith({
      persons: [
        person({ id: 'p1', name: 'สมาชิกทดสอบ ก', relation: 'พ่อ', birthYearBE: 2510, selfManaged: true, insurance: { health: 'บริษัททดสอบ 1', accident: 'บริษัททดสอบ 2' } }),
      ],
    });
    const after = okRoot(editPerson(before, 'p1', { color: 'green' }, pctx()));
    const expected = { ...(before.persons[0] as object), color: 'green' };
    expect(JSON.stringify(after.persons[0])).toBe(JSON.stringify(expected));
    expect(after.persons).toHaveLength(1);
    expect(after.assignments).toEqual(before.assignments);
  });

  it('clearing the birth year (null or empty text) removes the field', () => {
    const before = rootWith({ persons: [person({ id: 'p1', birthYearBE: 2510 })] });
    for (const clear of [null, '', '  '] as const) {
      const after = okRoot(editPerson(before, 'p1', { birthYearBE: clear }, pctx()));
      expect('birthYearBE' in (after.persons[0] ?? {})).toBe(false);
      expect(after.persons[0]).toEqual(person({ id: 'p1' }));
    }
  });

  it('changes every editable field at once', () => {
    const after = okRoot(
      editPerson(
        house(),
        'p1',
        { name: 'สมาชิกทดสอบ ข', relation: 'แม่', birthYearBE: 2500, color: 'yellow', insurance: { health: ' บริษัททดสอบ 1 ', accident: 'บริษัททดสอบ 2' }, selfManaged: true },
        pctx(),
      ),
    );
    expect(after.persons[0]).toEqual({
      id: 'p1',
      name: 'สมาชิกทดสอบ ข',
      relation: 'แม่',
      birthYearBE: 2500,
      color: 'yellow',
      selfManaged: true,
      insurance: { health: 'บริษัททดสอบ 1', accident: 'บริษัททดสอบ 2' },
    });
  });

  it('relation and colour must be from the lists', () => {
    // @ts-expect-error a relation outside the list must be refused at run time too
    expect(errOf(editPerson(house(), 'p1', { relation: 'เพื่อน' }, pctx()))).toBe('invalid_relation');
    // @ts-expect-error a colour outside the list must be refused at run time too
    expect(errOf(editPerson(house(), 'p1', { color: 'red' }, pctx()))).toBe('invalid_color');
  });

  it('insurance: trimmed, up to 60 characters, blank = not given; the other box stays', () => {
    const before = rootWith({ persons: [person({ id: 'p1', insurance: { health: 'บริษัททดสอบ 1', accident: 'บริษัททดสอบ 2' } })] });
    expect(okRoot(editPerson(before, 'p1', { insurance: { health: 'x'.repeat(60) } }, pctx())).persons[0]?.insurance.health).toHaveLength(60);
    expect(errOf(editPerson(before, 'p1', { insurance: { health: 'x'.repeat(61) } }, pctx()))).toBe('invalid_insurance');
    expect(errOf(editPerson(before, 'p1', { insurance: { accident: 'x'.repeat(61) } }, pctx()))).toBe('invalid_insurance');
    const cleared = okRoot(editPerson(before, 'p1', { insurance: { health: '  ' } }, pctx()));
    expect(cleared.persons[0]?.insurance).toEqual({ accident: 'บริษัททดสอบ 2' });
    const nulled = okRoot(editPerson(before, 'p1', { insurance: { accident: null } }, pctx()));
    expect(nulled.persons[0]?.insurance).toEqual({ health: 'บริษัททดสอบ 1' });
    // a 60-character name with spaces around passes after trimming
    expect(okRoot(editPerson(before, 'p1', { insurance: { health: `  ${'x'.repeat(60)}  ` } }, pctx())).persons[0]?.insurance.health).toHaveLength(60);
  });

  it('a patch that changes nothing is ok and returns the same root', () => {
    const before = house();
    const res = editPerson(before, 'p1', { name: 'สมาชิกทดสอบ ก', selfManaged: false }, pctx());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.root).toBe(before);
    const empty = editPerson(before, 'p1', {}, pctx());
    expect(empty.ok && empty.root === before).toBe(true);
  });

  it('refuses an unknown or removed member, and never touches the other members or medicines', () => {
    const before = rootWith({
      persons: [person({ id: 'p1' }), person({ id: 'p2', name: 'สมาชิกทดสอบ ข', removedAt: NOW })],
      medications: [{ id: 'm1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด' }],
      assignments: [assignment({ personId: 'p2', schedule: dailyMeal({ morning: { pills: 1, meal: 'after' } }) })],
    });
    expect(errOf(editPerson(before, 'nope', { name: 'ใหม่' }, pctx()))).toBe('person_not_found');
    expect(errOf(editPerson(before, 'p2', { name: 'ใหม่' }, pctx()))).toBe('person_not_found');
    const after = okRoot(editPerson(before, 'p1', { name: 'ชื่อใหม่' }, pctx()));
    expect(after.persons[1]).toEqual(before.persons[1]);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.events).toEqual(before.events);
  });
});

describe('example 3: removePerson / restorePerson', () => {
  const MORNING = dailyMeal({ morning: { pills: 1, meal: 'after' } });
  const TWICE = dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } });
  // ก (p1): a1 active, a2 stopped. ข (p2): a3. ก's a1 is low (counted 20 on 15 Oct, 2 a day -> 14 today, 7 days left).
  const start = (id: string, schedule = MORNING) => ({ id: `e-${id}`, assignmentId: id, type: 'start' as const, effectiveOn: '2026-10-15', at: NOW, to: { schedule } });
  const base = (): Root =>
    rootWith({
      persons: [person({ id: 'p1', name: 'สมาชิกทดสอบ ก' }), person({ id: 'p2', name: 'สมาชิกทดสอบ ข', color: 'green' })],
      medications: [
        { id: 'm1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด' },
        { id: 'm2', name: 'ยาตัวอย่าง ข', unit: 'เม็ด' },
      ],
      assignments: [
        assignment({ id: 'a1', personId: 'p1', medicationId: 'm1', schedule: TWICE, stock: { qty: 20, countedOn: '2026-10-15' }, expiry: '2026-10-10' }),
        assignment({ id: 'a2', personId: 'p1', medicationId: 'm2', schedule: MORNING, stock: { qty: 5, countedOn: '2026-10-15' }, status: 'stopped' }),
        assignment({ id: 'a3', personId: 'p2', medicationId: 'm1', schedule: MORNING, stock: { qty: 40, countedOn: '2026-10-15' } }),
      ],
      events: [start('a1', TWICE), start('a2'), start('a3')],
    });

  it('sets removedAt only: members, assignments and events are all still there, unchanged', () => {
    const before = base();
    const after = okRoot(removePerson(before, 'p1', pctx()));
    expect(after.persons).toHaveLength(2);
    expect(after.persons[0]?.removedAt).toBe(LATER);
    expect(after.persons[0]).toEqual({ ...before.persons[0], removedAt: LATER });
    expect(after.persons[1]).toEqual(before.persons[1]);
    expect(after.assignments).toHaveLength(3);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.medications).toEqual(before.medications);
    expect(after.events).toEqual(before.events);
    expect(before.persons[0]?.removedAt).toBeUndefined(); // the old root is not mutated
  });

  it('the backup summary counts 1 member and 3 medicines', () => {
    expect(summarizeRoot(base())).toMatchObject({ members: 2, medicines: 3 });
    const after = okRoot(removePerson(base(), 'p1', pctx()));
    expect(summarizeRoot(after)).toMatchObject({ members: 1, medicines: 3 });
  });

  it('the member is gone from the list, the removed list, today, the care list and the medicine list', () => {
    const before = base();
    const after = okRoot(removePerson(before, 'p1', pctx()));
    expect(membersInHouse(after, D18).map((m) => m.person.id)).toEqual(['p2']);
    expect(removedMembers(after).map((p) => p.id)).toEqual(['p1']);
    expect(findMember(after, 'p1')).toBeUndefined();
    expect(memberCards(after, D18).map((c) => c.personId)).toEqual(['p2']);
    expect(medsByMember(after).map((m) => m.person.id)).toEqual(['p2']);
    // today's doses of the whole house: before, ก's a1 is there; after, only ข's
    expect(todayDoses(before, D18).some((d) => d.personId === 'p1')).toBe(true);
    expect(todayDoses(after, D18).some((d) => d.personId === 'p1')).toBe(false);
    expect(todayDoses(after, D18, 'p1')).toEqual([]);
    // care list: ก's expired and low medicine were on it, and are not now
    const careIds = (r: Root) => {
      const c = careItems(r, D18);
      return [...c.expired, ...c.lowStock, ...c.expirySoon].map((i) => i.id);
    };
    expect(careIds(before)).toContain('a1');
    expect(careIds(after)).not.toContain('a1');
    expect(careItems(after, D18).count).toBe(0);
  });

  it('removing twice is already_removed; an unknown member is person_not_found', () => {
    const once = okRoot(removePerson(base(), 'p1', pctx()));
    expect(errOf(removePerson(once, 'p1', pctx()))).toBe('already_removed');
    expect(errOf(removePerson(base(), 'nope', pctx()))).toBe('person_not_found');
  });

  it('restore brings the member back; the stock and the days left are the same at the same date', () => {
    const before = base();
    const a1 = (r: Root) => r.assignments.find((a) => a.id === 'a1')!;
    const numbers = (r: Root) => ({
      now: stockNow(a1(r), D18, r.events),
      left: daysLeft(a1(r), D18, r.events),
      b: stockNow(r.assignments.find((a) => a.id === 'a3')!, D18, r.events),
    });
    expect(numbers(before)).toMatchObject({ now: 14, left: { status: 'ok', days: 7 } });
    const removed = okRoot(removePerson(before, 'p1', pctx()));
    expect(numbers(removed)).toEqual(numbers(before)); // nothing about the numbers depends on being in the house
    const restored = okRoot(restorePerson(removed, 'p1', pctx()));
    expect('removedAt' in (restored.persons[0] ?? {})).toBe(false);
    expect(restored).toEqual(before); // exactly the same data as before
    expect(numbers(restored)).toEqual(numbers(before));
    expect(memberCards(restored, D18).map((c) => c.personId)).toEqual(['p1', 'p2']);
    expect(medsByMember(restored).find((m) => m.person.id === 'p1')?.active.map((a) => a.id)).toEqual(['a1']);
    expect(summarizeRoot(restored)).toMatchObject({ members: 2, medicines: 3 });
  });

  it('restore refuses a member who is not removed or not found', () => {
    expect(errOf(restorePerson(base(), 'p1', pctx()))).toBe('not_removed');
    expect(errOf(restorePerson(base(), 'nope', pctx()))).toBe('person_not_found');
  });

  it('a removed member can be edited only after being put back', () => {
    const removed = okRoot(removePerson(base(), 'p1', pctx()));
    expect(errOf(editPerson(removed, 'p1', { name: 'ใหม่' }, pctx()))).toBe('person_not_found');
  });
});

describe('example 4: the numbers on a member card', () => {
  const MORNING = dailyMeal({ morning: { pills: 1, meal: 'after' } });
  const TWICE = dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } });
  const root = (): Root =>
    rootWith({
      persons: [person({ id: 'p1' }), person({ id: 'p2', name: 'Test Person B', selfManaged: true })],
      medications: [
        { id: 'm1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด' },
        { id: 'm2', name: 'ยาตัวอย่าง ข', unit: 'เม็ด' },
      ],
      assignments: [
        assignment({ id: 'a1', personId: 'p1', medicationId: 'm1', schedule: TWICE, stock: { qty: 20, countedOn: '2026-10-15' } }),
        assignment({ id: 'a2', personId: 'p1', medicationId: 'm2', schedule: MORNING, stock: { qty: 50, countedOn: '2026-10-15' }, status: 'stopped' }),
        assignment({ id: 'a3', personId: 'p2', medicationId: 'm1', schedule: MORNING, stock: { qty: 3, countedOn: '2026-10-18' } }),
      ],
    });

  it('"ยา N รายการ" counts only the medicines that are not stopped; "ทานวันนี้" is the rows of today', () => {
    const s = memberSummary(root(), root().persons[0]!, D18);
    expect(s.medCount).toBe(1);
    expect(s.doseCount).toBe(2);
    expect(s.stock).toEqual({ status: 'low', lowCount: 1 }); // 14 left, 7 days = the border of 7
  });

  it('a member who sets out their own medicine has no rows today, but the stock is still watched', () => {
    const s = memberSummary(root(), root().persons[1]!, D18);
    expect(s.doseCount).toBe(0);
    expect(s.medCount).toBe(1);
    expect(s.stock).toEqual({ status: 'low', lowCount: 1 }); // 3 left, 3 days
  });

  it('memberStock: ok, no medicine, no count', () => {
    const r = rootWith({
      persons: [person({ id: 'p1' }), person({ id: 'p2' }), person({ id: 'p3' })],
      medications: [{ id: 'm1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด' }],
      assignments: [
        assignment({ id: 'a1', personId: 'p1', schedule: MORNING, stock: { qty: 100, countedOn: '2026-10-18' } }),
        assignment({ id: 'a2', personId: 'p2', schedule: MORNING, stock: null }),
      ],
    });
    expect(memberStock(r, 'p1', D18)).toEqual({ status: 'ok' });
    expect(memberStock(r, 'p2', D18)).toEqual({ status: 'noStock' });
    expect(memberStock(r, 'p3', D18)).toEqual({ status: 'noMeds' });
  });
});

describe('example 5: the colour of a new member', () => {
  const add = (r: Root, color?: 'blue' | 'green' | 'yellow' | 'gray') =>
    okRoot(addPerson(r, { name: 'สมาชิกทดสอบ ก', relation: 'อื่น ๆ', selfManaged: false, ...(color ? { color } : {}) }, ctx()));

  it('a house that uses blue gives green next; all four used starts again from blue', () => {
    const blueOnly = rootWith({ persons: [person({ id: 'p1', color: 'blue' })] });
    expect(nextPersonColor(blueOnly)).toBe('green');
    expect(add(blueOnly).persons.at(-1)?.color).toBe('green');
    const all = rootWith({
      persons: [
        person({ id: 'p1', color: 'blue' }),
        person({ id: 'p2', color: 'green' }),
        person({ id: 'p3', color: 'yellow' }),
        person({ id: 'p4', color: 'gray' }),
      ],
    });
    expect(nextPersonColor(all)).toBe('blue');
    expect(add(all).persons.at(-1)?.color).toBe('blue');
  });

  it('takes the first colour nobody uses, not just the next in line; a removed member does not use a colour', () => {
    const gap = rootWith({ persons: [person({ id: 'p1', color: 'green' })] });
    expect(nextPersonColor(gap)).toBe('blue');
    const removedBlue = rootWith({ persons: [person({ id: 'p1', color: 'blue', removedAt: NOW })] });
    expect(nextPersonColor(removedBlue)).toBe('blue');
  });

  it('a colour that is given is used, a wrong one is refused', () => {
    expect(add(house(), 'gray').persons.at(-1)?.color).toBe('gray');
    // @ts-expect-error a colour outside the list must be refused at run time too
    expect(errOf(addPerson(house(), { name: 'ก', relation: 'อื่น ๆ', selfManaged: false, color: 'red' }, ctx()))).toBe('invalid_color');
  });

  it('addPerson takes the insurance boxes with the same rule as editPerson', () => {
    const r = okRoot(
      addPerson(house(), { name: 'ก', relation: 'ลูก', selfManaged: false, insurance: { health: ' บริษัททดสอบ 1 ', accident: '' } }, ctx()),
    );
    expect(r.persons.at(-1)?.insurance).toEqual({ health: 'บริษัททดสอบ 1' });
    expect(errOf(addPerson(house(), { name: 'ก', relation: 'ลูก', selfManaged: false, insurance: { accident: 'x'.repeat(61) } }, ctx()))).toBe(
      'invalid_insurance',
    );
  });

  it('the old behaviour of addPerson is kept (name 1..40, relation, insurance {} and no birth year)', () => {
    const r = okRoot(addPerson(rootWith({}), { name: ' Test Person C ', relation: 'ลูก', selfManaged: true }, ctx()));
    expect(r.persons).toEqual([{ id: r.persons[0]?.id, name: 'Test Person C', relation: 'ลูก', color: 'blue', selfManaged: true, insurance: {} }]);
  });
});

describe('example 6: sample data is never changed by the member functions', () => {
  const sample = (): Root => rootWith({ persons: [person({ id: 'p1' }), person({ id: 'p2', removedAt: NOW })], meta: { createdAt: NOW, isSample: true } });

  it('edit, remove and restore are refused with sample_present and nothing changes', () => {
    const before = sample();
    const snapshot = JSON.stringify(before);
    expect(errOf(editPerson(before, 'p1', { name: 'ใหม่' }, pctx()))).toBe('sample_present');
    expect(errOf(removePerson(before, 'p1', pctx()))).toBe('sample_present');
    expect(errOf(restorePerson(before, 'p2', pctx()))).toBe('sample_present');
    expect(errOf(addPerson(before, { name: 'ก', relation: 'ลูก', selfManaged: false }, ctx()))).toBe('sample_present');
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('sample_present comes before the other checks', () => {
    expect(errOf(editPerson(sample(), 'nope', { name: '' }, pctx()))).toBe('sample_present');
  });
});
