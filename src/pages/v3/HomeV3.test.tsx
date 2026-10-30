import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { ComingSoon } from '../../components/v3/ComingSoon';
import { EveningIcon, MorningIcon, NightIcon, NoonIcon } from '../../components/v3/PeriodIcons';
import { DEMO_NAMES, DEMO_TODAY, demoRoot, type DemoName } from '../../domain/v3/homeDemo';
import { rootSchema } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY, loadRoot, saveRoot, type KeyValueStore } from '../../domain/v3/storage';
import { HomeV3Route } from './HomeV3Page';

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
};

const renderDemo = (name: DemoName) => {
  window.location.hash = `#/n?demo=${name}`;
  return render(<HomeV3Route />);
};
const today = () => DEMO_TODAY;

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => vi.restoreAllMocks());

describe('the six states render', () => {
  it.each(DEMO_NAMES)('%s', (name) => {
    renderDemo(name);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สวัสดีค่ะ');
    expect(screen.getByRole('navigation', { name: 'เมนูหลัก' })).toBeInTheDocument();
  });
  it('normal: greeting, members, today card, shortcuts, no warning', () => {
    renderDemo('normal');
    expect(screen.getByText('วันนี้มี 7 รายการที่ต้องจัดยา')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ยาของวันนี้ (สมาชิก ก)' })).toBeInTheDocument();
    expect(screen.getByText('เช้า · 1 เม็ด · หลังอาหาร')).toBeInTheDocument();
    expect(screen.queryByText(/\+\d+ เรื่อง/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'ยาที่ต้องดูแล' })).toBeNull();
    expect(screen.getByText('พุธ 28 ต.ค. 2569')).toBeInTheDocument();
  });
  it('alert: one orange warning, +3 เรื่อง, care card with rows and the order button', () => {
    renderDemo('alert');
    expect(screen.getByText('ยาหมดอายุแล้ว 1 รายการ')).toBeInTheDocument();
    expect(screen.getByText('+3 เรื่อง')).toBeInTheDocument();
    const care = screen.getByRole('region', { name: 'ยาที่ต้องดูแล' });
    expect(within(care).getByText('เลิกใช้')).toBeInTheDocument();
    expect(within(care).getByText('7 วัน')).toBeInTheDocument();
    expect(within(care).getByText('สั่งยา').closest('button')).toBeDisabled();
  });
  it('empty0 (S0): start card, step 2 locked, no members card, no today card, no shortcuts', () => {
    renderDemo('empty0');
    expect(screen.getByText('มาเริ่มจัดยากันเลย')).toBeInTheDocument();
    expect(screen.getByText('เพิ่มสมาชิกคนแรก')).toBeInTheDocument();
    expect(screen.getByText('ต้องเพิ่มสมาชิกก่อน').closest('button')).toBeNull();
    expect(screen.queryByText('สมาชิกในครอบครัว')).toBeNull();
    expect(screen.queryByText(/ยาของวันนี้/)).toBeNull();
    expect(screen.queryByText('สั่งซื้อยา')).toBeNull();
  });
  it('empty1 (S1): member done, add-medicine step open (coming soon), members card shown', () => {
    renderDemo('empty1');
    expect(screen.getByText('สมาชิก ก · เพิ่มแล้ว')).toBeInTheDocument();
    expect(screen.getByText('เสร็จแล้ว')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'สมาชิกในครอบครัว' })).toBeInTheDocument();
    expect(screen.getByText('เพิ่มยา').closest('button')).toBeDisabled();
  });
  it('notoday: says there is no medicine today, with the member line', () => {
    renderDemo('notoday');
    expect(screen.getByText('วันนี้ไม่มียาที่ต้องจัด')).toBeInTheDocument();
    expect(screen.getByText('วันนี้ไม่มียาที่ต้องกิน')).toBeInTheDocument();
    expect(screen.getByText('สมาชิก กไม่มียาตามตารางวันนี้')).toBeInTheDocument();
  });
  it('backup: shows the banner text from backupBanner()', () => {
    renderDemo('backup');
    expect(screen.getByText('ยังไม่ได้สำรองข้อมูล')).toBeInTheDocument();
  });
});

