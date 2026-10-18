// Changing medicine data (step 3.2b-1): add a member / medicine, adjust dose, stop, resume, edit.
// Pure functions, Root -> result. No storage, no clock, no UI: `today`, `nowIso` and the id maker come in
// through `MedicineContext` so tests can fix them. Wrong user input never throws; it comes back as
// `{ ok: false, error: <short English code> }` (the Thai text is the screen's job, step 3.2b-2).
// Events are only ever appended. Every ok result has been checked with `rootSchema`.
import { z } from 'zod';
import type { IsoDate } from './calc';
import {
  EVENT_REASONS,
  PERSON_COLORS,
  RELATIONS,
  rootSchema,
  scheduleSchema,
  type Assignment,
  type MedEvent,
  type Medication,
  type Person,
  type Root,
  type Schedule,
  type Snapshot,
} from './schema';
import { stockNow } from './stock';

export type MedicineContext = {
  today: IsoDate;
  nowIso: string;
  newId: () => string;
};

export type EventReason = (typeof EVENT_REASONS)[number];
export type Relation = (typeof RELATIONS)[number];

type Fail<E extends string> = { ok: false; error: E };
const fail = <E extends string>(error: E): Fail<E> => ({ ok: false, error });

export type AddPersonError =
  | 'sample_present'
  | 'invalid_name'
  | 'invalid_relation'
  | 'invalid_color'
  | 'invalid_birth_year'
  | 'invalid_insurance'
  | 'invalid_data';
export type EditPersonError =
  | 'sample_present'
  | 'person_not_found'
  | 'invalid_name'
  | 'invalid_relation'
  | 'invalid_color'
  | 'invalid_birth_year'
  | 'invalid_insurance'
  | 'invalid_data';
export type RemovePersonError = 'sample_present' | 'person_not_found' | 'already_removed' | 'invalid_data';
export type RestorePersonError = 'sample_present' | 'person_not_found' | 'not_removed' | 'invalid_data';
export type AddMedicineError =
  | 'sample_present'
  | 'person_not_found'
  | 'person_removed'
  | 'invalid_name'
  | 'invalid_unit'
  | 'invalid_schedule'
  | 'invalid_qty'
  | 'invalid_expiry'
  | 'invalid_note'
  | 'unit_mismatch'
  | 'duplicate'
  | 'invalid_data';
export type AdjustDoseError =
  | 'assignment_not_found'
  | 'stopped'
  | 'reason_required'
  | 'invalid_note'
  | 'invalid_schedule'
  | 'no_change'
  | 'invalid_data';
export type StopMedicineError =
  | 'assignment_not_found'
  | 'already_stopped'
  | 'reason_required'
  | 'invalid_note'
  | 'invalid_data';
export type ResumeMedicineError = 'assignment_not_found' | 'not_stopped' | 'invalid_note' | 'invalid_data';
export type EditMedicineError =
  | 'assignment_not_found'
  | 'medication_not_found'
  | 'invalid_name'
  | 'invalid_qty'
  | 'invalid_expiry'
  | 'invalid_note'
  | 'name_taken'
  | 'no_change'
  | 'invalid_data';

// ---------- small helpers ----------

const normName = (s: string): string => s.trim().toLowerCase();

/** Same Medication if the names match ignoring spaces at both ends and letter case (Q6). */
export const findMedicationByName = (root: Root, name: string): Medication | undefined => {
  const key = normName(name);
  return root.medications.find((m) => normName(m.name) === key);
};

/** Trimmed name when it is 2..60 characters (the schema limit), else null. */
const cleanMedName = (raw: string): string | null => {
  const n = raw.trim();
  return n.length >= 2 && n.length <= 60 ? n : null;
};

const validQty = (n: number): boolean => Number.isFinite(n) && n >= 0 && n <= 9999 && Number.isInteger(n * 2);
const validDate = (s: string): boolean => z.iso.date().safeParse(s).success;
const isReason = (r: unknown): r is EventReason => EVENT_REASONS.some((x) => x === r);

/** JSON copy, so a parsed value holds nothing but plain data (no explicit `undefined` keys). */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => k in b && sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Optional free text of an event (max 200). Blank = no note. null = too long. */
const eventNote = (note: string | undefined): { note?: string } | null => {
  const n = note?.trim();
  if (!n) return {};
  return n.length <= 200 ? { note: n } : null;
};

