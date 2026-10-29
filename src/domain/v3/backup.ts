// Backup file logic for data v3 (M4 PR 3). Pure: no clock, no storage, no UI. Callers pass `nowIso` / `today`.
// The backup file is exactly the stored root (version 3) as JSON, nothing wrapped around it. Restoring is done by
// `restoreRoot` in ./storage (it keeps the old data in `judya.v3.prev`); this file never touches storage.
// Only the date helpers of ../calc are used from v2.
import { diffDays, type IsoDate } from '../calc';
import { DATA_VERSION_V3, rootSchema, type Root } from './schema';

/** Files bigger than this are refused without being read as data. 5 MB = 5 * 1024 * 1024 bytes (same as v2;
 * v3 has no receipt pictures, so the limit is not raised). */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
/** More than this many days since the last backup = the "old backup" reminder. */
export const BACKUP_WARN_DAYS = 14;

export interface BackupSummary {
  /** Members still in the house (removed members are not counted). */
  members: number;
  /** Every assignment, stopped ones included. */
  medicines: number;
  /** House medicines (ยาสามัญ) that are not removed. */
  houseItems: number;
  /** Every order, whatever its status. */
  orders: number;
  /** Thai text for the confirm page before restoring. */
  text: string;
}

export type BackupError = 'not_json' | 'wrong_version' | 'invalid' | 'too_big';
export type BackupCheck = { ok: true; root: Root; summary: BackupSummary } | { ok: false; error: BackupError };

/** Calendar date in Asia/Bangkok (UTC+7, no daylight saving) of an ISO timestamp, as 'YYYY-MM-DD'. */
export function bangkokDate(iso: string): IsoDate {
  return new Date(Date.parse(iso) + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** "สมาชิก 3 คน ยา 9 รายการ ยาสามัญ 2 รายการ ใบสั่ง 4 ใบ" */
export const summaryText = (s: Omit<BackupSummary, 'text'>): string =>
  `สมาชิก ${s.members} คน ยา ${s.medicines} รายการ ยาสามัญ ${s.houseItems} รายการ ใบสั่ง ${s.orders} ใบ`;

export function summarizeRoot(root: Root): BackupSummary {
  const counts = {
    members: root.persons.filter((p) => p.removedAt === undefined).length,
    medicines: root.assignments.length,
    houseItems: root.houseItems.filter((h) => h.removedAt === undefined).length,
    orders: root.orders.length,
  };
  return { ...counts, text: summaryText(counts) };
}

/** A copy of the root with meta.lastBackupAt = nowIso. The root passed in is not changed. Call this (and save the
 * result) only after the file was really handed to the user. */
export const markBackedUp = (root: Root, nowIso: string): Root => ({ ...root, meta: { ...root.meta, lastBackupAt: nowIso } });

/** The file to save: the root with meta.lastBackupAt = nowIso, as JSON. The file name uses the Thai date of nowIso
 * and ends with -v3: `judya-backup-2026-10-28-v3.json` (v2 files are `judya-backup-2026-10-28.json`). */
export function makeBackup(root: Root, nowIso: string): { fileName: string; text: string } {
  return {
    fileName: `judya-backup-${bangkokDate(nowIso)}-v3.json`,
    text: JSON.stringify(markBackedUp(root, nowIso)),
  };
}

/** The same size rule for a chosen file before it is read (File.size is in bytes). */
export const isTooBig = (bytes: number): boolean => bytes > MAX_BACKUP_BYTES;

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

/** Checks a backup file's text: size, then JSON, then version, then the full schema (cross-table checks included).
 * Nothing is written. To restore, pass `root` of an ok result to `restoreRoot`. */
export function summarizeBackup(text: string): BackupCheck {
  if (isTooBig(byteLength(text))) return { ok: false, error: 'too_big' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not_json' };
  }
  // A file that says it is another version (v2, or newer) is "wrong_version"; anything that does not even say is "invalid".
  if (typeof json === 'object' && json !== null && 'version' in json && json.version !== DATA_VERSION_V3) {
    return { ok: false, error: 'wrong_version' };
  }
  const parsed = rootSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  return { ok: true, root: parsed.data, summary: summarizeRoot(parsed.data) };
}

// ---------- Home banner ----------

/** The house has medicines: at least one assignment, or at least one house medicine that is not removed. */
export const hasMedicines = (root: Root): boolean =>
  root.assignments.length > 0 || root.houseItems.some((h) => h.removedAt === undefined);

/** Thai calendar date of the last backup (null = never backed up). */
export const backupDate = (root: Root): IsoDate | null =>
  root.meta.lastBackupAt === undefined ? null : bangkokDate(root.meta.lastBackupAt);

/** Last backup as a Thai calendar date and the days since then (null = never backed up). */
export function backupAge(root: Root, today: IsoDate): { date: IsoDate; daysAgo: number } | null {
  const date = backupDate(root);
  return date === null ? null : { date, daysAgo: diffDays(date, today) };
}

/** True when the house has medicines and was never backed up. */
export const shouldShowNeverBackedUp = (root: Root): boolean => hasMedicines(root) && root.meta.lastBackupAt === undefined;

/** Ported from v2: the last backup is more than 14 days before `today` (Thai dates). A house that was never backed
 * up is false here (that is `shouldShowNeverBackedUp`), so the two never overlap. */
export function needsBackupWarning(root: Root, today: IsoDate): boolean {
  const age = backupAge(root, today);
  return age !== null && hasMedicines(root) && age.daysAgo > BACKUP_WARN_DAYS;
}

export const NEVER_BACKED_UP_TEXT = 'ยังไม่ได้สำรองข้อมูล';
export const oldBackupText = (daysAgo: number): string => `ไม่ได้สำรองข้อมูลมา ${daysAgo} วันแล้ว`;

export type BackupBanner = { kind: 'never'; text: string } | { kind: 'old'; text: string; daysAgo: number };

/** The one banner to show on Home, or null. Never backed up wins; the 14-day reminder only comes after a backup. */
export function backupBanner(root: Root, today: IsoDate): BackupBanner | null {
  if (shouldShowNeverBackedUp(root)) return { kind: 'never', text: NEVER_BACKED_UP_TEXT };
  const age = backupAge(root, today);
  if (age !== null && needsBackupWarning(root, today)) return { kind: 'old', text: oldBackupText(age.daysAgo), daysAgo: age.daysAgo };
  return null;
}
