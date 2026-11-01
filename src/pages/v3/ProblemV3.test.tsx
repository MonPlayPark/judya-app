import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { backupFileOf } from '../../domain/v3/dataPage';
import { sampleRootV3 } from '../../domain/v3/fixtures';
import { loadRoot, PREV_KEY, STORAGE_KEY } from '../../domain/v3/storage';

// M4 PR 7: `judya.v3` cannot be read -> every v3 page offers "เริ่มใหม่" and "กู้คืนจากไฟล์สำรอง".
// These tests use jsdom's real localStorage through <App />. The v2 keys are filled with a marker text that must never change.

const V2_MARK = '{"v2":"must stay as it is"}';
const CORRUPT = '{not json at all';
const WRONG_VERSION = JSON.stringify({ version: 99, somethingNew: true });

const go = (hash: string): void => {
  window.location.hash = hash;
};
const press = (name: string): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};
const touched: string[] = [];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('judya.v2', V2_MARK);
  localStorage.setItem('judya.v2.prev', V2_MARK);
  touched.length = 0;
  const record = (key: unknown): void => void touched.push(String(key));
  for (const m of ['getItem', 'setItem', 'removeItem'] as const) {
    const real = Storage.prototype[m] as (...a: string[]) => unknown;
    vi.spyOn(Storage.prototype, m).mockImplementation(function (this: Storage, ...args: string[]) {
      record(args[0]);
      return real.apply(this, args);
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const v2Untouched = (): void => {
  expect(touched.filter((k) => k.startsWith('judya.v2'))).toEqual([]);
  expect(localStorage.getItem('judya.v2')).toBe(V2_MARK);
  expect(localStorage.getItem('judya.v2.prev')).toBe(V2_MARK);
};

describe('data that cannot be read shows the two buttons', () => {
  it.each([
    ['corrupt text', CORRUPT],
    ['another data version', WRONG_VERSION],
  ])('%s at #/ : both buttons, nothing is written, v2 untouched', (_name, raw) => {
    localStorage.setItem(STORAGE_KEY, raw);
    go('#/');
    render(<App />);
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'เริ่มใหม่' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'กู้คืนจากไฟล์สำรอง' })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); // not overwritten
    expect(localStorage.getItem(PREV_KEY)).toBeNull();
    v2Untouched();
  });

  it.each(['#/n/meds', '#/n/meds/new', '#/n/members/new', '#/n/settings/data', '#/n/meds/abc'])('%s shows the same two buttons', (hash) => {
    localStorage.setItem(STORAGE_KEY, CORRUPT);
    go(hash);
    render(<App />);
    expect(screen.getByRole('button', { name: 'เริ่มใหม่' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'กู้คืนจากไฟล์สำรอง' })).toBeInTheDocument();
    v2Untouched();
  });

  it('storage blocked by the browser: the reason only, no buttons (nothing to start over from)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    go('#/');
    render(<App />);
    expect(screen.getByText(/เบราว์เซอร์ไม่ให้เก็บข้อมูล/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'เริ่มใหม่' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'กู้คืนจากไฟล์สำรอง' })).not.toBeInTheDocument();
  });
});