describe('no "ตารางยา" and no dead controls', () => {
  it.each(DEMO_NAMES)('%s: no word ตารางยา, no # links, every control has a job', (name) => {
    const { container } = renderDemo(name);
    expect(container.textContent).not.toContain('ตารางยา');
    // only the two real nav links exist (home and the medicine list); nothing else is a link, so nothing can be a dead link
    expect(Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['#/n', '#/n/meds']);
    for (const b of Array.from(container.querySelectorAll('button'))) {
      if (b.hasAttribute('aria-pressed')) {
        expect(b).toBeEnabled(); // member picker or tick: a real handler (tested below)
      } else {
        expect(b).toBeDisabled();
        expect(b).toHaveAttribute('aria-disabled', 'true');
        expect(b.textContent).toContain('เร็ว ๆ นี้');
      }
    }
  });
  it('ComingSoon does nothing when pressed and is not a tab stop', () => {
    render(<ComingSoon>ตัวอย่าง</ComingSoon>);
    const b = screen.getByRole('button');
    expect(b).toBeDisabled(); // a disabled button gets no click and no keyboard focus
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).not.toHaveAttribute('href');
    expect(b).toHaveTextContent('เร็ว ๆ นี้');
  });
  it('the three shortcuts and the bottom tabs are coming soon', () => {
    renderDemo('normal');
    for (const t of ['สั่งซื้อยา', 'แชร์ให้แพทย์', 'รายการยา', 'สมาชิก', 'ตั้งค่า', 'จัดการ', 'เพิ่มสมาชิก']) {
      const hit = screen.getAllByText(t).map((e) => e.closest('button')).filter((b) => b !== null);
      expect(hit.length, t).toBeGreaterThan(0);
      for (const b of hit) expect(b).toBeDisabled();
    }
    expect(screen.getByText('หน้าหลัก').closest('[aria-current="page"]')).not.toBeNull();
  });
});

