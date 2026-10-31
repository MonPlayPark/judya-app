// "ขวด" instead of "แผง" wherever the pack is a bottle (M4 PR 6b): detail page and refill sheet.
import { describe, expect, it } from 'vitest';
import { buildMedDetail, refillFields } from './medDetail';
import { sampleRootV3 } from './fixtures';
import type { Assignment, Root } from './schema';

const bottleRoot = (): Root => {
  const r = sampleRootV3();
  return {
    ...r,
    medications: r.medications.map((m) => (m.id === 'm1' ? { ...m, pack: { type: 'bottle' as const, perBottle: 30 } } : m)),
    assignments: r.assignments.map((a): Assignment => (a.id === 'a1' ? { ...a, stock: { kind: 'count', strips: 2, loose: 3, countedOn: '2026-10-28' } } : a)),
  };
};

describe('bottle pack words', () => {
  it('the refill sheet asks for ขวด', () => {
    const r = bottleRoot();
    const a = r.assignments.find((x) => x.id === 'a1');
    const m = r.medications.find((x) => x.id === 'm1');
    if (!a || !m) throw new Error('fixture');
    expect(refillFields(a, m)).toEqual([{ key: 'strips', unit: 'ขวด' }, { key: 'loose', unit: 'เม็ด' }]);
  });
  it('the detail page splits the stock into ขวด', () => {
    const detail = buildMedDetail(bottleRoot(), 'a1', '2026-10-28');
    expect(detail?.stock.sub).toBe('2 ขวด + 3 เม็ด');
    expect(detail?.stock.sub).not.toContain('แผง');
  });
});
