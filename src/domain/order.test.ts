// Step 3.3b-1: orderLines, targetDoses and compareShops with the owner's hand examples (today = 2026-10-19, a Monday,
// orderDays 30, lowStockDays 7). Made-up data only.
import { describe, expect, it } from 'vitest';
import { NOW } from './fixtures';
import { assignment, dailyMeal, person, resumeEvent, rootWith, stopEvent } from './helpers.test-util';
import { compareShops, orderLines, type HouseOrderLine, type MedOrderLine, type OrderLine } from './order';
import { emptyRoot, type Assignment, type HouseItem, type Medication, type Price, type Root, type Schedule, type Shop } from './schema';
import { stockNow, targetDoses } from './stock';

const T = '2026-10-19'; // Monday
const daily = (pills: number): Schedule => dailyMeal({ morning: { pills, meal: 'after' } });
const twoADay: Schedule = dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } });
const monWedFri: Schedule = { kind: 'meal', slots: { morning: { pills: 1, meal: 'after' } }, days: { kind: 'weekdays', days: [1, 3, 5] } };

const med = (id: string, name: string): Medication => ({ id, name, unit: 'เม็ด' });
const asg = (id: string, medicationId: string, personId: string, schedule: Schedule, stock: Assignment['stock'], over: Partial<Assignment> = {}) =>
  assignment({ id, medicationId, personId, schedule, stock, ...over });

const P1 = person({ id: 'p1', name: 'ชื่อสมาชิกทดสอบ' });
const P2 = person({ id: 'p2', name: 'ชื่อสมาชิกทดสอบ สอง', color: 'green' });

const rootOf = (over: Partial<Root> = {}): Root => rootWith({ persons: [P1, P2], ...over });
const med0 = (r: Root, key: string): MedOrderLine => {
  const l = orderLines(r, T).find((x) => x.key === key);
  if (!l || l.kind !== 'med') throw new Error(`no med line ${key}`);
  return l;
};
const keys = (r: Root): string[] => orderLines(r, T).map((l) => l.key);

describe('targetDoses: day by day over the real schedule', () => {
  const a = (schedule: Schedule, over: Partial<Assignment> = {}) => asg('a', 'm', 'p1', schedule, null, over);
  it('1 pill a day for 30 days = 30; two a day = 60; half a pill = 15', () => {
    expect(targetDoses(a(daily(1)), T, 30)).toBe(30);
    expect(targetDoses(a(twoADay), T, 30)).toBe(60);
    expect(targetDoses(a(daily(0.5)), T, 30)).toBe(15);
  });
  it('Mon/Wed/Fri 1 pill from Monday 19 Oct to 17 Nov = 13 (not an average of 12.86)', () => {
    expect(targetDoses(a(monWedFri), T, 30)).toBe(13);
  });
  it('the window starts today: 7 days of Mon/Wed/Fri from a Monday = 3, from a Tuesday = 3 (Wed, Fri, Mon)', () => {
    expect(targetDoses(a(monWedFri), '2026-10-19', 7)).toBe(3);
    expect(targetDoses(a(monWedFri), '2026-10-20', 7)).toBe(3);
    expect(targetDoses(a(monWedFri), '2026-10-20', 1)).toBe(0);
  });
  it('every other day counts from its anchor, never before it', () => {
    const alt: Schedule = { kind: 'meal', slots: { morning: { pills: 1, meal: 'after' } }, days: { kind: 'alt', anchor: '2026-10-19' } };
    expect(targetDoses(a(alt), T, 30)).toBe(15);
    expect(targetDoses(a(alt), '2026-10-10', 30)).toBe(11); // 19 Oct onward: 19,21,...,8 Nov
  });
  it('an interval course ends with its last day: every 8 hours x 1, 5 days from today = 15 in a 30-day window', () => {
    const course: Schedule = { kind: 'interval', everyHours: 8, firstTime: '08:00', pills: 1, course: { kind: 'days', days: 5, startDate: T } };
    expect(targetDoses(a(course), T, 30)).toBe(15);
  });
  it('a stop that covers part of the window takes those days out; a resume puts them back', () => {
    const stopOnly = [stopEvent('a', '2026-10-29')]; // paused from the 10th day on
    expect(targetDoses(a(daily(1)), T, 30, stopOnly)).toBe(10);
    const stopResume = [stopEvent('a', '2026-10-24'), resumeEvent('a', '2026-10-29')]; // 24..28 paused = 5 days
    expect(targetDoses(a(daily(1)), T, 30, stopResume)).toBe(25);
  });
  it('a stopped assignment needs nothing', () => {
    expect(targetDoses(a(daily(1), { status: 'stopped' }), T, 30)).toBe(0);
  });
});

