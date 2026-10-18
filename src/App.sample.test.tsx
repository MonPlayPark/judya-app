// Sample house on screen (step 3.2a-3). On the S24 the owner saw more rows than the counter said; these tests keep
// "rows you see = total" and "one card per time of day" true for the real sample on a Sunday, plus the small fixes.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from './App';
import { makeSample } from './domain/sample';
import { NOW } from './domain/fixtures';
import { emptyRoot } from './domain/schema';
import { PREV_KEY, saveRoot, STORAGE_KEY } from './domain/storage';
import { todayDoses } from './domain/today';

const SUNDAY = '2026-10-18';

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
const openSample = (hash = '#/today') => {
  window.location.hash = '#/';
  render(<App getToday={() => SUNDAY} />);
  fireEvent.click(screen.getByRole('button', { name: 'ลองดูด้วยข้อมูลตัวอย่าง' }));
  go(hash);
};

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
});
afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
});

describe('sample house on a Sunday', () => {
  it('the sample has no repeated ids and todayDoses has no repeated keys', () => {
    const s = makeSample(SUNDAY, NOW);
    for (const list of [s.persons, s.medications, s.assignments, s.events]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    }
    const doses = todayDoses({ ...emptyRoot(NOW), ...s }, SUNDAY);
    expect(doses).toHaveLength(4); // ก morning, ก evening, ค 08:00, ค 20:00; ข is Mon/Wed/Fri only
    expect(new Set(doses.map((d) => d.key)).size).toBe(4);
  });

  it('#/today: rows you see = the total, one card per time of day', () => {
    openSample();
    expect(screen.getByText('จัดแล้ว 0 จาก 4')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'ยาที่กินทุก ๆ ชั่วโมง',
      'เช้า',
      'เย็น',
    ]);
  });

  it('#/today: only one member has doses, so there is no member filter', () => {
    openSample();
    expect(screen.queryByRole('group', { name: 'กรองตามสมาชิก' })).not.toBeInTheDocument();
  });

  it('home: when everything is prepared the link says only "ดูทั้งหมด"', () => {
    openSample('#/today');
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
    go('#/');
    const card = screen.getByRole('link', { name: /ยาวันนี้/ });
    expect(within(card).getByText('จัดครบแล้ว')).toBeInTheDocument();
    expect(within(card).getByText('ดูทั้งหมด')).toBeInTheDocument();
    expect(within(card).queryByText(/อีก \d+ รายการ/)).not.toBeInTheDocument();
  });

  it('home: "ถึงรอบซื้อเติมสต๊อก" is a plain heading, not a link or button', () => {
    openSample('#/');
    const title = screen.queryByRole('heading', { name: /ถึงรอบซื้อเติมสต๊อก/ });
    if (title) expect(title.closest('a, button')).toBeNull();
  });
});

describe('tabs that have no screen yet', () => {
  it.each([
    ['#/members', 'สมาชิก'],
    ['#/settings', 'ตั้งค่า'],
  ])('%s shows a short "being built" note with a way back home', (hash, title) => {
    expect(saveRoot(emptyRoot(NOW)).ok).toBe(true);
    window.location.hash = '#/';
    render(<App getToday={() => SUNDAY} />);
    go(hash);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
    expect(screen.getByText('หน้านี้กำลังสร้าง')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'กลับหน้าแรก' }));
    expect(window.location.hash).toBe('#/');
  });
});
