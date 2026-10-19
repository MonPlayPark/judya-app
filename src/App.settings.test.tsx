// Settings screen, backup / restore, the quiet reminder on the home screen (step 3.2d). Made-up data only.
// Today is Sunday 2026-10-18; the clock (Date) is fixed to 20:40 Thai time that day so file names and dates are known.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from './App';
import { MAX_BACKUP_BYTES, makeBackup } from './domain/backup';
import { NOW, sampleRoot } from './domain/fixtures';
import { assignment, dailyMeal, person, rootWith } from './domain/helpers.test-util';
import { emptyRoot, type Root } from './domain/schema';
import { PREV_KEY, STORAGE_KEY, loadRoot, saveRoot } from './domain/storage';
import { resetPersistenceAsked } from './state/persist';

const TODAY = '2026-10-18';
const CLOCK = '2026-10-18T13:40:00.000Z'; // 20:40 in Thailand
const morning = dailyMeal({ morning: { pills: 1, meal: 'after' } });

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
const open = (hash = '#/settings') => {
  window.location.hash = hash;
  return render(<App getToday={() => TODAY} />);
};
const stored = (): Root => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Root;
const rawStored = () => localStorage.getItem(STORAGE_KEY);

/** Two members (one with a stopped medicine) and 3 medicines: "สมาชิก 2 คน ยา 3 รายการ". */
const threeMeds = (): Root =>
  rootWith({
    persons: [person({ id: 'p1' }), person({ id: 'p2', name: 'Test Person B', color: 'green' })],
    medications: [1, 2, 3].map((n) => ({ id: `m${n}`, name: `Sample Med ${n} mg`, unit: 'เม็ด' })),
    assignments: [
      assignment({ id: 'a1', medicationId: 'm1', schedule: morning }),
      assignment({ id: 'a2', medicationId: 'm2', personId: 'p2', schedule: morning }),
      assignment({ id: 'a3', medicationId: 'm3', personId: 'p2', schedule: morning, status: 'stopped' }),
    ],
  });
const backupFile = (root: Root, name = 'judya-backup-2026-10-03.json') => new File([makeBackup(root, '2026-10-03T09:00:00+07:00').text], name, { type: 'application/json' });
const pick = (file: File) => fireEvent.change(screen.getByTestId('restore-file'), { target: { files: [file] } });

/** A chip of one of the two threshold groups (both groups have a "30 วัน" chip). */
const chip = (group: 'เตือนยาใกล้หมดอายุ' | 'เตือนยาใกล้หมด', label: string) =>
  within(screen.getByRole('radiogroup', { name: `เลือกจำนวนวัน · ${group}` })).getByRole('radio', { name: label });

const failWrites = (key?: string) =>
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string) {
    if (key === undefined || k === key) throw new DOMException('full', 'QuotaExceededError');
  });

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
  resetPersistenceAsked();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(CLOCK));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const k of ['share', 'canShare', 'storage']) Reflect.deleteProperty(navigator, k);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
});

