import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { MAX_BACKUP_BYTES } from '../../domain/v3/backup';
import { NO_UPLOAD_TEXT, PRIVACY_TEXT, RESTORE_ERRORS } from '../../domain/v3/dataPage';
import { sampleRootV3 } from '../../domain/v3/fixtures';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { DEFAULT_SETTINGS_V3, rootSchema, type Root } from '../../domain/v3/schema';
import { PREV_KEY, STORAGE_KEY, loadRoot, type KeyValueStore } from '../../domain/v3/storage';
import { resetPersistenceAsked } from '../../state/persist';
import { DataV3Route } from './DataPage';
import { HomeV3Route } from './HomeV3Page';

type Spy = KeyValueStore & { data: Record<string, string>; touched: Set<string>; writes: string[] };
/** An in-memory store that remembers every key that was read or written. */
const memoryStore = (initial: Record<string, string> = {}): Spy => {
  const data = { ...initial };
  const touched = new Set<string>();
  const writes: string[] = [];
  return {
    data,
    touched,
    writes,
    getItem: (k) => (touched.add(k), data[k] ?? null),
    setItem: (k, v) => {
      touched.add(k);
      writes.push(k);
      data[k] = v;
    },
    removeItem: (k) => {
      touched.add(k);
      writes.push(k);
      delete data[k];
    },
  };
};

const TODAY = '2026-10-28';
const house = (extra: Partial<Root> = {}): Root => ({ ...sampleRootV3(), ...extra });
const withBackup = (iso: string): Root => {
  const r = house();
  return { ...r, meta: { ...r.meta, lastBackupAt: iso } };
};
const store0 = (root: Root = house()): Spy => memoryStore({ [STORAGE_KEY]: JSON.stringify(root) });

const open = (store: KeyValueStore, query = '', today = TODAY) => {
  window.location.hash = `#/n/settings/data${query}`;
  return render(<DataV3Route store={store} getToday={() => today} />);
};

const fileOf = (text: string, name = 'judya-backup.json'): File => new File([text], name, { type: 'application/json' });
const choose = async (file: File): Promise<void> => {
  fireEvent.change(screen.getByLabelText('เลือกไฟล์สำรอง'), { target: { files: [file] } });
};
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

let shared: File[] = [];
/** Pretend the browser can share files; `outcome` is what the share sheet does. */
const stubShare = (outcome: 'ok' | 'abort' | 'unsupported'): void => {
  shared = [];
  if (outcome === 'unsupported') {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    return;
  }
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: vi.fn(async (d: ShareData) => {
      if (outcome === 'abort') throw new DOMException('closed', 'AbortError');
      shared.push(...(d.files ?? []));
    }),
  });
};
const readShared = (): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(shared[0]!);
  });

beforeEach(() => {
  window.location.hash = '';
  resetPersistenceAsked();
  Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
  Reflect.deleteProperty(navigator, 'storage');
});

