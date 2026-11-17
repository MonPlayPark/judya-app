// The members tab (M4 PR 9): edit, take out, bring back, and what the list and the one-member page show. Pure: takes a root,
// returns a new root (checked by rootSchema), never touches storage or the clock (callers give `nowIso`).
import { allergyStateText, coverageText } from './allergy';
import { bangkokDate } from './backup';
import { doseTextOf, label, shortThaiDate } from './medsList';
import { draftState, hasSelf, type MemberDraft } from './members';
import { SELF_RELATION, maxBirthYearBE, rootSchema, type Person, type Root } from './schema';

const BAD_DATA = 'ข้อมูลไม่ถูกต้อง บันทึกไม่ได้ ลองใหม่อีกครั้ง';
const active = (persons: readonly Person[]): Person[] => persons.filter((p) => p.removedAt === undefined);

export type UpdateResult = { ok: true; root: Root; person: Person; duplicateName: boolean } | { ok: false; error: string };

/** Changes the five things of the form (name, relation, birth year, picture, self-managed). Same checks as `createMember`, but the
 * person themselves is left out of the "same name" warning and of the "ตัวฉัน" rule. Colour, allergies, coverage and removedAt stay. */
export function updateMember(root: Root, id: string, draft: MemberDraft): UpdateResult {
  const was = root.persons.find((p) => p.id === id && p.removedAt === undefined);
  if (!was) return { ok: false, error: 'ไม่พบสมาชิกคนนี้' };
  const others = root.persons.filter((p) => p.id !== id);
  const state = draftState(draft, others);
  if (draft.relation === SELF_RELATION && hasSelf(others)) return { ok: false, error: "มี 'ตัวฉัน' แล้ว" };
  if (state.blocker !== null || draft.relation === null) return { ok: false, error: state.blocker ?? 'กรอกข้อมูลให้ครบก่อน' };
  const { birthYearBE: _old, ...rest } = was;
  const person: Person = {
    ...rest,
    name: draft.name.trim(),
    relation: draft.relation,
    ...(state.birth.kind === 'ok' ? { birthYearBE: state.birth.year } : {}),
    avatar: draft.avatar,
    selfManaged: draft.selfManaged,
  };
  const next: Root = { ...root, persons: root.persons.map((p) => (p.id === id ? person : p)) };
  if (!rootSchema.safeParse(next).success) return { ok: false, error: BAD_DATA };
  return { ok: true, root: next, person, duplicateName: state.duplicate };
}

/** Takes a member off the list (soft: `removedAt`). Medicines and history stay. An unknown or already removed member changes nothing. */
export function removeMember(root: Root, id: string, nowIso: string): Root {
  if (!root.persons.some((p) => p.id === id && p.removedAt === undefined)) return root;
  return { ...root, persons: root.persons.map((p) => (p.id === id ? { ...p, removedAt: nowIso } : p)) };
}

export type RestoreResult = { ok: true; root: Root; person: Person } | { ok: false; error: string };

/** Brings a removed member back. Refused when it would make two active "ตัวฉัน". */
export function restoreMember(root: Root, id: string): RestoreResult {
  const was = root.persons.find((p) => p.id === id && p.removedAt !== undefined);
  if (!was) return { ok: false, error: 'ไม่พบสมาชิกคนนี้ในรายชื่อที่นำออก' };
  if (was.relation === SELF_RELATION && hasSelf(root.persons)) return { ok: false, error: `นำ${was.name}กลับไม่ได้ เพราะมี 'ตัวฉัน' อยู่ในรายชื่อแล้ว` };
  const { removedAt: _gone, ...person } = was;
  const next: Root = { ...root, persons: root.persons.map((p) => (p.id === id ? person : p)) };
  if (!rootSchema.safeParse(next).success) return { ok: false, error: BAD_DATA };
  return { ok: true, root: next, person };
}

// ---------- what the screens show ----------

export interface MemberRow {
  id: string;
  name: string;
  avatar: Person['avatar'];
  /** 'อายุ 71 ปี · ยา 2 รายการ'; the age part is left out when there is no birth year. */
  subText: string;
  selfManaged: boolean;
}
export interface RemovedRow {
  id: string;
  name: string;
  avatar: Person['avatar'];
  removedText: string; // 'นำออกเมื่อ 3 ต.ค. 69'
}
export interface MembersListModel {
  members: MemberRow[];
  removed: RemovedRow[];
}

const activeMedCount = (root: Root, personId: string): number => root.assignments.filter((a) => a.personId === personId && a.status === 'active').length;
const ageOf = (p: Person): number | null => (p.birthYearBE === undefined ? null : maxBirthYearBE() - p.birthYearBE);

export function buildMembersList(root: Root): MembersListModel {
  const members = active(root.persons).map((p): MemberRow => {
    const age = ageOf(p);
    const meds = `ยา ${activeMedCount(root, p.id)} รายการ`;
    return { id: p.id, name: p.name, avatar: p.avatar, subText: age === null ? meds : `อายุ ${age} ปี · ${meds}`, selfManaged: p.selfManaged };
  });
  const removed = root.persons
    .flatMap((p) => (p.removedAt === undefined ? [] : [{ p, at: p.removedAt }]))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map(({ p, at }): RemovedRow => ({ id: p.id, name: p.name, avatar: p.avatar, removedText: `นำออกเมื่อ ${shortThaiDate(bangkokDate(at))}` }));
  return { members, removed };
}

export interface MemberMedRow {
  id: string; // the assignment id: #/n/meds/:id
  name: string;
  subText: string;
}
export interface MemberDetail {
  id: string;
  name: string;
  avatar: Person['avatar'];
  birthText: string; // 'พ.ศ. 2498 (อายุ 71 ปี)' | 'ยังไม่ได้ระบุ'
  meds: MemberMedRow[];
  /** The words of the allergy state (PR 10: allergy.ts). */
  allergyText: string;
  allergyStatus: Person['allergies']['status'];
  /** The listed drugs (empty unless the state is `listed`), shown inside the red block. */
  allergyItems: { drug: string; reaction: string }[];
  /** 'บัตรทอง' | 'ประกันเอกชน (บริษัท)' | 'ยังไม่ได้ระบุ' */
  coverageText: string;
}

/** null for an unknown or removed member. */
export function buildMemberDetail(root: Root, id: string): MemberDetail | null {
  const p = root.persons.find((x) => x.id === id && x.removedAt === undefined);
  if (!p) return null;
  const age = ageOf(p);
  const meds = root.assignments.flatMap((a): MemberMedRow[] => {
    const m = root.medications.find((x) => x.id === a.medicationId);
    return a.personId === p.id && a.status === 'active' && m ? [{ id: a.id, name: label(m), subText: doseTextOf(a, m) }] : [];
  });
  return {
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    birthText: p.birthYearBE === undefined || age === null ? 'ยังไม่ได้ระบุ' : `พ.ศ. ${p.birthYearBE} (อายุ ${age} ปี)`,
    meds,
    allergyText: allergyStateText(p.allergies),
    allergyStatus: p.allergies.status,
    allergyItems: p.allergies.status === 'listed' ? p.allergies.items : [],
    coverageText: coverageText(p.coverage),
  };
}
