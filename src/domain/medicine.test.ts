import { describe, expect, it } from 'vitest';
import { addDays } from './calc';
import { clearSample, loadSample } from './actions';
import { NOW } from './fixtures';
import { assignment, dailyMeal, person, rootWith } from './helpers.test-util';
import {
  addMedicine,
  addPerson,
  adjustDose,
  editMedicine,
  findMedicationByName,
  resumeMedicine,
  stopMedicine,
  type AddMedicineInput,
  type MedicineContext,
} from './medicine';
import { emptyRoot, rootSchema, type Root, type Schedule } from './schema';
import { stockNow } from './stock';

const D18 = '2026-10-18'; // Sunday
let idCounter = 0; // one counter for the whole file, so ids never repeat between calls
const ctxOn = (today: string): MedicineContext => ({ today, nowIso: NOW, newId: () => `id${++idCounter}` });

/** Result must be ok, valid against rootSchema, and only append to the old events. */
function ok<T extends { ok: boolean }>(before: Root, res: T): Extract<T, { ok: true }> & { root: Root } {
  expect(res.ok).toBe(true);
  const root = (res as unknown as { root: Root }).root;
  expect(rootSchema.safeParse(root).success).toBe(true);
  expect(root.events.slice(0, before.events.length)).toEqual(before.events);
  expect(root.events.length).toBeGreaterThan(before.events.length);
  return res as Extract<T, { ok: true }> & { root: Root };
}
const err = (res: { ok: boolean; error?: string }): string | undefined => (res.ok ? 'ok' : res.error);

const twoPerDay = dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } });
const fourPerDay = dailyMeal({ morning: { pills: 2, meal: 'after' }, evening: { pills: 2, meal: 'after' } });
const every = (h: 8 | 12): Schedule => ({
  kind: 'interval',
  everyHours: h,
  firstTime: '08:00',
  pills: 1,
  course: { kind: 'ongoing' },
});

/** House for the hand examples: person p1, medicine m1 (unit เม็ด), assignment a1 with the given stock. */
const houseA = (schedule: Schedule = twoPerDay, stock: { qty: number; countedOn: string } | null = { qty: 20, countedOn: '2026-10-15' }): Root =>
  rootWith({
    persons: [person()],
    medications: [{ id: 'm1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด' }],
    assignments: [assignment({ schedule, stock })],
    events: [{ id: 'e0', assignmentId: 'a1', type: 'start', effectiveOn: '2026-10-15', at: NOW, to: { schedule } }],
  });
const stockOn = (r: Root, day: string) => {
  const a = r.assignments[0]!;
  return stockNow(a, day, r.events);
};

describe('example A: adjust dose rebases the stock count (O4)', () => {
  it('numbers match the hand calculation', () => {
    const before = houseA();
    expect(stockOn(before, D18)).toBe(14);
    const res = ok(before, adjustDose(before, 'a1', { schedule: fourPerDay, reason: 'หมอสั่ง' }, ctxOn(D18)));
    const a = res.root.assignments[0]!;
    expect(a.stock).toEqual({ qty: 14, countedOn: D18 });
    expect(a.schedule).toEqual(fourPerDay);
    expect([19, 20, 21, 22].map((d) => stockOn(res.root, `2026-10-${d}`))).toEqual([10, 6, 2, 0]);
    expect(stockOn(res.root, '2026-10-30')).toBe(0); // never negative
  });

  it('would be wrong (4, not 10) if the count were not rebased — guards the bug', () => {
    const a = { ...houseA().assignments[0]!, schedule: fourPerDay };
    expect(stockNow(a, '2026-10-19')).toBe(4);
  });

  it('adds one adjust event with from/to schedule, reason, effectiveOn today', () => {
    const before = houseA();
    const res = ok(before, adjustDose(before, 'a1', { schedule: fourPerDay, reason: 'หมอสั่ง', note: ' ตามนัด ' }, ctxOn(D18)));
    const e = res.root.events.at(-1)!;
    expect(e).toMatchObject({
      assignmentId: 'a1',
      type: 'adjust',
      effectiveOn: D18,
      at: NOW,
      reason: 'หมอสั่ง',
      note: 'ตามนัด',
      from: { schedule: twoPerDay },
      to: { schedule: fourPerDay },
    });
    expect(res.root.events).toHaveLength(2);
  });

  it('a medicine without a count gets no count', () => {
    const before = houseA(twoPerDay, null);
    const res = ok(before, adjustDose(before, 'a1', { schedule: fourPerDay, reason: 'อื่น ๆ' }, ctxOn(D18)));
    expect(res.root.assignments[0]!.stock).toBeNull();
  });

  it('does not change its input', () => {
    const before = houseA();
    const copy = structuredClone(before);
    adjustDose(before, 'a1', { schedule: fourPerDay, reason: 'หมอสั่ง' }, ctxOn(D18));
    expect(before).toEqual(copy);
  });
});

