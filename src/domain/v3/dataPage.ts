// Logic of the v3 page "ข้อมูลและสำรองข้อมูล" (M4 PR 6c): texts, the status card, and the two actions (back up / restore).
// No UI and no clock. Storage is touched only through ./storage (`judya.v3` and `judya.v3.prev`); nothing else.
//
// Settings (`root.settings`: font size, warning days, order text ...) are NOT part of a backup file and a restore does
// not overwrite them (owner's rule, PR 6c). The file format has to stay a valid v3 root, so the file carries the default
// settings as a placeholder, and restore puts the settings of the current house back on top of the file's root.
import type { IsoDate } from '../calc';
import { MAX_BACKUP_BYTES, backupAge, BACKUP_WARN_DAYS, makeBackup, markBackedUp, summarizeRoot, type BackupError, type BackupSummary } from './backup';
import { fullThaiDate } from './medDetail';
import { DEFAULT_SETTINGS_V3, type Root } from './schema';
import { restoreRoot, saveRoot, startFresh, type KeyValueStore, type SaveResult } from './storage';

export const PRIVACY_TEXT = 'ไฟล์นี้มีข้อมูลสุขภาพของครอบครัว ส่งเฉพาะที่ที่ไว้ใจ';
export const NO_UPLOAD_TEXT = 'แอปนี้ไม่ส่งข้อมูลออกนอกเครื่องยกเว้นคุณกดแชร์เอง';
export const DEMO_BLOCKED_TEXT = 'โหมดตัวอย่าง ใช้สำรองหรือนำกลับข้อมูลไม่ได้';
export const REPLACE_ALL_TEXT = 'จะแทนที่ข้อมูลปัจจุบันทั้งหมดด้วยข้อมูลในไฟล์นี้';

const UNTOUCHED = 'ข้อมูลปัจจุบันไม่ถูกแตะ';

// ---------- status card ----------

export type BackupStatus =
  | { kind: 'never'; text: string }
  | { kind: 'ok'; text: string; date: IsoDate; daysAgo: number }
  | { kind: 'old'; text: string; date: IsoDate; daysAgo: number; warning: string };

/** "สำรองล่าสุด 28 ต.ค. 2569" / "ยังไม่เคยสำรอง"; more than 14 days = also a warning (icon + words on screen). */
export function backupStatus(root: Root, today: IsoDate): BackupStatus {
  const age = backupAge(root, today);
  if (age === null) return { kind: 'never', text: 'ยังไม่เคยสำรอง' };
  const text = `สำรองล่าสุด ${fullThaiDate(age.date)}`;
  if (age.daysAgo > BACKUP_WARN_DAYS) return { kind: 'old', text, date: age.date, daysAgo: age.daysAgo, warning: `ไม่ได้สำรองข้อมูลมา ${age.daysAgo} วันแล้ว` };
  return { kind: 'ok', text, date: age.date, daysAgo: age.daysAgo };
}

export const currentSummary = (root: Root): BackupSummary => summarizeRoot(root);

// ---------- storage promise ----------

export type PersistShown = 'granted' | 'denied' | 'unsupported' | 'unknown';

/** "เบราว์เซอร์รับปากจะไม่ลบข้อมูล: ใช่ / ไม่ / ไม่รองรับ" and the advice under it. Never claims the data is 100% safe. */
export function persistText(status: PersistShown): { answer: string; advice: string } {
  switch (status) {
    case 'granted':
      return { answer: 'ใช่', advice: 'แต่ถ้าล้างข้อมูลเว็บไซต์หรือถอนการติดตั้งแอป ข้อมูลก็ยังหายได้ สำรองเป็นไฟล์ไว้เป็นระยะ' };
    case 'denied':
      return { answer: 'ไม่', advice: 'เบราว์เซอร์อาจลบข้อมูลในเครื่องเมื่อเครื่องพื้นที่เหลือน้อย กรุณาสำรองเป็นไฟล์เป็นประจำ' };
    case 'unsupported':
      return { answer: 'ไม่รองรับ', advice: 'เบราว์เซอร์นี้บอกไม่ได้ว่าจะลบข้อมูลหรือไม่ กรุณาสำรองเป็นไฟล์เป็นประจำ' };
    case 'unknown':
      return { answer: 'กำลังตรวจ…', advice: 'สำรองเป็นไฟล์เป็นประจำเพื่อความอุ่นใจ' };
  }
}

// ---------- error texts (all say that the current data is untouched) ----------

export type RestoreFailure = BackupError | 'save_failed';

export const RESTORE_ERRORS: Record<RestoreFailure, string> = {
  not_json: `อ่านไฟล์นี้ไม่ได้ หรือไม่ใช่ไฟล์สำรองของ JudYa เลือกไฟล์ .json ที่ได้จากปุ่ม "สำรองข้อมูล" ${UNTOUCHED}`,
  wrong_version: `ไฟล์นี้เป็นไฟล์สำรองจากแอปเวอร์ชันเก่า แอปเวอร์ชันนี้นำกลับจากไฟล์นี้ไม่ได้ ${UNTOUCHED}`,
  invalid: `ไฟล์สำรองนี้เสียหรือข้อมูลในไฟล์ไม่ครบ นำกลับไม่ได้ ${UNTOUCHED}`,
  too_big: `ไฟล์ใหญ่เกิน ${MAX_BACKUP_BYTES / 1024 / 1024} MB ไม่น่าใช่ไฟล์สำรองของ JudYa เลยไม่ได้เปิดอ่าน ${UNTOUCHED}`,
  save_failed: `นำข้อมูลกลับไม่สำเร็จ เก็บข้อมูลลงเครื่องไม่ได้ ${UNTOUCHED}`,
};