const event = (ctx: MedicineContext, assignmentId: string, type: MedEvent['type'], extra: Partial<MedEvent> = {}): MedEvent => ({
  id: ctx.newId(),
  assignmentId,
  type,
  effectiveOn: ctx.today,
  at: ctx.nowIso,
  ...extra,
});

/** Last safety net: the new root must pass the schema, else nothing is returned as ok. */
const checked = (root: Root): { ok: true; root: Root } | Fail<'invalid_data'> =>
  rootSchema.safeParse(root).success ? { ok: true, root } : fail('invalid_data');

const replaceAssignment = (root: Root, next: Assignment): Assignment[] =>
  root.assignments.map((a) => (a.id === next.id ? next : a));

/** The amount the person sees today: stockNow while active, the frozen count while stopped, null without a count. */
const qtyToday = (root: Root, a: Assignment, today: IsoDate): number | null => {
  if (!a.stock) return null;
  return a.status === 'stopped' ? a.stock.qty : (stockNow(a, today, root.events) ?? a.stock.qty);
};

/** O4: the count becomes today's number, so the new dose only applies from today on. */
const rebased = (root: Root, a: Assignment, today: IsoDate): Assignment['stock'] => {
  const qty = qtyToday(root, a, today);
  return qty === null ? null : { qty, countedOn: today };
};

// ---------- members: addPerson, editPerson, removePerson, restorePerson ----------

export type PersonColor = Person['color'];
/** What the member functions need from the clock. `MedicineContext` fits, so addPerson keeps its context. */
export type PersonContext = Pick<MedicineContext, 'today' | 'nowIso'>;

export const MIN_BIRTH_YEAR_BE = 2400;
export const INSURANCE_MAX = 60;

/** Buddhist-era year of a 'YYYY-MM-DD' date (Gregorian year + 543). */
export const buddhistYear = (today: IsoDate): number => Number(today.slice(0, 4)) + 543;

/** Birth year (พ.ศ.). Empty / null / undefined = not given (value null). Otherwise 4 digits, 2400 .. this Buddhist year.
 * Accepts a number or what was typed; "25a0", 2500.5 and 2570 (in 2569) are refused. */
export function checkBirthYear(raw: number | string | null | undefined, today: IsoDate): { ok: true; value: number | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  let n: number;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t === '') return { ok: true, value: null };
    if (!/^\d{4}$/.test(t)) return { ok: false };
    n = Number(t);
  } else {
    n = raw;
  }
  return Number.isInteger(n) && n >= MIN_BIRTH_YEAR_BE && n <= buddhistYear(today) ? { ok: true, value: n } : { ok: false };
}

/** Insurance company name: trimmed, up to 60 characters; blank / null = not given (value null). */
export function checkInsurance(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const t = raw.trim();
  if (t === '') return { ok: true, value: null };
  return t.length <= INSURANCE_MAX ? { ok: true, value: t } : { ok: false };
}

const isColor = (c: unknown): c is PersonColor => PERSON_COLORS.some((x) => x === c);
const isRelation = (r: unknown): r is Relation => RELATIONS.some((x) => x === r);

/** The colour a new member gets: the first one nobody in the house uses; when all four are used, it starts over from the first.
 * Members who were taken out of the house do not count. */
export function nextPersonColor(root: Root): PersonColor {
  const inHouse = root.persons.filter((p) => p.removedAt === undefined);
  const free = PERSON_COLORS.find((c) => !inHouse.some((p) => p.color === c));
  return free ?? PERSON_COLORS[inHouse.length % PERSON_COLORS.length] ?? 'blue';
}

export type AddPersonInput = {
  name: string;
  relation: Relation;
  selfManaged: boolean;
  /** Left out / empty = not given. */
  birthYearBE?: number | string | null;
  /** Left out = the next colour nobody uses (nextPersonColor). */
  color?: PersonColor;
  insurance?: { health?: string | null; accident?: string | null };
};