describe('orderLines: regular medicines (owner examples A, B, C, W, H)', () => {
  const root = (): Root =>
    rootOf({
      medications: [med('mA', 'ยาทดสอบ เอ'), med('mX', 'ยาทดสอบ เอ็กซ์'), med('mZ', 'ยาทดสอบ แซด'), med('mH', 'ยาทดสอบ เอช')],
      assignments: [
        asg('A', 'mA', 'p1', daily(1), { qty: 20, countedOn: T }),
        asg('B', 'mX', 'p1', twoADay, { qty: 10, countedOn: T }),
        asg('C', 'mX', 'p2', daily(1), { qty: 12, countedOn: '2026-10-14' }),
        asg('W', 'mZ', 'p1', monWedFri, null),
        asg('H', 'mH', 'p2', daily(0.5), { qty: 3, countedOn: T }),
      ],
    });

  it('the hand numbers: C has 7 now, B 10 now', () => {
    const r = root();
    expect(stockNow(r.assignments[2]!, T)).toBe(7);
    expect(stockNow(r.assignments[1]!, T)).toBe(10);
  });
  it('A: 20 days left, not low, stock known -> not on the list', () => {
    expect(keys(root())).not.toContain('med:mA');
  });
  it('B + C are one medicine: ONE line, qty 50 + 23 = 73, reason low, ticked', () => {
    const l = med0(root(), 'med:mX');
    expect(l).toMatchObject({ kind: 'med', medicationId: 'mX', name: 'ยาทดสอบ เอ็กซ์', unit: 'เม็ด', qty: 73, reason: 'low', ticked: true });
    expect(l.assignmentIds).toEqual(['B', 'C']);
    expect(orderLines(root(), T).filter((x) => x.key === 'med:mX')).toHaveLength(1);
  });
  it('W: no count -> target 13, reason unknown, qty 13, NOT ticked', () => {
    expect(med0(root(), 'med:mZ')).toMatchObject({ qty: 13, reason: 'unknown', ticked: false });
  });
  it('H: half a pill a day, 3 left = 6 days -> low, target 15, need 12, ticked', () => {
    expect(med0(root(), 'med:mH')).toMatchObject({ qty: 12, reason: 'low', ticked: true });
  });
  it('C alone sits exactly on the border: 7 days left with lowStockDays 7 is low (need 23)', () => {
    const r = rootOf({ medications: [med('mX', 'ยาทดสอบ เอ็กซ์')], assignments: [asg('C', 'mX', 'p2', daily(1), { qty: 12, countedOn: '2026-10-14' })] });
    expect(med0(r, 'med:mX')).toMatchObject({ qty: 23, reason: 'low', ticked: true });
  });
  it('one day over the border (8 days left) is not low', () => {
    const r = rootOf({ medications: [med('mX', 'ยาทดสอบ เอ็กซ์')], assignments: [asg('C', 'mX', 'p2', daily(1), { qty: 8, countedOn: T })] });
    expect(keys(r)).toEqual([]);
  });
  it('the lines are sorted by Thai name (localeCompare th): แซด, เอ็กซ์, เอช', () => {
    expect(keys(root())).toEqual(['med:mZ', 'med:mX', 'med:mH']);
  });
  it('a low assignment and an unknown one of the same medicine: reason low, qty = need + whole target, ticked', () => {
    const r = rootOf({
      medications: [med('mX', 'ยาทดสอบ เอ็กซ์')],
      assignments: [asg('B', 'mX', 'p1', twoADay, { qty: 10, countedOn: T }), asg('U', 'mX', 'p2', daily(1), null)],
    });
    expect(med0(r, 'med:mX')).toMatchObject({ qty: 50 + 30, reason: 'low', ticked: true });
  });
  it('a medicine with only an unknown assignment and a healthy one: reason unknown, not ticked, qty adds only the need', () => {
    const r = rootOf({
      medications: [med('mX', 'ยาทดสอบ เอ็กซ์')],
      assignments: [asg('K', 'mX', 'p1', daily(1), { qty: 200, countedOn: T }), asg('U', 'mX', 'p2', daily(1), null)],
    });
    expect(med0(r, 'med:mX')).toMatchObject({ qty: 0 + 30, reason: 'unknown', ticked: false });
  });
  it('a stopped medicine (status stopped) is not on the list, also with no count', () => {
    const r = rootOf({
      medications: [med('mX', 'ยาทดสอบ เอ็กซ์')],
      assignments: [asg('S', 'mX', 'p1', daily(1), { qty: 2, countedOn: T }, { status: 'stopped' })],
    });
    expect(keys(r)).toEqual([]);
  });
  it('a removed member is not counted; the other member of the same medicine still is', () => {
    const r = rootOf({
      persons: [P1, { ...P2, removedAt: NOW }],
      medications: [med('mX', 'ยาทดสอบ เอ็กซ์')],
      assignments: [asg('B', 'mX', 'p1', twoADay, { qty: 10, countedOn: T }), asg('C', 'mX', 'p2', daily(1), { qty: 12, countedOn: '2026-10-14' })],
    });
    const l = med0(r, 'med:mX');
    expect(l.qty).toBe(50);
    expect(l.assignmentIds).toEqual(['B']);
    const onlyRemoved = rootOf({
      persons: [{ ...P1, removedAt: NOW }],
      medications: [med('mX', 'ยาทดสอบ เอ็กซ์')],
      assignments: [asg('B', 'mX', 'p1', twoADay, { qty: 10, countedOn: T })],
    });
    expect(keys(onlyRemoved)).toEqual([]);
  });
  it('a self-managed member counts too', () => {
    const r = rootOf({
      persons: [{ ...P1, selfManaged: true }],
      medications: [med('mX', 'ยาทดสอบ เอ็กซ์')],
      assignments: [asg('B', 'mX', 'p1', twoADay, { qty: 10, countedOn: T })],
    });
    expect(med0(r, 'med:mX')).toMatchObject({ qty: 50, ticked: true });
  });
  it('a pause in the window lowers the target (stop on 29 Oct for good: 10 days, stock 4 -> need 6)', () => {
    const r = rootOf({
      medications: [med('mX', 'ยาทดสอบ เอ็กซ์')],
      assignments: [asg('B', 'mX', 'p1', daily(1), { qty: 4, countedOn: T })],
      events: [stopEvent('B', '2026-10-29')],
    });
    expect(med0(r, 'med:mX')).toMatchObject({ qty: 6, reason: 'low' });
  });
  it('orderDays 7 with lowStockDays 14: 10 days left is low, but target 7 needs 0 -> listed, qty 0, NOT ticked', () => {
    const r = rootOf({
      settings: { ...emptyRoot(NOW).settings, orderDays: 7, lowStockDays: 14 },
      medications: [med('mX', 'ยาทดสอบ เอ็กซ์')],
      assignments: [asg('A', 'mX', 'p1', daily(1), { qty: 10, countedOn: T })],
    });
    expect(med0(r, 'med:mX')).toMatchObject({ qty: 0, reason: 'low', ticked: false });
  });
  it('orderDays follows the settings (60 days: B needs 120 - 10 = 110)', () => {
    const r = rootOf({
      settings: { ...emptyRoot(NOW).settings, orderDays: 60 },
      medications: [med('mX', 'ยาทดสอบ เอ็กซ์')],
      assignments: [asg('B', 'mX', 'p1', twoADay, { qty: 10, countedOn: T })],
    });
    expect(med0(r, 'med:mX').qty).toBe(110);
  });
  it('no member name is in any line (only assignment ids)', () => {
    const text = JSON.stringify(orderLines(root(), T));
    expect(text).not.toContain('ชื่อสมาชิกทดสอบ');
    expect(text).not.toContain('Test Person');
  });
  it('an assignment whose medication is missing is skipped, not a crash', () => {
    const r = rootOf({ assignments: [asg('B', 'gone', 'p1', twoADay, null)] });
    expect(keys(r)).toEqual([]);
  });
});

