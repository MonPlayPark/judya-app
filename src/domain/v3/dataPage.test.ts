import { describe, expect, it } from 'vitest';
import { summarizeBackup } from './backup';
import { RESTORE_ERRORS, backupFileOf, backupStatus, persistText, recordBackup, restoreFromBackup } from './dataPage';
import { NOW, blankRootV3, sampleRootV3 } from './fixtures';
import { DEFAULT_SETTINGS_V3, type Root } from './schema';
import { PREV_KEY, STORAGE_KEY, loadRoot, type KeyValueStore } from './storage';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const withBackup = (iso: string): Root => ({ ...sampleRootV3(), meta: { ...sampleRootV3().meta, lastBackupAt: iso } });

describe('backupStatus', () => {
  it('never', () => expect(backupStatus(sampleRootV3(), '2026-10-28')).toEqual({ kind: 'never', text: 'ยังไม่เคยสำรอง' }));
  it('14 days is still fine, 15 days is the warning', () => {
    expect(backupStatus(withBackup('2026-10-14T09:00:00+07:00'), '2026-10-28').kind).toBe('ok');
    const old = backupStatus(withBackup('2026-10-13T09:00:00+07:00'), '2026-10-28');
    expect(old.kind).toBe('old');
    expect(old.kind === 'old' && old.warning).toBe('ไม่ได้สำรองข้อมูลมา 15 วันแล้ว');
  });
  it('uses the Thai calendar day (late evening UTC is already the next Thai day)', () => {
    expect(backupStatus(withBackup('2026-10-27T18:30:00Z'), '2026-10-28').text).toBe('สำรองล่าสุด 28 ต.ค. 2569');
  });
});

describe('persistText', () => {
  it('has a different answer for each state and never claims 100% safe', () => {
    const all = (['granted', 'denied', 'unsupported', 'unknown'] as const).map(persistText);
    expect(new Set(all.map((t) => t.answer)).size).toBe(4);
    for (const t of all) expect(t.advice).not.toMatch(/100|แน่นอน/);
  });
});

describe('every restore error says the current data is untouched', () => {
  it.each(Object.entries(RESTORE_ERRORS))('%s', (_k, text) => expect(text).toContain('ข้อมูลปัจจุบันไม่ถูกแตะ'));
  it('wrong_version names the older app version', () => expect(RESTORE_ERRORS.wrong_version).toContain('แอปเวอร์ชันเก่า'));
});

describe('backup file and restore', () => {
  it('the file carries default settings, not the real ones, and is a valid backup', () => {
    const root: Root = { ...sampleRootV3(), settings: { ...DEFAULT_SETTINGS_V3, fontSize: 'large', orderDays: 60 } };
    const file = backupFileOf(root, NOW);
    expect(file.fileName).toBe('judya-backup-2026-10-28-v3.json');
    const check = summarizeBackup(file.text);
    expect(check.ok && check.root.settings).toEqual(DEFAULT_SETTINGS_V3);
    expect(check.ok && check.root.meta.lastBackupAt).toBe(NOW);
  });

  it('recordBackup saves only lastBackupAt', () => {
    const store = memoryStore({ [STORAGE_KEY]: JSON.stringify(sampleRootV3()) });
    const saved = recordBackup(sampleRootV3(), NOW, store);
    expect(saved?.meta.lastBackupAt).toBe(NOW);
    const loaded = loadRoot(store);
    expect(loaded.status === 'ok' && { ...loaded.root, meta: undefined }).toEqual({ ...sampleRootV3(), meta: undefined });
  });

  it('recordBackup returns null when saving fails', () => {
    const store = memoryStore();
    store.setItem = () => {
      throw new Error('blocked');
    };
    expect(recordBackup(sampleRootV3(), NOW, store)).toBeNull();
  });

  it('restoreFromBackup keeps the current settings and the old text goes to judya.v3.prev', () => {
    const current: Root = { ...blankRootV3(), settings: { ...DEFAULT_SETTINGS_V3, fontSize: 'medium' } };
    const store = memoryStore({ [STORAGE_KEY]: JSON.stringify(current) });
    const old = store.data[STORAGE_KEY];
    const out = restoreFromBackup(sampleRootV3(), current, store);
    expect(out.ok && out.root.settings.fontSize).toBe('medium');
    expect(store.data[PREV_KEY]).toBe(old);
    const loaded = loadRoot(store);
    expect(loaded.status === 'ok' && loaded.root.persons).toEqual(sampleRootV3().persons);
  });

  it('restoreFromBackup failure: Thai text, nothing changed', () => {
    const store = memoryStore({ [STORAGE_KEY]: 'old' });
    const real = store.setItem;
    store.setItem = (k, v) => {
      if (k === STORAGE_KEY) throw new Error('blocked');
      real(k, v);
    };
    const out = restoreFromBackup(sampleRootV3(), blankRootV3(), store);
    expect(out.ok).toBe(false);
    expect(!out.ok && out.text).toContain('ข้อมูลปัจจุบันไม่ถูกแตะ');
    expect(store.data[STORAGE_KEY]).toBe('old');
  });
});
