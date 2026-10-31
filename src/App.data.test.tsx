// Screen tests for the data layer (step 3.2a-1): sample data, load problems, failed saves.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from './App';
import { PREV_KEY, STORAGE_KEY } from './domain/storage';
import { requestPersistence, resetPersistenceAsked } from './state/persist';

const EMPTY_TEXT = 'เริ่มที่ยาตัวแรก'; // round 9 first-run card heading (was 'ยังไม่มีสมาชิกหรือยา')
const SAMPLE_TEXT = 'นี่คือข้อมูลตัวอย่าง';

const click = (el: HTMLElement) => fireEvent.click(el);

const clearOurKeys = () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
};

beforeEach(() => {
  clearOurKeys();
  window.location.hash = '#/old'; // v2 Home (M4 PR 7: `#/` is v3 Home)
  resetPersistenceAsked();
});
afterEach(() => {
  vi.restoreAllMocks();
  clearOurKeys();
});

const quotaError = () => new DOMException('full', 'QuotaExceededError');

describe('first launch and sample data', () => {
  it('starts as a blank house with only the sample button (no add-member / add-medicine buttons yet)', () => {
    render(<App />);
    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ลองดูด้วยข้อมูลตัวอย่าง' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /เพิ่มสมาชิก|เพิ่มยา/ })).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull(); // opening alone writes nothing
  });

  it('sample data appears and is still there after a reload', () => {
    const first = render(<App />);
    click(screen.getByRole('button', { name: 'ลองดูด้วยข้อมูลตัวอย่าง' }));
    expect(screen.getByText(SAMPLE_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();

    first.unmount(); // "reload": a brand new app that reads storage
    render(<App />);
    expect(screen.getByText(SAMPLE_TEXT)).toBeInTheDocument();
  });

  it('deleting the sample data returns to the blank house, also after a reload', () => {
    const first = render(<App />);
    click(screen.getByRole('button', { name: 'ลองดูด้วยข้อมูลตัวอย่าง' }));
    click(screen.getByRole('button', { name: 'ลบข้อมูลตัวอย่าง' }));
    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(SAMPLE_TEXT)).not.toBeInTheDocument();

    first.unmount();
    render(<App />);
    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument();
  });
});

describe('data that cannot be loaded is never overwritten silently', () => {
  const CORRUPT = '{"version":2,"persons":[';

  it('corrupt data: explains, offers both buttons, and writes nothing until the person confirms', async () => {
    localStorage.setItem(STORAGE_KEY, CORRUPT);
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('อ่านข้อมูลที่เก็บไว้ไม่ได้');
    expect(screen.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);

    // open the box, then cancel: still untouched
    click(screen.getByRole('button', { name: 'เริ่มใหม่' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
    expect(localStorage.getItem(PREV_KEY)).toBeNull();
    click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
    expect(localStorage.getItem(PREV_KEY)).toBeNull();

    // confirm: copy kept under judya.v2.prev, blank house starts
    click(screen.getByRole('button', { name: 'เริ่มใหม่' }));
    const dialog = screen.getByRole('dialog');
    click(within(dialog).getByRole('button', { name: 'ยืนยัน เริ่มใหม่' }));
    expect(localStorage.getItem(PREV_KEY)).toBe(CORRUPT);
    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ version: 2, persons: [] });
  });

  it('"try again" loads again without changing anything', async () => {
    localStorage.setItem(STORAGE_KEY, CORRUPT);
    render(<App />);
    click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('อ่านข้อมูลที่เก็บไว้ไม่ได้');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
  });

  it('data of another version gets its own explanation and is kept', () => {
    const newer = JSON.stringify({ version: 3, persons: [] });
    localStorage.setItem(STORAGE_KEY, newer);
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ข้อมูลเป็นรุ่นอื่นของแอพ');
    expect(screen.getByRole('button', { name: 'เริ่มใหม่' })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(newer);
  });

  it('storage blocked: explains and offers only "try again" (there is nothing to start over from)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('เบราว์เซอร์ไม่ให้เก็บข้อมูล');
    expect(screen.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'เริ่มใหม่' })).not.toBeInTheDocument();
  });

  it('start over that cannot keep the safety copy changes nothing and says so', async () => {
    localStorage.setItem(STORAGE_KEY, CORRUPT);
    render(<App />);
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === PREV_KEY) throw quotaError();
      realSet.call(this, key, value);
    });
    click(screen.getByRole('button', { name: 'เริ่มใหม่' }));
    click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยืนยัน เริ่มใหม่' }));
    expect(screen.getByText('เริ่มใหม่ไม่ได้ ข้อมูลเดิมยังอยู่')).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
  });
});

describe('a save that fails is never shown as saved', () => {
  it('first save fails (storage full): message appears, screen stays blank, nothing is stored; retry works', () => {
    render(<App />);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    click(screen.getByRole('button', { name: 'ลองดูด้วยข้อมูลตัวอย่าง' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
    expect(screen.queryByText(SAMPLE_TEXT)).not.toBeInTheDocument();
    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    spy.mockRestore(); // space is available again
    click(within(alert).getByRole('button', { name: 'ลองใหม่' }));
    expect(screen.getByText(SAMPLE_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ meta: { isSample: true } });
  });

  it('a later save fails: the earlier data is intact on screen and in storage', () => {
    render(<App />);
    click(screen.getByRole('button', { name: 'ลองดูด้วยข้อมูลตัวอย่าง' }));
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).not.toBeNull();

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    click(screen.getByRole('button', { name: 'ลบข้อมูลตัวอย่าง' }));

    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
    expect(screen.getByText(SAMPLE_TEXT)).toBeInTheDocument(); // not shown as deleted
    expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
  });
});

describe('persistent storage request', () => {
  const withStorage = (persist: () => Promise<boolean>, persisted = async () => false) =>
    Object.defineProperty(navigator, 'storage', { value: { persist, persisted }, configurable: true });
  afterEach(() => Reflect.deleteProperty(navigator, 'storage'));

  it('asks the browser once when the app opens, even if the app re-renders', async () => {
    const persist = vi.fn(async () => true);
    withStorage(persist);
    const r = render(<App />);
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    r.rerender(<App />);
    await requestPersistence();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not ask again when already granted, and a refusal does not break the app', async () => {
    const persist = vi.fn(async () => true);
    withStorage(persist, async () => true);
    await requestPersistence();
    expect(persist).not.toHaveBeenCalled();

    resetPersistenceAsked();
    withStorage(async () => {
      throw new Error('refused');
    });
    await expect(requestPersistence()).resolves.toBe('denied'); // a refusal is just "no promise"
  });
});