describe('thresholds apply at once, with no save button', () => {
  it('shows both settings with the default values and no save button', () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'ตั้งค่า' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'เตือนยาใกล้หมดอายุ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'เตือนยาใกล้หมด' })).toBeInTheDocument();
    expect(screen.getByText(/หมดอายุภายใน 15 วัน/)).toBeInTheDocument();
    expect(screen.getByText(/เหลือพอกินไม่เกิน 7 วัน/)).toBeInTheDocument();
    expect(screen.getAllByText(/ไม่ต้องกดบันทึก/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^บันทึก/ })).not.toBeInTheDocument();
    // shops exist since step 3.3a; the order-message template stays hidden until step 3.3b
    expect(screen.getByRole('heading', { name: 'ร้านค้า' })).toBeInTheDocument();
    expect(screen.queryByText('ข้อความสั่งยาไปร้าน')).not.toBeInTheDocument();
  });

  it('a chip changes the value at once, saves it, and the chosen chip says so (tick + aria-checked)', () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    open();
    const group = screen.getByRole('radiogroup', { name: /เลือกจำนวนวัน · เตือนยาใกล้หมดอายุ/ });
    fireEvent.click(within(group).getByRole('radio', { name: '30 วัน' }));
    expect(within(group).getByRole('radio', { name: '30 วัน' })).toHaveAttribute('aria-checked', 'true');
    expect(within(group).getByRole('radio', { name: '15 วัน' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/หมดอายุภายใน 30 วัน/)).toBeInTheDocument();
    expect(stored().settings.expiryWarnDays).toBe(30);
  });

  it('− and + move by one day and stop at the ends (1 and 365 / 1 and 60)', () => {
    const root = sampleRoot();
    expect(saveRoot({ ...root, settings: { ...root.settings, expiryWarnDays: 2, lowStockDays: 59 } }).ok).toBe(true);
    open();
    const dec = () => screen.getByRole('button', { name: 'ลด 1 วัน · เตือนยาใกล้หมดอายุ' });
    fireEvent.click(dec());
    expect(stored().settings.expiryWarnDays).toBe(1);
    expect(dec()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่ม 1 วัน · เตือนยาใกล้หมด' }));
    expect(stored().settings.lowStockDays).toBe(60);
    expect(screen.getByRole('button', { name: 'เพิ่ม 1 วัน · เตือนยาใกล้หมด' })).toBeDisabled();
  });

  it('the home screen uses the new value at once (a medicine expiring 2026-11-01, 14 days away)', () => {
    const base = rootWith({
      persons: [person()],
      medications: [{ id: 'm1', name: 'Sample Med 5 mg', unit: 'เม็ด' }],
      assignments: [assignment({ schedule: morning, expiry: '2026-11-01' })],
    });
    expect(saveRoot({ ...base, meta: { ...base.meta, lastBackupAt: CLOCK }, settings: { ...base.settings, expiryWarnDays: 7 } }).ok).toBe(true);
    open('#/');
    expect(screen.queryByText('อีก 14 วัน')).not.toBeInTheDocument(); // 7-day window: not listed
    go('#/settings');
    fireEvent.click(chip('เตือนยาใกล้หมดอายุ', '30 วัน'));
    go('#/');
    expect(screen.getByText('อีก 14 วัน')).toBeInTheDocument();
    expect(screen.getByText('เตือนก่อนหมดอายุ 30 วัน')).toBeInTheDocument();
  });

  it('a save that fails writes the reason, and the value on screen does not change', () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    const before = rawStored();
    open();
    failWrites();
    fireEvent.click(chip('เตือนยาใกล้หมดอายุ', '30 วัน'));
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ค่าเดิมยังอยู่');
    expect(screen.getByText(/หมดอายุภายใน 15 วัน/)).toBeInTheDocument();
    expect(chip('เตือนยาใกล้หมดอายุ', '15 วัน')).toHaveAttribute('aria-checked', 'true');
    expect(rawStored()).toBe(before);
    vi.restoreAllMocks(); // the disk works again: the same tap works and clears the message
    fireEvent.click(chip('เตือนยาใกล้หมดอายุ', '30 วัน'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(stored().settings.expiryWarnDays).toBe(30);
  });
});