describe('orderLines: house medicines and the order of the list', () => {
  const house = (id: string, name: string, qty: number | null, lowAt?: number, over: Partial<HouseItem> = {}): HouseItem => ({
    id,
    name,
    ...(qty === null ? {} : { stock: { qty, unit: 'ขวด' } }),
    ...(lowAt === undefined ? {} : { lowAt }),
    ...over,
  });
  const hl = (r: Root, key: string): HouseOrderLine => {
    const l = orderLines(r, T).find((x) => x.key === key);
    if (!l || l.kind !== 'house') throw new Error(`no house line ${key}`);
    return l;
  };

  it('qty 2 with lowAt 5 is on the list: 1 sell unit, reason low, ticked; qty 20 is not', () => {
    const r = rootOf({ houseItems: [house('Y', 'ยาสามัญทดสอบ วาย', 2, 5), house('Q', 'ยาสามัญทดสอบ คิว', 20, 5)] });
    expect(keys(r)).toEqual(['house:Y']);
    expect(hl(r, 'house:Y')).toMatchObject({ kind: 'house', houseItemId: 'Y', name: 'ยาสามัญทดสอบ วาย', unit: 'ขวด', qty: 1, reason: 'low', ticked: true });
  });
  it('out (0 left) is on the list too, exactly at the warn level too', () => {
    const r = rootOf({ houseItems: [house('Y', 'ยาสามัญทดสอบ วาย', 0, 5), house('E', 'ยาสามัญทดสอบ อี', 5, 5), house('N', 'ยาสามัญทดสอบ เอ็น', 6, 5)] });
    expect(keys(r).sort()).toEqual(['house:E', 'house:Y']);
  });
  it('not counted (no stock) or deleted house medicines are left out; the deleted one even when empty', () => {
    const r = rootOf({
      houseItems: [house('U', 'ยาสามัญทดสอบ ยู', null), house('R', 'ยาสามัญทดสอบ อาร์', 0, 5, { removedAt: NOW }), house('K', 'ยาสามัญทดสอบ เค', 0)],
    });
    expect(keys(r)).toEqual(['house:K']);
  });
  it('a house medicine with stock but no warn level and some left is not low', () => {
    expect(keys(rootOf({ houseItems: [house('Z', 'ยาสามัญทดสอบ แซด', 3)] }))).toEqual([]);
  });
  it('regular medicines come first, then house medicines, each group by Thai name', () => {
    const r = rootOf({
      medications: [med('m1', 'ยาทดสอบ ข'), med('m2', 'ยาทดสอบ ก')],
      assignments: [asg('a1', 'm1', 'p1', daily(1), null), asg('a2', 'm2', 'p1', daily(1), null)],
      houseItems: [house('h1', 'ก ยาสามัญ ทดสอบ', 0), house('h2', 'ข ยาสามัญ ทดสอบ', 0)],
    });
    expect(keys(r)).toEqual(['med:m2', 'med:m1', 'house:h1', 'house:h2']);
  });
  it('an empty house gives an empty list', () => {
    expect(orderLines(emptyRoot(NOW), T)).toEqual([]);
  });
});

