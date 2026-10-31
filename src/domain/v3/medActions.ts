// Stop and resume a medicine (M4 PR 5b). Pure: takes a root, returns a new root, never touches storage.
// Each makes one new MedEvent at the end of `events` and flips `status`; stock, expiry and schedule are not touched.
// (Refill and "open a new tube" are in stock.ts and make no event.)
import type { IsoDate } from '../calc';
import { RESUME_REASONS, STOP_REASONS, rootSchema, type MedEvent, type Root } from './schema';

export type ActionResult = { ok: true; root: Root } | { ok: false; error: string };

export interface StopInput {
  reason: (typeof STOP_REASONS)[number];
  note?: string;
}
export interface ResumeInput {
  reason: (typeof RESUME_REASONS)[number];
  note?: string;
}

const fail = (error: string): ActionResult => ({ ok: false, error });

/** A new 12-character id (also used by the member form). */
export const defaultNewId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const cleanNote = (note: string | undefined): { note?: string } => {
  const t = note?.trim() ?? '';
  return t === '' ? {} : { note: t };
};

function change(root: Root, assignmentId: string, from: 'active' | 'stopped', event: MedEvent): ActionResult {
  const next: Root = {
    ...root,
    assignments: root.assignments.map((a) => (a.id === assignmentId ? { ...a, status: from === 'active' ? 'stopped' : 'active' } : a)),
    events: [...root.events, event],
  };
  const checked = rootSchema.safeParse(next);
  if (!checked.success) return fail('ข้อมูลไม่ถูกต้อง บันทึกไม่ได้ ลองใหม่อีกครั้ง');
  return { ok: true, root: next };
}

export function stopMedication(
  root: Root,
  assignmentId: string,
  input: StopInput,
  today: IsoDate,
  nowIso: string,
  newId: () => string = defaultNewId,
): ActionResult {
  const a = root.assignments.find((x) => x.id === assignmentId);
  if (!a) return fail('ไม่พบยานี้');
  if (a.status !== 'active') return fail('ยานี้หยุดไปแล้ว');
  const note = cleanNote(input.note);
  if (input.reason === 'อื่น ๆ' && note.note === undefined) return fail('กรุณาพิมพ์เหตุผล');
  // only the two "symptom" reasons and "other" keep a note; the others never do
  const keepsNote = input.reason === 'อื่น ๆ' || input.reason === 'แพ้ยา' || input.reason === 'ใช้ยาไม่ได้ / ผลข้างเคียง';
  const event: MedEvent = { id: newId(), assignmentId, type: 'stop', reason: input.reason, effectiveOn: today, at: nowIso, ...(keepsNote ? note : {}) };
  return change(root, assignmentId, 'active', event);
}

export function resumeMedication(
  root: Root,
  assignmentId: string,
  input: ResumeInput,
  today: IsoDate,
  nowIso: string,
  newId: () => string = defaultNewId,
): ActionResult {
  const a = root.assignments.find((x) => x.id === assignmentId);
  if (!a) return fail('ไม่พบยานี้');
  if (a.status !== 'stopped') return fail('ยานี้กำลังใช้อยู่แล้ว');
  const note = cleanNote(input.note);
  if (input.reason === 'อื่น ๆ' && note.note === undefined) return fail('กรุณาพิมพ์เหตุผล');
  const event: MedEvent = { id: newId(), assignmentId, type: 'resume', reason: input.reason, effectiveOn: today, at: nowIso, ...(input.reason === 'อื่น ๆ' ? note : {}) };
  return change(root, assignmentId, 'stopped', event);
}
