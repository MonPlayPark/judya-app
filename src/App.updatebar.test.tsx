import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A new version is announced at once, as the service worker does when a new build is waiting.
const reload = vi.fn(async () => {});
vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts: { onNeedRefresh?: () => void }) => {
    opts.onNeedRefresh?.();
    return reload;
  },
}));

import { App } from './App';

// M4 PR 7: the owner opens the app from a Chrome link and lands on v3 Home, so the "new version" bar must be on v3 pages too
// (it used to live only in the v2 shell). Without it a v3 user would stay on the cached build.
describe('the "new version" bar', () => {
  beforeEach(() => {
    localStorage.clear();
    reload.mockClear();
  });

  it.each(['', '#/', '#/n', '#/n/meds', '#/n/settings/data', '#/n?demo=normal', '#/old'])('shows on "%s"', (hash) => {
    window.location.hash = hash;
    render(<App />);
    expect(screen.getByText('มีเวอร์ชันใหม่')).toBeInTheDocument();
    expect(screen.getAllByText('มีเวอร์ชันใหม่')).toHaveLength(1);
  });
});
