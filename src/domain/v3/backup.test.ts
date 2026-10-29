import { describe, expect, it } from 'vitest';
import {
  BACKUP_WARN_DAYS, MAX_BACKUP_BYTES, NEVER_BACKED_UP_TEXT, backupAge, backupBanner, bangkokDate, hasMedicines,
  isTooBig, makeBackup, markBackedUp, needsBackupWarning, oldBackupText, shouldShowNeverBackedUp, summarizeBackup,
} from './backup';
import { NOW, blankRootV3, sampleRootV3 } from './fixtures';
import type { Root } from './schema';
import { PREV_KEY, STORAGE_KEY, loadRoot, restoreRoot, saveRoot, startFresh, type KeyValueStore } from './storage';

class FakeStore implements KeyValueStore {
  data = new Map<string, string>();
  touched = new Set<string>();
  getItem(key: string): string | null {
    this.touched.add(key);
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.touched.add(key);
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.touched.add(key);
    this.data.delete(key);
  }
}

const LATER = '2026-11-02T10:00:00+07:00';
const withMedicine = (r: Root): Root => ({ ...r, assignments: sampleRootV3().assignments.slice(0, 1), medications: sampleRootV3().medications, persons: sampleRootV3().persons });

describe('the backup file', () => {
  it('is the root as JSON with version 3, nothing wrapped around it', () => {
    const { text } = makeBackup(sampleRootV3(), LATER);
    const json = JSON.parse(text) as Record<string, unknown>;
    expect(json.version).toBe(3);
    expect(Object.keys(json).sort()).toEqual(Object.keys(sampleRootV3()).sort());
  });

  it('stamps meta.lastBackupAt in the file and leaves the root passed in alone', () => {
    const root = sampleRootV3();
    const { text } = makeBackup(root, LATER);
    expect((JSON.parse(text) as Root).meta.lastBackupAt).toBe(LATER);
    expect(root).toEqual(sampleRootV3());
  });

  it('file name: same start as v2, the Thai date, then -v3', () => {
    expect(makeBackup(sampleRootV3(), LATER).fileName).toBe('judya-backup-2026-11-02-v3.json');
  });

  it('file name uses the Thai date, not the UTC date', () => {
    expect(bangkokDate('2026-10-28T20:30:00Z')).toBe('2026-10-29'); // 03:30 in Thailand
    expect(bangkokDate('2026-10-28T16:59:00Z')).toBe('2026-10-28');
    expect(makeBackup(sampleRootV3(), '2026-10-28T20:30:00Z').fileName).toBe('judya-backup-2026-10-29-v3.json');
  });

  it('markBackedUp returns a new root and does not change the old one', () => {
    const root = sampleRootV3();
    const stamped = markBackedUp(root, LATER);
    expect(stamped).not.toBe(root);
    expect(stamped.meta.lastBackupAt).toBe(LATER);
    expect(root.meta.lastBackupAt).toBeUndefined();
    expect(stamped.persons).toBe(root.persons);
  });
});