describe('example B: stop and resume', () => {
  const afterA = () => {
    const b = houseA();
    return ok(b, adjustDose(b, 'a1', { schedule: fourPerDay, reason: 'หมอสั่ง' }, ctxOn(D18))).root;
  };

  it('stop keeps the count of the stop day; resume restarts it, so the stopped days are not deducted', () => {
    const a = afterA();
    const stopped = ok(a, stopMedicine(a, 'a1', { reason: 'ใช้ยาไม่ได้ / ผลข้างเคียง' }, ctxOn('2026-10-19')));
    const sa = stopped.root.assignments[0]!;
    expect(sa.status).toBe('stopped');
    expect(sa.stock).toEqual({ qty: 10, countedOn: '2026-10-19' });
    expect(stockNow(sa, '2026-10-19', stopped.root.events)).toBeNull();
    expect(stopped.root.events.at(-1)).toMatchObject({ type: 'stop', effectiveOn: '2026-10-19', reason: 'ใช้ยาไม่ได้ / ผลข้างเคียง' });
    expect(stopped.root.events.at(-1)).not.toHaveProperty('from');
    expect(stopped.root.events.at(-1)).not.toHaveProperty('to');

    const back = ok(stopped.root, resumeMedicine(stopped.root, 'a1', {}, ctxOn('2026-10-25')));
    const ra = back.root.assignments[0]!;
    expect(ra.status).toBe('active');
    expect(ra.stock).toEqual({ qty: 10, countedOn: '2026-10-25' });
    expect(stockOn(back.root, '2026-10-25')).toBe(10);
    expect(stockOn(back.root, '2026-10-26')).toBe(6);
    expect(back.root.events.at(-1)).toMatchObject({ type: 'resume', effectiveOn: '2026-10-25' });
    expect(back.root.events.at(-1)).not.toHaveProperty('reason');
  });

  it('stop / resume on a medicine without a count keep it without a count', () => {
    const b = houseA(twoPerDay, null);
    const s = ok(b, stopMedicine(b, 'a1', { reason: 'หมอสั่ง' }, ctxOn(D18)));
    expect(s.root.assignments[0]!.stock).toBeNull();
    const r = ok(s.root, resumeMedicine(s.root, 'a1', { note: 'กลับมากิน' }, ctxOn('2026-10-20')));
    expect(r.root.assignments[0]!.stock).toBeNull();
    expect(r.root.events.at(-1)).toMatchObject({ type: 'resume', note: 'กลับมากิน' });
  });

  it('stop twice, resume while active, adjust while stopped are errors', () => {
    const a = afterA();
    const stopped = ok(a, stopMedicine(a, 'a1', { reason: 'หมอสั่ง' }, ctxOn(D18))).root;
    expect(err(stopMedicine(stopped, 'a1', { reason: 'หมอสั่ง' }, ctxOn(D18)))).toBe('already_stopped');
    expect(err(resumeMedicine(a, 'a1', {}, ctxOn(D18)))).toBe('not_stopped');
    expect(err(adjustDose(stopped, 'a1', { schedule: twoPerDay, reason: 'หมอสั่ง' }, ctxOn(D18)))).toBe('stopped');
  });
});

