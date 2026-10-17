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
