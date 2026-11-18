// Allergy (3 states), treatment rights and side effects of one medicine (M4 PR 10). Pure: takes a root, returns a new root
// (checked by rootSchema), never touches storage or the clock (callers give today's date).
//
// Safety rules:
//  - `unknown` is never worded as "no allergy". Only `confirmNoAllergy` (an explicit button + confirm step in the UI) makes `none_confirmed`.
//  - Taking away the last listed drug goes back to `unknown`, never to `none_confirmed`.
import { shortThaiDate } from './medsList';
import { COVERAGE_TYPES, rootSchema, type Allergies, type Coverage, type Person, type Root } from './schema';

export type AllergyItem = { drug: string; reaction: string };
export type PersonResult = { ok: true; root: Root; person: Person } | { ok: false; error: string };

const BAD_DATA = 'ข้อมูลไม่ถูกต้อง บันทึกไม่ได้ ลองใหม่อีกครั้ง';
const NOT_FOUND = 'ไม่พบสมาชิกคนนี้';
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const UNKNOWN_TEXT = 'ยังไม่ได้บันทึกข้อมูลการแพ้ยา';

/** The words for the state. `unknown` is exactly UNKNOWN_TEXT. */
export function allergyStateText(a: Allergies): string {
  switch (a.status) {
    case 'unknown':
      return UNKNOWN_TEXT;
    case 'none_confirmed':
      return `ยืนยันแล้วว่าไม่มีประวัติแพ้ยา (บันทึก ${shortThaiDate(a.confirmedAt)})`;
    case 'listed':
      return `แพ้ยา ${a.items.length} รายการ`;
  }
}

const activePerson = (root: Root, id: string): Person | undefined => root.persons.find((p) => p.id === id && p.removedAt === undefined);

function withPerson(root: Root, id: string, change: (p: Person) => Person): PersonResult {
  const was = activePerson(root, id);
  if (!was) return fail(NOT_FOUND);
  const person = change(was);
  const next: Root = { ...root, persons: root.persons.map((p) => (p.id === id ? person : p)) };
  if (!rootSchema.safeParse(next).success) return fail(BAD_DATA);
  return { ok: true, root: next, person };
}

const cleanItem = (i: AllergyItem): AllergyItem | null => {
  const drug = i.drug.trim();
  const reaction = i.reaction.trim();
  return drug === '' || reaction === '' ? null : { drug, reaction };
};
const itemsOf = (a: Allergies): AllergyItem[] => (a.status === 'listed' ? a.items : []);
const listedOrUnknown = (items: AllergyItem[]): Allergies => (items.length === 0 ? { status: 'unknown' } : { status: 'listed', items });

/** Adds a drug. The first one makes the state `listed` (from unknown or none_confirmed). Both fields are required. */
export function addAllergyItem(root: Root, personId: string, item: AllergyItem): PersonResult {
  const clean = cleanItem(item);
  if (!clean) return fail('กรอกชื่อยาและอาการให้ครบ');
  return withPerson(root, personId, (p) => ({ ...p, allergies: listedOrUnknown([...itemsOf(p.allergies), clean]) }));
}

export function updateAllergyItem(root: Root, personId: string, index: number, item: AllergyItem): PersonResult {
  const clean = cleanItem(item);
  if (!clean) return fail('กรอกชื่อยาและอาการให้ครบ');
  const was = activePerson(root, personId);
  if (was && itemsOf(was.allergies)[index] === undefined) return fail('ไม่พบรายการนี้');
  return withPerson(root, personId, (p) => ({ ...p, allergies: listedOrUnknown(itemsOf(p.allergies).map((x, i) => (i === index ? clean : x))) }));
}

/** Deletes one drug. When it was the last one the state is `unknown` again (never "none confirmed"). */
export function deleteAllergyItem(root: Root, personId: string, index: number): PersonResult {
  const was = activePerson(root, personId);
  if (was && itemsOf(was.allergies)[index] === undefined) return fail('ไม่พบรายการนี้');
  return withPerson(root, personId, (p) => ({ ...p, allergies: listedOrUnknown(itemsOf(p.allergies).filter((_, i) => i !== index)) }));
}