describe('backup', () => {
  const shareMock = (impl: (data: ShareData) => Promise<void>) => {
    const share = vi.fn(impl);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    return share;
  };
  const downloads: string[] = [];
  beforeEach(() => {
    downloads.length = 0;
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });
  const tapBackup = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'สำรองข้อมูล' }));
    await act(async () => {});
  };

  it('says "never backed up" and warns about health data before anything is shared', () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    open();
    expect(screen.getByText('ยังไม่เคยสำรอง')).toBeInTheDocument();
    expect(screen.getByText('ไฟล์นี้มีข้อมูลสุขภาพของครอบครัว ส่งเฉพาะที่ที่ไว้ใจ')).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่เคยสำรอง แต่มีข้อมูลในแอพแล้ว/)).toBeInTheDocument(); // the warning (icon + words)
  });

  it('share succeeds: the sheet gets the file, the date is saved and shown', async () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    const share = shareMock(async () => {});
    open();
    await tapBackup();
    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0]?.[0];
    const file = data?.files?.[0];
    expect(file?.name).toBe('judya-backup-2026-10-18.json');
    const sent = JSON.parse(await file!.text()) as Root;
    expect(sent.version).toBe(2);
    expect(sent.meta.lastBackupAt).toBe(CLOCK);
    expect(screen.getByText('แชร์ไฟล์ judya-backup-2026-10-18.json แล้ว')).toBeInTheDocument();
    expect(screen.getByText('สำรองล่าสุด 18 ต.ค. 2569 (วันนี้)')).toBeInTheDocument();
    expect(screen.queryByText(/ยังไม่เคยสำรอง/)).not.toBeInTheDocument();
    expect(stored().meta.lastBackupAt).toBe(CLOCK);
    expect(downloads).toEqual([]); // shared, so no download
  });

  it('the person closes the share sheet (AbortError): the date is not updated and nothing says it worked', async () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    const before = rawStored();
    shareMock(async () => {
      throw new DOMException('closed', 'AbortError');
    });
    open();
    await tapBackup();
    expect(screen.getByText('ยกเลิกแล้ว ยังไม่ได้สำรอง')).toBeInTheDocument();
    expect(screen.queryByText(/แชร์ไฟล์|ดาวน์โหลดไฟล์/)).not.toBeInTheDocument();
    expect(screen.getByText('ยังไม่เคยสำรอง')).toBeInTheDocument();
    expect(rawStored()).toBe(before);
    expect(downloads).toEqual([]);
  });

  it('no share support: the file is downloaded instead and the date is saved', async () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    open();
    await tapBackup();
    expect(downloads).toEqual(['judya-backup-2026-10-18.json']);
    expect(screen.getByText(/ดาวน์โหลดไฟล์ judya-backup-2026-10-18.json แล้ว/)).toBeInTheDocument();
    expect(stored().meta.lastBackupAt).toBe(CLOCK);
  });

  it('the share sheet fails for another reason: the file is downloaded instead', async () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    shareMock(async () => {
      throw new DOMException('no', 'NotAllowedError');
    });
    open();
    await tapBackup();
    expect(downloads).toEqual(['judya-backup-2026-10-18.json']);
    expect(stored().meta.lastBackupAt).toBe(CLOCK);
  });

  it('the file was handed over but the date cannot be saved: no "done" message, the old date stays', async () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    const before = rawStored();
    shareMock(async () => {
      failWrites(); // the disk fills up while the share sheet is open
    });
    open();
    await tapBackup();
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกวันที่สำรองในแอพไม่ได้');
    expect(screen.queryByText(/แชร์ไฟล์ judya/)).not.toBeInTheDocument();
    expect(screen.getByText('ยังไม่เคยสำรอง')).toBeInTheDocument();
    expect(rawStored()).toBe(before);
  });

  it('after a backup more than 14 days ago the page warns; at exactly 14 days it does not', () => {
    const base = sampleRoot();
    expect(saveRoot({ ...base, meta: { ...base.meta, lastBackupAt: '2026-10-03T23:30:00+07:00' } }).ok).toBe(true);
    const first = open();
    expect(screen.getByText('สำรองล่าสุด 3 ต.ค. 2569 (15 วันที่แล้ว)')).toBeInTheDocument();
    expect(screen.getByText('ไม่ได้สำรองเกิน 14 วันแล้ว สำรองไว้กันข้อมูลหาย')).toBeInTheDocument();
    first.unmount();
    expect(saveRoot({ ...base, meta: { ...base.meta, lastBackupAt: '2026-10-04T10:00:00+07:00' } }).ok).toBe(true);
    open();
    expect(screen.getByText('สำรองล่าสุด 4 ต.ค. 2569 (14 วันที่แล้ว)')).toBeInTheDocument();
    expect(screen.queryByText(/สำรองไว้กันข้อมูลหาย/)).not.toBeInTheDocument();
  });
});