export function addPerson(
  root: Root,
  input: AddPersonInput,
  ctx: MedicineContext,
): { ok: true; root: Root; personId: string } | Fail<AddPersonError> {
  if (root.meta.isSample) return fail('sample_present'); // O5: the screen asks the owner to clear the sample first
  const name = input.name.trim();
  if (name.length < 1 || name.length > 40) return fail('invalid_name');
  if (!isRelation(input.relation)) return fail('invalid_relation');
  if (input.color !== undefined && !isColor(input.color)) return fail('invalid_color');
  const year = checkBirthYear(input.birthYearBE, ctx.today);
  if (!year.ok) return fail('invalid_birth_year');
  const health = checkInsurance(input.insurance?.health);
  const accident = checkInsurance(input.insurance?.accident);
  if (!health.ok || !accident.ok) return fail('invalid_insurance');
  const person: Person = {
    id: ctx.newId(),
    name,
    relation: input.relation,
    ...(year.value === null ? {} : { birthYearBE: year.value }),
    color: input.color ?? nextPersonColor(root),
    selfManaged: input.selfManaged === true,
    insurance: {
      ...(health.value === null ? {} : { health: health.value }),
      ...(accident.value === null ? {} : { accident: accident.value }),
    },
  };
  const res = checked({ ...root, persons: [...root.persons, person] });
  return res.ok ? { ok: true, root: res.root, personId: person.id } : res;
}

/** A field left out (undefined) is not touched. null (or blank text) clears birth year and insurance. */
export type EditPersonPatch = {
  name?: string;
  relation?: Relation;
  birthYearBE?: number | string | null;
  color?: PersonColor;
  insurance?: { health?: string | null; accident?: string | null };
  selfManaged?: boolean;
};

/** Changes a member who is still in the house. Nothing but the fields in `patch` changes. A patch that changes
 * nothing is ok and returns the same root. Members and medicines are never added or removed here. */
export function editPerson(
  root: Root,
  personId: string,
  patch: EditPersonPatch,
  ctx: PersonContext,
): { ok: true; root: Root } | Fail<EditPersonError> {
  if (root.meta.isSample) return fail('sample_present');
  const current = root.persons.find((p) => p.id === personId);
  if (!current || current.removedAt !== undefined) return fail('person_not_found');

  let next: Person = { ...current, insurance: { ...current.insurance } };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 1 || name.length > 40) return fail('invalid_name');
    next = { ...next, name };
  }
  if (patch.relation !== undefined) {
    if (!isRelation(patch.relation)) return fail('invalid_relation');
    next = { ...next, relation: patch.relation };
  }
  if (patch.color !== undefined) {
    if (!isColor(patch.color)) return fail('invalid_color');
    next = { ...next, color: patch.color };
  }
  if (patch.birthYearBE !== undefined) {
    const year = checkBirthYear(patch.birthYearBE, ctx.today);
    if (!year.ok) return fail('invalid_birth_year');
    const { birthYearBE: _old, ...rest } = next;
    next = year.value === null ? rest : { ...rest, birthYearBE: year.value };
  }
  for (const field of ['health', 'accident'] as const) {
    const raw = patch.insurance?.[field];
    if (raw === undefined) continue;
    const value = checkInsurance(raw);
    if (!value.ok) return fail('invalid_insurance');
    const { [field]: _old, ...rest } = next.insurance;
    next = { ...next, insurance: value.value === null ? rest : { ...rest, [field]: value.value } };
  }
  if (patch.selfManaged !== undefined) next = { ...next, selfManaged: patch.selfManaged === true };

  if (sameJson(next, current)) return { ok: true, root };
  return checked({ ...root, persons: root.persons.map((p) => (p.id === personId ? next : p)) });
}

/** Takes a member out of the house: only `removedAt` is set. The member, the medicines and the history stay (append-only),
 * so putting the member back brings everything back with the same numbers. */
export function removePerson(root: Root, personId: string, ctx: PersonContext): { ok: true; root: Root } | Fail<RemovePersonError> {
  if (root.meta.isSample) return fail('sample_present');
  const current = root.persons.find((p) => p.id === personId);
  if (!current) return fail('person_not_found');
  if (current.removedAt !== undefined) return fail('already_removed');
  return checked({ ...root, persons: root.persons.map((p) => (p.id === personId ? { ...p, removedAt: ctx.nowIso } : p)) });
}

/** Puts a removed member back (deletes `removedAt`). */
export function restorePerson(root: Root, personId: string, _ctx: PersonContext): { ok: true; root: Root } | Fail<RestorePersonError> {
  if (root.meta.isSample) return fail('sample_present');
  const current = root.persons.find((p) => p.id === personId);
  if (!current) return fail('person_not_found');
  if (current.removedAt === undefined) return fail('not_removed');
  const { removedAt: _removed, ...rest } = current;
  return checked({ ...root, persons: root.persons.map((p) => (p.id === personId ? rest : p)) });
}