/** The only way to `none_confirmed`: from `unknown`, with the day it was confirmed. Not possible while drugs are listed. */
export function confirmNoAllergy(root: Root, personId: string, today: string): PersonResult {
  const was = activePerson(root, personId);
  if (was && was.allergies.status === 'listed') return fail('มีรายการยาที่แพ้อยู่ ยืนยันว่าไม่มีประวัติแพ้ไม่ได้');
  return withPerson(root, personId, (p) => ({ ...p, allergies: { status: 'none_confirmed', confirmedAt: today } }));
}

/** "ยกเลิกการยืนยัน": none_confirmed back to unknown. */
export function clearNoneConfirmed(root: Root, personId: string): PersonResult {
  const was = activePerson(root, personId);
  if (was && was.allergies.status !== 'none_confirmed') return fail('ไม่มีการยืนยันให้ยกเลิก');
  return withPerson(root, personId, (p) => ({ ...p, allergies: { status: 'unknown' } }));
}

// ---------- the add-medicine warning (S4) ----------

const squash = (s: string): string => s.replace(/\s+/g, '').toLowerCase();
const MIN_MATCH = 3; // a shorter name matches too much (same rule as calc.ts allergyHits)

/** The warning for giving `medName` to this person, or null. Matches a listed drug when either name contains the other
 * (case and spaces ignored, at least 3 letters). Only a warning: saving stays allowed. */
export function allergyWarning(root: Root, personId: string, medName: string): string | null {
  const p = activePerson(root, personId);
  const name = squash(medName);
  if (!p || p.allergies.status !== 'listed' || name.length < MIN_MATCH) return null;
  const hit = p.allergies.items.find((i) => {
    const drug = squash(i.drug);
    return drug.length >= MIN_MATCH && (drug.includes(name) || name.includes(drug));
  });
  return hit ? `ระวัง: ${medName.trim()} มีบันทึกแพ้ยา ${hit.drug} (${hit.reaction}) ตรวจกับแพทย์หรือเภสัชกรก่อน` : null;
}

// ---------- treatment rights ----------

export const COVERAGE_LABEL: Record<(typeof COVERAGE_TYPES)[number], string> = {
  government: 'บัตรทอง',
  social: 'ประกันสังคม',
  civil_servant: 'ข้าราชการ',
  private: 'ประกันเอกชน',
  self_pay: 'จ่ายเอง',
  other: 'อื่นๆ',
};
export const COVERAGE_NOT_GIVEN = 'ยังไม่ได้ระบุ';

export const coverageText = (c: Coverage | undefined): string => (c === undefined ? COVERAGE_NOT_GIVEN : c.company === undefined ? COVERAGE_LABEL[c.type] : `${COVERAGE_LABEL[c.type]} (${c.company})`);

/** What the form holds: null = "ไม่ระบุ". The company is kept only for a private insurance and only when not empty. */
export type CoverageDraft = { type: Coverage['type']; company?: string } | null;

export const coverageFromDraft = (d: CoverageDraft): Coverage | undefined => {
  if (d === null) return undefined;
  const company = d.company?.trim() ?? '';
  return d.type === 'private' && company !== '' ? { type: 'private', company } : { type: d.type };
};

export function setCoverage(root: Root, personId: string, draft: CoverageDraft): PersonResult {
  return withPerson(root, personId, ({ coverage: _old, ...rest }) => {
    const c = coverageFromDraft(draft);
    return c === undefined ? rest : { ...rest, coverage: c };
  });
}

// ---------- side effects of one medicine ----------

export const SIDE_EFFECTS_MAX = 500;

/** Saves the text on the assignment (empty = removed). No MedEvent: it is a note, not a doctor's change. */
export function setSideEffects(root: Root, assignmentId: string, text: string): { ok: true; root: Root } | { ok: false; error: string } {
  if (!root.assignments.some((a) => a.id === assignmentId)) return fail('ไม่พบยานี้');
  const t = text.trim();
  if (t.length > SIDE_EFFECTS_MAX) return fail(`ยาวเกิน ${SIDE_EFFECTS_MAX} ตัวอักษร`);
  const next: Root = {
    ...root,
    assignments: root.assignments.map((a) => {
      if (a.id !== assignmentId) return a;
      const { sideEffects: _old, ...rest } = a;
      return t === '' ? rest : { ...rest, sideEffects: t };
    }),
  };
  if (!rootSchema.safeParse(next).success) return fail(BAD_DATA);
  return { ok: true, root: next };
}