describe('example C: interval dose', () => {
  it('every 12 h -> every 8 h today keeps the count; tomorrow shows 7', () => {
    const before = houseA(every(12), { qty: 10, countedOn: D18 });
    const res = ok(before, adjustDose(before, 'a1', { schedule: every(8), reason: 'หมอสั่ง' }, ctxOn(D18)));
    expect(res.root.assignments[0]!.stock).toEqual({ qty: 10, countedOn: D18 });
    expect(stockOn(res.root, addDays(D18, 1))).toBe(7);
  });
});

describe('example D: shared medicine and renaming', () => {
  const house = () => rootWith({ persons: [person({ id: 'p1' }), person({ id: 'p2', name: 'Test Person B' })] });
  const base: Omit<AddMedicineInput, 'personId'> = { name: 'ยาตัวอย่าง ก', unit: 'เม็ด', schedule: twoPerDay };

  it('matching name (spaces, case) shares one Medication; same person twice is duplicate; other unit is unit_mismatch', () => {
    const r0 = house();
    const r1 = ok(r0, addMedicine(r0, { ...base, personId: 'p1' }, ctxOn(D18)));
    expect(r1.reusedMedication).toBe(false);
    const r2 = ok(r1.root, addMedicine(r1.root, { ...base, name: '  ยาตัวอย่าง ก ', personId: 'p2' }, ctxOn(D18)));
    expect(r2.reusedMedication).toBe(true);
    expect(r2.medicationId).toBe(r1.medicationId);
    expect(r2.root.medications).toHaveLength(1);
    expect(r2.root.assignments).toHaveLength(2);
    expect(err(addMedicine(r2.root, { ...base, unit: 'แคปซูล', personId: 'p2' }, ctxOn(D18)))).toBe('unit_mismatch');
    expect(err(addMedicine(r2.root, { ...base, unit: 'แคปซูล', personId: 'p1' }, ctxOn(D18)))).toBe('unit_mismatch');
    expect(err(addMedicine(r2.root, { ...base, personId: 'p1' }, ctxOn(D18)))).toBe('duplicate');
  });

  it('a stopped copy does not block adding the same medicine again', () => {
    const r1 = ok(house(), addMedicine(house(), { ...base, personId: 'p1' }, ctxOn(D18)));
    const s = ok(r1.root, stopMedicine(r1.root, r1.assignmentId, { reason: 'หมอสั่ง' }, ctxOn(D18)));
    ok(s.root, addMedicine(s.root, { ...base, personId: 'p1' }, ctxOn(D18)));
  });

  it('findMedicationByName ignores outer spaces and letter case', () => {
    const r = rootWith({ medications: [{ id: 'm1', name: 'Test Med A', unit: 'เม็ด' }] });
    expect(findMedicationByName(r, '  test med a ')?.id).toBe('m1');
    expect(findMedicationByName(r, 'Test Med B')).toBeUndefined();
  });

  it('add: start event, count from today, optional fields kept', () => {
    const r0 = house();
    const res = ok(
      r0,
      addMedicine(r0, { ...base, personId: 'p1', stockQty: 30, expiry: '2027-01-31', note: ' กินหลังอาหาร ' }, ctxOn(D18)),
    );
    const a = res.root.assignments[0]!;
    expect(a).toMatchObject({ status: 'active', stock: { qty: 30, countedOn: D18 }, expiry: '2027-01-31', note: 'กินหลังอาหาร', createdAt: NOW });
    expect(res.root.events).toEqual([
      { id: expect.any(String), assignmentId: a.id, type: 'start', effectiveOn: D18, at: NOW, to: { schedule: twoPerDay } },
    ]);
    const bare = ok(r0, addMedicine(r0, { ...base, personId: 'p1' }, ctxOn(D18)));
    expect(bare.root.assignments[0]!.stock).toBeNull();
    expect(bare.root.assignments[0]).not.toHaveProperty('expiry');
  });

  it('rename from member 1 renames for both, sharedWith 2, one edit event per assignment', () => {
    const r1 = ok(house(), addMedicine(house(), { ...base, personId: 'p1' }, ctxOn(D18)));
    const r2 = ok(r1.root, addMedicine(r1.root, { ...base, personId: 'p2' }, ctxOn(D18)));
    const res = ok(r2.root, editMedicine(r2.root, r1.assignmentId, { name: 'ยาตัวอย่าง ค' }, ctxOn(D18)));
    expect(res.sharedWith).toBe(2);
    expect(res.root.medications.map((m) => m.name)).toEqual(['ยาตัวอย่าง ค']);
    const edits = res.root.events.filter((e) => e.type === 'edit');
    expect(edits).toHaveLength(2);
    expect(edits.map((e) => e.assignmentId).sort()).toEqual([r1.assignmentId, r2.assignmentId].sort());
    for (const e of edits) {
      expect(e.from).toEqual({ name: 'ยาตัวอย่าง ก' });
      expect(e.to).toEqual({ name: 'ยาตัวอย่าง ค' });
    }
  });

  it('rename onto another Medication is name_taken; same name (any case) as itself is allowed', () => {
    const r1 = ok(house(), addMedicine(house(), { ...base, personId: 'p1' }, ctxOn(D18)));
    const r2 = ok(r1.root, addMedicine(r1.root, { ...base, name: 'ยาตัวอย่าง ข', personId: 'p2' }, ctxOn(D18)));
    expect(err(editMedicine(r2.root, r1.assignmentId, { name: 'ยาตัวอย่าง ข' }, ctxOn(D18)))).toBe('name_taken');
    expect(err(editMedicine(r2.root, r1.assignmentId, { name: ' ยาตัวอย่าง ข ' }, ctxOn(D18)))).toBe('name_taken');
    const lower = rootWith({ persons: [person()], medications: [{ id: 'm1', name: 'Test Med A', unit: 'เม็ด' }], assignments: [assignment({ schedule: twoPerDay })] });
    const res = ok(lower, editMedicine(lower, 'a1', { name: 'TEST MED A' }, ctxOn(D18)));
    expect(res.root.medications[0]!.name).toBe('TEST MED A');
    expect(res.sharedWith).toBe(1);
  });
});

