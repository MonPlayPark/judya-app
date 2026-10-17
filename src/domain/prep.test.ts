import { describe, expect, it } from 'vitest';
import { prunePrep, tickPrep, untickPrep } from './prep';

describe('prep log (tick marks)', () => {
  it('tick adds the key under the date; untick removes it and drops the empty day', () => {
    const a = tickPrep({}, '2026-10-16', 'a1:morning');
    expect(a).toEqual({ '2026-10-16': { 'a1:morning': true } });
    const b = tickPrep(a, '2026-10-16', 'a1:evening');
    expect(Object.keys(b['2026-10-16']!).sort()).toEqual(['a1:evening', 'a1:morning']);
    const c = untickPrep(b, '2026-10-16', 'a1:morning');
    expect(c).toEqual({ '2026-10-16': { 'a1:evening': true } });
    expect(untickPrep(c, '2026-10-16', 'a1:evening')).toEqual({});
  });

  it('does not change the object it was given', () => {
    const before = { '2026-10-16': { 'a1:morning': true as const } };
    tickPrep(before, '2026-10-16', 'a1:evening');
    untickPrep(before, '2026-10-16', 'a1:morning');
    expect(before).toEqual({ '2026-10-16': { 'a1:morning': true } });
  });

  it('untick of something never ticked changes nothing', () => {
    expect(untickPrep({ '2026-10-16': { 'a1:morning': true } }, '2026-10-16', 'zz:morning')).toEqual({
      '2026-10-16': { 'a1:morning': true },
    });
    expect(untickPrep({}, '2026-10-16', 'a1:morning')).toEqual({});
  });

  it('h) prune keeps data that is 14 days old and removes data that is 15 days old', () => {
    const log = {
      '2026-10-16': { k: true as const }, // today
      '2026-10-02': { k: true as const }, // 14 days old
      '2026-10-01': { k: true as const }, // 15 days old
      '2026-09-01': { k: true as const },
    };
    expect(Object.keys(prunePrep(log, '2026-10-16')).sort()).toEqual(['2026-10-02', '2026-10-16']);
  });
});