// ---------- compareShops ----------
const shop = (id: string, name: string, delivery: Shop['delivery']): Shop => ({ id, name, delivery });
const SHOPS: Shop[] = [
  shop('sA', 'ร้านทดสอบ ก', { kind: 'pickup' }),
  shop('sB', 'ร้านทดสอบ ข', { kind: 'deliver', fee: 40, freeOver: 1000 }),
  shop('sC', 'ร้านทดสอบ ค', { kind: 'deliver', fee: 30, freeOver: 700 }),
  shop('sD', 'ร้านทดสอบ ง', { kind: 'deliver', fee: 50, freeOver: 650 }),
  shop('sE', 'ร้านทดสอบ จ', { kind: 'pickup' }),
];
const mp = (shopId: string, medicationId: string, price: number, sellUnit: string, perSellUnit: number): Price => ({
  id: `${shopId}-${medicationId}`,
  shopId,
  item: { kind: 'med', medicationId },
  price,
  sellUnit,
  perSellUnit,
});
const hp = (shopId: string, houseItemId: string, price: number, sellUnit: string): Price => ({
  id: `${shopId}-${houseItemId}`,
  shopId,
  item: { kind: 'house', houseItemId },
  price,
  sellUnit,
  perSellUnit: 1,
});
const PRICES: Price[] = [
  mp('sA', 'mX', 290, 'กล่อง', 60),
  hp('sA', 'hY', 35, 'ขวด'),
  mp('sB', 'mX', 240, 'แผง', 30),
  hp('sB', 'hY', 40, 'ขวด'),
  mp('sC', 'mX', 250, 'กล่อง', 30),
  hp('sC', 'hY', 30, 'ขวด'),
  mp('sD', 'mX', 290, 'กล่อง', 60),
  hp('sD', 'hY', 35, 'ขวด'),
  mp('sE', 'mX', 100, 'กล่อง', 60), // no price for Y
];
const X = (qty = 73): MedOrderLine => ({
  kind: 'med',
  key: 'med:mX',
  medicationId: 'mX',
  name: 'ยาทดสอบ เอ็กซ์',
  unit: 'เม็ด',
  qty,
  reason: 'low',
  ticked: true,
  assignmentIds: ['B', 'C'],
});
const Y = (qty = 2): HouseOrderLine => ({ kind: 'house', key: 'house:hY', houseItemId: 'hY', name: 'ยาสามัญทดสอบ วาย', unit: 'ขวด', qty, reason: 'low', ticked: true });
const names = (lines: OrderLine[], inc: boolean, prices = PRICES, shops = SHOPS) =>
  compareShops(lines, shops, prices, inc).rows.map((r) => `${r.shopName.slice(-1)}:${r.total}`);

