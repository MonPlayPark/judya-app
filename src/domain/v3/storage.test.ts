import { describe, expect, it } from 'vitest';
import { sampleRootV3 } from './fixtures';
import { rootSchema } from './schema';
import { PREV_KEY, STORAGE_KEY, loadRoot, restoreRoot, saveRoot, startFresh, type KeyValueStore } from './storage';

/** In-memory store that records every key it is asked about. */
class FakeStore implements KeyValueStore {
  data = new Map<string, string>();
  touched = new Set<string>();
  failQuota = false;
  garbleNextSet = false; // corrupts only the next write, like a one-off disk glitch

  getItem(key: string): string | null {
    this.touched.add(key);
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.touched.add(key);
    if (this.failQuota) throw new DOMException('full', 'QuotaExceededError');
    const garble = this.garbleNextSet;
    this.garbleNextSet = false;
    this.data.set(key, garble ? value.slice(0, -5) : value);
  }
  removeItem(key: string): void {
    this.touched.add(key);
    this.data.delete(key);
  }
}

const NOW = '2026-10-28T09:00:00+07:00';

describe('storage v3 (key judya.v3)', () => {
  it('uses the v3 keys', () => {
    expect(STORAGE_KEY).toBe('judya.v3');
    expect(PREV_KEY).toBe('judya.v3.prev');
  });

  it('first launch: nothing saved reads as empty', () => {
    expect(loadRoot(new FakeStore())).toEqual({ status: 'empty' });
  });

  it('save then load returns the same data', () => {
    const s = new FakeStore();
    const root = sampleRootV3();
    expect(saveRoot(root, s)).toEqual({ ok: true });
    const r = loadRoot(s);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.root).toEqual(root);
  });

  it('corrupt JSON and schema failures are reported and kept untouched', () => {
    const s = new FakeStore();
    s.data.set(STORAGE_KEY, '{"version":3,"persons":[');
    expect(loadRoot(s).status).toBe('corrupt');
    expect(s.data.get(STORAGE_KEY)).toBe('{"version":3,"persons":[');

    const bad = JSON.stringify({ ...sampleRootV3(), settings: { expiryWarnDays: 0 } });
    s.data.set(STORAGE_KEY, bad);
    expect(loadRoot(s).status).toBe('corrupt');
    expect(s.data.get(STORAGE_KEY)).toBe(bad);
  });

  it('a different data version (v2 shape) is not loaded and not overwritten', () => {
    const s = new FakeStore();
    const other = JSON.stringify({ version: 2, persons: [] });
    s.data.set(STORAGE_KEY, other);
    expect(loadRoot(s)).toMatchObject({ status: 'wrong-version', foundVersion: 2 });
    expect(s.data.get(STORAGE_KEY)).toBe(other);
  });

  it('an invalid root is refused and nothing is written', () => {
    const s = new FakeStore();
    const r = sampleRootV3();
    r.persons.push({ ...r.persons[0]!, id: 'dup-self' }); // second "ตัวฉัน"
    expect(saveRoot(r, s)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(s.data.size).toBe(0);
  });

  it('storage full: save fails and the old data survives', () => {
    const s = new FakeStore();
    const old = sampleRootV3();
    expect(saveRoot(old, s).ok).toBe(true);
    const before = s.data.get(STORAGE_KEY);
    s.failQuota = true;
    expect(saveRoot({ ...old, prepLog: {} }, s)).toMatchObject({ ok: false, reason: 'quota' });
    expect(s.data.get(STORAGE_KEY)).toBe(before);
  });

  it('a write that reads back wrong is undone and the old data survives', () => {
    const s = new FakeStore();
    const old = sampleRootV3();
    saveRoot(old, s);
    const before = s.data.get(STORAGE_KEY);
    s.garbleNextSet = true;
    expect(saveRoot({ ...old, prepLog: {} }, s)).toMatchObject({ ok: false, reason: 'verify-failed' });
    expect(s.data.get(STORAGE_KEY)).toBe(before);
  });

  it('startFresh copies unreadable data to .prev before replacing it', () => {
    const s = new FakeStore();
    s.data.set(STORAGE_KEY, 'not json');
    expect(startFresh(NOW, s)).toEqual({ ok: true });
    expect(s.data.get(PREV_KEY)).toBe('not json');
    expect(loadRoot(s).status).toBe('ok');
  });

  it('startFresh keeps the old data if the safety copy cannot be written', () => {
    const s = new FakeStore();
    s.data.set(STORAGE_KEY, 'not json');
    s.failQuota = true;
    expect(startFresh(NOW, s).ok).toBe(false);
    expect(s.data.get(STORAGE_KEY)).toBe('not json');
  });

  it('restoreRoot saves the old text to .prev and puts both keys back on failure', () => {
    const s = new FakeStore();
    const first = sampleRootV3();
    saveRoot(first, s);
    const oldMain = s.data.get(STORAGE_KEY);
    s.data.set(PREV_KEY, 'older copy');

    expect(restoreRoot({ ...first, prepLog: {} }, s)).toEqual({ ok: true });
    expect(s.data.get(PREV_KEY)).toBe(oldMain);

    const afterMain = s.data.get(STORAGE_KEY);
    s.garbleNextSet = false;
    s.failQuota = true;
    expect(restoreRoot(first, s).ok).toBe(false);
    expect(s.data.get(STORAGE_KEY)).toBe(afterMain);
    expect(s.data.get(PREV_KEY)).toBe(oldMain);
  });

  it('what is saved is valid v3 JSON', () => {
    const s = new FakeStore();
    saveRoot(sampleRootV3(), s);
    expect(rootSchema.safeParse(JSON.parse(s.data.get(STORAGE_KEY)!)).success).toBe(true);
  });
});