describe('example E: sample data is never mixed with real data (O5)', () => {
  it('add person / medicine are refused while meta.isSample; fine after clearSample', () => {
    const sample = loadSample(emptyRoot(NOW), D18, NOW);
    expect(sample.meta.isSample).toBe(true);
    const med: AddMedicineInput = { personId: sample.persons[0]!.id, name: 'ยาตัวอย่าง จ', unit: 'เม็ด', schedule: twoPerDay };
    expect(err(addMedicine(sample, med, ctxOn(D18)))).toBe('sample_present');
    expect(err(addPerson(sample, { name: 'Test Person C', relation: 'ลูก', selfManaged: false }, ctxOn(D18)))).toBe('sample_present');

    const cleared = clearSample(sample);
    const p = addPerson(cleared, { name: ' Test Person C ', relation: 'ลูก', selfManaged: true }, ctxOn(D18));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(rootSchema.safeParse(p.root).success).toBe(true);
    expect(p.root.persons).toEqual([
      { id: p.personId, name: 'Test Person C', relation: 'ลูก', color: 'blue', selfManaged: true, insurance: {} },
    ]);
    const m = ok(p.root, addMedicine(p.root, { ...med, personId: p.personId }, ctxOn(D18)));
    expect(m.root.meta.isSample).toBeUndefined();
  });

  it('addPerson checks name 1..40 and relation, and rotates colours', () => {
    const r = emptyRoot(NOW);
    expect(err(addPerson(r, { name: '   ', relation: 'พ่อ', selfManaged: false }, ctxOn(D18)))).toBe('invalid_name');
    expect(err(addPerson(r, { name: 'x'.repeat(41), relation: 'พ่อ', selfManaged: false }, ctxOn(D18)))).toBe('invalid_name');
    // @ts-expect-error a relation outside the set must be refused at run time too
    expect(err(addPerson(r, { name: 'A', relation: 'เพื่อน', selfManaged: false }, ctxOn(D18)))).toBe('invalid_relation');
    let cur = r;
    const colors: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = addPerson(cur, { name: `Test ${i}`, relation: 'อื่น ๆ', selfManaged: false }, ctxOn(D18));
      if (!res.ok) throw new Error('should be ok');
      cur = res.root;
      colors.push(cur.persons.at(-1)!.color);
    }
    expect(colors).toEqual(['blue', 'green', 'yellow', 'gray', 'blue']);
    expect(cur.persons.every((p) => p.name.length >= 1)).toBe(true);
  });
});

