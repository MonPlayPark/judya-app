import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_KEY,
  applyFontSize,
  initFontSize,
  initFontSizeFromHouse,
  readFontSize,
  useFontSize,
  writeFontSize,
} from './fontSize';
import { blankRootV3 } from '../domain/v3/fixtures';
import { saveRoot } from '../domain/v3/storage';

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.fs;
  vi.restoreAllMocks();
});

describe('font size preference', () => {
  it('defaults to normal when nothing is saved', () => {
    expect(DEFAULT_FONT_SIZE).toBe('n');
    expect(readFontSize()).toBe('n');
    expect(initFontSize()).toBe('n');
    expect(document.documentElement.dataset.fs).toBe('n');
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
      expect(readFontSize()).toBe('n');
    }
  });

  it('survives storage that cannot be read or written', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(readFontSize()).toBe('n');
    expect(writeFontSize('l')).toBe(false);
    expect(document.documentElement.dataset.fs).toBe('l');
  });

  it('uses its own key and touches no other key', () => {
    expect(FONT_SIZE_KEY).not.toBe('judya.v3');
    window.localStorage.setItem('old.app', 'keep');
    window.localStorage.setItem('other', 'keep');
    writeFontSize('n');
    expect(window.localStorage.getItem('old.app')).toBe('keep');
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

describe('font size from the saved house (M4 PR 14)', () => {
  const rootWith = (fontSize: 'normal' | 'medium' | 'large') => {
    const r = blankRootV3();
    return { ...r, settings: { ...r.settings, fontSize } };
  };
  it('a readable house decides the size at start, over the old key', () => {
    window.localStorage.setItem(FONT_SIZE_KEY, 'n');
    expect(saveRoot(rootWith('large')).ok).toBe(true);
    expect(initFontSizeFromHouse()).toBe('l');
    expect(document.documentElement.dataset.fs).toBe('l');
    window.localStorage.clear();
  });
  it('with no house (or one that cannot be read) the old behaviour stays', () => {
    window.localStorage.setItem(FONT_SIZE_KEY, 'm');
    expect(initFontSizeFromHouse()).toBe('m');
    window.localStorage.setItem('judya.v3', '{broken');
    expect(initFontSizeFromHouse()).toBe('m');
    window.localStorage.clear();
  });
  it('applying a size never writes the old key', () => {
    applyFontSize('l');
    expect(window.localStorage.getItem(FONT_SIZE_KEY)).toBeNull();
  });
});