describe('layout and texts', () => {
  it('title, back button, four cards, privacy line, footer, Settings tab is the current one', () => {
    open(store0());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ข้อมูลและสำรองข้อมูล');
    expect(screen.getByRole('button', { name: 'กลับ' })).toBeInTheDocument();
    for (const h of ['สถานะการสำรอง', 'สำรองข้อมูล', 'นำกลับจากไฟล์สำรอง', 'ที่เก็บข้อมูลในเครื่อง']) {
      expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
    }
    expect(screen.getByText(PRIVACY_TEXT)).toBeInTheDocument();
    expect(screen.getByText(NO_UPLOAD_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ตั้งค่า' })).toHaveAttribute('aria-current', 'page');
  });

  it('never backed up: says so, with the summary of the data', () => {
    open(store0());
    expect(screen.getByText('ยังไม่เคยสำรอง')).toBeInTheDocument();
    expect(screen.getByText(/ข้อมูลตอนนี้: สมาชิก 7 คน/)).toBeInTheDocument();
    expect(screen.queryByText(/ไม่ได้สำรองข้อมูลมา/)).toBeNull();
  });

  it('backed up 14 days ago or less: Thai date, no warning', () => {
    open(store0(withBackup('2026-10-14T09:00:00+07:00')), '', TODAY); // exactly 14 days
    expect(screen.getByText('สำรองล่าสุด 14 ต.ค. 2569')).toBeInTheDocument();
    expect(screen.queryByText(/ไม่ได้สำรองข้อมูลมา/)).toBeNull();
  });

  it('backed up more than 14 days ago: warning with an icon and words', () => {
    open(store0(withBackup('2026-10-13T09:00:00+07:00')), '', TODAY); // 15 days
    expect(screen.getByText('สำรองล่าสุด 13 ต.ค. 2569')).toBeInTheDocument();
    const warn = screen.getByText('ไม่ได้สำรองข้อมูลมา 15 วันแล้ว');
    expect(warn.parentElement?.querySelector('svg')).not.toBeNull();
  });
});

describe('storage promise', () => {
  const stubStorage = (persisted: boolean | 'none') => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: persisted === 'none' ? {} : { persist: async () => persisted, persisted: async () => persisted },
    });
  };
  it('yes: does not claim 100% safe', async () => {
    stubStorage(true);
    open(store0());
    expect(await screen.findByText('ใช่')).toBeInTheDocument();
    expect(screen.getByText(/ข้อมูลก็ยังหายได้/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ปลอดภัย 100|ปลอดภัยแน่นอน/);
  });
  it('no: tells to back up to a file regularly', async () => {
    stubStorage(false);
    open(store0());
    expect(await screen.findByText('ไม่')).toBeInTheDocument();
    expect(screen.getByText(/กรุณาสำรองเป็นไฟล์เป็นประจำ/)).toBeInTheDocument();
  });
  it('not supported', async () => {
    stubStorage('none');
    open(store0());
    expect(await screen.findByText('ไม่รองรับ')).toBeInTheDocument();
  });
});

describe('back up', () => {
  it('shared: the file is a v3 root without the real settings; the date is saved; success is shown', async () => {
    stubShare('ok');
    const root = house({ settings: { ...DEFAULT_SETTINGS_V3, fontSize: 'large', orderDays: 45 } });
    const store = store0(root);
    open(store);
    press('สำรองข้อมูล');
    expect(await screen.findByText('สำรองข้อมูลแล้ว')).toBeInTheDocument();
    expect(shared).toHaveLength(1);
    expect(shared[0]!.name).toMatch(/^judya-backup-\d{4}-\d{2}-\d{2}-v3\.json$/);
    const file = JSON.parse(await readShared()) as Root;
    expect(rootSchema.safeParse(file).success).toBe(true);
    expect(file.settings).toEqual(DEFAULT_SETTINGS_V3); // settings are not in the file
    const saved = loadRoot(store);
    expect(saved.status === 'ok' && saved.root.meta.lastBackupAt).toBeTruthy();
    expect(saved.status === 'ok' && saved.root.settings.fontSize).toBe('large'); // the house keeps its own settings
    expect(screen.getByText(/สำรองล่าสุด/)).toBeInTheDocument();
  });

  it('cancelled in the share sheet: no date saved, nothing written, no success text', async () => {
    stubShare('abort');
    const store = store0();
    const before = { ...store.data };
    open(store);
    press('สำรองข้อมูล');
    expect(await screen.findByText('ยังไม่ได้สำรองข้อมูล เพราะปิดเมนูแชร์ก่อน')).toBeInTheDocument();
    expect(store.data).toEqual(before);
    expect(store.writes).toEqual([]);
    expect(screen.queryByText(/^สำรองข้อมูลแล้ว/)).toBeNull();
    expect(screen.getByText('ยังไม่เคยสำรอง')).toBeInTheDocument();
  });

  it('no share support: the file is downloaded and counts as a backup', async () => {
    stubShare('unsupported');
    const createUrl = vi.fn(() => 'blob:test');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const store = store0();
    open(store);
    press('สำรองข้อมูล');
    expect(await screen.findByText(/สำรองข้อมูลแล้ว ไฟล์อยู่ในโฟลเดอร์ดาวน์โหลด/)).toBeInTheDocument();
    expect(createUrl).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    const saved = loadRoot(store);
    expect(saved.status === 'ok' && saved.root.meta.lastBackupAt).toBeTruthy();
    Reflect.deleteProperty(URL, 'createObjectURL');
  });

  it('the file was handed over but the date cannot be saved: says so, never says "success"', async () => {
    stubShare('ok');
    const store = store0();
    open(store);
    store.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    press('สำรองข้อมูล');
    expect(await screen.findByRole('alert')).toHaveTextContent('บันทึกวันที่สำรองในแอปไม่ได้');
    expect(screen.queryByText('สำรองข้อมูลแล้ว')).toBeNull();
  });
});