describe('example F: wrong values', () => {
  const house = () => rootWith({ persons: [person()] });
  const add = (over: Partial<AddMedicineInput>) =>
    addMedicine(house(), { personId: 'p1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด', schedule: twoPerDay, ...over }, ctxOn(D18));

  it('quantity must be 0..9999 in steps of 0.5', () => {
    for (const q of [0.25, 10000, -1, Number.NaN, Infinity]) expect(err(add({ stockQty: q }))).toBe('invalid_qty');
    for (const q of [0, 0.5, 9999]) expect(add({ stockQty: q }).ok).toBe(true);
  });

  it('name 2..60 after trimming, unit not blank, expiry a real date, schedule passes the schema', () => {
    expect(err(add({ name: 'ก' }))).toBe('invalid_name');
    expect(err(add({ name: '  ก  ' }))).toBe('invalid_name');
    expect(err(add({ name: 'x'.repeat(61) }))).toBe('invalid_name');
    expect(add({ name: 'x'.repeat(60) }).ok).toBe(true);
    expect(err(add({ unit: '  ' }))).toBe('invalid_unit');
    expect(err(add({ expiry: '2027-02-30' }))).toBe('invalid_expiry');
    expect(err(add({ expiry: 'พรุ่งนี้' }))).toBe('invalid_expiry');
    expect(err(add({ note: '   ' }))).toBe('invalid_note');
    const tooMany = dailyMeal({ morning: { pills: 4.5, meal: 'after' } });
    const step = dailyMeal({ morning: { pills: 1.25, meal: 'after' } });
    expect(err(add({ schedule: tooMany }))).toBe('invalid_schedule');
    expect(err(add({ schedule: step }))).toBe('invalid_schedule');
  });

  it('member must exist and not be removed', () => {
    expect(err(add({ personId: 'nobody' }))).toBe('person_not_found');
    const removed = rootWith({ persons: [person({ removedAt: NOW })] });
    expect(err(addMedicine(removed, { personId: 'p1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด', schedule: twoPerDay }, ctxOn(D18)))).toBe('person_removed');
  });

  it('adjust / stop need a reason; adjust needs a different schedule; unknown ids', () => {
    const b = houseA();
    // @ts-expect-error reason missing on purpose
    expect(err(adjustDose(b, 'a1', { schedule: fourPerDay }, ctxOn(D18)))).toBe('reason_required');
    // @ts-expect-error reason outside the set on purpose
    expect(err(adjustDose(b, 'a1', { schedule: fourPerDay, reason: 'เบื่อ' }, ctxOn(D18)))).toBe('reason_required');
    // @ts-expect-error reason missing on purpose
    expect(err(stopMedicine(b, 'a1', {}, ctxOn(D18)))).toBe('reason_required');
    expect(err(adjustDose(b, 'a1', { schedule: structuredClone(twoPerDay), reason: 'หมอสั่ง' }, ctxOn(D18)))).toBe('no_change');
    expect(err(adjustDose(b, 'a1', { schedule: { kind: 'meal', slots: {}, days: { kind: 'daily' } }, reason: 'หมอสั่ง' }, ctxOn(D18)))).toBe('ok'); // empty slots pass the schema; screens must not offer it
    expect(err(adjustDose(b, 'zz', { schedule: fourPerDay, reason: 'หมอสั่ง' }, ctxOn(D18)))).toBe('assignment_not_found');
    expect(err(stopMedicine(b, 'zz', { reason: 'หมอสั่ง' }, ctxOn(D18)))).toBe('assignment_not_found');
    expect(err(resumeMedicine(b, 'zz', {}, ctxOn(D18)))).toBe('assignment_not_found');
    expect(err(editMedicine(b, 'zz', { note: 'x' }, ctxOn(D18)))).toBe('assignment_not_found');
    expect(err(stopMedicine(b, 'a1', { reason: 'หมอสั่ง', note: 'x'.repeat(201) }, ctxOn(D18)))).toBe('invalid_note');
  });

  it('no function throws on bad input and a refusal leaves the input untouched', () => {
    const b = houseA();
    const copy = structuredClone(b);
    stopMedicine(b, 'a1', { reason: 'หมอสั่ง', note: 'x'.repeat(201) }, ctxOn(D18));
    editMedicine(b, 'a1', { stockQty: 0.3 }, ctxOn(D18));
    expect(b).toEqual(copy);
  });
});

