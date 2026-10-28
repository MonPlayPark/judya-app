import { describe, expect, it } from 'vitest';
import { sampleRootV3 } from './fixtures';
import { rootSchema, stockProblem, type MedKind, type Pack, type Stock } from './schema';

const count = (strips: number, loose = 0): Stock => ({ kind: 'count', strips, loose, countedOn: '2026-10-28' });
const volume: Stock = { kind: 'volume', ml: 30, countedOn: '2026-10-28' };
const tubes: Stock = { kind: 'tubes', opened: false, spare: 1 };
const strip: Pack = { type: 'strip', perStrip: 10 };
const none: Pack = { type: 'none' };

describe('stock must fit the medicine kind', () => {
  const fits = (kind: MedKind, stock: Stock | null, pack: Pack = strip) => stockProblem({ kind, pack }, stock) === null;

  it('tablet / capsule / sachet: count or null only', () => {
    for (const kind of ['tablet', 'capsule', 'sachet'] as const) {
      expect([fits(kind, count(1)), fits(kind, null), fits(kind, volume), fits(kind, tubes)]).toEqual([true, true, false, false]);
    }
  });

  it('liquid: volume or null only', () => {
    expect([fits('liquid', volume), fits('liquid', null), fits('liquid', count(0, 5)), fits('liquid', tubes)]).toEqual([true, true, false, false]);
  });

  it('cream / drops: tubes or null only', () => {
    for (const kind of ['cream', 'drops'] as const) {
      expect([fits(kind, tubes), fits(kind, null), fits(kind, count(0, 5)), fits(kind, volume)]).toEqual([true, true, false, false]);
    }
  });

  it('other: anything', () => {
    expect([fits('other', count(0, 1), none), fits('other', volume, none), fits('other', tubes, none), fits('other', null, none)]).toEqual([true, true, true, true]);
  });

  it('a count with strips needs a pack with a strip size; with 0 strips a pack of none is fine', () => {
    expect(fits('tablet', count(2), none)).toBe(false);
    expect(fits('tablet', count(0, 7), none)).toBe(true);
    expect(fits('other', count(1), { type: 'container', amount: 60, unit: 'ml' })).toBe(false);
    expect(fits('sachet', count(2, 4), { type: 'sachetBox', sachets: 10 })).toBe(true);
  });
});

describe('the root schema applies the stock rule', () => {
  it('the sample house still passes', () => {
    expect(rootSchema.safeParse(sampleRootV3()).success).toBe(true);
  });

  it('a tablet with a volume stock fails at assignments.N.stock', () => {
    const r = sampleRootV3();
    const i = r.assignments.findIndex((a) => a.id === 'a1'); // medicine m1 = tablet
    r.assignments[i]!.stock = { kind: 'volume', ml: 10, countedOn: '2026-10-28' };
    const res = rootSchema.safeParse(r);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues.some((x) => x.path.join('.') === `assignments.${i}.stock`)).toBe(true);
  });

  it('strips on a medicine whose pack is none fails', () => {
    const r = sampleRootV3();
    r.medications.find((m) => m.id === 'm1')!.pack = { type: 'none' };
    expect(rootSchema.safeParse(r).success).toBe(false); // a1 holds 2 strips
  });

  it('an assignment of an unknown medicine adds no stock issue (not this rule\'s job)', () => {
    const r = sampleRootV3();
    r.assignments[0]!.medicationId = 'missing';
    expect(rootSchema.safeParse(r).success).toBe(true);
  });
});