describe('compareShops: the owner example (X qty 73 + Y qty 2)', () => {
  const run = (inc: boolean) => compareShops([X(), Y()], SHOPS, PRICES, inc);
  const row = (id: string, inc = true) => {
    const r = run(inc).rows.find((x) => x.shopId === id);
    if (!r) throw new Error(`no row ${id}`);
    return r;
  };

  it('ร้านก (pick-up): 73/60 -> 2 boxes = 580, Y 2 x 35 = 70, items 650, shipping 0, total 650', () => {
    expect(row('sA')).toMatchObject({ itemsTotal: 650, shipping: 0, total: 650, buyMore: null });
    expect(row('sA').lines).toEqual([
      { key: 'med:mX', sellUnits: 2, sellUnit: 'กล่อง', perSellUnit: 60, price: 290, cost: 580 },
      { key: 'house:hY', sellUnits: 2, sellUnit: 'ขวด', perSellUnit: 1, price: 35, cost: 70 },
    ]);
  });
  it('ร้านข (deliver 40, free over 1000): 73/30 -> 3 packs = 720, Y 80, items 800, shipping 40, total 840 with / 800 without, buy 200 more', () => {
    expect(row('sB')).toMatchObject({ itemsTotal: 800, shipping: 40, total: 840, buyMore: 200 });
    expect(row('sB', false)).toMatchObject({ itemsTotal: 800, shipping: 40, total: 800, buyMore: 200 });
    expect(row('sB').lines[0]).toMatchObject({ sellUnits: 3, cost: 720 });
  });
  it('ร้านค (deliver 30, free over 700): 3 x 250 = 750, Y 60, items 810 >= 700 -> shipping 0, total 810, no "buy more"', () => {
    expect(row('sC')).toMatchObject({ itemsTotal: 810, shipping: 0, total: 810, buyMore: null });
  });
  it('ร้านง (deliver 50, free over 650): items 650 is exactly the limit -> shipping 0, total 650', () => {
    expect(row('sD')).toMatchObject({ itemsTotal: 650, shipping: 0, total: 650, buyMore: null });
  });
  it('ร้านจ has X but no price for Y: not compared, and the missing key is house:hY', () => {
    const res = run(true);
    expect(res.rows.map((r) => r.shopId)).not.toContain('sE');
    expect(res.missing).toEqual([{ shopId: 'sE', shopName: 'ร้านทดสอบ จ', keys: ['house:hY'] }]);
  });
  it('with shipping: ก 650, ง 650 (tie, ก first by name), ค 810, ข 840', () => {
    expect(names([X(), Y()], true)).toEqual(['ก:650', 'ง:650', 'ค:810', 'ข:840']);
  });
  it('without shipping: ก 650, ง 650, ข 800, ค 810 (ข and ค swap places)', () => {
    expect(names([X(), Y()], false)).toEqual(['ก:650', 'ง:650', 'ข:800', 'ค:810']);
  });
});

