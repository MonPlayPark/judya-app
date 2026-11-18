// Liquid doses are plain decimals in ml ("7.5 มล."), never "7½ มล."; tablets keep ½.
import { describe, expect, it } from 'vitest';
import { formatDose } from './home';
import { todayRows } from './home';
import { DEMO_TODAY } from './homeDemo';
import { demoRoot } from './homeDemo';
import { doseTextOf } from './medsList';
import { buildMedDetail } from './medDetail';
import type { Root, Schedule } from './schema';

const T = DEMO_TODAY;
const daily = (pills: number): Schedule => ({ kind: 'meal', slots: { morning: { pills, meal: 'after' } }, days: { kind: 'daily' } });

/** Normal demo house: medicine of assignment a1 becomes a liquid (unit มล.) taken `pills` ml in the morning. */
function liquidRoot(pills: number): Root {
  const r = demoRoot('normal');
  const a1 = r.assignments.find((a) => a.id === 'a1')!;
  return {
    ...r,
    medications: r.medications.map((m) => (m.id === a1.medicationId ? { ...m, kind: 'liquid' as const, unit: 'มล.' } : m)),
    assignments: r.assignments.map((a) => (a.id === 'a1' ? { ...a, status: 'active' as const, stock: null, schedule: daily(pills) } : a)),
  };
}
const tabletRoot = (pills: number): Root => {
  const r = demoRoot('normal');
  return { ...r, assignments: r.assignments.map((a) => (a.id === 'a1' ? { ...a, schedule: daily(pills) } : a)) };
};

describe('formatDose', () => {
  it('liquid is a plain decimal, others keep the half sign', () => {
    expect(formatDose({ kind: 'liquid' }, 7.5)).toBe('7.5');
    expect(formatDose({ kind: 'liquid' }, 2.5)).toBe('2.5');
    expect(formatDose({ kind: 'liquid' }, 5)).toBe('5');
    expect(formatDose({ kind: 'tablet' }, 1.5)).toBe('1½');
    expect(formatDose({ kind: 'tablet' }, 0.5)).toBe('½');
  });
});

describe.each([7.5, 2.5])('liquid dose %s ml', (ml) => {
  it('Home, medicine list and detail all say the plain decimal', () => {
    const root = liquidRoot(ml);
    const a1 = root.assignments.find((a) => a.id === 'a1')!;
    const m = root.medications.find((x) => x.id === a1.medicationId)!;
    const text = `${ml} มล.`;
    expect(todayRows(root, T).find((r) => r.key.startsWith('a1:'))?.amountText).toBe(text);
    expect(doseTextOf(a1, m)).toContain(text);
    expect(doseTextOf(a1, m)).not.toContain('½');
    const detail = buildMedDetail(root, 'a1', T);
    expect(JSON.stringify(detail)).toContain(text);
    expect(JSON.stringify(detail)).not.toContain('½');
  });
});

describe('tablet dose is unchanged', () => {
  it('1.5 tablets stays "1½"', () => {
    const root = tabletRoot(1.5);
    expect(todayRows(root, T).find((r) => r.key.startsWith('a1:'))?.amountText).toMatch(/^1½ /);
  });
});
