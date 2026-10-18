// Data layer methods of step 3.2d: replaceAll (restore), markBackedUp, setSettings, and asking the browser to keep the data.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleRoot } from '../domain/fixtures';
import { dailyMeal } from '../domain/helpers.test-util';
import { PREV_KEY, STORAGE_KEY, saveRoot } from '../domain/storage';
import type { Root } from '../domain/schema';
import { DataProvider, useData, type DataApi } from './DataContext';
import { resetPersistenceAsked } from './persist';

const TODAY = '2026-10-18';
let api: DataApi;
function Probe() {
  api = useData();
  return null;
}
const mount = () => render(<DataProvider getToday={() => TODAY}><Probe /></DataProvider>);
function run<T>(fn: () => T): T {
  let out!: T;
  act(() => {
    out = fn();
  });
  return out;
}
const root = (): Root => {
  if (api.state.kind !== 'ready') throw new Error('not ready');
  return api.state.root;
};
const disk = () => localStorage.getItem(STORAGE_KEY);
const other = (): Root => ({ ...sampleRoot(), persons: [], assignments: [], events: [], prepLog: {}, medications: [] });
const failWrites = (key?: string) =>
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string) {
    if (key === undefined || k === key) throw new DOMException('full', 'QuotaExceededError');
  });

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
  resetPersistenceAsked();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
});

describe('replaceAll (restore from a backup file)', () => {
  it('replaces memory and disk, and keeps the old text in judya.v2.prev', () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    const before = disk();
    mount();
    expect(run(() => api.replaceAll(other()))).toEqual({ ok: true });
    expect(root()).toEqual(other());
    expect(disk()).toBe(JSON.stringify(other()));
    expect(localStorage.getItem(PREV_KEY)).toBe(before);
  });

  it('works from the problem screen (unreadable data): the screen then shows the restored house', () => {
    localStorage.setItem(STORAGE_KEY, '{"version":2,"persons":[');
    mount();
    expect(api.state).toEqual({ kind: 'problem', problem: 'corrupt' });
    expect(run(() => api.replaceAll(sampleRoot()))).toEqual({ ok: true });
    expect(root()).toEqual(sampleRoot());
    expect(localStorage.getItem(PREV_KEY)).toBe('{"version":2,"persons":[');
  });

  it('a save that fails returns save_failed; memory, judya.v2 and judya.v2.prev keep what they had', () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    localStorage.setItem(PREV_KEY, 'older-copy');
    const before = disk();
    mount();
    const memory = root();
    failWrites(STORAGE_KEY); // the safety copy is written, then writing the new data fails
    expect(run(() => api.replaceAll(other()))).toEqual({ ok: false, error: 'save_failed' });
    expect(root()).toBe(memory);
    expect(disk()).toBe(before);
    expect(localStorage.getItem(PREV_KEY)).toBe('older-copy');
  });

  it('data that is not valid is refused as invalid_data and nothing is written', () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    const before = disk();
    mount();
    const bad = { ...other(), settings: { ...other().settings, orderDays: 3 } };
    expect(run(() => api.replaceAll(bad))).toEqual({ ok: false, error: 'invalid_data' });
    expect(disk()).toBe(before);
    expect(localStorage.getItem(PREV_KEY)).toBeNull();
  });
});

describe('markBackedUp', () => {
  it('saves the time of the backup', () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    mount();
    expect(run(() => api.markBackedUp('2026-10-18T20:40:00+07:00'))).toEqual({ ok: true });
    expect(root().meta.lastBackupAt).toBe('2026-10-18T20:40:00+07:00');
    expect((JSON.parse(disk() ?? '{}') as Root).meta.lastBackupAt).toBe('2026-10-18T20:40:00+07:00');
  });
  it('a failed save is save_failed and the date does not change', () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    mount();
    const memory = root();
    failWrites();
    expect(run(() => api.markBackedUp('2026-10-18T20:40:00+07:00'))).toEqual({ ok: false, error: 'save_failed' });
    expect(root()).toBe(memory);
    expect(root().meta.lastBackupAt).toBeUndefined();
  });
});

describe('setSettings', () => {
  it('applies at once and saves; a value outside the range is refused and nothing changes', () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    mount();
    expect(run(() => api.setSettings({ expiryWarnDays: 30 }))).toEqual({ ok: true });
    expect(root().settings.expiryWarnDays).toBe(30);
    expect((JSON.parse(disk() ?? '{}') as Root).settings.expiryWarnDays).toBe(30);
    const memory = root();
    expect(run(() => api.setSettings({ expiryWarnDays: 366 }))).toEqual({ ok: false, error: 'invalid_expiry_days' });
    expect(run(() => api.setSettings({ lowStockDays: 61 }))).toEqual({ ok: false, error: 'invalid_low_stock_days' });
    expect(root()).toBe(memory);
  });
  it('a failed save is save_failed and the value shown does not change', () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    mount();
    failWrites();
    expect(run(() => api.setSettings({ lowStockDays: 14 }))).toEqual({ ok: false, error: 'save_failed' });
    expect(root().settings.lowStockDays).toBe(7);
  });
});

describe('asking the browser to keep the data', () => {
  const fakeStorage = (persisted: boolean) => {
    const persist = vi.fn(async () => true);
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: async () => persisted, persist } });
    return persist;
  };
  afterEach(() => Reflect.deleteProperty(navigator, 'storage'));

  it('asks when the app opens, and asks again after the first medicine is saved (but not after the second)', async () => {
    const persist = fakeStorage(false);
    mount();
    await act(async () => {});
    expect(persist).toHaveBeenCalledTimes(1);

    const p = run(() => api.addPerson({ name: 'Test Person A', relation: 'แม่', selfManaged: false }));
    if (!p.ok) throw new Error(p.error);
    expect(persist).toHaveBeenCalledTimes(1); // adding a member is not a medicine
    const med = (name: string) => api.addMedicine({ personId: p.personId, name, unit: 'เม็ด', schedule: dailyMeal({ morning: { pills: 1, meal: 'after' } }) });
    expect(run(() => med('ยาตัวอย่าง ก')).ok).toBe(true);
    await act(async () => {});
    expect(persist).toHaveBeenCalledTimes(2);
    expect(run(() => med('ยาตัวอย่าง ข')).ok).toBe(true);
    await act(async () => {});
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('does not ask when the browser already promised', async () => {
    const persist = fakeStorage(true);
    mount();
    await act(async () => {});
    expect(persist).not.toHaveBeenCalled();
  });
});
