import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { sampleRootV3 } from '../../domain/v3/fixtures';
import { STORAGE_KEY, loadRoot, saveRoot, type KeyValueStore } from '../../domain/v3/storage';
import { ABOUT_LOCAL, ABOUT_NOT_MEDICAL, APP_VERSION } from './SettingsV3';

type Mem = KeyValueStore & { data: Record<string, string>; failQuota: boolean; writes: number };
const memoryStore = (): Mem => {
  const data: Record<string, string> = {};
  const m: Mem = {
    data,
    failQuota: false,
    writes: 0,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      if (m.failQuota) throw new DOMException('full', 'QuotaExceededError');
      m.writes += 1;
      data[k] = v;
    },
    removeItem: (k) => void delete data[k],
  };
  return m;
};

const house = (settings: Record<string, unknown> = {}) => {
  const r = sampleRootV3();
  return { ...r, settings: { ...r.settings, ...settings } };
};
const open = (path: string, store: Mem) => {
  window.location.hash = `#${path}`;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => store.getItem(k));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => store.setItem(k, v));
  return render(<App getToday={() => '2026-10-30'} />);
};
const seeded = (settings: Record<string, unknown> = {}): Mem => {
  const s = memoryStore();
  expect(saveRoot(house(settings), s).ok).toBe(true);
  s.writes = 0;
  return s;
};
const saved = (s: Mem) => {
  const r = loadRoot(s);
  if (r.status !== 'ok') throw new Error('no house');
  return r.root;
};
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  window.location.hash = '';
  delete document.documentElement.dataset.fs;
});
afterEach(() => vi.restoreAllMocks());

describe('the list', () => {
  it('has the title, five link rows with their live lines, and no coming-soon buttons', () => {
    const store = seeded({ expiryWarnDays: 30, orderDays: 60 });
    open('/n/settings', store);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ตั้งค่า');
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs.slice(0, 5)).toEqual(['#/n/settings/font', '#/n/settings/reminders', '#/n/settings/order', '#/n/settings/data', '#/n/settings/about']);
    expect(screen.getByText('ปกติ')).toBeInTheDocument();
    expect(screen.getByText(/ใกล้หมดอายุ 30 วัน · ใกล้หมด 14 วัน/)).toBeInTheDocument();
    expect(screen.getByText(/สั่งให้พอ 60 วัน · \d+ ร้าน/)).toBeInTheDocument();
    expect(screen.getByText('ยังไม่เคยสำรอง')).toBeInTheDocument();
    expect(screen.getByText(`เวอร์ชัน ${APP_VERSION}`)).toBeInTheDocument();
    expect(screen.queryByText(/เร็วๆ นี้/)).toBeNull();
  });
  it('the Settings tab is current here and on every settings page', () => {
    for (const p of ['', '/font', '/reminders', '/order', '/about']) {
      const { unmount } = open(`/n/settings${p}`, seeded());
      expect(screen.getByRole('link', { name: 'ตั้งค่า' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'ตั้งค่า' })).toHaveAttribute('href', '#/n/settings');
      unmount();
    }
  });
  it('a demo keeps ?demo in its links and reads no storage', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    window.location.hash = '#/n/settings?demo=normal';
    render(<App getToday={() => '2026-10-30'} />);
    expect(screen.getByText('โหมดตัวอย่าง ไม่บันทึกข้อมูล')).toBeInTheDocument();
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '#/n/settings/font?demo=normal');
    expect(get.mock.calls.filter(([k]) => k === STORAGE_KEY)).toEqual([]);
  });
});