describe('"เริ่มใหม่": two confirm steps, the old text goes to judya.v3.prev', () => {
  it('asks twice; cancelling at either step changes nothing', () => {
    localStorage.setItem(STORAGE_KEY, CORRUPT);
    go('#/');
    render(<App />);
    press('เริ่มใหม่');
    expect(screen.getByRole('dialog', { name: 'เริ่มใหม่?' })).toBeInTheDocument();
    press('ยกเลิก ไม่เปลี่ยนอะไร');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    press('เริ่มใหม่');
    press('ต่อไป');
    expect(screen.getByRole('dialog', { name: 'ยืนยันอีกครั้ง' })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT); // still nothing written after step 1
    press('ยกเลิก ไม่เปลี่ยนอะไร');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
    expect(localStorage.getItem(PREV_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'เริ่มใหม่' })).toBeInTheDocument();
    v2Untouched();
  });

  it.each([
    ['corrupt text', CORRUPT],
    ['another data version', WRONG_VERSION],
  ])('%s: after the second confirm the old text is in judya.v3.prev and Home opens on a blank house', (_n, raw) => {
    localStorage.setItem(STORAGE_KEY, raw);
    go('#/');
    render(<App />);
    press('เริ่มใหม่');
    press('ต่อไป');
    press('เริ่มใหม่ ล้างข้อมูลเดิม');
    expect(localStorage.getItem(PREV_KEY)).toBe(raw); // exact copy of what was there
    expect(loadRoot().status).toBe('ok'); // a blank, valid v3 house
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สวัสดีค่ะ'); // v3 Home, not the problem screen
    expect(screen.queryByRole('button', { name: 'เริ่มใหม่' })).not.toBeInTheDocument();
    v2Untouched();
  });

  it('when the safety copy cannot be written, the old text stays and the reason is shown', () => {
    localStorage.setItem(STORAGE_KEY, CORRUPT);
    go('#/');
    render(<App />);
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === PREV_KEY) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, k, v);
    });
    press('เริ่มใหม่');
    press('ต่อไป');
    press('เริ่มใหม่ ล้างข้อมูลเดิม');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
    expect(screen.getByText(/เริ่มใหม่ไม่ได้ ข้อมูลเดิมยังอยู่/)).toBeInTheDocument();
    v2Untouched();
  });
});

describe('"กู้คืนจากไฟล์สำรอง": the restore of the data page', () => {
  const fileOf = (text: string): File => new File([text], 'judya-backup.json', { type: 'application/json' });
  const choose = async (file: File): Promise<void> => {
    await act(async () => {
      fireEvent.change(screen.getByLabelText('เลือกไฟล์สำรอง'), { target: { files: [file] } });
    });
  };

  it('a good file: summary sheet, confirm, the old text is kept in .prev, Home shows the restored house', async () => {
    localStorage.setItem(STORAGE_KEY, CORRUPT);
    go('#/');
    render(<App />);
    const file = backupFileOf(sampleRootV3(), '2026-10-28T09:00:00+07:00');
    await choose(fileOf(file.text));
    const sheet = await screen.findByRole('dialog', { name: 'นำข้อมูลกลับจากไฟล์นี้?' });
    expect(within(sheet).getByText(/ในไฟล์สำรอง/)).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT); // nothing before the confirm button
    fireEvent.click(within(sheet).getByRole('button', { name: 'นำกลับ แทนที่ข้อมูลทั้งหมด' }));
    await waitFor(() => expect(loadRoot().status).toBe('ok'));
    const loaded = loadRoot();
    expect(loaded.status === 'ok' && loaded.root.persons.length).toBe(sampleRootV3().persons.length);
    expect(localStorage.getItem(PREV_KEY)).toBe(CORRUPT);
    expect(screen.queryByRole('button', { name: 'กู้คืนจากไฟล์สำรอง' })).not.toBeInTheDocument();
    v2Untouched();
  });

  it('cancelling the sheet changes nothing', async () => {
    localStorage.setItem(STORAGE_KEY, WRONG_VERSION);
    go('#/');
    render(<App />);
    await choose(fileOf(backupFileOf(sampleRootV3(), '2026-10-28T09:00:00+07:00').text));
    fireEvent.click(await screen.findByRole('button', { name: 'ยกเลิก ไม่เปลี่ยนอะไร' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(WRONG_VERSION);
    expect(localStorage.getItem(PREV_KEY)).toBeNull();
  });

  it('a file that is not a backup: the data-page error text, nothing written', async () => {
    localStorage.setItem(STORAGE_KEY, CORRUPT);
    go('#/');
    render(<App />);
    await choose(fileOf('hello'));
    expect(await screen.findByText(/อ่านไฟล์นี้ไม่ได้ หรือไม่ใช่ไฟล์สำรองของ JudYa/)).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
    expect(localStorage.getItem(PREV_KEY)).toBeNull();
    v2Untouched();
  });
});