describe('restore from a backup file', () => {
  it('pick a file -> summary next to the current data -> confirm -> data replaced, old text kept', async () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    const before = rawStored();
    open();
    pick(backupFile(threeMeds()));
    expect(await screen.findByText('จะแทนที่ข้อมูลปัจจุบันทั้งหมดด้วยข้อมูลในไฟล์นี้')).toBeInTheDocument();
    expect(screen.getByText(/สมาชิก 2 คน ยา 3 รายการ · สำรองเมื่อ 3 ต.ค. 2569/)).toBeInTheDocument();
    expect(screen.getByText('สมาชิก 1 คน ยา 1 รายการ')).toBeInTheDocument(); // what is in the phone now
    expect(rawStored()).toBe(before); // nothing is replaced before the confirm

    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน นำกลับ' }));
    expect(screen.getByText(/นำกลับข้อมูลแล้ว สมาชิก 2 คน ยา 3 รายการ/)).toBeInTheDocument();
    expect(stored().assignments).toHaveLength(3);
    expect(stored().persons).toHaveLength(2);
    expect(localStorage.getItem(PREV_KEY)).toBe(before);
    expect(loadRoot().status).toBe('ok');
    // the settings page now reports the restored backup date
    expect(screen.getByText(/สำรองล่าสุด 3 ต.ค. 2569/)).toBeInTheDocument();
  });

  it('cancel half way: nothing changes', async () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    const before = rawStored();
    open();
    pick(backupFile(threeMeds()));
    await screen.findByText('จะแทนที่ข้อมูลปัจจุบันทั้งหมดด้วยข้อมูลในไฟล์นี้');
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByText('จะแทนที่ข้อมูลปัจจุบันทั้งหมดด้วยข้อมูลในไฟล์นี้')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'นำกลับจากไฟล์สำรอง' })).toBeInTheDocument();
    expect(rawStored()).toBe(before);
    expect(localStorage.getItem(PREV_KEY)).toBeNull();
  });

  const bad: [string, () => File, string][] = [
    ['not JSON', () => new File(['abc'], 'x.json'), 'อ่านไฟล์นี้ไม่ได้'],
    ['version 1', () => new File([JSON.stringify({ ...sampleRoot(), version: 1 })], 'x.json'), 'คนละรุ่นกับแอพ'],
    ['missing fields', () => new File([JSON.stringify({ version: 2, persons: [] })], 'x.json'), 'ข้อมูลไม่ครบหรือเสียหาย'],
    ['over 5 MB', () => new File(['x'.repeat(MAX_BACKUP_BYTES + 1)], 'x.json'), 'ใหญ่เกิน 5 MB'],
  ];
  it.each(bad)('%s: a Thai message that says the current data is untouched, and the data really is', async (_name, file, text) => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    const before = rawStored();
    open();
    pick(file());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(alert).toHaveTextContent('ข้อมูลปัจจุบันไม่ถูกแตะ');
    expect(screen.queryByRole('button', { name: 'ยืนยัน นำกลับ' })).not.toBeInTheDocument();
    expect(rawStored()).toBe(before);
    expect(localStorage.getItem(PREV_KEY)).toBeNull();
  });

  it('the data cannot be saved at the confirm: an error, the screen and the phone keep the current data', async () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    localStorage.setItem(PREV_KEY, 'older-copy');
    const before = rawStored();
    open();
    pick(backupFile(threeMeds()));
    await screen.findByRole('button', { name: 'ยืนยัน นำกลับ' });
    failWrites(STORAGE_KEY);
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน นำกลับ' }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('บันทึกข้อมูลจากไฟล์ลงเครื่องไม่ได้');
    expect(alert).toHaveTextContent('ข้อมูลปัจจุบันไม่ถูกแตะ');
    expect(screen.queryByText(/นำกลับข้อมูลแล้ว/)).not.toBeInTheDocument();
    expect(rawStored()).toBe(before);
    expect(localStorage.getItem(PREV_KEY)).toBe('older-copy');
    go('#/');
    expect(screen.getByText('Test Person A')).toBeInTheDocument();
    expect(screen.queryByText('Test Person B')).not.toBeInTheDocument();
  });

  it('the same file can be chosen again after a refusal', async () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    open();
    pick(new File(['abc'], 'x.json'));
    await screen.findByRole('alert');
    pick(backupFile(threeMeds()));
    expect(await screen.findByRole('button', { name: 'ยืนยัน นำกลับ' })).toBeInTheDocument();
  });
});

describe('where the data is kept', () => {
  const withStorage = (persisted: boolean) =>
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: async () => persisted, persist: async () => persisted } });

  it('yes: the browser promised, and the text still says to back up (never "100% safe")', async () => {
    withStorage(true);
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    open();
    await waitFor(() => expect(screen.getByText('ใช่')).toBeInTheDocument());
    expect(screen.getByText(/เบราว์เซอร์รับปากจะไม่ลบข้อมูล:/)).toBeInTheDocument();
    expect(screen.getByText(/ข้อมูลก็ยังหายได้ ควรสำรองไฟล์เป็นประจำ/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/100%|ปลอดภัย/);
  });
  it('no: says so and tells the person to back up regularly', async () => {
    withStorage(false);
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    open();
    await waitFor(() => expect(screen.getByText('ไม่')).toBeInTheDocument());
    expect(screen.getByText(/ให้สำรองไฟล์เป็นประจำ/)).toBeInTheDocument();
  });
  it('not supported: says so', async () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    open();
    await waitFor(() => expect(screen.getByText('ไม่รองรับ')).toBeInTheDocument());
    expect(screen.getByText(/สำรองไฟล์เป็นประจำ/)).toBeInTheDocument();
  });
});

