import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from './App';

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

describe('app shell', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('shows the four tabs in the bottom menu', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'เมนูหลัก' });
    const labels = Array.from(nav.querySelectorAll('a')).map((a) => a.textContent);
    expect(labels).toEqual(['หน้าแรก', 'ยา', 'สมาชิก', 'ตั้งค่า']);
  });

  it('opens on the home tab and follows the hash', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สวัสดีค่ะ');
    expect(screen.getByRole('link', { name: 'หน้าแรก' })).toHaveAttribute('aria-current', 'page');

    go('#/members');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สมาชิก');
    expect(screen.getByRole('link', { name: 'สมาชิก' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'หน้าแรก' })).not.toHaveAttribute('aria-current');
  });

  it('shows a not-found page for an unknown route', () => {
    render(<App />);
    go('#/nowhere');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ไม่พบหน้านี้');
  });
});