describe('restore', () => {
  const backupOf = (root: Root): string => JSON.stringify({ ...root, settings: { ...DEFAULT_SETTINGS_V3 }, meta: { ...root.meta, lastBackupAt: '2026-10-20T10:00:00+07:00' } });

  it('round trip: back up, wipe, restore = the same data in every table (only lastBackupAt and the kept settings differ)', async () => {
    stubShare('ok');
    const original = house({ settings: { ...DEFAULT_SETTINGS_V3, fontSize: 'large' } });
    const store = store0(original);
    const { unmount } = open(store);
    press('สำรองข้อมูล');
    await screen.findByText('สำรองข้อมูลแล้ว');
    const text = await readShared();
    unmount();

    // wipe: a blank house with its own settings
    const blank: Root = { ...rootSchema.parse({ ...original, persons: [], medications: [], assignments: [], events: [], houseItems: [], shops: [], prices: [], orders: [], prepLog: {} }), settings: { ...DEFAULT_SETTINGS_V3, fontSize: 'medium' } };
    store.data[STORAGE_KEY] = JSON.stringify(blank);
    open(store);
    await choose(fileOf(text));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('จะแทนที่ข้อมูลปัจจุบันทั้งหมดด้วยข้อมูลในไฟล์นี้')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: /นำกลับ แทนที่ข้อมูลทั้งหมด/ }));
    expect(await screen.findByText('นำข้อมูลกลับมาแล้ว')).toBeInTheDocument();

    const after = loadRoot(store);
    expect(after.status).toBe('ok');
    if (after.status !== 'ok') return;
    for (const table of ['persons', 'medications', 'assignments', 'events', 'houseItems', 'shops', 'prices', 'orders', 'prepLog'] as const) {
      expect(after.root[table], table).toEqual(original[table]);
    }
    expect(after.root.settings.fontSize).toBe('medium'); // settings of this phone are not overwritten
    expect(after.root.meta.createdAt).toBe(original.meta.createdAt);
    expect(after.root.meta.lastBackupAt).toBeTruthy();
  });

  it('shows the file against the current data, asks to confirm, and nothing is written before the confirm button', async () => {
    const store = store0();
    const other = house({ persons: house().persons.slice(0, 2), assignments: [], events: [], orders: [] });
    open(store);
    store.writes.length = 0;
    await choose(fileOf(backupOf(rootSchema.parse({ ...other, prices: [], shops: [] }))));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/ในไฟล์สำรอง \(สำรองเมื่อ 20 ต.ค. 2569\)/)).toBeInTheDocument();
    expect(within(sheet).getByText(/^สมาชิก 2 คน ยา 0 รายการ/)).toBeInTheDocument();
    expect(within(sheet).getByText('ข้อมูลปัจจุบัน (จะถูกแทนที่)')).toBeInTheDocument();
    expect(within(sheet).getByText(/^สมาชิก 7 คน ยา 7 รายการ/)).toBeInTheDocument();
    expect(store.writes).toEqual([]);
  });

  it('cancel, or the dark curtain, or no press at all = localStorage is not changed by one byte', async () => {
    const store = store0();
    const before = { ...store.data };
    open(store);
    store.writes.length = 0;
    await choose(fileOf(backupOf(house())));
    fireEvent.click(await screen.findByRole('button', { name: /ยกเลิก ไม่เปลี่ยนอะไร/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await choose(fileOf(backupOf(house())));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByTestId('sheet-curtain'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await choose(fileOf(backupOf(house())));
    await screen.findByRole('dialog');
    expect(store.data).toEqual(before);
    expect(store.writes).toEqual([]);
  });

  it('after the restore the old data is in judya.v3.prev', async () => {
    const store = store0();
    const old = store.data[STORAGE_KEY]!;
    open(store);
    await choose(fileOf(backupOf(rootSchema.parse({ ...house(), orders: [] }))));
    fireEvent.click(await screen.findByRole('button', { name: /นำกลับ แทนที่ข้อมูลทั้งหมด/ }));
    await screen.findByText('นำข้อมูลกลับมาแล้ว');
    expect(store.data[PREV_KEY]).toBe(old);
    expect(store.data[STORAGE_KEY]).not.toBe(old);
  });

  const errorCases: [string, string, () => File, number?][] = [
    ['not_json', 'not_json', () => fileOf('this is not json {')],
    ['wrong_version (v2 file)', 'wrong_version', () => fileOf(JSON.stringify({ version: 2, persons: [] }, null, 1))],
    ['invalid (v3 with missing tables)', 'invalid', () => fileOf(JSON.stringify({ version: 3, persons: [] }))],
  ];
  it.each(errorCases)('%s: its own message, "ข้อมูลปัจจุบันไม่ถูกแตะ", nothing written', async (_label, key, make) => {
    const store = store0();
    const before = { ...store.data };
    open(store);
    store.writes.length = 0;
    await choose(make());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(RESTORE_ERRORS[key as keyof typeof RESTORE_ERRORS]);
    expect(alert).toHaveTextContent('ข้อมูลปัจจุบันไม่ถูกแตะ');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.data).toEqual(before);
    expect(store.writes).toEqual([]);
  });

  it('wrong_version says the file is from an older version of the app', async () => {
    open(store0());
    await choose(fileOf(JSON.stringify({ version: 2 })));
    expect(await screen.findByRole('alert')).toHaveTextContent('แอปเวอร์ชันเก่า');
  });

  it('too big: refused by size before the file is read', async () => {
    const store = store0();
    const before = { ...store.data };
    const read = vi.spyOn(FileReader.prototype, 'readAsText');
    open(store);
    const big = fileOf(backupOf(house()));
    Object.defineProperty(big, 'size', { value: MAX_BACKUP_BYTES + 1 });
    await choose(big);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ไฟล์ใหญ่เกิน 5 MB');
    expect(alert).toHaveTextContent('ข้อมูลปัจจุบันไม่ถูกแตะ');
    expect(read).not.toHaveBeenCalled();
    expect(store.data).toEqual(before);
  });

  it('exactly 5 MB is allowed by the size rule', async () => {
    open(store0());
    const edge = fileOf(backupOf(house()));
    Object.defineProperty(edge, 'size', { value: MAX_BACKUP_BYTES });
    await choose(edge);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('saving fails (storage full): its own message, current data untouched, old backup copy untouched', async () => {
    const store = store0();
    store.data[PREV_KEY] = 'older safety copy';
    open(store);
    const before = { ...store.data };
    await choose(fileOf(backupOf(house())));
    const realSet = store.setItem;
    store.setItem = (k, v) => {
      if (k === STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError');
      realSet(k, v);
    };
    fireEvent.click(await screen.findByRole('button', { name: /นำกลับ แทนที่ข้อมูลทั้งหมด/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('พื้นที่เก็บข้อมูลในเครื่องเต็ม');
    expect(alert).toHaveTextContent('ข้อมูลปัจจุบันไม่ถูกแตะ');
    expect(store.data).toEqual(before);
    expect(screen.queryByText('นำข้อมูลกลับมาแล้ว')).toBeNull();
  });

  it('a new user (nothing stored yet) can restore too, with default settings', async () => {
    const store = memoryStore();
    open(store);
    await choose(fileOf(backupOf(house())));
    fireEvent.click(await screen.findByRole('button', { name: /นำกลับ แทนที่ข้อมูลทั้งหมด/ }));
    await screen.findByText('นำข้อมูลกลับมาแล้ว');
    const after = loadRoot(store);
    expect(after.status === 'ok' && after.root.settings).toEqual(DEFAULT_SETTINGS_V3);
    expect(store.data[PREV_KEY]).toBeUndefined(); // there was nothing to copy
  });
});

describe('only judya.v3 and judya.v3.prev are touched', () => {
  it('backup and restore read and write no other key, and leave the other keys as they were', async () => {
    stubShare('ok');
    const others = { 'judya.v2': 'v2 text', 'judya.v2.prev': 'v2 prev', 'judya.fontsize': 'l', 'medmate.v1': 'x' };
    const store = memoryStore({ ...others, [STORAGE_KEY]: JSON.stringify(house()) });
    open(store);
    press('สำรองข้อมูล');
    await screen.findByText('สำรองข้อมูลแล้ว');
    const text = await readShared();
    await choose(fileOf(text));
    fireEvent.click(await screen.findByRole('button', { name: /นำกลับ แทนที่ข้อมูลทั้งหมด/ }));
    await screen.findByText('นำข้อมูลกลับมาแล้ว');
    expect([...store.touched].filter((k) => k !== STORAGE_KEY && k !== PREV_KEY)).toEqual([]);
    for (const [k, v] of Object.entries(others)) expect(store.data[k]).toBe(v);
  });
});

describe('demo (?demo=...)', () => {
  const noStorage = () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    return () => {
      expect(get).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    };
  };

  it('shows a made-up house, says it is a demo, and both buttons only explain that they do not work', () => {
    const check = noStorage();
    const store = memoryStore();
    window.location.hash = '#/n/settings/data?demo=normal';
    render(<DataV3Route store={store} />);
    expect(screen.getByRole('status')).toHaveTextContent('โหมดตัวอย่าง');
    expect(screen.getByText(/สำรองล่าสุด/)).toBeInTheDocument();
    press('สำรองข้อมูล');
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'โหมดตัวอย่าง ใช้สำรองหรือนำกลับข้อมูลไม่ได้')).toBe(true);
    expect(screen.getByRole('button', { name: 'สำรองข้อมูล' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'นำกลับจากไฟล์สำรอง' })).toHaveAttribute('aria-disabled', 'true');
    check();
    expect(store.touched.size).toBe(0);
  });

  it('&backup=old shows the 14-day warning in a demo', () => {
    open(memoryStore(), '?demo=normal&backup=old');
    expect(screen.getByText('สำรองล่าสุด 8 ต.ค. 2569')).toBeInTheDocument();
    expect(screen.getByText('ไม่ได้สำรองข้อมูลมา 20 วันแล้ว')).toBeInTheDocument();
  });

  it('?demo=backup is a house that was never backed up; ?demo=nomeds works too', () => {
    const { unmount } = open(memoryStore(), '?demo=backup');
    expect(screen.getByText('ยังไม่เคยสำรอง')).toBeInTheDocument();
    unmount();
    open(memoryStore(), '?demo=nomeds');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ข้อมูลและสำรองข้อมูล');
  });

  it.each(Object.keys(RESTORE_ERRORS))('?error=%s opens on that message', (key) => {
    const check = noStorage();
    open(memoryStore(), `?demo=normal&error=${key}`);
    expect(screen.getByRole('alert')).toHaveTextContent(RESTORE_ERRORS[key as keyof typeof RESTORE_ERRORS]);
    check();
  });

  it('?sheet=confirm shows the confirm sheet; pressing confirm in a demo changes nothing', () => {
    const check = noStorage();
    open(memoryStore(), '?demo=normal&sheet=confirm');
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('จะแทนที่ข้อมูลปัจจุบันทั้งหมดด้วยข้อมูลในไฟล์นี้')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: /นำกลับ แทนที่ข้อมูลทั้งหมด/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('นำข้อมูลกลับมาแล้ว')).toBeNull();
    check();
  });

  it('the demo date is fixed (DEMO_TODAY)', () => {
    expect(DEMO_TODAY).toBe('2026-10-28');
  });
});

describe('ways in', () => {
  it('the Settings tab of the bottom menu opens this page', () => {
    window.location.hash = '#/n?demo=normal';
    render(<HomeV3Route />);
    expect(screen.getByRole('link', { name: 'ตั้งค่า' })).toHaveAttribute('href', '#/n/settings/data');
  });

  it('the backup reminder on Home is a link to this page (and keeps the demo)', () => {
    window.location.hash = '#/n?demo=backup';
    render(<HomeV3Route />);
    const link = screen.getByText('ยังไม่ได้สำรองข้อมูล').closest('a');
    expect(link).toHaveAttribute('href', '#/n/settings/data?demo=backup');
  });

  it('the other Home warnings are not links', () => {
    window.location.hash = '#/n?demo=alert';
    render(<HomeV3Route />);
    expect(screen.getByText('ยาหมดอายุแล้ว 1 รายการ').closest('a')).toBeNull();
  });

  it('the real app routes #/n/settings/data to the page (outside the v2 data: judya.v2 is not read)', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    window.location.hash = '#/n/settings/data?demo=normal';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ข้อมูลและสำรองข้อมูล');
    expect(get.mock.calls.map((c) => c[0]).filter((k) => String(k).startsWith('judya.v2'))).toEqual([]);
  });

  it('back button goes to Home when there is no page before', () => {
    open(store0(), '?demo=normal');
    Object.defineProperty(window.history, 'length', { configurable: true, value: 1 });
    press('กลับ');
    expect(window.location.hash).toBe('#/n?demo=normal');
  });
});