// ---------- addMedicine ----------

export type AddMedicineInput = {
  personId: string;
  name: string;
  unit: string;
  schedule: Schedule;
  stockQty?: number;
  expiry?: string;
  note?: string;
};

export function addMedicine(
  root: Root,
  input: AddMedicineInput,
  ctx: MedicineContext,
): { ok: true; root: Root; assignmentId: string; medicationId: string; reusedMedication: boolean } | Fail<AddMedicineError> {
  if (root.meta.isSample) return fail('sample_present'); // O5
  const person = root.persons.find((p) => p.id === input.personId);
  if (!person) return fail('person_not_found');
  if (person.removedAt !== undefined) return fail('person_removed');
  const name = cleanMedName(input.name);
  if (name === null) return fail('invalid_name');
  const unit = input.unit.trim();
  if (unit.length < 1) return fail('invalid_unit');
  const parsed = scheduleSchema.safeParse(input.schedule);
  if (!parsed.success) return fail('invalid_schedule');
  const schedule = plain(parsed.data);
  if (input.stockQty !== undefined && !validQty(input.stockQty)) return fail('invalid_qty');
  if (input.expiry !== undefined && !validDate(input.expiry)) return fail('invalid_expiry');
  const note = input.note?.trim();
  if (input.note !== undefined && !note) return fail('invalid_note');

  const existing = findMedicationByName(root, name);
  if (existing && existing.unit !== unit) return fail('unit_mismatch');
  if (existing && root.assignments.some((a) => a.personId === person.id && a.medicationId === existing.id && a.status === 'active')) {
    return fail('duplicate');
  }

  const medication: Medication = existing ?? { id: ctx.newId(), name, unit };
  const assignment: Assignment = {
    id: ctx.newId(),
    medicationId: medication.id,
    personId: person.id,
    schedule,
    stock: input.stockQty === undefined ? null : { qty: input.stockQty, countedOn: ctx.today },
    ...(input.expiry === undefined ? {} : { expiry: input.expiry }),
    ...(note ? { note } : {}),
    status: 'active',
    createdAt: ctx.nowIso,
  };
  const res = checked({
    ...root,
    medications: existing ? root.medications : [...root.medications, medication],
    assignments: [...root.assignments, assignment],
    events: [...root.events, event(ctx, assignment.id, 'start', { to: { schedule } })],
  });
  return res.ok
    ? { ok: true, root: res.root, assignmentId: assignment.id, medicationId: medication.id, reusedMedication: existing !== undefined }
    : res;
}

// ---------- adjustDose ----------

export function adjustDose(
  root: Root,
  assignmentId: string,
  input: { schedule: Schedule; reason: EventReason; note?: string },
  ctx: MedicineContext,
): { ok: true; root: Root } | Fail<AdjustDoseError> {
  const a = root.assignments.find((x) => x.id === assignmentId);
  if (!a) return fail('assignment_not_found');
  if (a.status === 'stopped') return fail('stopped');
  if (!isReason(input.reason)) return fail('reason_required');
  const note = eventNote(input.note);
  if (!note) return fail('invalid_note');
  const parsed = scheduleSchema.safeParse(input.schedule);
  if (!parsed.success) return fail('invalid_schedule');
  const schedule = plain(parsed.data);
  if (sameJson(schedule, a.schedule)) return fail('no_change');

  const next: Assignment = { ...a, schedule, stock: rebased(root, a, ctx.today) };
  return checked({
    ...root,
    assignments: replaceAssignment(root, next),
    events: [
      ...root.events,
      event(ctx, a.id, 'adjust', { from: { schedule: a.schedule }, to: { schedule }, reason: input.reason, ...note }),
    ],
  });
}

// ---------- stopMedicine ----------

export function stopMedicine(
  root: Root,
  assignmentId: string,
  input: { reason: EventReason; note?: string },
  ctx: MedicineContext,
): { ok: true; root: Root } | Fail<StopMedicineError> {
  const a = root.assignments.find((x) => x.id === assignmentId);
  if (!a) return fail('assignment_not_found');
  if (a.status === 'stopped') return fail('already_stopped');
  if (!isReason(input.reason)) return fail('reason_required');
  const note = eventNote(input.note);
  if (!note) return fail('invalid_note');

  const next: Assignment = { ...a, status: 'stopped', stock: rebased(root, a, ctx.today) };
  return checked({
    ...root,
    assignments: replaceAssignment(root, next),
    events: [...root.events, event(ctx, a.id, 'stop', { reason: input.reason, ...note })],
  });
}