describe('checking a backup file', () => {
  it('a good file is ok and returns the root and a summary', () => {
    const r = summarizeBackup(makeBackup(sampleRootV3(), LATER).text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.root.version).toBe(3);
      expect(r.summary).toMatchObject({ members: 7, medicines: 7, houseItems: 2, orders: 4 });
    }
  });

  it('summary text is Thai and has the four numbers', () => {
    const r = summarizeBackup(makeBackup(sampleRootV3(), LATER).text);
    expect(r.ok && r.summary.text).toBe('สมาชิก 7 คน ยา 7 รายการ ยาสามัญ 2 รายการ ใบสั่ง 4 ใบ');
  });

  it('removed members and removed house medicines are not counted; stopped medicines and every order are', () => {
    const root = sampleRootV3();
    root.persons[0]!.removedAt = LATER;
    root.persons[1]!.removedAt = LATER;
    root.houseItems[0]!.removedAt = LATER;
    const r = summarizeBackup(JSON.stringify(root));
    expect(r.ok && r.summary).toMatchObject({ members: 5, medicines: 7, houseItems: 1, orders: 4 });
  });

  it('a blank house is ok with all zeros', () => {
    const r = summarizeBackup(JSON.stringify(blankRootV3()));
    expect(r.ok && r.summary).toMatchObject({ members: 0, medicines: 0, houseItems: 0, orders: 0 });
  });

  it('not JSON -> not_json', () => {
    expect(summarizeBackup('hello')).toEqual({ ok: false, error: 'not_json' });
    expect(summarizeBackup('')).toEqual({ ok: false, error: 'not_json' });
    expect(summarizeBackup('{"version":3,')).toEqual({ ok: false, error: 'not_json' });
  });

  it('a version 2 file -> wrong_version (not invalid)', () => {
    const v2 = JSON.stringify({ version: 2, persons: [], medications: [], assignments: [], events: [], houseItems: [], shops: [], prices: [], settings: {}, prepLog: {}, meta: {} });
    expect(summarizeBackup(v2)).toEqual({ ok: false, error: 'wrong_version' });
  });

  it('any other version (1, 4, "3") -> wrong_version', () => {
    for (const version of [1, 4, '3']) {
      expect(summarizeBackup(JSON.stringify({ ...sampleRootV3(), version }))).toEqual({ ok: false, error: 'wrong_version' });
    }
  });

  it('no version, or not an object -> invalid', () => {
    const { version: _v, ...noVersion } = sampleRootV3();
    expect(summarizeBackup(JSON.stringify(noVersion))).toEqual({ ok: false, error: 'invalid' });
    for (const text of ['null', '[]', '42', '"x"']) expect(summarizeBackup(text)).toEqual({ ok: false, error: 'invalid' });
  });

  it('damaged data -> invalid', () => {
    const bad = { ...sampleRootV3(), settings: { expiryWarnDays: 0 } };
    expect(summarizeBackup(JSON.stringify(bad))).toEqual({ ok: false, error: 'invalid' });
    const noTable = { ...sampleRootV3(), assignments: undefined };
    expect(summarizeBackup(JSON.stringify(noTable))).toEqual({ ok: false, error: 'invalid' });
  });

  it('a file with a broken reference between tables -> invalid', () => {
    const root = sampleRootV3();
    root.orders[0]!.shopId = 'gone';
    expect(summarizeBackup(JSON.stringify(root))).toEqual({ ok: false, error: 'invalid' });
  });

  it('bigger than 5 MB -> too_big, checked before anything else', () => {
    expect(MAX_BACKUP_BYTES).toBe(5 * 1024 * 1024);
    expect(summarizeBackup('x'.repeat(MAX_BACKUP_BYTES + 1))).toEqual({ ok: false, error: 'too_big' });
    expect(summarizeBackup('x'.repeat(MAX_BACKUP_BYTES))).toEqual({ ok: false, error: 'not_json' }); // exactly 5 MB is allowed
  });

  it('size is counted in bytes, not letters (Thai letters are 3 bytes)', () => {
    expect(summarizeBackup('ก'.repeat(Math.floor(MAX_BACKUP_BYTES / 3) + 1))).toEqual({ ok: false, error: 'too_big' });
  });

  it('isTooBig for a chosen file (File.size)', () => {
    expect(isTooBig(MAX_BACKUP_BYTES)).toBe(false);
    expect(isTooBig(MAX_BACKUP_BYTES + 1)).toBe(true);
  });
});