export const isRestoreFailure = (v: string | null): v is RestoreFailure => v !== null && Object.keys(RESTORE_ERRORS).includes(v);

/** Why saving failed, in words an owner can act on. Always ends with "ข้อมูลปัจจุบันไม่ถูกแตะ". */
export function restoreSaveErrorText(result: Extract<SaveResult, { ok: false }>): string {
  switch (result.reason) {
    case 'quota':
      return `นำข้อมูลกลับไม่สำเร็จ พื้นที่เก็บข้อมูลในเครื่องเต็ม ${UNTOUCHED}`;
    case 'unavailable':
      return `นำข้อมูลกลับไม่สำเร็จ เบราว์เซอร์ไม่ให้เก็บข้อมูลในเครื่อง ${UNTOUCHED}`;
    case 'invalid':
    case 'verify-failed':
      return `นำข้อมูลกลับไม่สำเร็จ ลองอีกครั้ง ${UNTOUCHED}`;
  }
}

/** The file was handed over but the "last backed up" date could not be saved. The file itself is fine. */
export const BACKUP_DATE_NOT_SAVED = 'ส่งไฟล์สำรองออกไปแล้ว แต่บันทึกวันที่สำรองในแอปไม่ได้ ข้อมูลในแอปยังอยู่ครบ';

export const HANDOFF_TEXT: Record<'shared' | 'downloaded', string> = {
  shared: 'สำรองข้อมูลแล้ว',
  downloaded: 'สำรองข้อมูลแล้ว ไฟล์อยู่ในโฟลเดอร์ดาวน์โหลดของเครื่อง',
};
/** The person closed the share sheet: nothing was handed over, so this is not a success. */
export const BACKUP_CANCELLED_TEXT = 'ยังไม่ได้สำรองข้อมูล เพราะปิดเมนูแชร์ก่อน';
export const RESTORED_TEXT = 'นำข้อมูลกลับมาแล้ว';

// ---------- the two actions ----------

/** The file to hand over: the house without its settings (defaults stand in, see the top of this file). */
export function backupFileOf(root: Root, nowIso: string): { fileName: string; text: string } {
  return makeBackup({ ...root, settings: { ...DEFAULT_SETTINGS_V3 } }, nowIso);
}

/** After the file was really handed over ('shared' or 'downloaded'): remember the date in `judya.v3`.
 * Returns the saved root, or null when saving failed (nothing changed then). A 'cancelled' hand-off must not call this. */
export function recordBackup(root: Root, nowIso: string, store?: KeyValueStore | null): Root | null {
  const next = markBackedUp(root, nowIso);
  const result = store === undefined ? saveRoot(next) : saveRoot(next, store);
  return result.ok ? next : null;
}

export type RestoreOutcome = { ok: true; root: Root } | { ok: false; text: string };

/** Replaces the current house with a checked backup root. The old `judya.v3` text goes to `judya.v3.prev` (restoreRoot);
 * the current settings stay. Call only after the owner pressed the confirm button. */
export function restoreFromBackup(fileRoot: Root, current: Root, store?: KeyValueStore | null): RestoreOutcome {
  const next: Root = { ...fileRoot, settings: current.settings };
  const result = store === undefined ? restoreRoot(next) : restoreRoot(next, store);
  return result.ok ? { ok: true, root: next } : { ok: false, text: restoreSaveErrorText(result) };
}

// ---------- when the stored data cannot be read (M4 PR 7) ----------
// The "can't read the data" screen offers "start over" and "restore from a backup file". Both keep one copy of the old text in
// `judya.v3.prev` before anything is replaced (startFresh / restoreRoot in ./storage). There is no current root to read settings from,
// so a restore keeps the file's own (default) settings.

export const START_OVER_FAILED_TEXT = 'เริ่มใหม่ไม่ได้ ข้อมูลเดิมยังอยู่ ไม่ได้ถูกลบหรือเขียนทับ';

export type StartOverOutcome = { ok: true } | { ok: false; text: string };

/** "Start over": copy the unreadable text to `judya.v3.prev`, then save a blank house. Call only after the second confirm. */
export function startOver(nowIso: string, store?: KeyValueStore | null): StartOverOutcome {
  const result = store === undefined ? startFresh(nowIso) : startFresh(nowIso, store);
  return result.ok ? { ok: true } : { ok: false, text: START_OVER_FAILED_TEXT };
}

/** Restore a checked backup root over data that cannot be read. Same storage function and same error texts as `restoreFromBackup`. */
export function restoreUnreadable(fileRoot: Root, store?: KeyValueStore | null): RestoreOutcome {
  const result = store === undefined ? restoreRoot(fileRoot) : restoreRoot(fileRoot, store);
  return result.ok ? { ok: true, root: fileRoot } : { ok: false, text: restoreSaveErrorText(result) };
}