describe('editMedicine fields', () => {
  it('stockQty is a recount: base = new number, countedOn = today; event keeps what the person saw', () => {
    const b = houseA(); // 14 on 18 Oct
    const res = ok(b, editMedicine(b, 'a1', { stockQty: 30 }, ctxOn(D18)));
    expect(res.root.assignments[0]!.stock).toEqual({ qty: 30, countedOn: D18 });
    expect(res.root.events.at(-1)).toMatchObject({ type: 'edit', effectiveOn: D18, from: { stockQty: 14 }, to: { stockQty: 30 } });
    expect(res.sharedWith).toBe(1);
    expect(stockOn(res.root, '2026-10-19')).toBe(28);
  });

  it('same number as the current amount is no change; null removes the count; setting one from none works', () => {
    const b = houseA();
    expect(err(editMedicine(b, 'a1', { stockQty: 14 }, ctxOn(D18)))).toBe('no_change');
    const removed = ok(b, editMedicine(b, 'a1', { stockQty: null }, ctxOn(D18)));
    expect(removed.root.assignments[0]!.stock).toBeNull();
    expect(removed.root.events.at(-1)).toMatchObject({ from: { stockQty: 14 }, to: { stockQty: null } });
    expect(err(editMedicine(removed.root, 'a1', { stockQty: null }, ctxOn(D18)))).toBe('no_change');
    const set = ok(removed.root, editMedicine(removed.root, 'a1', { stockQty: 8 }, ctxOn(D18)));
    expect(set.root.assignments[0]!.stock).toEqual({ qty: 8, countedOn: D18 });
    expect(set.root.events.at(-1)).toMatchObject({ from: { stockQty: null }, to: { stockQty: 8 } });
  });

  it('a stopped medicine can be recounted and the count survives resume', () => {
    const b = houseA();
    const s = ok(b, stopMedicine(b, 'a1', { reason: 'หมอสั่ง' }, ctxOn(D18))).root; // frozen at 14
    const e = ok(s, editMedicine(s, 'a1', { stockQty: 20 }, ctxOn('2026-10-20')));
    expect(e.root.events.at(-1)).toMatchObject({ from: { stockQty: 14 }, to: { stockQty: 20 } });
    const r = ok(e.root, resumeMedicine(e.root, 'a1', {}, ctxOn('2026-10-22')));
    expect(r.root.assignments[0]!.stock).toEqual({ qty: 20, countedOn: '2026-10-22' });
  });

  it('expiry and note: set, change, remove; only changed fields are in the event', () => {
    const b = houseA();
    const r1 = ok(b, editMedicine(b, 'a1', { expiry: '2027-03-01', note: 'เก็บในตู้เย็น' }, ctxOn(D18)));
    expect(r1.root.assignments[0]).toMatchObject({ expiry: '2027-03-01', note: 'เก็บในตู้เย็น' });
    expect(r1.root.events.at(-1)).toMatchObject({
      from: { expiry: null, note: null },
      to: { expiry: '2027-03-01', note: 'เก็บในตู้เย็น' },
    });
    expect(Object.keys(r1.root.events.at(-1)!.from!).sort()).toEqual(['expiry', 'note']);

    const r2 = ok(r1.root, editMedicine(r1.root, 'a1', { expiry: '2027-03-01', note: 'เก็บในที่เย็น' }, ctxOn(D18)));
    expect(r2.root.events.at(-1)).toMatchObject({ from: { note: 'เก็บในตู้เย็น' }, to: { note: 'เก็บในที่เย็น' } });
    expect(Object.keys(r2.root.events.at(-1)!.from!)).toEqual(['note']);

    const r3 = ok(r2.root, editMedicine(r2.root, 'a1', { expiry: null, note: null }, ctxOn(D18)));
    expect(r3.root.assignments[0]).not.toHaveProperty('expiry');
    expect(r3.root.assignments[0]).not.toHaveProperty('note');
    expect(err(editMedicine(r3.root, 'a1', { expiry: null, note: null }, ctxOn(D18)))).toBe('no_change');
  });

  it('name + other fields together: one event on the member with all keys, name-only events on the others', () => {
    const r0 = rootWith({
      persons: [person({ id: 'p1' }), person({ id: 'p2', name: 'Test Person B' })],
      medications: [{ id: 'm1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด' }],
      assignments: [assignment({ id: 'a1', personId: 'p1', schedule: twoPerDay }), assignment({ id: 'a2', personId: 'p2', schedule: twoPerDay })],
    });
    const res = ok(r0, editMedicine(r0, 'a1', { name: 'ยาตัวอย่าง ค', expiry: '2027-05-05' }, ctxOn(D18)));
    const [e1, e2] = res.root.events;
    expect(e1).toMatchObject({ assignmentId: 'a1', from: { name: 'ยาตัวอย่าง ก', expiry: null }, to: { name: 'ยาตัวอย่าง ค', expiry: '2027-05-05' } });
    expect(e2).toMatchObject({ assignmentId: 'a2', from: { name: 'ยาตัวอย่าง ก' }, to: { name: 'ยาตัวอย่าง ค' } });
    expect(res.root.assignments[1]).not.toHaveProperty('expiry'); // other member's own data untouched
    expect(res.sharedWith).toBe(2);
  });

  it('nothing changed, or invalid values, are errors', () => {
    const b = houseA();
    expect(err(editMedicine(b, 'a1', {}, ctxOn(D18)))).toBe('no_change');
    expect(err(editMedicine(b, 'a1', { name: ' ยาตัวอย่าง ก ' }, ctxOn(D18)))).toBe('no_change');
    expect(err(editMedicine(b, 'a1', { name: 'ก' }, ctxOn(D18)))).toBe('invalid_name');
    for (const q of [0.25, 10000, -1]) expect(err(editMedicine(b, 'a1', { stockQty: q }, ctxOn(D18)))).toBe('invalid_qty');
    expect(err(editMedicine(b, 'a1', { expiry: '2027-13-01' }, ctxOn(D18)))).toBe('invalid_expiry');
    expect(err(editMedicine(b, 'a1', { note: '  ' }, ctxOn(D18)))).toBe('invalid_note');
    expect(err(editMedicine({ ...b, medications: [] }, 'a1', { note: 'x' }, ctxOn(D18)))).toBe('medication_not_found');
  });
});

