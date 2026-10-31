// Adding a member (M4 PR 6a). Pure: takes a root, returns a new root, never touches storage. The rules for the name,
// the birth year and "ตัวฉัน" are the ones of personSchema / rootSchema (the result is checked by rootSchema before it is returned).
import { defaultNewId } from './medActions';
import {
  AVATAR_NAMES_V3,
  PERSON_COLORS,
  RELATIONS_V3,
  SELF_RELATION,
  maxBirthYearBE,
  rootSchema,
  type Person,
  type Root,
} from './schema';

export type Relation = (typeof RELATIONS_V3)[number];
export type Avatar = (typeof AVATAR_NAMES_V3)[number];

export const NAME_MAX = 40;
export const MIN_BIRTH_YEAR_BE = 2400;

/** What the form holds. `birthYear` is the text of the box (digits). */
export interface MemberDraft {
  name: string;
  relation: Relation | null;
  birthYear: string;
  avatar: Avatar;
  selfManaged: boolean;
}

export const emptyDraft = (): MemberDraft => ({ name: '', relation: null, birthYear: '', avatar: AVATAR_NAMES_V3[0], selfManaged: false });

/** Members that are on the list (not taken out). */
const active = (persons: readonly Person[]): Person[] => persons.filter((p) => p.removedAt === undefined);

export const hasSelf = (persons: readonly Person[]): boolean => active(persons).some((p) => p.relation === SELF_RELATION);

/** The "self-managed" switch follows the relation until the user touches it: on for "ตัวฉัน", off for the rest. */
export const defaultSelfManaged = (relation: Relation | null): boolean => relation === SELF_RELATION;

/** The first colour no active member uses; when all are used, start again from the top (member count modulo 4). */
export function nextColor(persons: readonly Person[]): Person['color'] {
  const list = active(persons);
  const used = new Set(list.map((p) => p.color));
  return PERSON_COLORS.find((c) => !used.has(c)) ?? PERSON_COLORS[list.length % PERSON_COLORS.length] ?? PERSON_COLORS[0];
}

const squash = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

/** Same name as a member already on the list (case and spaces ignored). Only a warning, never a block. */
export const isDuplicateName = (persons: readonly Person[], name: string): boolean => {
  const key = squash(name);
  return key !== '' && active(persons).some((p) => squash(p.name) === key);
};

export type BirthYear = { kind: 'empty' } | { kind: 'ok'; year: number; age: number } | { kind: 'bad' };

/** Empty is fine (optional). Otherwise exactly 4 digits from 2400 up to this Buddhist year (personSchema's rule). */
export function parseBirthYear(text: string): BirthYear {
  const t = text.trim();
  if (t === '') return { kind: 'empty' };
  if (!/^\d{4}$/.test(t)) return { kind: 'bad' };
  const year = Number(t);
  const max = maxBirthYearBE();
  return year < MIN_BIRTH_YEAR_BE || year > max ? { kind: 'bad' } : { kind: 'ok', year, age: max - year };
}

export interface DraftState {
  nameOk: boolean;
  relationOk: boolean;
  birth: BirthYear;
  duplicate: boolean;
  /** The sentence that says why "บันทึก" is grey; null = ready. */
  blocker: string | null;
}

export function draftState(draft: MemberDraft, persons: readonly Person[]): DraftState {
  const name = draft.name.trim();
  const nameOk = name.length >= 1 && name.length <= NAME_MAX;
  const relationOk = draft.relation !== null && !(draft.relation === SELF_RELATION && hasSelf(persons));
  const birth = parseBirthYear(draft.birthYear);
  let blocker: string | null = null;
  if (name.length > NAME_MAX) blocker = `ชื่อยาวเกิน ${NAME_MAX} ตัวอักษร`;
  else if (!nameOk && !relationOk) blocker = 'พิมพ์ชื่อและเลือกความสัมพันธ์ก่อน';
  else if (!nameOk) blocker = 'พิมพ์ชื่อก่อน';
  else if (!relationOk) blocker = 'เลือกความสัมพันธ์ก่อน';
  else if (birth.kind === 'bad') blocker = 'แก้ปีเกิดให้ถูกต้องก่อน';
  return { nameOk, relationOk, birth, duplicate: nameOk && isDuplicateName(persons, name), blocker };
}

export type CreateResult = { ok: true; root: Root; person: Person; duplicateName: boolean } | { ok: false; error: string };

const fail = (error: string): CreateResult => ({ ok: false, error });

/** Adds a member at the end of the list: no coverage, allergies unknown. A second active "ตัวฉัน" is refused. */
export function createMember(root: Root, draft: MemberDraft, newId: () => string = defaultNewId): CreateResult {
  const state = draftState(draft, root.persons);
  if (draft.relation === SELF_RELATION && hasSelf(root.persons)) return fail("มี 'ตัวฉัน' แล้ว");
  if (state.blocker !== null || draft.relation === null) return fail(state.blocker ?? 'กรอกข้อมูลให้ครบก่อน');
  const person: Person = {
    id: newId(),
    name: draft.name.trim(),
    relation: draft.relation,
    ...(state.birth.kind === 'ok' ? { birthYearBE: state.birth.year } : {}),
    avatar: draft.avatar,
    color: nextColor(root.persons),
    selfManaged: draft.selfManaged,
    allergies: { status: 'unknown' },
  };
  const next: Root = { ...root, persons: [...root.persons, person] };
  if (!rootSchema.safeParse(next).success) return fail('ข้อมูลไม่ถูกต้อง บันทึกไม่ได้ ลองใหม่อีกครั้ง');
  return { ok: true, root: next, person, duplicateName: state.duplicate };
}
