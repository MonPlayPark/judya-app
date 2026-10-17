import { describe, expect, it } from 'vitest';
import { careItems, memberCards } from './care';
import { assignment, dailyMeal, person, resumeEvent, rootWith, stopEvent, TODAY } from './helpers.test-util';
import type { Assignment, HouseItem, Root } from './schema';

// TODAY = 2026-10-16, default warn 15 days, low stock 7 days.
const morning = dailyMeal({ morning: { pills: 1, meal: 'after' } });
const med = (id: string, name = `Sample Med ${id}`) => ({ id, name, unit: 'เม็ด' });
const mk = (id: string, over: Partial<Assignment> = {}): Assignment =>
  assignment({ id, medicationId: `m-${id}`, schedule: morning, ...over });
const house = (id: string, over: Partial<HouseItem> = {}): HouseItem => ({ id, name: `House ${id}`, ...over });

const base = (over: Partial<Root> = {}): Root =>
  rootWith({
    persons: [person({ id: 'p1', name: 'Test Person A' })],
    medications: ['a', 'b', 'c', 'd'].map((x) => med(`m-${x}`, `Sample Med ${x}`)),
    ...over,
  });

describe('expiry rows (owner examples, today 2026-10-16, warn 15)', () => {
  const rows = (expiry: string, warn?: number) => {
    const root = base({ houseItems: [house('h1', { expiry })] });
    if (warn) root.settings = { ...root.settings, expiryWarnDays: warn };
    const c = careItems(root, TODAY);
    return [...c.expired, ...c.expirySoon].map((i) => `${i.group}:${i.right}`);
  };
  it('2026-09-30 is expired by 16 days', () => expect(rows('2026-09-30')).toEqual(['expired:เกิน 16 วัน']));
  it('2026-10-16 is soon: today', () => expect(rows('2026-10-16')).toEqual(['expirySoon:วันนี้']));
  it('2026-10-24 is soon: 8 days', () => expect(rows('2026-10-24')).toEqual(['expirySoon:อีก 8 วัน']));
  it('2026-10-31 is the edge and still soon: 15 days', () => expect(rows('2026-10-31')).toEqual(['expirySoon:อีก 15 วัน']));
  it('2026-11-01 is 16 days away and does not show', () => expect(rows('2026-11-01')).toEqual([]));
  it('with warn 30 days, 2026-11-01 shows as 16 days', () => expect(rows('2026-11-01', 30)).toEqual(['expirySoon:อีก 16 วัน']));
  it('no expiry date: never listed', () => expect(rows('')).toEqual([]));
});

describe('order inside the groups', () => {
  it('expired: most overdue first; soon: fewest days first', () => {
    const root = base({
      houseItems: [
        house('h1', { name: 'H1', expiry: '2026-10-10' }), // 6 over
        house('h2', { name: 'H2', expiry: '2026-09-01' }), // 45 over
        house('h3', { name: 'H3', expiry: '2026-10-30' }), // 14
        house('h4', { name: 'H4', expiry: '2026-10-18' }), // 2
      ],
    });
    const c = careItems(root, TODAY);
    expect(c.expired.map((i) => i.name)).toEqual(['H2', 'H1']);
    expect(c.expirySoon.map((i) => i.name)).toEqual(['H4', 'H3']);
    expect(c.count).toBe(4);
  });

  it('stock: members by days left (least first), then house medicines by quantity', () => {
    const root = base({
      assignments: [
        mk('a', { stock: { qty: 5, countedOn: TODAY } }), // 5 days
        mk('b', { stock: { qty: 2, countedOn: TODAY } }), // 2 days
        mk('c', { stock: { qty: 0, countedOn: TODAY } }), // 0 days
        mk('d', { stock: { qty: 50, countedOn: TODAY } }), // not low
      ],
      houseItems: [
        house('h1', { name: 'H1', stock: { qty: 4, unit: 'เม็ด' }, lowAt: 10 }),
        house('h2', { name: 'H2', stock: { qty: 0, unit: 'ขวด' } }),
        house('h3', { name: 'H3', stock: { qty: 50, unit: 'เม็ด' }, lowAt: 10 }), // enough
      ],
    });
    const c = careItems(root, TODAY);
    expect(c.lowStock.map((i) => [i.name, i.right])).toEqual([
      ['Sample Med c', 'ไม่พอสำหรับวันนี้'],
      ['Sample Med b', 'เหลือ 2 วัน'],
      ['Sample Med a', 'เหลือ 5 วัน'],
      ['H2', 'หมดแล้ว'],
      ['H1', 'เหลือ 4 เม็ด'],
    ]);
  });
});