describe('example G: history is append-only and the result is valid data', () => {
  it('a whole life of one medicine keeps every old event, in order', () => {
    let r = rootWith({ persons: [person()] });
    const add = ok(r, addMedicine(r, { personId: 'p1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด', schedule: twoPerDay, stockQty: 20 }, ctxOn('2026-10-15')));
    r = add.root;
    const steps: Array<(x: Root) => { ok: boolean; root?: Root }> = [
      (x) => adjustDose(x, add.assignmentId, { schedule: fourPerDay, reason: 'หมอสั่ง' }, ctxOn('2026-10-17')),
      (x) => editMedicine(x, add.assignmentId, { note: 'x' }, ctxOn('2026-10-17')),
      (x) => stopMedicine(x, add.assignmentId, { reason: 'แพ้ยา' }, ctxOn('2026-10-18')),
      (x) => resumeMedicine(x, add.assignmentId, {}, ctxOn('2026-10-20')),
    ];
    for (const step of steps) {
      const before = r;
      const res = step(r);
      expect(res.ok).toBe(true);
      r = res.root!;
      expect(rootSchema.safeParse(r).success).toBe(true);
      expect(r.events.slice(0, before.events.length)).toEqual(before.events);
      expect(r.events.length).toBe(before.events.length + 1);
    }
    expect(r.events.map((e) => e.type)).toEqual(['start', 'adjust', 'edit', 'stop', 'resume']);
    expect(new Set(r.events.map((e) => e.id)).size).toBe(5);
  });
});