describe('compareShops: edge cases', () => {
  it('no lines at all: rows empty, nothing missing, no error', () => {
    expect(compareShops([], SHOPS, PRICES, true)).toEqual({ rows: [], missing: [] });
  });
  it('lines that are not ticked, or have qty 0, are left out (nothing ticked = empty)', () => {
    expect(compareShops([{ ...X(), ticked: false }, { ...Y(), ticked: false }], SHOPS, PRICES, true).rows).toEqual([]);
    expect(compareShops([X(0), Y(0)], SHOPS, PRICES, true).rows).toEqual([]);
    // only the Y line counts: ร้านจ has no price for it, the others do
    expect(compareShops([{ ...X(), ticked: false }, Y()], SHOPS, PRICES, false).rows).toHaveLength(4);
  });
  it('no shops: rows empty', () => {
    expect(compareShops([X(), Y()], [], PRICES, true)).toEqual({ rows: [], missing: [] });
  });
  it('every shop is incomplete: rows empty, each shop listed with what it lacks', () => {
    const res = compareShops([X(), Y()], SHOPS, [mp('sA', 'mX', 290, 'กล่อง', 60), hp('sB', 'hY', 40, 'ขวด')], true);
    expect(res.rows).toEqual([]);
    expect(res.missing.find((m) => m.shopId === 'sA')?.keys).toEqual(['house:hY']);
    expect(res.missing.find((m) => m.shopId === 'sB')?.keys).toEqual(['med:mX']);
    expect(res.missing.find((m) => m.shopId === 'sC')?.keys).toEqual(['med:mX', 'house:hY']);
  });
  it('a shop with no prices at all is listed as missing everything', () => {
    const res = compareShops([X()], [SHOPS[0]!], [], true);
    expect(res).toEqual({ rows: [], missing: [{ shopId: 'sA', shopName: 'ร้านทดสอบ ก', keys: ['med:mX'] }] });
  });
  it('one line only: a shop that prices just that line is compared', () => {
    const res = compareShops([X()], SHOPS, PRICES, true);
    expect(res.rows.map((r) => r.shopId)).toContain('sE');
    expect(res.rows[0]).toMatchObject({ shopId: 'sE', total: 200 });
  });
  it('rounds up to whole sell units at the edge: 60 of 60 = 1 box, 60.5 of 60 = 2 boxes (half a pill)', () => {
    expect(compareShops([X(60)], [SHOPS[0]!], PRICES, true).rows[0]?.lines[0]?.sellUnits).toBe(1);
    expect(compareShops([X(60.5)], [SHOPS[0]!], PRICES, true).rows[0]?.lines[0]?.sellUnits).toBe(2);
    expect(compareShops([X(0.5)], [SHOPS[0]!], PRICES, true).rows[0]?.lines[0]?.sellUnits).toBe(1);
  });
  it('floating point does not add a box: 0.3 / 0.1 and 12 / 0.4 style quotients stay whole', () => {
    const p = [mp('sA', 'mX', 10, 'ขวด', 0.1)];
    expect(compareShops([X(0.3)], [SHOPS[0]!], p, true).rows[0]?.lines[0]?.sellUnits).toBe(3);
    const q = [mp('sA', 'mX', 10, 'ขวด', 0.4)];
    expect(compareShops([X(12)], [SHOPS[0]!], q, true).rows[0]?.lines[0]?.sellUnits).toBe(30);
  });
  it('a house medicine of n sell units costs n x price', () => {
    expect(compareShops([Y(5)], [SHOPS[0]!], PRICES, true).rows[0]).toMatchObject({ itemsTotal: 175, total: 175 });
  });
  it('money is rounded to the satang: 0.1 + 0.2 = 0.3', () => {
    const a: HouseOrderLine = { ...Y(1), key: 'house:h1', houseItemId: 'h1' };
    const b: HouseOrderLine = { ...Y(1), key: 'house:h2', houseItemId: 'h2' };
    const res = compareShops([a, b], [SHOPS[0]!], [hp('sA', 'h1', 0.1, 'ขวด'), hp('sA', 'h2', 0.2, 'ขวด')], true);
    expect(res.rows[0]?.itemsTotal).toBe(0.3);
    expect(res.rows[0]?.total).toBe(0.3);
  });
  it('rounded totals decide the order: 0.1 + 0.2 ties with a shop priced 0.3 and the name wins', () => {
    const shops = [shop('s1', 'ร้านทดสอบ ข', { kind: 'pickup' }), shop('s2', 'ร้านทดสอบ ก', { kind: 'pickup' })];
    const a: HouseOrderLine = { ...Y(1), key: 'house:h1', houseItemId: 'h1' };
    const b: HouseOrderLine = { ...Y(1), key: 'house:h2', houseItemId: 'h2' };
    const prices = [hp('s1', 'h1', 0.1, 'ขวด'), hp('s1', 'h2', 0.2, 'ขวด'), hp('s2', 'h1', 0.3, 'ขวด'), hp('s2', 'h2', 0.0001, 'ขวด')];
    const res = compareShops([a, b], shops, prices, true);
    expect(res.rows.map((r) => `${r.shopName}:${r.total}`)).toEqual(['ร้านทดสอบ ก:0.3', 'ร้านทดสอบ ข:0.3']);
  });
  it('same total: ordered by shop name in Thai', () => {
    const shops = [shop('s3', 'ร้านทดสอบ ค', { kind: 'pickup' }), shop('s1', 'ร้านทดสอบ ก', { kind: 'pickup' }), shop('s2', 'ร้านทดสอบ ข', { kind: 'pickup' })];
    const prices = ['s1', 's2', 's3'].map((s) => hp(s, 'hY', 35, 'ขวด'));
    expect(compareShops([Y()], shops, prices, true).rows.map((r) => r.shopId)).toEqual(['s1', 's2', 's3']);
  });
  it('delivery fee 0 (free) is 0 and has no "buy more"; a delivery shop without a free-over limit always charges the fee', () => {
    const free = shop('f', 'ร้านทดสอบ ฟรี', { kind: 'deliver', fee: 0, freeOver: 1000 });
    const always = shop('g', 'ร้านทดสอบ เสมอ', { kind: 'deliver', fee: 25 });
    const prices = [hp('f', 'hY', 35, 'ขวด'), hp('g', 'hY', 35, 'ขวด')];
    const res = compareShops([Y()], [free, always], prices, true);
    expect(res.rows.find((r) => r.shopId === 'f')).toMatchObject({ shipping: 0, total: 70, buyMore: null });
    expect(res.rows.find((r) => r.shopId === 'g')).toMatchObject({ shipping: 25, total: 95, buyMore: null });
  });
  it('"buy more" is the rounded gap to the free-over amount, only while it is not reached', () => {
    const s = shop('s', 'ร้านทดสอบ ส', { kind: 'deliver', fee: 40, freeOver: 100.1 });
    const res = compareShops([Y(1)], [s], [hp('s', 'hY', 0.2, 'ขวด')], true);
    expect(res.rows[0]?.buyMore).toBe(99.9);
  });
  it('the price of a medicine is shared: the same medicationId line is priced once whoever uses it', () => {
    const res = compareShops([X(73)], [SHOPS[0]!], PRICES, true);
    expect(res.rows[0]?.lines).toHaveLength(1);
  });
  it('a medicine price does not match a house medicine with the same id text', () => {
    const odd: HouseOrderLine = { ...Y(), houseItemId: 'mX', key: 'house:mX' };
    expect(compareShops([odd], [SHOPS[0]!], [mp('sA', 'mX', 290, 'กล่อง', 60)], true).rows).toEqual([]);
  });
  it('works on the output of orderLines with the owner quantities changed by +/-', () => {
    const root = rootOf({
      medications: [med('mX', 'ยาทดสอบ เอ็กซ์')],
      assignments: [asg('B', 'mX', 'p1', twoADay, { qty: 10, countedOn: T }), asg('C', 'mX', 'p2', daily(1), { qty: 12, countedOn: '2026-10-14' })],
      houseItems: [{ id: 'hY', name: 'ยาสามัญทดสอบ วาย', stock: { qty: 2, unit: 'ขวด' }, lowAt: 5 }],
      shops: SHOPS,
      prices: PRICES,
    });
    const lines = orderLines(root, T).map((l) => (l.key === 'house:hY' ? { ...l, qty: 2 } : l));
    expect(names(lines, true, root.prices, root.shops)).toEqual(['ก:650', 'ง:650', 'ค:810', 'ข:840']);
  });
});