describe('storage v3 touches only judya.v3 and judya.v3.prev', () => {
  it('every operation, including failures, stays inside the two keys and leaves old.app alone', () => {
    const s = new FakeStore();
    s.data.set('old.app', 'v2 data');
    s.data.set('old.app.prev', 'v2 prev');
    s.data.set('judya.v1', 'v1 data');
    const root = sampleRootV3();

    loadRoot(s);
    saveRoot(root, s);
    s.data.set(STORAGE_KEY, 'broken');
    loadRoot(s);
    startFresh(NOW, s);
    restoreRoot(root, s);
    s.failQuota = true;
    saveRoot(root, s);
    restoreRoot(root, s);
    startFresh(NOW, s);

    expect([...s.touched].sort()).toEqual(['judya.v3', 'judya.v3.prev']);
    expect(s.data.get('old.app')).toBe('v2 data');
    expect(s.data.get('old.app.prev')).toBe('v2 prev');
    expect(s.data.get('judya.v1')).toBe('v1 data');
  });

  it('with the real localStorage, only the two v3 keys are accessed', () => {
    localStorage.clear();
    localStorage.setItem('old.app', 'v2 data');
    const keys: string[] = [];
    const proto = Object.getPrototypeOf(localStorage) as Storage;
    const originals = { g: proto.getItem, s: proto.setItem, r: proto.removeItem };
    proto.getItem = function (this: Storage, k: string) { keys.push(k); return originals.g.call(this, k); };
    proto.setItem = function (this: Storage, k: string, v: string) { keys.push(k); originals.s.call(this, k, v); };
    proto.removeItem = function (this: Storage, k: string) { keys.push(k); originals.r.call(this, k); };
    try {
      loadRoot();
      saveRoot(sampleRootV3());
      restoreRoot(sampleRootV3());
      startFresh(NOW);
    } finally {
      proto.getItem = originals.g;
      proto.setItem = originals.s;
      proto.removeItem = originals.r;
    }
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys)).toEqual(new Set(['judya.v3', 'judya.v3.prev']));
    expect(localStorage.getItem('old.app')).toBe('v2 data');
    localStorage.clear();
  });
});

describe('orders in the new shape (M4 PR 11.1)', () => {
  it('backup -> start fresh -> restore keeps every order, its shares, shopName, shippingFee and closedAt', () => {
    const root = sampleRootV3();
    const s = new FakeStore();
    expect(saveRoot(root, s)).toEqual({ ok: true });
    const backup = JSON.stringify(root);
    expect(startFresh(NOW, s)).toEqual({ ok: true });
    const fresh = loadRoot(s);
    expect(fresh.status === 'ok' && fresh.root.orders).toEqual([]);

    const checked = rootSchema.parse(JSON.parse(backup));
    expect(restoreRoot(checked, s)).toEqual({ ok: true });
    const back = loadRoot(s);
    expect(back.status).toBe('ok');
    const orders = back.status === 'ok' ? back.root.orders : [];
    expect(orders).toEqual(root.orders);
    expect(orders[0]?.lines[0]?.source).toEqual({ kind: 'med', medicationId: 'm1', shares: [{ assignmentId: 'a1', qty: 20 }] });
    expect(orders[1]).toMatchObject({ shopName: 'ร้านตัวอย่าง 2', shippingFee: 40 });
    expect(orders[3]?.closedAt).toBe(NOW);
  });

  it('a shop deleted after the order: the order is kept with its shop name', () => {
    const root = sampleRootV3();
    root.shops = root.shops.filter((x) => x.id !== 's1');
    root.prices = root.prices.filter((p) => p.shopId !== 's1');
    const s = new FakeStore();
    expect(saveRoot(root, s)).toEqual({ ok: true });
    const back = loadRoot(s);
    expect(back.status === 'ok' && back.root.orders[0]?.shopName).toBe('ร้านตัวอย่าง 1');
  });

  // The older order shape (one person per line: source.kind 'assignment', no shopName) must be refused, not read as something else.
  const oldShape = () => {
    const root = JSON.parse(JSON.stringify(sampleRootV3())) as { orders: Record<string, unknown>[] };
    const o = root.orders[0] as { shopName?: string; lines: { source: unknown }[] };
    delete o.shopName;
    o.lines[0]!.source = { kind: 'assignment', assignmentId: 'a1' };
    return root;
  };

  it('a file with the older order shape is refused with a message that names the problem', () => {
    const s = new FakeStore();
    s.setItem(STORAGE_KEY, JSON.stringify(oldShape()));
    const r = loadRoot(s);
    expect(r.status).toBe('corrupt');
    const reason = r.status === 'corrupt' ? r.reason : '';
    expect(reason).toContain("the older 'assignment' order format is not supported");
    expect(reason).toContain('shopName');
    expect(s.getItem(STORAGE_KEY)).toContain('"assignment"'); // not overwritten
  });

  it('saveRoot refuses the older shape too', () => {
    const r = saveRoot(oldShape() as never, new FakeStore());
    expect(r).toMatchObject({ ok: false, reason: 'invalid' });
  });
});
