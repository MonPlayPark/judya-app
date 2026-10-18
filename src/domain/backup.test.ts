// The owner's hand-calculated examples 1-4 (today = 2026-10-18). Made-up data only.
import { describe, expect, it } from 'vitest';
import { BACKUP_WARN_DAYS, MAX_BACKUP_BYTES, backupAge, makeBackup, needsBackupWarning, summarizeBackup, summarizeRoot, summaryText } from './backup';
import { NOW, sampleRoot } from './fixtures';
import { assignment, dailyMeal, person, rootWith } from './helpers.test-util';
import { emptyRoot, type Root } from './schema';

const TODAY = '2026-10-18';
const withBackup = (at: string): Root => ({ ...sampleRoot(), meta: { ...sampleRoot().meta, lastBackupAt: at } });

describe('needsBackupWarning (example 1)', () => {
  it('last backup exactly 14 days ago (2026-10-04 10:00) does not warn', () => {
    expect(needsBackupWarning(withBackup('2026-10-04T10:00:00+07:00'), TODAY)).toBe(false);
  });
  it('15 days ago by Thai date (2026-10-03 23:30 +07:00) warns', () => {
    expect(needsBackupWarning(withBackup('2026-10-03T23:30:00+07:00'), TODAY)).toBe(true);
  });
  it('uses the Thai date: 2026-10-03T17:30Z is already 04 Oct in Thailand = 14 days, no warning', () => {
    expect(needsBackupWarning(withBackup('2026-10-03T17:30:00Z'), TODAY)).toBe(false);
  });
  it('never backed up with one member warns', () => {
    const r = rootWith({ persons: [person()] });
    expect(r.meta.lastBackupAt).toBeUndefined();
    expect(needsBackupWarning(r, TODAY)).toBe(true);
  });
  it('a blank house never warns, even if never backed up', () => {
    expect(needsBackupWarning(emptyRoot(NOW), TODAY)).toBe(false);
  });
  it('the sample house never warns', () => {
    expect(needsBackupWarning({ ...sampleRoot(), meta: { ...sampleRoot().meta, isSample: true } }, TODAY)).toBe(false);
  });
  it('a backup dated in the future (clock moved) does not warn', () => {
    expect(needsBackupWarning(withBackup('2026-10-25T10:00:00+07:00'), TODAY)).toBe(false);
  });
  it('the limit is 14 days', () => {
    expect(BACKUP_WARN_DAYS).toBe(14);
  });
});

describe('backupAge', () => {
  it('null when never backed up; date and days since otherwise', () => {
    expect(backupAge(sampleRoot(), TODAY)).toBeNull();
    expect(backupAge(withBackup('2026-10-03T23:30:00+07:00'), TODAY)).toEqual({ date: '2026-10-03', daysAgo: 15 });
  });
});

describe('makeBackup (example 2)', () => {
  const NOW_BKK = '2026-10-18T20:40:00+07:00';

  it('file name has the Thai date', () => {
    expect(makeBackup(sampleRoot(), NOW_BKK).fileName).toBe('judya-backup-2026-10-18.json');
  });
  it('a time after 17:00 UTC is already the next Thai day', () => {
    expect(makeBackup(sampleRoot(), '2026-10-18T17:30:00.000Z').fileName).toBe('judya-backup-2026-10-19.json');
  });
  it('the text passes summarizeBackup and equals the original root except meta.lastBackupAt (= nowIso)', () => {
    const original = sampleRoot();
    const { text } = makeBackup(original, NOW_BKK);
    const back = summarizeBackup(text);
    if (!back.ok) throw new Error(back.error);
    expect(back.root.meta.lastBackupAt).toBe(NOW_BKK);
    expect(back.root).toEqual({ ...original, meta: { ...original.meta, lastBackupAt: NOW_BKK } });
  });
  it('the file is the root itself (version 2, no wrapper) and the original is not changed', () => {
    const original = sampleRoot();
    const json = JSON.parse(makeBackup(original, NOW_BKK).text) as Record<string, unknown>;
    expect(json.version).toBe(2);
    expect(Object.keys(json).sort()).toEqual(Object.keys(original).sort());
    expect(original.meta.lastBackupAt).toBeUndefined();
  });
});

