// Backup file logic (BRIEF 3.3, step 3.2d). Pure: no clock, no storage, no UI. Callers pass `nowIso` / `today`.
// The backup file is exactly the stored root (version 2) as JSON, nothing wrapped around it.
import { diffDays, type IsoDate } from './calc';
import { isBlank } from './actions';
import { rootSchema, type Root } from './schema';
import { todayInBangkok } from './today';

/** Files bigger than this are refused without being read as data (a real backup is far smaller). 5 MB = 5 * 1024 * 1024 bytes. */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
/** More than this many days since the last backup = the quiet reminder shows. */
export const BACKUP_WARN_DAYS = 14;

export interface HouseSummary {
  /** Members still in the house (removed members are not counted). */
  members: number;
  /** Every assignment, stopped ones included. */
  medicines: number;
  /** House medicines that are not removed. */
  houseItems: number;
}

export type BackupError = 'not_json' | 'wrong_version' | 'invalid' | 'too_big';
export type BackupCheck = { ok: true; root: Root; summary: HouseSummary } | { ok: false; error: BackupError };

export function summarizeRoot(root: Root): HouseSummary {
  return {
    members: root.persons.filter((p) => p.removedAt === undefined).length,
    medicines: root.assignments.length,
    houseItems: root.houseItems.filter((h) => h.removedAt === undefined).length,
  };
}

/** "สมาชิก 3 คน ยา 9 รายการ" */
export const summaryText = (s: HouseSummary): string => `สมาชิก ${s.members} คน ยา ${s.medicines} รายการ`;

/** The file to save: root as it is, with meta.lastBackupAt = nowIso. The file name uses the Thai date of nowIso. */
export function makeBackup(root: Root, nowIso: string): { fileName: string; text: string } {
  const stamped: Root = { ...root, meta: { ...root.meta, lastBackupAt: nowIso } };
  return {
    fileName: `judya-backup-${todayInBangkok(new Date(nowIso))}.json`,
    text: JSON.stringify(stamped),
  };
}

/** The same size rule for a chosen file before it is read (File.size is in bytes). */
export const isTooBig = (bytes: number): boolean => bytes > MAX_BACKUP_BYTES;

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

/** Checks a backup file's text: size, then JSON, then version, then the full schema. Nothing is written. */
export function summarizeBackup(text: string): BackupCheck {
  if (isTooBig(byteLength(text))) return { ok: false, error: 'too_big' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not_json' };
  }
  // A file that says it is another version is "wrong_version"; anything that does not even say is just "invalid".
  if (typeof json === 'object' && json !== null && 'version' in json && json.version !== 2) {
    return { ok: false, error: 'wrong_version' };
  }
  const parsed = rootSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  return { ok: true, root: parsed.data, summary: summarizeRoot(parsed.data) };
}

/** Thai calendar date of the last backup (null = never backed up). */
export const backupDate = (root: Root): IsoDate | null =>
  root.meta.lastBackupAt === undefined ? null : todayInBangkok(new Date(root.meta.lastBackupAt));

/** Last backup as a Thai calendar date and the days since then (null = never backed up). */
export function backupAge(root: Root, today: IsoDate): { date: IsoDate; daysAgo: number } | null {
  const date = backupDate(root);
  return date === null ? null : { date, daysAgo: diffDays(date, today) };
}

/** True when the house has data (not blank, not the sample) and it was never backed up, or the last backup is
 * more than 14 days before `today` (Thai dates). */
export function needsBackupWarning(root: Root, today: IsoDate): boolean {
  if (isBlank(root) || root.meta.isSample === true) return false;
  const age = backupAge(root, today);
  return age === null || age.daysAgo > BACKUP_WARN_DAYS;
}