describe('demo mode touches no storage', () => {
  it('no localStorage call of any kind, no loadRoot / saveRoot, ticks change in memory', () => {
    const calls = (['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const).map((m) => vi.spyOn(Storage.prototype, m));
    const save = vi.spyOn(storage, 'saveRoot');
    const load = vi.spyOn(storage, 'loadRoot');
    renderDemo('normal');
    expect(screen.getByText('โหมดตัวอย่าง ไม่บันทึกข้อมูล')).toBeInTheDocument();
    const pending = screen.getByRole('button', { name: /รอจัด/ });
    fireEvent.click(pending);
    expect(screen.getByText('วันนี้มี 6 รายการที่ต้องจัดยา')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /สมาชิก ข/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /รอจัด/ })[0]!);
    for (const c of calls) expect(c).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
  it('the demo badge is only in demo mode', () => {
    window.location.hash = '#/n';
    render(<HomeV3Route store={memoryStore()} getToday={today} />);
    expect(screen.queryByText(/โหมดตัวอย่าง/)).toBeNull();
  });
  it('picking a member switches the card', () => {
    renderDemo('normal');
    fireEvent.click(screen.getByRole('button', { name: /สมาชิก ง/ }));
    expect(screen.getByRole('heading', { name: 'ยาของวันนี้ (สมาชิก ง)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /สมาชิก ง/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('real data (judya.v3)', () => {
  const live = (store: KeyValueStore | null) => {
    window.location.hash = '#/n';
    return render(<HomeV3Route store={store} getToday={today} />);
  };

  it('a new user gets S0 and nothing is written', () => {
    const store = memoryStore();
    live(store);
    expect(screen.getByText('เพิ่มสมาชิกคนแรก')).toBeInTheDocument();
    expect(screen.getByText('มาเริ่มจัดยากันเลย')).toBeInTheDocument();
    expect(store.data).toEqual({});
  });
  it('ticking writes prepLog and a fresh load still has it; unticking removes it', () => {
    const store = memoryStore();
    expect(saveRoot(demoRoot('normal'), store)).toEqual({ ok: true });
    const { unmount } = live(store);
    const evening = screen.getByRole('button', { name: /เย็น.*รอจัด/ });
    fireEvent.click(evening);
    expect(screen.getByRole('button', { name: /เย็น.*จัดแล้ว/ })).toHaveAttribute('aria-pressed', 'true');
    const saved = loadRoot(store);
    expect(saved.status === 'ok' && saved.root.prepLog[DEMO_TODAY]).toEqual({ 'a1:morning': true, 'a1:evening': true });
    expect(saved.status === 'ok' && rootSchema.safeParse(saved.root).success).toBe(true);
    unmount();
    live(store); // "reload"
    expect(screen.getByRole('button', { name: /เย็น.*จัดแล้ว/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /เย็น.*จัดแล้ว/ }));
    const after = loadRoot(store);
    expect(after.status === 'ok' && after.root.prepLog[DEMO_TODAY]).toEqual({ 'a1:morning': true });
  });
  it('a failed save is told in readable Thai and the tick is not shown', () => {
    const store = memoryStore();
    saveRoot(demoRoot('normal'), store);
    live(store);
    store.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    fireEvent.click(screen.getByRole('button', { name: /เย็น.*รอจัด/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่ พื้นที่เก็บข้อมูลในเครื่องเต็ม');
    expect(screen.getByRole('button', { name: /เย็น.*รอจัด/ })).toHaveAttribute('aria-pressed', 'false');
  });
  it('data that cannot be read is reported and left alone', () => {
    const store = memoryStore({ [STORAGE_KEY]: '{not json' });
    live(store);
    expect(screen.getByRole('alert')).toHaveTextContent('อ่านข้อมูลที่เก็บไว้ไม่ได้');
    expect(store.data[STORAGE_KEY]).toBe('{not json');
  });
  it('blocked storage is reported', () => {
    live(null);
    expect(screen.getByRole('alert')).toHaveTextContent('เบราว์เซอร์ไม่ให้เก็บข้อมูล');
  });
});

describe('route #/n in the app', () => {
  it('opens the v3 home and never reads the v2 key', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    go('#/n?demo=alert');
    render(<App />);
    expect(screen.getByText('ยาหมดอายุแล้ว 1 รายการ')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
  it('leaves the old home alone at #/', () => {
    go('#/');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ยินดีต้อนรับค่ะ');
  });
});

const homeCss = readFileSync(resolve(process.cwd(), 'src/pages/v3/HomeV3.module.css'), 'utf8');

describe('period icons follow the locked board (canvas v87)', () => {
  const svgOf = (el: JSX.Element) => render(el).container.querySelector('svg') as SVGSVGElement;
  it('morning: sun behind a cloud, blue', () => {
    const svg = svgOf(<MorningIcon />);
    expect(svg).toHaveAttribute('stroke', '#1A6FD6');
    expect(svg.querySelector('path[fill="#CFE4FF"]')).not.toBeNull();
  });
  it('noon: full sun, yellow', () => {
    const svg = svgOf(<NoonIcon />);
    expect(svg).toHaveAttribute('stroke', '#F29900');
    expect(svg.querySelector('circle[fill="#FBBC05"]')).not.toBeNull();
  });
  it('evening: setting sun, orange-red', () => {
    const svg = svgOf(<EveningIcon />);
    expect(svg).toHaveAttribute('stroke', '#D9480F');
    expect(svg.querySelector('path[fill="#FF9F43"]')).not.toBeNull();
  });
  it('night: solid navy moon, no stroke', () => {
    const svg = svgOf(<NightIcon />);
    expect(svg.querySelector('path')).toHaveAttribute('fill', '#013073');
    expect(svg).not.toHaveAttribute('stroke');
  });
  it('all four are decorative 28px icons', () => {
    for (const C of [MorningIcon, NoonIcon, EveningIcon, NightIcon]) {
      const svg = svgOf(<C />);
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('width', '28');
    }
  });
  it('each dose row shows its own period icon, in the board colours', () => {
    const { container } = renderDemo('normal');
    const strokes = new Set([...container.querySelectorAll('section[aria-labelledby="today-h"] svg[width="28"][stroke]')].map((s) => s.getAttribute('stroke')));
    expect(strokes.size).toBeGreaterThan(1);
    for (const s of strokes) expect(['#1A6FD6', '#F29900', '#D9480F']).toContain(s);
  });
  it('no warning colour or period colour class is tied to the dose rows any more', () => {
    const css = homeCss;
    expect(css).not.toMatch(/\.(morning|noon|evening|bedtime)\b/);
    const rowIcon = css.match(/\.rowIcon\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rowIcon).not.toMatch(/color/);
    const { container } = renderDemo('alert');
    for (const el of container.querySelectorAll('section[aria-labelledby="today-h"] *')) {
      expect(el.className.toString()).not.toMatch(/warning/);
    }
  });
  it('the greeting uses the navy token', () => {
    expect(homeCss).toMatch(/\.greeting\s*\{[^}]*color:\s*var\(--color-navy\)/);
  });
});
