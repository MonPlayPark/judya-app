import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from './App';

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

describe('app routes (v3 only)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });

  it.each(['', '#/', '#/n'])('the empty app (hash "%s") opens Home', (hash) => {
    window.location.hash = hash;
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สวัสดีค่ะ');
    expect(screen.getByRole('link', { name: 'หน้าหลัก' })).toHaveAttribute('href', '#/n');
  });

  it.each(['#/old', '#/meds', '#/members', '#/order', '#/nowhere', '#/n/nowhere'])('an unknown or retired route (%s) opens Home', (hash) => {
    window.location.hash = hash;
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สวัสดีค่ะ');
  });

  it('follows the hash from Home to the medicine list and back', () => {
    render(<App />);
    go('#/n/meds');
    expect(screen.getByRole('link', { name: 'รายการยา' })).toHaveAttribute('aria-current', 'page');
    go('#/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สวัสดีค่ะ');
  });
});