describe('reminders', () => {
  it('shows the chips with the saved value chosen (check + word) and the hints', () => {
    open('/n/settings/reminders', seeded({ expiryWarnDays: 15, lowStockDays: 14 }));
    expect(screen.getByRole('link', { name: 'กลับไปหน้าตั้งค่า' })).toHaveAttribute('href', '#/n/settings');
    expect(screen.getAllByRole('button', { name: /วัน$/ })).toHaveLength(8);
    expect(screen.getByRole('button', { name: '15 วัน' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '14 วัน' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('ยาที่หมดอายุภายใน 15 วัน จะขึ้นในหน้าแรก')).toBeInTheDocument();
    expect(screen.getByText('ยาประจำตัวที่เหลือไม่เกิน 14 วัน จะขึ้นในหน้าแรก')).toBeInTheDocument();
    expect(screen.getByText('ปรับแล้วใช้ทันที ไม่ต้องกดบันทึก')).toBeInTheDocument();
  });
  it('one tap = one write, the hint follows, nothing else in the house changes', () => {
    const store = seeded();
    const before = saved(store);
    open('/n/settings/reminders', store);
    fireEvent.click(within(screen.getByRole('group', { name: 'ยาใกล้หมดอายุ' })).getByRole('button', { name: '30 วัน' }));
    expect(store.writes).toBe(1);
    expect(saved(store).settings.expiryWarnDays).toBe(30);
    expect({ ...saved(store), settings: before.settings }).toEqual(before);
    expect(screen.getByText('ยาที่หมดอายุภายใน 30 วัน จะขึ้นในหน้าแรก')).toBeInTheDocument();
    press('3 วัน');
    expect(saved(store).settings.lowStockDays).toBe(3);
    expect(store.writes).toBe(2);
  });
  it('a stored value that is not a chip is shown as an extra chosen chip', () => {
    open('/n/settings/reminders', seeded({ expiryWarnDays: 45 }));
    expect(screen.getByRole('button', { name: '45 วัน' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('a failed write keeps the old choice and says so', () => {
    const store = seeded();
    open('/n/settings/reminders', store);
    store.failQuota = true;
    press('60 วัน');
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
    expect(screen.getByRole('button', { name: '15 วัน' })).toHaveAttribute('aria-pressed', 'true');
    expect(saved(store).settings.expiryWarnDays).toBe(15);
  });
  it('a demo changes the page and writes nothing', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    window.location.hash = '#/n/settings/reminders?demo=normal';
    render(<App getToday={() => '2026-10-30'} />);
    press('60 วัน');
    expect(screen.getByRole('button', { name: '60 วัน' })).toHaveAttribute('aria-pressed', 'true');
    expect(set).not.toHaveBeenCalled();
  });
});

describe('font size', () => {
  it('three big rows with a sample sentence each; the saved one is chosen', () => {
    open('/n/settings/font', seeded());
    expect(screen.getAllByText('ยาของคุณแม่ เช้า 1 เม็ด หลังอาหาร')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /^ปกติ/ })).toHaveAttribute('aria-pressed', 'true');
  });
  it('a tap saves to the house (one write), changes the whole app at once and writes no other key', () => {
    const store = seeded();
    open('/n/settings/font', store);
    press(/^ใหญ่/);
    expect(saved(store).settings.fontSize).toBe('large');
    expect(store.writes).toBe(1);
    expect(Object.keys(store.data)).toEqual([STORAGE_KEY]);
    expect(document.documentElement.dataset.fs).toBe('l');
    press(/^กลาง/);
    expect(document.documentElement.dataset.fs).toBe('m');
    expect(saved(store).settings.fontSize).toBe('medium');
  });
  it('a failed write leaves the size as it was', () => {
    const store = seeded();
    document.documentElement.dataset.fs = 'n';
    open('/n/settings/font', store);
    store.failQuota = true;
    press(/^ใหญ่/);
    expect(document.documentElement.dataset.fs).toBe('n');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('order and shops', () => {
  it('chips for the days, the shop count with a link, the template text', () => {
    open('/n/settings/order', seeded({ orderDays: 45 }));
    expect(screen.getAllByRole('button', { name: /วัน$/ }).map((b) => b.textContent)).toEqual(['14 วัน', '30 วัน', '45 วัน', '60 วัน', '90 วัน']);
    expect(screen.getByRole('button', { name: '45 วัน' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /จัดการร้านค้า/ })).toHaveAttribute('href', '#/n/shops');
    expect(screen.getByText('ใช้ข้อความมาตรฐาน')).toBeInTheDocument();
  });
  it('a tap on the days saves orderDays', () => {
    const store = seeded();
    open('/n/settings/order', store);
    press('90 วัน');
    expect(saved(store).settings.orderDays).toBe(90);
    expect(store.writes).toBe(1);
  });
});

describe('about', () => {
  it('shows the version, the two sentences and the link to the data page', () => {
    open('/n/settings/about', seeded());
    expect(screen.getByText(`เวอร์ชัน ${APP_VERSION}`)).toBeInTheDocument();
    expect(screen.getByText(ABOUT_NOT_MEDICAL)).toBeInTheDocument();
    expect(screen.getByText(ABOUT_LOCAL)).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: /ข้อมูลและสำรอง/ })).toHaveAttribute('href', '#/n/settings/data');
  });
});

describe('every settings page', () => {
  it.each(['', '/font', '/reminders', '/order', '/about', '/data'])('/n/settings%s has no "#" link and no coming-soon button', (p) => {
    open(`/n/settings${p}`, seeded());
    for (const a of screen.getAllByRole('link')) expect(a.getAttribute('href')).not.toBe('#');
    expect(screen.queryByText(/เร็วๆ นี้/)).toBeNull();
  });
});
