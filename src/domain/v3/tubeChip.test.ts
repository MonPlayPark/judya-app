// M4 PR 6a: the owner's rule for creams / drops, shared by the list and the detail page.
import { describe, expect, it } from 'vitest';
import { buildMedDetail } from './medDetail';
import { DEMO_TODAY } from './homeDemo';
import { buildMedsList } from './medsList';
import { medsDemoRoot } from './medsListDemo';
import { type Assignment, type Root } from './schema';
import { tubeLevel } from './stock';

describe('tubeLevel', () => {
  it.each([
    [{ opened: false, spare: 2 }, 'enough'],
    [{ opened: true, spare: 1 }, 'enough'], // a spare tube wins
    [{ opened: true, spare: 0 }, 'low'], // in use, no spare
    [{ opened: false, spare: 0 }, 'out'], // nothing at all
  ] as const)('%j -> %s', (s, level) => {
    expect(tubeLevel(s)).toBe(level);
  });
});

function withTube(opened: boolean, spare: number, extra: Partial<Assignment> = {}): Root {
  const root = medsDemoRoot('cream');
  return { ...root, assignments: root.assignments.map((a) => (a.id === 'a9' ? { ...a, stock: { kind: 'tubes' as const, opened, spare }, ...extra } : a)) };
}
const creamRow = (root: Root) => buildMedsList(root, DEMO_TODAY, { tab: 'mine', filter: 'all', query: '' }).groups.flatMap((g) => g.rows).find((r) => r.id === 'a9');
const orderCountOfDad = (root: Root) => buildMedsList(root, DEMO_TODAY, { tab: 'mine', filter: 'all', query: '' }).groups.find((g) => g.personId === 'p1')?.orderCount;

describe('the list follows the same rule as the detail page for creams', () => {
  it.each([
    [true, 2, 'ปกติ', 'เพียงพอ', false],
    [false, 2, 'ปกติ', 'เพียงพอ', false],
    [true, 0, 'ใกล้หมด', 'ใกล้หมด', true],
    [false, 0, 'หมด', 'หมด', true],
  ] as const)('opened=%s spare=%s -> list "%s", detail "%s"', (opened, spare, listLabel, detailLabel, needsOrder) => {
    const root = withTube(opened, spare);
    const row = creamRow(root);
    expect(row?.chip.label).toBe(listLabel);
    expect(row?.needsOrder).toBe(needsOrder);
    expect(buildMedDetail(root, 'a9', DEMO_TODAY)?.stock.chip?.label).toBe(detailLabel);
  });

  it('the order button counts a cream that is low or out (dad: 2 tablets + 1 cream)', () => {
    expect(orderCountOfDad(medsDemoRoot('cream'))).toBe(2); // spare 2 -> not counted
    expect(orderCountOfDad(withTube(true, 0))).toBe(3);
    expect(orderCountOfDad(withTube(false, 0))).toBe(3);
  });

  it('the "ใกล้หมด" filter keeps a low or out cream and drops an enough one', () => {
    const q = { tab: 'mine' as const, filter: 'low' as const, query: '' };
    const ids = (r: Root) => buildMedsList(r, DEMO_TODAY, q).groups.flatMap((g) => g.rows.map((x) => x.id));
    expect(ids(medsDemoRoot('cream'))).not.toContain('a9');
    expect(ids(withTube(true, 0))).toContain('a9');
    expect(ids(withTube(false, 0))).toContain('a9');
  });

  it('an expired cream shows "หมดอายุแล้ว" and is not counted for ordering', () => {
    const root = withTube(false, 0, { expiry: '2026-10-01' });
    expect(creamRow(root)?.chip.label).toBe('หมดอายุแล้ว');
    expect(creamRow(root)?.needsOrder).toBe(false);
  });

  it('a cream that was never counted (no stock) stays "ปกติ"', () => {
    expect(creamRow(withTube(false, 0, { stock: null }))?.chip.label).toBe('ปกติ');
  });

  it('drops use the same rule', () => {
    const root = medsDemoRoot('cream');
    const dropsRoot: Root = {
      ...root,
      medications: root.medications.map((m) => (m.id === 'm8' ? { ...m, kind: 'drops' as const, pack: { type: 'container' as const, amount: 10, unit: 'ml' as const } } : m)),
      assignments: root.assignments.map((a) => (a.id === 'a9' ? { ...a, stock: { kind: 'tubes' as const, opened: true, spare: 0 } } : a)),
    };
    expect(creamRow(dropsRoot)?.chip.label).toBe('ใกล้หมด');
    expect(creamRow(dropsRoot)?.leftText).toBe('สำรอง 0 ขวด');
  });
});