describe('end of the page', () => {
  it('shows the app version and that nothing leaves the phone unless the person shares', () => {
    expect(saveRoot(sampleRoot()).ok).toBe(true);
    open();
    expect(screen.getByText(/^JudYa เวอร์ชัน \S+/)).toBeInTheDocument();
    expect(screen.getByText('แอพนี้ไม่ส่งข้อมูลออกนอกเครื่องยกเว้นคุณกดแชร์เอง')).toBeInTheDocument();
  });
});

describe('quiet backup reminder on the home screen', () => {
  const house = (lastBackupAt?: string): Root => {
    const r = sampleRoot();
    return lastBackupAt ? { ...r, meta: { ...r.meta, lastBackupAt } } : r;
  };
  const reminder = () => screen.queryByRole('link', { name: 'สำรองข้อมูล' });

  it('more than 14 days: a plain line with an icon and a link to Settings (no dialog, no alert)', () => {
    expect(saveRoot(house('2026-10-03T23:30:00+07:00')).ok).toBe(true);
    open('#/');
    expect(screen.getByText(/ไม่ได้สำรองข้อมูลมา 15 วันแล้ว/)).toBeInTheDocument();
    expect(reminder()).toHaveAttribute('href', '#/settings');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('never backed up but the house has data: shown', () => {
    expect(saveRoot(house()).ok).toBe(true);
    open('#/');
    expect(screen.getByText(/ยังไม่เคยสำรองข้อมูล/)).toBeInTheDocument();
    expect(reminder()).toBeInTheDocument();
  });
  it('14 days or less: not shown', () => {
    expect(saveRoot(house('2026-10-04T10:00:00+07:00')).ok).toBe(true);
    open('#/');
    expect(reminder()).not.toBeInTheDocument();
  });
  it('sample data: not shown', () => {
    const r = house();
    expect(saveRoot({ ...r, meta: { ...r.meta, isSample: true } }).ok).toBe(true);
    open('#/');
    expect(screen.getByText('นี่คือข้อมูลตัวอย่าง')).toBeInTheDocument();
    expect(reminder()).not.toBeInTheDocument();
  });
  it('blank house: not shown', () => {
    expect(saveRoot(emptyRoot(NOW)).ok).toBe(true);
    open('#/');
    expect(reminder()).not.toBeInTheDocument();
  });
});

describe('problem screen (unreadable data) offers restore from a backup file', () => {
  it('corrupt data: pick a file, the current data is shown as unreadable, confirm -> the app opens with the restored data', async () => {
    localStorage.setItem(STORAGE_KEY, '{"version":2,"persons":[');
    open('#/');
    expect(screen.getByRole('alert')).toHaveTextContent('อ่านข้อมูลที่เก็บไว้ไม่ได้');
    pick(backupFile(threeMeds()));
    await screen.findByText('จะแทนที่ข้อมูลปัจจุบันทั้งหมดด้วยข้อมูลในไฟล์นี้');
    expect(screen.getByText('อ่านไม่ได้')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน นำกลับ' }));
    expect(screen.getByText('สมาชิกในบ้าน')).toBeInTheDocument(); // the home screen of the restored house
    expect(stored().assignments).toHaveLength(3);
    expect(localStorage.getItem(PREV_KEY)).toBe('{"version":2,"persons":[');
  });
  it('a bad file there says the data was not touched', async () => {
    localStorage.setItem(STORAGE_KEY, '{"version":2,"persons":[');
    open('#/');
    pick(new File(['abc'], 'x.json'));
    expect(await screen.findAllByText(/ข้อมูลปัจจุบันไม่ถูกแตะ/)).not.toHaveLength(0);
    expect(rawStored()).toBe('{"version":2,"persons":[');
  });
  it('data from another version: the button is there too', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3 }));
    open('#/');
    expect(screen.getByRole('button', { name: 'นำกลับจากไฟล์สำรอง' })).toBeInTheDocument();
  });
  it('browser blocks storage: no restore button (nothing could be written)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    open('#/');
    expect(screen.getByRole('alert')).toHaveTextContent('เบราว์เซอร์ไม่ให้เก็บข้อมูล');
    expect(screen.queryByRole('button', { name: 'นำกลับจากไฟล์สำรอง' })).not.toBeInTheDocument();
  });
});