describe('restore: backup -> wipe -> restore', () => {
  it('every table comes back exactly as it was (orders, prices, 3 allergy states, coverage, events)', () => {
    const store = new FakeStore();
    const original = sampleRootV3();
    expect(saveRoot(original, store)).toEqual({ ok: true });
    const { text } = makeBackup(original, LATER);

    expect(startFresh(NOW, store)).toEqual({ ok: true }); // the wipe
    const wiped = loadRoot(store);
    expect(wiped.status === 'ok' && wiped.root.persons).toEqual([]);

    const checked = summarizeBackup(text);
    if (!checked.ok) throw new Error('backup should be ok');
    expect(restoreRoot(checked.root, store)).toEqual({ ok: true });
    const back = loadRoot(store);
    if (back.status !== 'ok') throw new Error('should load');

    for (const table of ['persons', 'medications', 'assignments', 'events', 'houseItems', 'shops', 'prices', 'orders'] as const) {
      expect(back.root[table], table).toEqual(original[table]);
    }
    expect(back.root.settings).toEqual(original.settings);
    expect(back.root.prepLog).toEqual(original.prepLog);
    expect(back.root.persons.map((p) => p.allergies.status)).toContain('listed');
    expect(back.root.persons.map((p) => p.allergies.status)).toContain('none_confirmed');
    expect(back.root.persons.map((p) => p.allergies.status)).toContain('unknown');
    // The only difference is the backup stamp that the file carries.
    expect(back.root).toEqual({ ...original, meta: { ...original.meta, lastBackupAt: LATER } });
  });

  it('after a restore, judya.v3.prev holds the data that was there before', () => {
    const store = new FakeStore();
    const before = withMedicine(blankRootV3());
    saveRoot(before, store);
    const beforeText = store.data.get(STORAGE_KEY);
    const checked = summarizeBackup(makeBackup(sampleRootV3(), LATER).text);
    if (!checked.ok) throw new Error('backup should be ok');
    expect(restoreRoot(checked.root, store)).toEqual({ ok: true });
    expect(store.data.get(PREV_KEY)).toBe(beforeText);
    expect(JSON.parse(store.data.get(PREV_KEY)!)).toEqual(before);
    expect(loadRoot(store).status).toBe('ok');
  });

  it('a file that fails the check is never restored: the data stays as it was', () => {
    const store = new FakeStore();
    saveRoot(sampleRootV3(), store);
    store.data.set(PREV_KEY, 'older safety copy');
    const mainBefore = store.data.get(STORAGE_KEY);
    const bad = ['hello', JSON.stringify({ version: 2 }), JSON.stringify({ version: 3, persons: 'x' }), 'x'.repeat(MAX_BACKUP_BYTES + 1)];
    for (const text of bad) {
      const checked = summarizeBackup(text);
      expect(checked.ok).toBe(false);
      if (checked.ok) restoreRoot(checked.root, store); // the screen only restores after an ok check
    }
    expect(store.data.get(STORAGE_KEY)).toBe(mainBefore);
    expect(store.data.get(PREV_KEY)).toBe('older safety copy');
  });

  it('restoring the file of a house with a removed member keeps that member and what points to them', () => {
    const root = sampleRootV3();
    root.persons.find((p) => p.id === 'p2')!.removedAt = LATER;
    const checked = summarizeBackup(makeBackup(root, LATER).text);
    expect(checked.ok && checked.root.persons.find((p) => p.id === 'p2')?.removedAt).toBe(LATER);
    expect(checked.ok && checked.summary.members).toBe(6);
  });
});

describe('the "never backed up" banner', () => {
  it('no medicines -> not shown (blank house, or only people)', () => {
    expect(shouldShowNeverBackedUp(blankRootV3())).toBe(false);
    expect(shouldShowNeverBackedUp({ ...blankRootV3(), persons: sampleRootV3().persons })).toBe(false);
  });

  it('medicines (assignments) and never backed up -> shown', () => {
    expect(shouldShowNeverBackedUp(withMedicine(blankRootV3()))).toBe(true);
  });

  it('only a house medicine (not removed) and never backed up -> shown; a removed one does not count', () => {
    const house = { ...blankRootV3(), houseItems: [{ id: 'h1', name: 'ยาสามัญตัวอย่าง ก' }] };
    expect(shouldShowNeverBackedUp(house)).toBe(true);
    expect(shouldShowNeverBackedUp({ ...house, houseItems: [{ id: 'h1', name: 'ยาสามัญตัวอย่าง ก', removedAt: NOW }] })).toBe(false);
  });

  it('backed up already -> not shown', () => {
    expect(shouldShowNeverBackedUp(markBackedUp(sampleRootV3(), LATER))).toBe(false);
  });

  it('hasMedicines', () => {
    expect(hasMedicines(blankRootV3())).toBe(false);
    expect(hasMedicines(sampleRootV3())).toBe(true);
  });
});

describe('the "old backup" warning (ported from v2, more than 14 days)', () => {
  const backedUp = markBackedUp(sampleRootV3(), '2026-10-01T09:00:00+07:00');

  it('age is counted in Thai calendar days', () => {
    expect(backupAge(backedUp, '2026-10-16')).toEqual({ date: '2026-10-01', daysAgo: 15 });
    expect(backupAge(sampleRootV3(), '2026-10-16')).toBeNull();
    expect(backupAge(markBackedUp(sampleRootV3(), '2026-09-30T20:00:00Z'), '2026-10-01')).toEqual({ date: '2026-10-01', daysAgo: 0 });
  });

  it('exactly 14 days is quiet, 15 days warns', () => {
    expect(BACKUP_WARN_DAYS).toBe(14);
    expect(needsBackupWarning(backedUp, '2026-10-15')).toBe(false);
    expect(needsBackupWarning(backedUp, '2026-10-16')).toBe(true);
  });

  it('never backed up is not this function\'s case', () => {
    expect(needsBackupWarning(sampleRootV3(), '2027-01-01')).toBe(false);
  });

  it('no medicines -> no warning, however old', () => {
    expect(needsBackupWarning(markBackedUp(blankRootV3(), '2026-01-01T09:00:00+07:00'), '2026-10-16')).toBe(false);
  });

  it('a backup dated after today (phone clock moved back) does not warn', () => {
    expect(needsBackupWarning(backedUp, '2026-09-01')).toBe(false);
  });
});

