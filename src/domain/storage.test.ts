import { describe, expect, it } from 'vitest';
import { sampleRoot } from './fixtures';
import { STORAGE_KEY, loadRoot, saveRoot, type KeyValueStore } from './storage';

/** In-memory store that records every key it is asked about. */
class FakeStore implements KeyValueStore {
  data = new Map<string, string>();
  touched = new Set<string>();
  failSet: 'quota' | null = null;
  garbleNextSet = false; // corrupts only the next write, like a one-off disk glitch

  getItem(key: string): string | null {
    this.touched.add(key);
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.touched.add(key);
    if (this.failSet === 'quota') throw new DOMException('full', 'QuotaExceededError');
    const garble = this.garbleNextSet;
    this.garbleNextSet = false;
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
});