describe('summarizeBackup (examples 3-4)', () => {
  const twoMembersOneRemoved = (): Root =>
    rootWith({
      persons: [person({ id: 'p1' }), person({ id: 'p2', name: 'Test Person B', removedAt: NOW })],
      medications: [
        { id: 'm1', name: 'Sample Med 5 mg', unit: 'เม็ด' },
        { id: 'm2', name: 'Sample Med 10 mg', unit: 'เม็ด' },
        { id: 'm3', name: 'Sample Med 20 mg', unit: 'เม็ด' },
      ],
      assignments: [
        assignment({ id: 'a1', medicationId: 'm1', schedule: dailyMeal({ morning: { pills: 1, meal: 'after' } }) }),
        assignment({ id: 'a2', medicationId: 'm2', schedule: dailyMeal({ morning: { pills: 1, meal: 'after' } }) }),
        assignment({ id: 'a3', medicationId: 'm3', status: 'stopped', schedule: dailyMeal({ morning: { pills: 1, meal: 'after' } }) }),
      ],
    });

  it('2 members (1 removed) and 3 medicines (1 stopped) = "สมาชิก 1 คน ยา 3 รายการ"', () => {
    const r = summarizeBackup(JSON.stringify(twoMembersOneRemoved()));
    if (!r.ok) throw new Error(r.error);
    expect(r.summary).toEqual({ members: 1, medicines: 3, houseItems: 0 });
    expect(summaryText(r.summary)).toBe('สมาชิก 1 คน ยา 3 รายการ');
  });
  it('removed house medicines are not counted', () => {
    const r = rootWith({
      houseItems: [
        { id: 'h1', name: 'House Item A' },
        { id: 'h2', name: 'House Item B', removedAt: NOW },
      ],
    });
    expect(summarizeRoot(r).houseItems).toBe(1);
  });
  it('"abc" is not_json', () => {
    expect(summarizeBackup('abc')).toEqual({ ok: false, error: 'not_json' });
    expect(summarizeBackup('')).toEqual({ ok: false, error: 'not_json' });
  });
  it('version 1 is wrong_version', () => {
    expect(summarizeBackup(JSON.stringify({ ...sampleRoot(), version: 1 }))).toEqual({ ok: false, error: 'wrong_version' });
  });
  it('version 2 with a missing field is invalid', () => {
    const { persons: _persons, ...missing } = sampleRoot();
    expect(summarizeBackup(JSON.stringify(missing))).toEqual({ ok: false, error: 'invalid' });
    const badId = { ...sampleRoot(), assignments: [{ ...sampleRoot().assignments[0], status: 'gone' }] };
    expect(summarizeBackup(JSON.stringify(badId))).toEqual({ ok: false, error: 'invalid' });
  });
  it('JSON without a version, or not an object, is invalid (it does not claim to be another version)', () => {
    expect(summarizeBackup('{}')).toEqual({ ok: false, error: 'invalid' });
    expect(summarizeBackup('[1,2]')).toEqual({ ok: false, error: 'invalid' });
    expect(summarizeBackup('null')).toEqual({ ok: false, error: 'invalid' });
    expect(summarizeBackup('42')).toEqual({ ok: false, error: 'invalid' });
  });
  it('5 MB + 1 byte is too_big, exactly 5 MB is not (it is then judged by its content)', () => {
    expect(summarizeBackup('x'.repeat(MAX_BACKUP_BYTES + 1))).toEqual({ ok: false, error: 'too_big' });
    expect(summarizeBackup('x'.repeat(MAX_BACKUP_BYTES))).toEqual({ ok: false, error: 'not_json' });
  });
  it('size is counted in bytes, not characters (a Thai letter is 3 bytes)', () => {
    const thai = 'ก'.repeat(Math.floor(MAX_BACKUP_BYTES / 3) + 1);
    expect(thai.length).toBeLessThan(MAX_BACKUP_BYTES);
    expect(summarizeBackup(thai)).toEqual({ ok: false, error: 'too_big' });
  });
  it('unknown extra keys are dropped, not carried into the data', () => {
    const r = summarizeBackup(JSON.stringify({ ...sampleRoot(), extra: 'x' }));
    if (!r.ok) throw new Error(r.error);
    expect('extra' in r.root).toBe(false);
  });
});
