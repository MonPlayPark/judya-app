// Every change to the data goes through a function here: Root -> Root, pure, no storage, no clock
// (BRIEF 3.2). Screens never write storage; the state holder in src/state saves the returned root.
import type { IsoDate } from './calc';
import { prunePrep, tickPrep, untickPrep } from './prep';
import { makeSample } from './sample';
import { emptyRoot, type Root } from './schema';

/** Nothing at all in the house: no people, medicines or house medicines. */
export const isBlank = (r: Root): boolean =>
  r.persons.length === 0 && r.medications.length === 0 && r.assignments.length === 0 && r.houseItems.length === 0;

/** Tick one dose as prepared today. Also drops tick marks older than 14 days. */
export const tickDose = (root: Root, today: IsoDate, key: string): Root => ({
  ...root,
  prepLog: prunePrep(tickPrep(root.prepLog, today, key), today),
});

export const untickDose = (root: Root, today: IsoDate, key: string): Root => ({
  ...root,
  prepLog: untickPrep(root.prepLog, today, key),
});

/** Fills a blank house with the made-up sample set. Anything else (real data, or the sample already there)
 * is returned unchanged: sample data is never mixed into real data. */
export function loadSample(root: Root, today: IsoDate, nowIso: string): Root {
  if (!isBlank(root)) return root;
  return { ...root, ...makeSample(today, nowIso), meta: { ...root.meta, isSample: true } };
}

/** Removes the whole sample set. Data that is not flagged as sample is never touched. */
export function clearSample(root: Root): Root {
  if (!root.meta.isSample) return root;
  const { createdAt, lastBackupAt } = root.meta;
  const blank = emptyRoot(createdAt);
  return {
    ...blank,
    settings: root.settings,
    meta: lastBackupAt === undefined ? { createdAt } : { createdAt, lastBackupAt },
  };
}

/** Stamps "backed up at nowIso" into the data (used after the backup file was shared or downloaded). */
export const markBackedUp = (root: Root, nowIso: string): Root => ({ ...root, meta: { ...root.meta, lastBackupAt: nowIso } });

export type SettingsError = 'invalid_expiry_days' | 'invalid_low_stock_days';
export interface SettingsPatch {
  expiryWarnDays?: number;
  lowStockDays?: number;
}
export const EXPIRY_DAYS_RANGE = { min: 1, max: 365 } as const;
export const LOW_STOCK_DAYS_RANGE = { min: 1, max: 60 } as const;

const wholeIn = (n: number, r: { min: number; max: number }): boolean => Number.isInteger(n) && n >= r.min && n <= r.max;

/** Changes the two warning thresholds. Each value must be a whole number inside its range (same limits as the schema);
 * a field that is left out stays as it is. If either value is refused nothing is changed. */
export function setSettings(root: Root, patch: SettingsPatch): { ok: true; root: Root } | { ok: false; error: SettingsError } {
  if (patch.expiryWarnDays !== undefined && !wholeIn(patch.expiryWarnDays, EXPIRY_DAYS_RANGE)) return { ok: false, error: 'invalid_expiry_days' };
  if (patch.lowStockDays !== undefined && !wholeIn(patch.lowStockDays, LOW_STOCK_DAYS_RANGE)) return { ok: false, error: 'invalid_low_stock_days' };
  return {
    ok: true,
    root: {
      ...root,
      settings: {
        ...root.settings,
        ...(patch.expiryWarnDays !== undefined && { expiryWarnDays: patch.expiryWarnDays }),
        ...(patch.lowStockDays !== undefined && { lowStockDays: patch.lowStockDays }),
      },
    },
  };
}
