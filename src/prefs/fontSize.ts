// Font-size preference (spec 1, D10). One attribute on <html>: data-fs="n|m|l". The CSS turns it into the html font-size,
// and every size in tokens.css is in rem, so the whole app scales. Stored on this device only, under its own key
// (never judya.v2, never in the backup file).
import { useCallback, useState } from 'react';

export const FONT_SIZE_KEY = 'judya.fontsize';
export const FONT_SIZES = ['n', 'm', 'l'] as const;
export type FontSize = (typeof FONT_SIZES)[number];
/** Medium until the owner decides (docs/DECISIONS.md O4): normal (93%) is below the 15px minimum. */
export const DEFAULT_FONT_SIZE: FontSize = 'm';

export const FONT_SIZE_LABELS: Record<FontSize, string> = { n: 'ปกติ', m: 'กลาง', l: 'ใหญ่' };
/** Same numbers as `[data-fs]` in tokens.css. */
export const FONT_SIZE_SCALE: Record<FontSize, number> = { n: 0.93, m: 1, l: 1.15 };

export const isFontSize = (v: unknown): v is FontSize => typeof v === 'string' && (FONT_SIZES as readonly string[]).includes(v);

/** The saved choice; the default when nothing is saved, the value is not one of n/m/l, or storage cannot be read. */
export function readFontSize(): FontSize {
  try {
    const v = window.localStorage.getItem(FONT_SIZE_KEY);
    return isFontSize(v) ? v : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

/** Puts the choice on <html> so the CSS applies it. */
export function applyFontSize(size: FontSize): void {
  document.documentElement.dataset.fs = size;
}

/** Saves and applies. If storage is full or blocked the size still changes for this visit; returns whether it was saved. */
export function writeFontSize(size: FontSize): boolean {
  applyFontSize(size);
  try {
    window.localStorage.setItem(FONT_SIZE_KEY, size);
    return true;
  } catch {
    return false;
  }
}

/** Call once before the first render so the page never flashes at the wrong size. */
export function initFontSize(): FontSize {
  const size = readFontSize();
  applyFontSize(size);
  return size;
}

/** For the Settings card (step V5). */
export function useFontSize(): [FontSize, (size: FontSize) => boolean] {
  const [size, setSize] = useState<FontSize>(readFontSize);
  const set = useCallback((next: FontSize) => {
    setSize(next);
    return writeFontSize(next);
  }, []);
  return [size, set];
}
