import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { V3Nav } from '../../components/v3/V3Nav';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { MEDS_DEMO_NAMES, type MedsDemoName } from '../../domain/v3/medsListDemo';
import { blankRootV3, sampleRootV3 } from '../../domain/v3/fixtures';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY, type KeyValueStore } from '../../domain/v3/storage';
import { MedsListV3Route } from './MedsListPage';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const demo = (name: MedsDemoName, extra = '') => {
  window.location.hash = `#/n/meds?demo=${name}${extra}`;
  return render(<MedsListV3Route />);
};

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => vi.restoreAllMocks());

describe('own medicines tab', () => {
  it('title, tabs with counts, members with counts, rows with chip + days', () => {
    demo('normal');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('รายการยา');
    expect(screen.getByRole('tab', { name: /ยาประจำตัว/ })).toHaveTextContent('6');
    expect(screen.getByRole('tab', { name: /ยาสามัญประจำบ้าน/ })).toHaveTextContent('5');
    const dad = screen.getByRole('region', { name: 'คุณพ่อ' });
    expect(within(dad).getByText('4 รายการ')).toBeInTheDocument();
    expect(within(dad).getByText('Simvastatin 20 mg')).toBeInTheDocument();
    expect(within(dad).getByText('เหลือ 3 วัน')).toBeInTheDocument();
    expect(within(dad).getByText('ก่อนนอน · 1 เม็ด')).toBeInTheDocument();
    expect(within(dad).getByText('สั่งยาที่ใกล้หมด (2 รายการ)')).toBeInTheDocument();
    const mom = screen.getByRole('region', { name: 'คุณแม่' });
    expect(within(mom).getByText('ใกล้หมดอายุ 5 พ.ย. 69')).toBeInTheDocument();
    expect(within(mom).queryByText(/สั่งยาที่ใกล้หมด/)).toBeNull();
  });
  it('every chip has an icon and a word', () => {
    demo('normal');
    for (const chip of document.querySelectorAll('[class*="statusChip"]')) {
      expect(chip.querySelector('svg')).not.toBeNull();
      expect(chip.textContent?.trim().length).toBeGreaterThan(0);
    }
  });
  it('stopped medicines are folded; opening shows who and when', () => {
    demo('normal');
    const fold = screen.getByRole('button', { name: 'ยาที่หยุดแล้ว (2)' });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('คุณพ่อ · หยุดเมื่อ 3 ก.ย. 69')).toBeNull();
    fireEvent.click(fold);
    expect(screen.getByText('คุณพ่อ · หยุดเมื่อ 3 ก.ย. 69')).toBeInTheDocument();
    expect(screen.getAllByText('กลับมาใช้').length).toBe(2);
  });
  it('&open=stopped starts open', () => {
    demo('normal', '&open=stopped');
    expect(screen.getByRole('button', { name: 'ยาที่หยุดแล้ว (2)' })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('house tab', () => {
  it('sorted, with hint, order button and the add button', () => {
    demo('normal', '&tab=house');
    expect(screen.getByText('เรียงจากที่ต้องดูแลก่อน')).toBeInTheDocument();
    const names = screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent);
    expect(names).toEqual(['ยาดมแก้วิงเวียน', 'ยาธาตุน้ำขาว', 'ผงเกลือแร่ ORS', 'ยาทาแก้ผื่นคัน', 'พาราเซตามอล 500 mg']);
    expect(screen.getByText('สั่งยาสามัญที่ใกล้หมด (2 รายการ)')).toBeInTheDocument();
    expect(screen.getByText('ใกล้หมดอายุ 6 พ.ย. 69')).toBeInTheDocument();
    expect(screen.getByText('ไม่นับจำนวน')).toBeInTheDocument();
    expect(screen.getByText('เพิ่มยา')).toBeInTheDocument();
  });
  it('kind pictures are drawn inline (seven shapes, no image files)', () => {
    demo('normal', '&tab=house');
    expect(document.querySelectorAll('li svg[viewBox="0 0 24 24"]').length).toBeGreaterThanOrEqual(5);
  });
  it('deleted section: folded, opens with the date', () => {
    demo('normal', '&open=deleted');
    expect(screen.getByRole('tab', { name: /ยาสามัญประจำบ้าน/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('ลบเมื่อ 8 ต.ค. 69')).toBeInTheDocument();
    expect(screen.getByText('นำกลับ')).toBeInTheDocument();
  });
});

describe('search and filter', () => {
  it('search opens from the button, finds without case, closing clears it', () => {
    demo('normal');
    const open = screen.getByRole('button', { name: 'ค้นหายา' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    fireEvent.change(screen.getByPlaceholderText('ค้นหาชื่อยา'), { target: { value: 'SIMVA' } });
    expect(screen.getByText('Simvastatin 20 mg')).toBeInTheDocument();
    expect(screen.queryByText('Losartan 50 mg')).toBeNull();
    expect(screen.getByText('1 รายการ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ยาที่หยุดแล้ว/ })).toBeNull(); // hidden while searching
    fireEvent.click(screen.getByRole('button', { name: 'ปิดการค้นหา' }));
    expect(screen.queryByPlaceholderText('ค้นหาชื่อยา')).toBeNull();
    expect(screen.getByText('Losartan 50 mg')).toBeInTheDocument();
  });
  it('chips use aria-pressed; "ใกล้หมด" keeps only low medicines', () => {
    demo('normal');
    const low = screen.getByRole('button', { name: 'ใกล้หมด' });
    expect(low).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(low);
    expect(low).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Losartan 50 mg')).toBeNull();
    expect(screen.getByText('Metformin 500 mg')).toBeInTheDocument();
    expect(screen.getByText('2 รายการ')).toBeInTheDocument();
  });
  it('no match: mascot message, and "ล้างตัวกรอง" brings the list back', () => {
    demo('normal');
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหายา' }));
    fireEvent.change(screen.getByPlaceholderText('ค้นหาชื่อยา'), { target: { value: 'zzz' } });
    expect(screen.getByRole('heading', { name: 'ไม่พบยาที่ตรงกัน' })).toBeInTheDocument();
    expect(screen.getByText('ลองเปลี่ยนคำค้นหา หรือล้างตัวกรอง')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
    expect(screen.getByText('Losartan 50 mg')).toBeInTheDocument();
  });
});

describe('empty states', () => {
  it('no member / no medicine / no house medicine, each with a coming-soon button and no add button', () => {
    demo('nomember');
    expect(screen.getByRole('heading', { name: 'ยังไม่มีสมาชิก' })).toBeInTheDocument();
    expect(screen.getByText('ต้องเพิ่มสมาชิกก่อน จึงเพิ่มยาได้')).toBeInTheDocument();
    expect(screen.getByText('เพิ่มสมาชิก').closest('button')).toBeDisabled();
    expect(screen.queryByText('เพิ่มยา')).toBeNull();
    document.body.innerHTML = '';
    demo('nomeds');
    expect(screen.getByRole('heading', { name: 'ยังไม่มียาประจำตัว' })).toBeInTheDocument();
    expect(screen.getByText('เพิ่มยาที่หมอสั่ง แล้วดูวันที่ยาพอใช้ได้ที่นี่')).toBeInTheDocument();
  });
  it('no house medicine', () => {
    demo('nohouse', '&tab=house');
    expect(screen.getByRole('heading', { name: 'ยังไม่มียาสามัญประจำบ้าน' })).toBeInTheDocument();
    expect(screen.getByText('ยาที่ใช้ร่วมกันทั้งบ้าน เช่น พาราเซตามอล')).toBeInTheDocument();
    expect(screen.queryByText('เพิ่มยา', { selector: 'span span' })).toBeNull();
  });
});

describe('chips and search button', () => {
  it('shown on a list, hidden in the three empty states', () => {
    demo('normal');
    expect(screen.getByRole('button', { name: 'ค้นหายา' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'กรองรายการยา' })).toBeInTheDocument();
    document.body.innerHTML = '';
    for (const [name, extra] of [['nomember', ''], ['nomeds', ''], ['nohouse', '&tab=house']] as const) {
      const { unmount } = demo(name, extra);
      expect(screen.queryByRole('button', { name: 'ค้นหายา' }), name).toBeNull();
      expect(screen.queryByRole('group', { name: 'กรองรายการยา' }), name).toBeNull();
      expect(screen.queryByRole('button', { name: 'ใกล้หมด' }), name).toBeNull();
      expect(screen.getByRole('tablist')).toBeInTheDocument(); // tabs stay
      unmount();
    }
  });
  it('"no match" keeps both, so the filter can be cleared', () => {
    demo('normal');
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหายา' }));
    fireEvent.change(screen.getByPlaceholderText('ค้นหาชื่อยา'), { target: { value: 'zzz' } });
    expect(screen.getByRole('heading', { name: 'ไม่พบยาที่ตรงกัน' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ค้นหายา' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'กรองรายการยา' })).toBeInTheDocument();
  });
  it('tab names are 15px x --fs with a 22px line', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/pages/v3/MedsListV3.module.css'), 'utf8');
    const rule = /\n\.tab \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(rule).toContain('font-size: calc(15px * var(--fs))');
    expect(rule).toContain('line-height: calc(22px * var(--fs))');
  });
});

describe('no dead buttons, no storage in demo', () => {
  it.each(MEDS_DEMO_NAMES)('%s: every control is a real control or a coming-soon button', (name) => {
    demo(name, '&open=stopped');
    for (const b of Array.from(document.querySelectorAll('button'))) {
      if (b.disabled) {
        expect(b).toHaveAttribute('aria-disabled', 'true');
        expect(b.textContent).toContain('เร็ว ๆ นี้');
      }
    }
    // rows and member heads are not links or buttons yet (details = PR 5b)
    expect(Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['#/n', '#/n/meds']);
  });
  it('demo mode: no localStorage call of any kind, no loadRoot / saveRoot', () => {
    const calls = (['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const).map((m) => vi.spyOn(Storage.prototype, m));
    const save = vi.spyOn(storage, 'saveRoot');
    const load = vi.spyOn(storage, 'loadRoot');
    demo('normal');
    fireEvent.click(screen.getByRole('tab', { name: /ยาสามัญประจำบ้าน/ }));
    for (const c of calls) expect(c).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByText('โหมดตัวอย่าง ไม่บันทึกข้อมูล')).toBeInTheDocument();
  });
});

describe('real data is read only', () => {
  it('no data yet -> "ยังไม่มีสมาชิก", nothing written', () => {
    const store = memoryStore();
    const setItem = vi.spyOn(store, 'setItem');
    window.location.hash = '#/n/meds';
    render(<MedsListV3Route store={store} getToday={() => DEMO_TODAY} />);
    expect(screen.getByRole('heading', { name: 'ยังไม่มีสมาชิก' })).toBeInTheDocument();
    expect(screen.queryByText(/โหมดตัวอย่าง/)).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
    expect(store.data).toEqual({});
  });
  it('saved data is shown and the stored text is untouched', () => {
    const text = JSON.stringify(sampleRootV3());
    const store = memoryStore({ [STORAGE_KEY]: text });
    window.location.hash = '#/n/meds';
    render(<MedsListV3Route store={store} getToday={() => DEMO_TODAY} />);
    expect(screen.getByRole('heading', { name: 'สมาชิก ก' })).toBeInTheDocument();
    expect(store.data).toEqual({ [STORAGE_KEY]: text });
  });
  it('unreadable data -> a message, no list', () => {
    window.location.hash = '#/n/meds';
    render(<MedsListV3Route store={memoryStore({ [STORAGE_KEY]: '{oops' })} getToday={() => DEMO_TODAY} />);
    expect(screen.getByRole('alert')).toHaveTextContent('อ่านข้อมูลที่เก็บไว้ไม่ได้');
  });
  it('blank house has the same state as the nomember demo', () => {
    expect(blankRootV3().persons).toHaveLength(0);
  });
});

describe('route and nav', () => {
  it('/n/meds is rendered by App without opening v2 data', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    act(() => {
      window.location.hash = '#/n/meds?demo=normal';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('รายการยา');
    expect(get).not.toHaveBeenCalled();
  });
  it('V3Nav: two real links, the current one is marked, the others are coming soon', () => {
    render(<V3Nav current="meds" />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['#/n', '#/n/meds']);
    expect(screen.getByRole('link', { name: /รายการยา/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /หน้าหลัก/ })).not.toHaveAttribute('aria-current');
    expect(screen.getAllByText('เร็ว ๆ นี้')).toHaveLength(2);
  });
});

describe('Home header has no sparkles any more', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/pages/v3/HomeV3.module.css'), 'utf8');
  it('no .hero::after rule and no sparkle mask', () => {
    expect(css).not.toMatch(/\.hero::after/);
    expect(css).not.toMatch(/header-spark/);
  });
});