describe('members', () => {
  it('a member medicine that expired shows with the owner name', () => {
    const root = base({ assignments: [mk('a', { expiry: '2026-10-01' })] });
    const [row] = careItems(root, TODAY).expired;
    expect(row).toMatchObject({ name: 'Sample Med a', right: 'เกิน 15 วัน', kind: 'member' });
    expect(row?.sub).toContain('Test Person A');
    expect(row?.sub).toContain('1 ต.ค. 2569');
  });

  it('uses settings.lowStockDays', () => {
    const root = base({ assignments: [mk('a', { stock: { qty: 10, countedOn: TODAY } })] }); // 10 days left
    expect(careItems(root, TODAY).lowStock).toHaveLength(0);
    root.settings = { ...root.settings, lowStockDays: 10 };
    expect(careItems(root, TODAY).lowStock).toHaveLength(1);
  });

  it('left out: stopped medicine, removed member, removed house medicine', () => {
    const root = base({
      persons: [person({ id: 'p1' }), person({ id: 'p2', name: 'Test Person B', removedAt: '2026-10-01T09:00:00+07:00' })],
      assignments: [
        mk('a', { status: 'stopped', expiry: '2026-09-01', stock: { qty: 0, countedOn: TODAY } }),
        mk('b', { personId: 'p2', expiry: '2026-09-01', stock: { qty: 0, countedOn: TODAY } }),
      ],
      houseItems: [house('h1', { expiry: '2026-09-01', removedAt: '2026-10-01T09:00:00+07:00' })],
    });
    const c = careItems(root, TODAY);
    expect(c.count).toBe(0);
  });

  it('a self-managed member is still counted (stock and expiry)', () => {
    const root = base({
      persons: [person({ id: 'p1', selfManaged: true })],
      assignments: [mk('a', { expiry: '2026-10-20', stock: { qty: 1, countedOn: TODAY } })],
    });
    const c = careItems(root, TODAY);
    expect(c.lowStock).toHaveLength(1);
    expect(c.expirySoon).toHaveLength(1);
    expect(c.count).toBe(1); // one medicine in two groups counts once
  });

  it('days paused by stop / resume are not deducted', () => {
    const root = base({
      assignments: [mk('a', { stock: { qty: 6, countedOn: '2026-10-10' } })],
      events: [stopEvent('a', '2026-10-10'), resumeEvent('a', '2026-10-14')],
    });
    // 10-10..10-13 paused; 10-14 and 10-15 deduct 2 -> 4 pills, 4 days
    expect(careItems(root, TODAY).lowStock[0]?.right).toBe('เหลือ 4 วัน');
  });
});

describe('memberCards', () => {
  it('status per member', () => {
    const root = base({
      persons: [
        person({ id: 'p1', name: 'Test Person A' }),
        person({ id: 'p2', name: 'Test Person B', selfManaged: true }),
        person({ id: 'p3', name: 'Test Person C' }),
        person({ id: 'p4', name: 'Test Person D' }),
        person({ id: 'p5', name: 'Test Person E', removedAt: '2026-10-01T09:00:00+07:00' }),
      ],
      assignments: [
        mk('a', { personId: 'p1', stock: { qty: 2, countedOn: TODAY } }), // low
        mk('b', { personId: 'p2', stock: { qty: 90, countedOn: TODAY } }), // self managed, enough
        mk('c', { personId: 'p3' }), // no count
        mk('d', { personId: 'p1', status: 'stopped' }), // not counted
      ],
    });
    expect(memberCards(root, TODAY).map((m) => [m.name, m.medCount, m.status])).toEqual([
      ['Test Person A', 1, 'low'],
      ['Test Person B', 1, 'selfManaged'],
      ['Test Person C', 1, 'noStock'],
      ['Test Person D', 0, 'noMeds'],
    ]);
  });

  it('enough stock is "ok"; low stock shows even for a self-managed member', () => {
    const root = base({
      persons: [person({ id: 'p1' }), person({ id: 'p2', name: 'Test Person B', selfManaged: true })],
      assignments: [
        mk('a', { personId: 'p1', stock: { qty: 90, countedOn: TODAY } }),
        mk('b', { personId: 'p2', stock: { qty: 1, countedOn: TODAY } }),
      ],
    });
    expect(memberCards(root, TODAY).map((m) => m.status)).toEqual(['ok', 'low']);
  });
});