// ---------- resumeMedicine ----------

export function resumeMedicine(
  root: Root,
  assignmentId: string,
  input: { note?: string },
  ctx: MedicineContext,
): { ok: true; root: Root } | Fail<ResumeMedicineError> {
  const a = root.assignments.find((x) => x.id === assignmentId);
  if (!a) return fail('assignment_not_found');
  if (a.status !== 'stopped') return fail('not_stopped');
  const note = eventNote(input.note);
  if (!note) return fail('invalid_note');

  // The kept count starts again today, so the days it was stopped are not deducted.
  const next: Assignment = { ...a, status: 'active', stock: a.stock ? { qty: a.stock.qty, countedOn: ctx.today } : null };
  return checked({
    ...root,
    assignments: replaceAssignment(root, next),
    events: [...root.events, event(ctx, a.id, 'resume', note)],
  });
}

// ---------- editMedicine ----------

/** A field left out (undefined) is not touched; null removes the value (not allowed for name). */
export type EditMedicinePatch = {
  name?: string;
  stockQty?: number | null;
  expiry?: string | null;
  note?: string | null;
};

export function editMedicine(
  root: Root,
  assignmentId: string,
  patch: EditMedicinePatch,
  ctx: MedicineContext,
): { ok: true; root: Root; sharedWith: number } | Fail<EditMedicineError> {
  const a = root.assignments.find((x) => x.id === assignmentId);
  if (!a) return fail('assignment_not_found');
  const med = root.medications.find((m) => m.id === a.medicationId);
  if (!med) return fail('medication_not_found');

  const from: Snapshot = {};
  const to: Snapshot = {};
  let next: Assignment = a;
  let newName: string | undefined;

  if (patch.name !== undefined) {
    const n = cleanMedName(patch.name);
    if (n === null) return fail('invalid_name');
    if (n !== med.name) {
      from.name = med.name;
      to.name = n;
      newName = n;
    }
  }
  if (patch.stockQty !== undefined) {
    if (patch.stockQty !== null && !validQty(patch.stockQty)) return fail('invalid_qty');
    const current = qtyToday(root, a, ctx.today);
    if (patch.stockQty !== current) {
      from.stockQty = current;
      to.stockQty = patch.stockQty;
      next = { ...next, stock: patch.stockQty === null ? null : { qty: patch.stockQty, countedOn: ctx.today } }; // a recount
    }
  }
  if (patch.expiry !== undefined) {
    if (patch.expiry !== null && !validDate(patch.expiry)) return fail('invalid_expiry');
    if (patch.expiry !== (a.expiry ?? null)) {
      from.expiry = a.expiry ?? null;
      to.expiry = patch.expiry;
      const { expiry: _old, ...rest } = next;
      next = patch.expiry === null ? rest : { ...rest, expiry: patch.expiry };
    }
  }
  if (patch.note !== undefined) {
    const n = patch.note === null ? null : patch.note.trim();
    if (n === '') return fail('invalid_note');
    if (n !== (a.note ?? null)) {
      from.note = a.note ?? null;
      to.note = n;
      const { note: _old, ...rest } = next;
      next = n === null ? rest : { ...rest, note: n };
    }
  }

  if (Object.keys(from).length === 0) return fail('no_change');
  if (newName !== undefined) {
    const key = normName(newName);
    if (root.medications.some((m) => m.id !== med.id && normName(m.name) === key)) return fail('name_taken');
  }

  const sharing = root.assignments.filter((x) => x.medicationId === med.id);
  const events: MedEvent[] = [event(ctx, a.id, 'edit', { from, to })];
  if (newName !== undefined) {
    for (const other of sharing) {
      if (other.id !== a.id) events.push(event(ctx, other.id, 'edit', { from: { name: med.name }, to: { name: newName } }));
    }
  }
  const res = checked({
    ...root,
    medications: newName === undefined ? root.medications : root.medications.map((m) => (m.id === med.id ? { ...m, name: newName } : m)),
    assignments: replaceAssignment(root, next),
    events: [...root.events, ...events],
  });
  return res.ok ? { ok: true, root: res.root, sharedWith: sharing.length } : res;
}
