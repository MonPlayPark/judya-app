import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { sampleRootV3 } from '../../domain/v3/fixtures';
import { rootSchema, type Root } from '../../domain/v3/schema';
import { STORAGE_KEY } from '../../domain/v3/storage';
import { resetPersistenceAsked } from '../../state/persist';

// M4 PR 7 fix: v3 pages have no DataProvider, so the v3 frame asks the browser to keep the data (once per page load) and the
// first saved medicine asks once more (BRIEF 3.2, same rule as the v2 DataContext).

/** A house with members but no medicine at all (the state "before the first medicine"). */
const houseWithoutMedicine = (): Root => ({ ...sampleRootV3(), medications: [], assignments: [], events: [], houseItems: [], prices: [], orders: [] });

const persist = vi.fn<() => Promise<boolean>>();
const persisted = vi.fn<() => Promise<boolean>>();
const touched: string[] = [];

const go = (hash: string): void => {
  window.location.hash = hash;
};
/** Moves a running app to another hash (the router listens to `hashchange`). */
const navigate = async (hash: string): Promise<void> => {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();
  });
};
const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
const btn = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('judya.v2', '{"v2":"mark"}');
  resetPersistenceAsked();
  persist.mockReset().mockResolvedValue(true);
  persisted.mockReset().mockResolvedValue(false);
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist, persisted } });
  touched.length = 0;
  for (const m of ['getItem', 'setItem', 'removeItem'] as const) {
    const real = Storage.prototype[m] as (...a: string[]) => unknown;
    vi.spyOn(Storage.prototype, m).mockImplementation(function (this: Storage, ...args: string[]) {
      touched.push(String(args[0]));
      return real.apply(this, args);
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  Reflect.deleteProperty(navigator, 'storage');
});

describe('asking the browser to keep the data', () => {
  it.each(['#/', '#/n', '#/n/meds', '#/n?demo=normal'])('opening %s asks once; the v2 keys are not touched', async (hash) => {
    go(hash);
    render(<App />);
    await flush();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(touched.filter((k) => k.startsWith('judya.v2'))).toEqual([]);
  });

  it('moving between v3 pages does not ask again', async () => {
    go('#/n');
    render(<App />);
    await flush();
    await navigate('#/n/meds');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not ask when the browser has already promised', async () => {
    persisted.mockResolvedValue(true);
    go('#/');
    render(<App />);
    await flush();
    expect(persist).not.toHaveBeenCalled();
  });

  it.each([
    ['refuses', () => persist.mockResolvedValue(false)],
    ['fails', () => persist.mockRejectedValue(new Error('not allowed'))],
    ['is missing', () => Reflect.deleteProperty(navigator, 'storage')],
  ])('when the browser %s, the page opens as usual and shows no error', async (_n, setup) => {
    setup();
    go('#/');
    render(<App />);
    await flush();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สวัสดีค่ะ');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('asking again after the first medicine is saved', () => {
  const addMedicine = async (name: string): Promise<void> => {
    await navigate('#/n/meds/new?person=p2');
    fireEvent.change(screen.getByLabelText('ชื่อยา'), { target: { value: name } });
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[class*="primary"]') as HTMLButtonElement);
    fireEvent.click(btn('ถัดไป'));
    fireEvent.click(btn('ไม่นับสต็อก'));
    fireEvent.click(btn('บันทึกยา'));
    await flush();
  };

  it('first medicine: one more request; second medicine: none', async () => {
    const start = houseWithoutMedicine();
    expect(rootSchema.safeParse(start).success).toBe(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(start));
    go('#/n');
    render(<App />);
    await flush();
    expect(persist).toHaveBeenCalledTimes(1); // when the app opened

    await addMedicine('ยาทดสอบหนึ่ง');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').assignments).toHaveLength(1);
    expect(persist).toHaveBeenCalledTimes(2);

    await addMedicine('ยาทดสอบสอง');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').assignments).toHaveLength(2);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(touched.filter((k) => k.startsWith('judya.v2'))).toEqual([]);
  });

  it('a house that already has medicines does not ask again', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleRootV3()));
    go('#/n');
    render(<App />);
    await flush();
    await addMedicine('ยาทดสอบใหม่');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('a failing request after the save is silent and the save still counts', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(houseWithoutMedicine()));
    go('#/n');
    render(<App />);
    await flush();
    persist.mockRejectedValue(new Error('no'));
    await addMedicine('ยาทดสอบหนึ่ง');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').assignments).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