describe('which banner to show (one at a time)', () => {
  const backedUp = markBackedUp(sampleRootV3(), '2026-10-01T09:00:00+07:00');

  it('no medicines -> null', () => {
    expect(backupBanner(blankRootV3(), '2026-10-28')).toBeNull();
  });

  it('medicines, never backed up -> "ยังไม่ได้สำรองข้อมูล"', () => {
    expect(backupBanner(sampleRootV3(), '2026-10-28')).toEqual({ kind: 'never', text: 'ยังไม่ได้สำรองข้อมูล' });
    expect(NEVER_BACKED_UP_TEXT).toBe('ยังไม่ได้สำรองข้อมูล');
  });

  it('backed up recently -> null', () => {
    expect(backupBanner(backedUp, '2026-10-10')).toBeNull();
    expect(backupBanner(backedUp, '2026-10-15')).toBeNull();
  });

  it('backed up more than 14 days ago -> a different text with the number of days', () => {
    const banner = backupBanner(backedUp, '2026-10-28');
    expect(banner).toEqual({ kind: 'old', text: 'ไม่ได้สำรองข้อมูลมา 27 วันแล้ว', daysAgo: 27 });
    expect(banner?.text).not.toBe(NEVER_BACKED_UP_TEXT);
    expect(oldBackupText(15)).toBe('ไม่ได้สำรองข้อมูลมา 15 วันแล้ว');
  });

  it('after a backup the banner goes away (markBackedUp, then the same day)', () => {
    const root = sampleRootV3();
    expect(backupBanner(root, '2026-10-28')).not.toBeNull();
    expect(backupBanner(markBackedUp(root, NOW), '2026-10-28')).toBeNull();
  });
});

describe('storage keys', () => {
  it('with the real localStorage, every v3 function in this PR touches only judya.v3 and judya.v3.prev', () => {
    localStorage.clear();
    localStorage.setItem('judya.v2', 'v2 data');
    localStorage.setItem('judya.v2.prev', 'v2 prev');
    const keys: string[] = [];
    const proto = Object.getPrototypeOf(localStorage) as Storage;
    const originals = { g: proto.getItem, s: proto.setItem, r: proto.removeItem, k: proto.key, c: proto.clear };
    proto.getItem = function (this: Storage, k: string) { keys.push(k); return originals.g.call(this, k); };
    proto.setItem = function (this: Storage, k: string, v: string) { keys.push(k); originals.s.call(this, k, v); };
    proto.removeItem = function (this: Storage, k: string) { keys.push(k); originals.r.call(this, k); };
    proto.key = function (this: Storage, i: number) { keys.push(`key(${i})`); return originals.k.call(this, i); };
    proto.clear = function (this: Storage) { keys.push('clear()'); originals.c.call(this); };
    try {
      const root = sampleRootV3();
      const { text } = makeBackup(root, LATER);
      const checked = summarizeBackup(text);
      summarizeBackup('hello');
      backupBanner(root, '2026-10-28');
      shouldShowNeverBackedUp(root);
      needsBackupWarning(root, '2026-10-28');
      backupAge(root, '2026-10-28');
      markBackedUp(root, LATER);
      expect(keys).toEqual([]); // the pure functions do not touch storage at all
      if (checked.ok) restoreRoot(checked.root);
      saveRoot(root);
      loadRoot();
    } finally {
      proto.getItem = originals.g;
      proto.setItem = originals.s;
      proto.removeItem = originals.r;
      proto.key = originals.k;
      proto.clear = originals.c;
    }
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys)).toEqual(new Set(['judya.v3', 'judya.v3.prev']));
    expect(localStorage.getItem('judya.v2')).toBe('v2 data');
    expect(localStorage.getItem('judya.v2.prev')).toBe('v2 prev');
    localStorage.clear();
  });
});
