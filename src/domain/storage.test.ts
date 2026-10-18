import { describe, expect, it } from 'vitest';
import { sampleRoot } from './fixtures';
import { PREV_KEY, STORAGE_KEY, loadRoot, restoreRoot, saveRoot, startFresh, type KeyValueStore } from './storage';

/** In-memory store that records every key it is asked about. */
class FakeStore implements KeyValueStore {
  data = new Map<string, string>();
  touched = new Set<string>();
  failSet: 'quota' | null = null;
  failKey: string | null = null; // when set, only writes to this key fail
  garbleNextSet = false; // corrupts only the next write, like a one-off disk glitch
  garbleKey: string | null = null; // when set, only a write to this key can be the corrupted one

  getItem(key: string): string | null {
    this.touched.add(key);
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.touched.add(key);
    if (this.failSet === 'quota' && (this.failKey === null || this.failKey === key)) throw new DOMException('full', 'QuotaExceededError');
    const garble = this.garbleNextSet && (this.garbleKey === null || this.garbleKey === key);
    if (garble) this.garbleNextSet = false;
    this.data.set(key, garble ? value.slice(0, -5) : value);
  }
  removeItem(key: string): void {
    this.touched.add(key);
    this.data.delete(key);
  }
}

describe('storage (key judya.v2)', () => {
  it('first launch: nothing saved reads as empty', () => {
    expect(loadRoot(new FakeStore())).toEqual({ status: 'empty' });
  });

  it('save then load returns the same data', () => {
    const s = new FakeStore();
    const root = sampleRoot();
    expect(saveRoot(root, s)).toEqual({ ok: true });
    const r = loadRoot(s);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.root).toEqual(root);
  });

  it('corrupt JSON is reported and left untouched (never overwritten by load)', () => {
    const s = new FakeStore();
    s.data.set(STORAGE_KEY, '{"version":2,"persons":[');
    const r = loadRoot(s);
    expect(r.status).toBe('corrupt');
    expect(s.data.get(STORAGE_KEY)).toBe('{"version":2,"persons":[');
  });

  it('data that fails the schema is reported as corrupt and kept', () => {
    const s = new FakeStore();
    const bad = JSON.stringify({ ...sampleRoot(), settings: { expiryWarnDays: 0 } });
    s.data.set(STORAGE_KEY, bad);
    expect(loadRoot(s).status).toBe('corrupt');
    expect(s.data.get(STORAGE_KEY)).toBe(bad);
  });

  it('a different data version is not loaded and not overwritten', () => {
    const s = new FakeStore();
    const newer = JSON.stringify({ version: 3, persons: [] });
    s.data.set(STORAGE_KEY, newer);
    expect(loadRoot(s)).toMatchObject({ status: 'wrong-version', foundVersion: 3 });
    expect(s.data.get(STORAGE_KEY)).toBe(newer);
  });

  it('storage full: save fails and the old data survives', () => {
    const s = new FakeStore();
    const old = sampleRoot();
    expect(saveRoot(old, s).ok).toBe(true);
    const before = s.data.get(STORAGE_KEY);

    s.failSet = 'quota';
    const changed = { ...old, persons: [...old.persons, { ...old.persons[0]!, id: 'p2' }] };
    expect(saveRoot(changed, s)).toMatchObject({ ok: false, reason: 'quota' });
    expect(s.data.get(STORAGE_KEY)).toBe(before);
  });

  it('write that does not read back correctly is rolled back to the previous value', () => {
    const s = new FakeStore();
    expect(saveRoot(sampleRoot(), s).ok).toBe(true);
    const before = s.data.get(STORAGE_KEY);

    s.garbleNextSet = true;
    const changed = { ...sampleRoot(), medications: [{ id: 'm2', name: 'Other Sample 10 mg', unit: 'เม็ด' }] };
    expect(saveRoot(changed, s)).toMatchObject({ ok: false, reason: 'verify-failed' });
    expect(s.data.get(STORAGE_KEY)).toBe(before);
  });

  it('invalid data is refused before anything is written', () => {
    const s = new FakeStore();
    expect(saveRoot(sampleRoot(), s).ok).toBe(true);
    const before = s.data.get(STORAGE_KEY);

    const invalid = { ...sampleRoot(), settings: { ...sampleRoot().settings, orderDays: 3 } };
    expect(saveRoot(invalid, s)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(s.data.get(STORAGE_KEY)).toBe(before);
  });

  it('first save that fails leaves no key behind', () => {
    const s = new FakeStore();
    s.failSet = 'quota';
    expect(saveRoot(sampleRoot(), s).ok).toBe(false);
    expect(s.data.has(STORAGE_KEY)).toBe(false);
  });

  it('never touches any other localStorage key', () => {
    const s = new FakeStore();
    s.data.set('judya.v1', 'old-app-data');
    s.data.set('medmate.v1', 'older-app-data');
    saveRoot(sampleRoot(), s);
    loadRoot(s);
    s.failSet = 'quota';
    saveRoot(sampleRoot(), s);
    expect([...s.touched]).toEqual([STORAGE_KEY]);
    expect(s.data.get('judya.v1')).toBe('old-app-data');
    expect(s.data.get('medmate.v1')).toBe('older-app-data');
  });

  it('missing or blocked storage is reported, not thrown', () => {
    expect(loadRoot(null)).toEqual({ status: 'unavailable' });
    expect(saveRoot(sampleRoot(), null)).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  describe('start fresh (after corrupt / wrong-version data)', () => {
    it('keeps the old text under judya.v2.prev, then writes a blank house', () => {
      const s = new FakeStore();
      s.data.set(STORAGE_KEY, '{"version":2,"persons":[');
      expect(startFresh('2026-10-17T09:00:00+07:00', s)).toEqual({ ok: true });
      expect(s.data.get(PREV_KEY)).toBe('{"version":2,"persons":[');
      expect(loadRoot(s)).toMatchObject({ status: 'ok', root: { persons: [], assignments: [] } });
    });

    it('if the safety copy cannot be written, the old data is left exactly as it was', () => {
      const s = new FakeStore();
      s.data.set(STORAGE_KEY, 'garbage');
      s.failSet = 'quota';
      s.failKey = PREV_KEY;
      expect(startFresh('2026-10-17T09:00:00+07:00', s)).toMatchObject({ ok: false });
      expect(s.data.get(STORAGE_KEY)).toBe('garbage');
      expect(s.data.has(PREV_KEY)).toBe(false);
    });

    it('if the blank house cannot be written, the old data is still in judya.v2', () => {
      const s = new FakeStore();
      s.data.set(STORAGE_KEY, 'garbage');
      s.failSet = 'quota';
      s.failKey = STORAGE_KEY;
      expect(startFresh('2026-10-17T09:00:00+07:00', s)).toMatchObject({ ok: false, reason: 'quota' });
      expect(s.data.get(STORAGE_KEY)).toBe('garbage');
    });

    it('touches only judya.v2 and judya.v2.prev', () => {
      const s = new FakeStore();
      s.data.set('judya.v1', 'old-app-data');
      s.data.set(STORAGE_KEY, 'garbage');
      startFresh('2026-10-17T09:00:00+07:00', s);
      expect([...s.touched].sort()).toEqual([STORAGE_KEY, PREV_KEY].sort());
      expect(s.data.get('judya.v1')).toBe('old-app-data');
    });
  });

  describe('restore from a backup file (restoreRoot)', () => {
    const OTHER = { ...sampleRoot(), medications: [{ id: 'm9', name: 'Other Sample 10 mg', unit: 'เม็ด' }], assignments: [], events: [], prepLog: {} };
    const stored = (s: FakeStore) => s.data.get(STORAGE_KEY);

    it('keeps the old text under judya.v2.prev, then writes the new data (example 5)', () => {
      const s = new FakeStore();
      expect(saveRoot(sampleRoot(), s).ok).toBe(true);
      const before = stored(s);
      expect(restoreRoot(OTHER, s)).toEqual({ ok: true });
      expect(s.data.get(PREV_KEY)).toBe(before);
      expect(loadRoot(s)).toMatchObject({ status: 'ok', root: OTHER });
    });

    it('works over unreadable data too: the unreadable text is kept in judya.v2.prev', () => {
      const s = new FakeStore();
      s.data.set(STORAGE_KEY, '{"version":2,"persons":[');
      expect(restoreRoot(OTHER, s)).toEqual({ ok: true });
      expect(s.data.get(PREV_KEY)).toBe('{"version":2,"persons":[');
      expect(loadRoot(s).status).toBe('ok');
    });

    it('first restore with nothing stored writes only judya.v2', () => {
      const s = new FakeStore();
      expect(restoreRoot(OTHER, s)).toEqual({ ok: true });
      expect(s.data.has(PREV_KEY)).toBe(false);
      expect(loadRoot(s).status).toBe('ok');
    });

    it('an older judya.v2.prev is overwritten', () => {
      const s = new FakeStore();
      saveRoot(sampleRoot(), s);
      s.data.set(PREV_KEY, 'older');
      restoreRoot(OTHER, s);
      expect(s.data.get(PREV_KEY)).not.toBe('older');
    });

    it('the write of judya.v2 fails (second key): both keys are back to their old values', () => {
      const s = new FakeStore();
      saveRoot(sampleRoot(), s);
      s.data.set(PREV_KEY, 'older-copy');
      const main = stored(s);
      s.failSet = 'quota';
      s.failKey = STORAGE_KEY;
      expect(restoreRoot(OTHER, s)).toMatchObject({ ok: false, reason: 'quota' });
      expect(stored(s)).toBe(main);
      expect(s.data.get(PREV_KEY)).toBe('older-copy');
    });

    it('judya.v2 written but does not read back right: both keys are back to their old values', () => {
      const s = new FakeStore();
      saveRoot(sampleRoot(), s);
      s.data.set(PREV_KEY, 'older-copy');
      const main = stored(s);
      s.garbleNextSet = true;
      s.garbleKey = STORAGE_KEY;
      expect(restoreRoot(OTHER, s)).toMatchObject({ ok: false, reason: 'verify-failed' });
      expect(stored(s)).toBe(main);
      expect(s.data.get(PREV_KEY)).toBe('older-copy');
    });

    it('the safety copy cannot be written: nothing changes, judya.v2 is not even attempted', () => {
      const s = new FakeStore();
      saveRoot(sampleRoot(), s);
      const main = stored(s);
      s.failSet = 'quota';
      s.failKey = PREV_KEY;
      expect(restoreRoot(OTHER, s)).toMatchObject({ ok: false, reason: 'quota' });
      expect(stored(s)).toBe(main);
      expect(s.data.has(PREV_KEY)).toBe(false);
    });

    it('the safety copy does not read back right: nothing changes', () => {
      const s = new FakeStore();
      saveRoot(sampleRoot(), s);
      const main = stored(s);
      s.garbleNextSet = true;
      s.garbleKey = PREV_KEY;
      expect(restoreRoot(OTHER, s)).toMatchObject({ ok: false, reason: 'verify-failed' });
      expect(stored(s)).toBe(main);
      expect(s.data.has(PREV_KEY)).toBe(false);
    });

    it('data that fails the schema is refused before any key is touched', () => {
      const s = new FakeStore();
      saveRoot(sampleRoot(), s);
      s.touched.clear();
      const invalid = { ...OTHER, settings: { ...OTHER.settings, orderDays: 3 } };
      expect(restoreRoot(invalid, s)).toMatchObject({ ok: false, reason: 'invalid' });
      expect([...s.touched]).toEqual([]);
    });

    it('blocked storage is reported, not thrown', () => {
      expect(restoreRoot(OTHER, null)).toMatchObject({ ok: false, reason: 'unavailable' });
    });

    it('never reads or changes any key except judya.v2 and judya.v2.prev (judya.v1, medmate.v1 stay as they were)', () => {
      const s = new FakeStore();
      s.data.set('judya.v1', 'old-app-data');
      s.data.set('medmate.v1', 'older-app-data');
      saveRoot(sampleRoot(), s);
      restoreRoot(OTHER, s);
      s.failSet = 'quota';
      restoreRoot(sampleRoot(), s); // a failing run touches only our keys as well
      expect([...s.touched].sort()).toEqual([PREV_KEY, STORAGE_KEY].sort());
      expect(s.data.get('judya.v1')).toBe('old-app-data');
      expect(s.data.get('medmate.v1')).toBe('older-app-data');
    });
  });
});
