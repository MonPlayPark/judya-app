import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_KEY,
  initFontSize,
  readFontSize,
  useFontSize,
  writeFontSize,
} from './fontSize';

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.fs;
  vi.restoreAllMocks();
});

describe('font size preference', () => {
  it('defaults to medium when nothing is saved', () => {
    expect(DEFAULT_FONT_SIZE).toBe('m');
    expect(readFontSize()).toBe('m');
    expect(initFontSize()).toBe('m');
    expect(document.documentElement.dataset.fs).toBe('m');
  });

  it('writes the choice, applies it to <html> and reads it back', () => {
    expect(writeFontSize('l')).toBe(true);
    expect(window.localStorage.getItem(FONT_SIZE_KEY)).toBe('l');
    expect(document.documentElement.dataset.fs).toBe('l');
    expect(readFontSize()).toBe('l');
    writeFontSize('n');
    expect(initFontSize()).toBe('n');
  });

  it('ignores a bad saved value and falls back to the default', () => {
    for (const bad of ['xl', '', '1.15', 'M', '{"a":1}']) {
      window.localStorage.setItem(FONT_SIZE_KEY, bad);
      expect(readFontSize()).toBe('m');
    }
  });

  it('survives storage that cannot be read or written', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(readFontSize()).toBe('m');
    expect(writeFontSize('l')).toBe(false);
    expect(document.documentElement.dataset.fs).toBe('l');
  });

  it('uses its own key and touches no other key', () => {
    expect(FONT_SIZE_KEY).not.toBe('judya.v2');
    window.localStorage.setItem('judya.v2', 'keep');
    window.localStorage.setItem('other', 'keep');
    writeFontSize('n');
    expect(window.localStorage.getItem('judya.v2')).toBe('keep');
    expect(window.localStorage.getItem('other')).toBe('keep');
    expect(window.localStorage.length).toBe(3);
  });

  it('hook reads, changes and saves the choice', () => {
    window.localStorage.setItem(FONT_SIZE_KEY, 'n');
    const { result } = renderHook(() => useFontSize());
    expect(result.current[0]).toBe('n');
    act(() => {
      result.current[1]('l');
    });
    expect(result.current[0]).toBe('l');
    expect(window.localStorage.getItem(FONT_SIZE_KEY)).toBe('l');
    expect(document.documentElement.dataset.fs).toBe('l');
  });
});
