// The data layer's medicine methods: a probe component hands out the API so the tests call it directly.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyMeal } from '../domain/helpers.test-util';
import { loadSample } from '../domain/actions';
import { emptyRoot, type Root } from '../domain/schema';
import { NOW } from '../domain/fixtures';
import { saveRoot, STORAGE_KEY } from '../domain/storage';
import { DataProvider, useData, type DataApi } from './DataContext';

const TODAY = '2026-10-18';
const SCHEDULE = dailyMeal({ morning: { pills: 1, meal: 'after' } });

let api: DataApi;
function Probe() {
  api = useData();
  return null;
}
const mount = () => render(<DataProvider getToday={() => TODAY}><Probe /></DataProvider>);
/** Calls the API inside act, so React shows the new data before the next line reads it. */
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
const stored = (): Root => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Root;

beforeEach(() => localStorage.removeItem(STORAGE_KEY));
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(STORAGE_KEY);
});

describe('medicine methods of the data layer', () => {
  it('addPerson and addMedicine save, use the injected today, and the screen data and storage agree', () => {
    mount();
    const p = run(() => api.addPerson({ name: 'Test Person A', relation: 'แม่', selfManaged: false }));
    if (!p.ok) throw new Error(p.error);
    const m = run(() => api.addMedicine({ personId: p.personId, name: 'ยาตัวอย่าง ก', unit: 'เม็ด', schedule: SCHEDULE, stockQty: 20 }));
    if (!m.ok) throw new Error(m.error);
    expect(m.reusedMedication).toBe(false);
    expect(root().assignments[0]?.stock).toEqual({ qty: 20, countedOn: TODAY });
    expect(root().events[0]).toMatchObject({ type: 'start', effectiveOn: TODAY });
    expect(stored()).toEqual(root());
  });

  it('adjust, stop, resume and edit go through and are saved', () => {
    mount();
    const p = run(() => api.addPerson({ name: 'Test Person A', relation: 'แม่', selfManaged: false }));
    if (!p.ok) throw new Error(p.error);
    const m = run(() => api.addMedicine({ personId: p.personId, name: 'ยาตัวอย่าง ก', unit: 'เม็ด', schedule: SCHEDULE, stockQty: 20 }));
    if (!m.ok) throw new Error(m.error);
    const id = m.assignmentId;
    expect(run(() => api.adjustDose(id, { schedule: dailyMeal({ morning: { pills: 2, meal: 'after' } }), reason: 'หมอสั่ง' })).ok).toBe(true);
    expect(run(() => api.stopMedicine(id, { reason: 'อื่น ๆ' })).ok).toBe(true);
    expect(root().assignments[0]?.status).toBe('stopped');
    expect(run(() => api.resumeMedicine(id, {})).ok).toBe(true);
    const e = run(() => api.editMedicine(id, { name: 'ยาตัวอย่าง ข' }));
    expect(e).toEqual({ ok: true, sharedWith: 1 });
    expect(root().events.map((x) => x.type)).toEqual(['start', 'adjust', 'stop', 'resume', 'edit']);
    expect(stored()).toEqual(root());
  });

  it('a refused change comes back as the error code and changes nothing', () => {
    mount();
    const before = root();
    expect(run(() => api.adjustDose('nope', { schedule: SCHEDULE, reason: 'หมอสั่ง' }))).toEqual({ ok: false, error: 'assignment_not_found' });
    expect(run(() => api.addPerson({ name: '  ', relation: 'แม่', selfManaged: false }))).toEqual({ ok: false, error: 'invalid_name' });
    expect(root()).toBe(before);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('a house still holding the sample refuses to add (O5) and nothing is cleared silently', () => {
    expect(saveRoot(loadSample(emptyRoot(NOW), TODAY, NOW)).ok).toBe(true);
    mount();
    const before = root();
    expect(run(() => api.addPerson({ name: 'Test Person A', relation: 'แม่', selfManaged: false }))).toEqual({ ok: false, error: 'sample_present' });
    expect(root()).toBe(before);
    expect(root().meta.isSample).toBe(true);
  });

  it('a save that fails is reported as save_failed, memory and storage keep the old data', () => {
    mount();
    const p = run(() => api.addPerson({ name: 'Test Person A', relation: 'แม่', selfManaged: false }));
    if (!p.ok) throw new Error(p.error);
    const beforeMemory = root();
    const beforeDisk = localStorage.getItem(STORAGE_KEY);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const res = run(() => api.addMedicine({ personId: p.personId, name: 'ยาตัวอย่าง ก', unit: 'เม็ด', schedule: SCHEDULE }));
    expect(res).toEqual({ ok: false, error: 'save_failed' });
    expect(root()).toBe(beforeMemory);
    expect(root().assignments).toHaveLength(0);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(beforeDisk);

    vi.restoreAllMocks(); // the disk works again: the same call now succeeds
    expect(run(() => api.addMedicine({ personId: p.personId, name: 'ยาตัวอย่าง ก', unit: 'เม็ด', schedule: SCHEDULE })).ok).toBe(true);
    expect(root().assignments).toHaveLength(1);
  });
});

describe('member methods of the data layer', () => {
  const addA = () => {
    const p = run(() => api.addPerson({ name: 'สมาชิกทดสอบ ก', relation: 'แม่', selfManaged: false, birthYearBE: 2510, insurance: { health: 'บริษัททดสอบ 1' } }));
    if (!p.ok) throw new Error(p.error);
    return p.personId;
  };

  it('editPerson, removePerson and restorePerson save, and screen data and storage agree', () => {
    mount();
    const id = addA();
    expect(root().persons[0]).toMatchObject({ birthYearBE: 2510, insurance: { health: 'บริษัททดสอบ 1' } });
    expect(run(() => api.editPerson(id, { name: 'สมาชิกทดสอบ ข', birthYearBE: null }))).toEqual({ ok: true });
    expect(root().persons[0]?.name).toBe('สมาชิกทดสอบ ข');
    expect('birthYearBE' in (root().persons[0] ?? {})).toBe(false);
    expect(run(() => api.removePerson(id))).toEqual({ ok: true });
    expect(root().persons[0]?.removedAt).toBeDefined();
    expect(stored()).toEqual(root());
    expect(run(() => api.restorePerson(id))).toEqual({ ok: true });
    expect(root().persons[0]?.removedAt).toBeUndefined();
    expect(stored()).toEqual(root());
  });

  it('a refused change comes back as the error code and changes nothing', () => {
    mount();
    const id = addA();
    const before = root();
    expect(run(() => api.editPerson(id, { birthYearBE: 2570 }))).toEqual({ ok: false, error: 'invalid_birth_year' });
    expect(run(() => api.editPerson('nope', { name: 'x' }))).toEqual({ ok: false, error: 'person_not_found' });
    expect(run(() => api.restorePerson(id))).toEqual({ ok: false, error: 'not_removed' });
    expect(root()).toBe(before);
  });

  it('with the sample in the house all three are refused with sample_present', () => {
    expect(saveRoot(loadSample(emptyRoot(NOW), TODAY, NOW)).ok).toBe(true);
    mount();
    const before = root();
    const id = root().persons[0]?.id ?? '';
    expect(run(() => api.editPerson(id, { name: 'ใหม่' }))).toEqual({ ok: false, error: 'sample_present' });
    expect(run(() => api.removePerson(id))).toEqual({ ok: false, error: 'sample_present' });
    expect(run(() => api.restorePerson(id))).toEqual({ ok: false, error: 'sample_present' });
    expect(root()).toBe(before);
  });

  it('a save that fails is save_failed for all three; memory and storage keep the old data', () => {
    mount();
    const id = addA();
    const removedId = (() => {
      const p = run(() => api.addPerson({ name: 'สมาชิกทดสอบ ข', relation: 'ลูก', selfManaged: false }));
      if (!p.ok) throw new Error(p.error);
      expect(run(() => api.removePerson(p.personId)).ok).toBe(true);
      return p.personId;
    })();
    const beforeMemory = root();
    const beforeDisk = localStorage.getItem(STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(run(() => api.editPerson(id, { name: 'ใหม่' }))).toEqual({ ok: false, error: 'save_failed' });
    expect(run(() => api.removePerson(id))).toEqual({ ok: false, error: 'save_failed' });
    expect(run(() => api.restorePerson(removedId))).toEqual({ ok: false, error: 'save_failed' });
    expect(root()).toBe(beforeMemory);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(beforeDisk);
  });
});

describe('prices and order settings of the data layer (step 3.3b-1)', () => {
  /** A house with one shop, one regular medicine and one house medicine. */
  function setup() {
    mount();
    const p = run(() => api.addPerson({ name: 'Test Person A', relation: 'แม่', selfManaged: false }));
    if (!p.ok) throw new Error(p.error);
    const m = run(() => api.addMedicine({ personId: p.personId, name: 'ยาตัวอย่าง ก', unit: 'เม็ด', schedule: SCHEDULE, stockQty: 20 }));
    if (!m.ok) throw new Error(m.error);
    const s = run(() => api.addShop({ name: 'ร้านทดสอบ ก', delivery: { kind: 'pickup' } }));
    if (!s.ok) throw new Error(s.error);
    const h = run(() => api.addHouseItem({ name: 'ยาสามัญทดสอบ' }));
    if (!h.ok) throw new Error(h.error);
    return { medicationId: m.medicationId, shopId: s.shopId, houseItemId: h.houseItemId };
  }

  it('setPrice saves, a second call for the same pair changes the same row, deletePrice removes it', () => {
    const { medicationId, shopId } = setup();
    const first = run(() => api.setPrice({ shopId, item: { kind: 'med', medicationId }, price: 290, sellUnit: 'กล่อง', perSellUnit: 60 }));
    if (!first.ok) throw new Error(first.error);
    expect(stored().prices).toEqual(root().prices);
    const second = run(() => api.setPrice({ shopId, item: { kind: 'med', medicationId }, price: 310, sellUnit: 'กล่อง', perSellUnit: 60 }));
    expect(second).toEqual({ ok: true, priceId: first.priceId });
    expect(root().prices).toHaveLength(1);
    expect(stored().prices[0]?.price).toBe(310);
    expect(run(() => api.deletePrice(first.priceId))).toEqual({ ok: true });
    expect(root().prices).toEqual([]);
    expect(stored().prices).toEqual([]);
  });

  it('a refused price comes back as its code and changes nothing', () => {
    const { medicationId, shopId } = setup();
    const before = root();
    expect(run(() => api.setPrice({ shopId, item: { kind: 'med', medicationId }, price: 290, sellUnit: 'กล่อง' }))).toEqual({ ok: false, error: 'per_sell_unit_required' });
    expect(run(() => api.setPrice({ shopId: 'nope', item: { kind: 'med', medicationId }, price: 290, sellUnit: 'กล่อง', perSellUnit: 60 }))).toEqual({ ok: false, error: 'shop_not_found' });
    expect(run(() => api.deletePrice('nope'))).toEqual({ ok: false, error: 'price_not_found' });
    expect(root()).toBe(before);
  });

  it('a price that cannot be written is save_failed: nothing in memory, nothing on disk', () => {
    const { houseItemId, shopId } = setup();
    const before = root();
    const diskBefore = localStorage.getItem(STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(run(() => api.setPrice({ shopId, item: { kind: 'house', houseItemId }, price: 35, sellUnit: 'ขวด' }))).toEqual({ ok: false, error: 'save_failed' });
    expect(root()).toBe(before);
    expect(root().prices).toEqual([]);
    vi.restoreAllMocks();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(diskBefore);
  });

  it('deletePrice that cannot be written leaves the price in memory and on disk', () => {
    const { houseItemId, shopId } = setup();
    const added = run(() => api.setPrice({ shopId, item: { kind: 'house', houseItemId }, price: 35, sellUnit: 'ขวด' }));
    if (!added.ok) throw new Error(added.error);
    const before = root();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(run(() => api.deletePrice(added.priceId))).toEqual({ ok: false, error: 'save_failed' });
    expect(root()).toBe(before);
    expect(root().prices).toHaveLength(1);
  });

  it('setSettings takes orderDays and orderTemplate, saves them, and refuses 91 days', () => {
    mount();
    expect(run(() => api.setSettings({ orderDays: 45, orderTemplate: 'ขอสั่งยา {ร้าน}' }))).toEqual({ ok: true });
    expect(root().settings).toMatchObject({ orderDays: 45, orderTemplate: 'ขอสั่งยา {ร้าน}' });
    expect(stored().settings).toMatchObject({ orderDays: 45, orderTemplate: 'ขอสั่งยา {ร้าน}' });
    const memory = root();
    expect(run(() => api.setSettings({ orderDays: 91, orderTemplate: 'อื่น' }))).toEqual({ ok: false, error: 'invalid_order_days' });
    expect(root()).toBe(memory);
  });

  it('setSettings with the new fields that cannot be written is save_failed and the old values stay', () => {
    mount();
    run(() => api.setSettings({ orderDays: 45 }));
    const memory = root();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(run(() => api.setSettings({ orderDays: 60, orderTemplate: 'ใหม่' }))).toEqual({ ok: false, error: 'save_failed' });
    expect(root()).toBe(memory);
    expect(root().settings.orderDays).toBe(45);
  });

  it('prices and shops go round a backup file through the data layer (replaceAll)', () => {
    const { medicationId, shopId } = setup();
    run(() => api.setPrice({ shopId, item: { kind: 'med', medicationId }, price: 290, sellUnit: 'กล่อง', perSellUnit: 60 }));
    const snapshot = root();
    localStorage.removeItem(STORAGE_KEY);
    cleanup();
    mount();
    expect(root().prices).toEqual([]);
    expect(run(() => api.replaceAll(snapshot))).toEqual({ ok: true });
    expect(root().prices).toEqual(snapshot.prices);
    expect(root().shops).toEqual(snapshot.shops);
    expect(stored().prices).toEqual(snapshot.prices);
  });
});
