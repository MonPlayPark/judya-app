import { describe, expect, it } from 'vitest';
import type { IsoDate } from '../calc';
import { sampleRootV3 } from './fixtures';
import { defaultReceive, dropRest, receiveOrder, type ReceiveInput } from './orderReceive';
import { rootSchema, type Assignment, type Medication, type Order, type OrderLine, type Person, type Root, type Schedule } from './schema';

const TODAY = '2026-10-28' as IsoDate;
const NOW = '2026-10-28T10:00:00+07:00';
const SCHED: Schedule = { kind: 'meal', slots: { morning: { pills: 1, meal: 'after' } }, days: { kind: 'daily' } };

/** The sample house plus a few made-up medicines for the unit kinds it does not have, and every order replaced by `orders`. */
function world(orders: Order[] = []): Root {
  const r = sampleRootV3();
  const meds: Medication[] = [
    { id: 'mb', name: 'ยาตัวอย่าง ขวด', kind: 'tablet', pack: { type: 'bottle', perBottle: 100 } },
    { id: 'mn', name: 'ยาตัวอย่าง ไม่มีแพ็ก', kind: 'tablet', pack: { type: 'none' } },
    { id: 'mo', name: 'ยาตัวอย่าง อื่น', kind: 'other', pack: { type: 'none' } },
  ];
  const mk = (id: string, medicationId: string, personId: string, stock: Assignment['stock']): Assignment => ({
    id, medicationId, personId, schedule: SCHED, stock, status: 'active', createdAt: NOW,
  });
  const extraPerson: Person = { ...r.persons[0]!, id: 'p8', name: 'สมาชิก ซ', relation: 'ญาติ', selfManaged: false };
  const as: Assignment[] = [
    mk('ab', 'mb', 'p1', { kind: 'count', strips: 1, loose: 5, countedOn: TODAY }),
    mk('an', 'mn', 'p1', { kind: 'count', strips: 0, loose: 4, countedOn: TODAY }),
    mk('ao1', 'mo', 'p1', null),
    mk('ao2', 'mo', 'p2', { kind: 'count', strips: 0, loose: 3, countedOn: TODAY }),
    // two people on one medicine (m1 = strips of 10): a1 (p1) exists in the sample; add p2 and p3
    mk('a1b', 'm1', 'p2', { kind: 'count', strips: 0, loose: 6, countedOn: TODAY }),
    mk('a1c', 'm1', 'p3', null),
    // three people on the cream m4: a4 (p3) exists; add p1, p2
    mk('a4b', 'm4', 'p1', { kind: 'tubes', opened: false, spare: 0 }),
    mk('a4c', 'm4', 'p2', { kind: 'tubes', opened: true, spare: 0 }),
  ];
  return { ...r, persons: [...r.persons, extraPerson], medications: [...r.medications, ...meds], assignments: [...r.assignments, ...as], orders };
}

const line = (source: OrderLine['source'], over: Partial<OrderLine> = {}): OrderLine => ({ source, qtyOrdered: 2, sellUnit: 'แผง', perSellUnit: 10, qtyReceived: 0, leftover: null, ...over });
const med = (medicationId: string, shares: [string, number][]): OrderLine['source'] => ({ kind: 'med', medicationId, shares: shares.map(([assignmentId, qty]) => ({ assignmentId, qty })) });
const order = (lines: OrderLine[], status: Order['status'] = 'waiting'): Order => ({ id: 'ox', shopId: 's1', shopName: 'ร้านตัวอย่าง 1', createdAt: NOW, status, includeShipping: false, lines });
const got = (lineIndex: number, qtyReceivedNow: number, leftover: ReceiveInput['leftover'] = null, addToList?: boolean): ReceiveInput => ({ lineIndex, qtyReceivedNow, leftover, ...(addToList === undefined ? {} : { addToList }) });

function receive(root: Root, input: ReceiveInput[], today = TODAY) {
  const r = receiveOrder(root, 'ox', input, today, NOW);
  if (!r.ok) throw new Error(r.error);
  return r;
}
const asg = (r: Root, id: string): Assignment => r.assignments.find((a) => a.id === id)!;
const ord = (r: Root): Order => r.orders.find((o) => o.id === 'ox')!;

describe('unit kinds', () => {
  it('strip: 2 strips of 10 on top of 2 strips + 3 loose (23) = 43 pills = 4 strips + 3', () => {
    const root = world([order([line(med('m1', [['a1', 20]]))])]);
    const r = receive(root, [got(0, 2)]);
    expect(asg(r.root, 'a1').stock).toEqual({ kind: 'count', strips: 4, loose: 3, countedOn: TODAY });
    expect(ord(r.root).status).toBe('received');
    expect(ord(r.root).closedAt).toBe(NOW);
    expect(ord(r.root).lines[0]).toMatchObject({ qtyReceived: 2, leftover: null });
  });
  it('box of 30 (perSellUnit 30): 1 box adds 30 pills', () => {
    const root = world([order([line(med('m2', [['a2', 30]]), { qtyOrdered: 1, sellUnit: 'กล่อง', perSellUnit: 30 })])]);
    const r = receive(root, [got(0, 1)]);
    expect(asg(r.root, 'a2').stock).toEqual({ kind: 'count', strips: 3, loose: 7, countedOn: TODAY }); // 7 + 30 = 37 = 3 strips + 7
  });
  it('bottle tablets: 1 bottle of 100 on 1 bottle + 5', () => {
    const root = world([order([line(med('mb', [['ab', 100]]), { qtyOrdered: 1, sellUnit: 'ขวด', perSellUnit: 100 })])]);
    const r = receive(root, [got(0, 1)]);
    expect(asg(r.root, 'ab').stock).toEqual({ kind: 'count', strips: 2, loose: 5, countedOn: TODAY });
  });
  it('pack none: loose pills only, never strips', () => {
    const root = world([order([line(med('mn', [['an', 30]]), { qtyOrdered: 30, sellUnit: 'เม็ด', perSellUnit: 1 })])]);
    const r = receive(root, [got(0, 30)]);
    expect(asg(r.root, 'an').stock).toEqual({ kind: 'count', strips: 0, loose: 34, countedOn: TODAY });
  });
  it('sachet box of 10: 2 boxes add 20 sachets', () => {
    const root = world([order([line(med('m5', [['a5', 20]]), { sellUnit: 'กล่อง' })])]);
    const r = receive(root, [got(0, 2)]);
    expect(asg(r.root, 'a5').stock).toEqual({ kind: 'count', strips: 3, loose: 4, countedOn: TODAY }); // 14 + 20 = 34 = 3 boxes + 4
  });
  it('liquid: 2 bottles of 60 ml add 120 ml', () => {
    const root = world([order([line(med('m3', [['a3', 120]]), { sellUnit: 'ขวด', perSellUnit: 60 })])]);
    const r = receive(root, [got(0, 2)]);
    expect(asg(r.root, 'a3').stock).toEqual({ kind: 'volume', ml: 165, countedOn: TODAY });
  });
  it('cream tubes: spare += qty, perSellUnit is not used', () => {
    const root = world([order([line(med('m4', [['a4', 2]]), { sellUnit: 'หลอด', perSellUnit: 15 })])]);
    const r = receive(root, [got(0, 2)]);
    expect(asg(r.root, 'a4').stock).toEqual({ kind: 'tubes', opened: true, spare: 3 });
  });
  it('drops: spare += qty', () => {
    const root = world([order([line(med('m6', [['a6', 1]]), { qtyOrdered: 1, sellUnit: 'ขวด', perSellUnit: undefined })])]);
    const r = receive(root, [got(0, 1)]);
    expect(asg(r.root, 'a6').stock).toEqual({ kind: 'tubes', opened: false, spare: 3 });
  });
  it('other with no stock: no update, not reported', () => {
    const root = world([order([line(med('mo', [['ao1', 10]]), { qtyOrdered: 10, sellUnit: 'ซอง', perSellUnit: 1 })])]);
    const r = receive(root, [got(0, 10)]);
    expect(asg(r.root, 'ao1')).toEqual(asg(root, 'ao1'));
    expect(r.startedCount).toEqual([]);
    expect(ord(r.root).status).toBe('received');
  });
  it('other with stock: refills the kind it has', () => {
    const root = world([order([line(med('mo', [['ao2', 10]]), { qtyOrdered: 10, sellUnit: 'ซอง', perSellUnit: 1 })])]);
    const r = receive(root, [got(0, 10)]);
    expect(asg(r.root, 'ao2').stock).toEqual({ kind: 'count', strips: 0, loose: 13, countedOn: TODAY });
  });
  it('other: with two people only the one with stock is refilled (the whole amount)', () => {
    const root = world([order([line(med('mo', [['ao1', 10], ['ao2', 10]]), { qtyOrdered: 20, sellUnit: 'ซอง', perSellUnit: 1 })])]);
    const r = receive(root, [got(0, 20)]);
    expect(asg(r.root, 'ao1').stock).toBeNull();
    expect(asg(r.root, 'ao2').stock).toEqual({ kind: 'count', strips: 0, loose: 23, countedOn: TODAY });
  });
  it('house with stock: qty += received', () => {
    const root = world([order([line({ kind: 'house', houseItemId: 'h1' }, { perSellUnit: 1 })])]);
    const r = receive(root, [got(0, 2)]);
    expect(r.root.houseItems.find((h) => h.id === 'h1')!.stock).toEqual({ qty: 4, unit: 'แผง' });
  });
  it('house without stock: no update', () => {
    const root = world([order([line({ kind: 'house', houseItemId: 'h2' }, { perSellUnit: 1 })])]);
    const r = receive(root, [got(0, 2)]);
    expect(r.root.houseItems).toEqual(root.houseItems);
  });
  it('house: a sell unit that is not the stock unit is refused', () => {
    const root = world([order([line({ kind: 'house', houseItemId: 'h1' }, { sellUnit: 'กล่อง', perSellUnit: 1 })])]);
    const r = receiveOrder(root, 'ox', [got(0, 2)], TODAY, NOW);
    expect(r.ok).toBe(false);
  });
  it('free: no stock change, keeps addToList, asks to add', () => {
    const root = world([order([line({ kind: 'free', name: 'ยาตัวอย่าง H' }, { perSellUnit: undefined })])]);
    const r = receive(root, [got(0, 2, null, true)]);
    expect({ ...r.root, orders: [] }).toEqual({ ...root, orders: [] });
    expect(ord(r.root).lines[0]!.addToList).toBe(true);
    expect(r.askAdd).toEqual([{ lineIndex: 0, name: 'ยาตัวอย่าง H' }]);
  });
  it('free received 0 is not asked', () => {
    const root = world([order([line({ kind: 'free', name: 'ยาตัวอย่าง H' })])]);
    expect(receive(root, [got(0, 0, 'waiting')]).askAdd).toEqual([]);
  });
});

describe('partial and round 2', () => {
  it('less than ordered: partial, waiting by default, stock only by what came', () => {
    const root = world([order([line(med('m1', [['a1', 20]]))])]);
    const r = receive(root, [got(0, 1, 'waiting')]);
    expect(ord(r.root).status).toBe('partial');
    expect(ord(r.root).closedAt).toBeUndefined();
    expect(ord(r.root).lines[0]).toMatchObject({ qtyReceived: 1, leftover: 'waiting' });
    expect(asg(r.root, 'a1').stock).toMatchObject({ strips: 3, loose: 3 }); // 23 + 10
  });
  it('a null leftover on a short line means waiting', () => {
    const root = world([order([line(med('m1', [['a1', 20]]))])]);
    expect(ord(receive(root, [got(0, 1)]).root).lines[0]!.leftover).toBe('waiting');
  });
  it('round 2 adds only the new part and never re-adds round 1', () => {
    const root = world([order([line(med('m1', [['a1', 20]]))])]);
    const r1 = receive(root, [got(0, 1, 'waiting')]);
    const r2 = receive(r1.root, [got(0, 1)]);
    expect(ord(r2.root).lines[0]).toMatchObject({ qtyReceived: 2, leftover: null });
    expect(ord(r2.root).status).toBe('received');
    expect(asg(r2.root, 'a1').stock).toMatchObject({ strips: 4, loose: 3 }); // 23 + 10 + 10 = 43, not 53
  });
  it('round 2 with 0 changes no stock', () => {
    const root = world([order([line(med('m1', [['a1', 20]]))])]);
    const r1 = receive(root, [got(0, 1, 'waiting')]);
    const r2 = receive(r1.root, [got(0, 0, 'waiting')]);
    expect(asg(r2.root, 'a1')).toEqual(asg(r1.root, 'a1'));
    expect(ord(r2.root).status).toBe('partial');
  });
  it('a dropped short line closes the order as received', () => {
    const root = world([order([line(med('m1', [['a1', 20]])), line({ kind: 'house', houseItemId: 'h1' }, { perSellUnit: 1 })])]);
    const r = receive(root, [got(0, 1, 'dropped'), got(1, 2)]);
    expect(ord(r.root).status).toBe('received');
    expect(ord(r.root).closedAt).toBe(NOW);
    expect(ord(r.root).lines[0]).toMatchObject({ qtyReceived: 1, leftover: 'dropped' });
  });
  it('one line complete and another waiting = partial', () => {
    const root = world([order([line(med('m1', [['a1', 20]])), line({ kind: 'house', houseItemId: 'h1' }, { perSellUnit: 1 })])]);
    const r = receive(root, [got(0, 2), got(1, 1, 'waiting')]);
    expect(ord(r.root).status).toBe('partial');
  });
  it('a line left out of the input keeps its stock and is waited for', () => {
    const root = world([order([line(med('m1', [['a1', 20]])), line({ kind: 'house', houseItemId: 'h1' }, { perSellUnit: 1 })])]);
    const r = receive(root, [got(0, 2)]);
    expect(ord(r.root).status).toBe('partial');
    expect(ord(r.root).lines[1]).toMatchObject({ qtyReceived: 0, leftover: 'waiting' });
    expect(r.root.houseItems).toEqual(root.houseItems);
  });
  it('more than ordered is complete', () => {
    const root = world([order([line(med('m1', [['a1', 20]]))])]);
    const r = receive(root, [got(0, 3, 'waiting')]);
    expect(ord(r.root).lines[0]!.leftover).toBeNull();
    expect(ord(r.root).status).toBe('received');
  });
  it('works on a partial order of the sample (round 2)', () => {
    const root = sampleRootV3();
    const r = receiveOrder(root, 'o2', [{ lineIndex: 0, qtyReceivedNow: 1, leftover: null }], TODAY, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.root.orders.find((o) => o.id === 'o2')!.status).toBe('received');
  });
});

describe('two people on one medicine', () => {
  it('splits in proportion, whole pills, the rest to the one short the most', () => {
    // 1 strip of 10 pills; shares 15 : 6 -> 7.14 / 2.85 -> floor 7 / 2, rest 1 -> the larger share
    const root = world([order([line(med('m1', [['a1', 15], ['a1b', 6]]), { qtyOrdered: 1 })])]);
    const r = receive(root, [got(0, 1)]);
    expect(asg(r.root, 'a1').stock).toMatchObject({ strips: 3, loose: 1 }); // 23 + 8 = 31
    expect(asg(r.root, 'a1b').stock).toMatchObject({ strips: 0, loose: 8 }); // 6 + 2
  });
  it('the total given never exceeds what came', () => {
    const root = world([order([line(med('m1', [['a1', 1], ['a1b', 1], ['a1c', 1]]), { qtyOrdered: 1 })])]);
    const r = receive(root, [got(0, 1)]);
    const units = (id: string): number => {
      const s = asg(r.root, id).stock;
      return s && s.kind === 'count' ? s.strips * 10 + s.loose : 0;
    };
    expect(units('a1') - 23 + (units('a1b') - 6) + units('a1c')).toBe(10); // 4 + 3 + 3
    expect(units('a1')).toBe(27); // tie -> the first in the list gets the rest
  });
  it('a tie goes to the first in the array', () => {
    const root = world([order([line(med('m1', [['a1b', 5], ['a1', 5]]), { qtyOrdered: 1, perSellUnit: 3 })])]);
    const r = receive(root, [got(0, 1)]); // 3 pills: 1 / 1, rest 1 -> a1b
    expect(asg(r.root, 'a1b').stock).toMatchObject({ loose: 8 });
    expect(asg(r.root, 'a1').stock).toMatchObject({ strips: 2, loose: 4 });
  });
  it('tubes fewer than people: one at a time to the one short the most, the others are named', () => {
    const root = world([order([line(med('m4', [['a4', 3], ['a4b', 5], ['a4c', 1]]), { qtyOrdered: 2, sellUnit: 'หลอด', perSellUnit: 1 })])]);
    const r = receive(root, [got(0, 2)]);
    expect(asg(r.root, 'a4b').stock).toEqual({ kind: 'tubes', opened: false, spare: 1 });
    expect(asg(r.root, 'a4').stock).toEqual({ kind: 'tubes', opened: true, spare: 2 });
    expect(asg(r.root, 'a4c').stock).toEqual({ kind: 'tubes', opened: true, spare: 0 });
    expect(r.noTube).toEqual(['สมาชิก ข']);
  });
  it('tubes: enough for everyone leaves noTube empty', () => {
    const root = world([order([line(med('m4', [['a4', 1], ['a4b', 1]]), { qtyOrdered: 2, sellUnit: 'หลอด', perSellUnit: 1 })])]);
    const r = receive(root, [got(0, 2)]);
    expect(r.noTube).toEqual([]);
    expect(asg(r.root, 'a4').stock).toEqual({ kind: 'tubes', opened: true, spare: 2 });
    expect(asg(r.root, 'a4b').stock).toEqual({ kind: 'tubes', opened: false, spare: 1 });
  });
  it('a stopped assignment is skipped (named) and the others share what came', () => {
    const root = world([order([line(med('m1', [['a1', 10], ['a1b', 10]]), { qtyOrdered: 1 })])]);
    const stopped = { ...root, assignments: root.assignments.map((a) => (a.id === 'a1b' ? { ...a, status: 'stopped' as const } : a)) };
    const r = receive(stopped, [got(0, 1)]);
    expect(r.skipped).toEqual(['สมาชิก ข']);
    expect(asg(r.root, 'a1b')).toEqual(asg(stopped, 'a1b'));
    expect(asg(r.root, 'a1').stock).toMatchObject({ strips: 3, loose: 3 }); // all 10 pills
  });
  it('a missing assignment makes the root invalid, so nothing is saved', () => {
    const root = world([order([line(med('m1', [['a1', 10], ['a1b', 10]]), { qtyOrdered: 1 })])]);
    const gone = { ...root, assignments: root.assignments.filter((a) => a.id !== 'a1b'), orders: root.orders };
    // the reference check would refuse this root, so only the skipping is checked
    const r = receiveOrder(gone, 'ox', [got(0, 1)], TODAY, NOW);
    expect(r.ok).toBe(false); // invalid root out -> error; the order itself is unchanged
  });
  it('never counted: counting starts from what came, and it is reported', () => {
    const root = world([order([line(med('m1', [['a1c', 10]]), { qtyOrdered: 1 })])]);
    const r = receive(root, [got(0, 1)]);
    expect(asg(r.root, 'a1c').stock).toEqual({ kind: 'count', strips: 0, loose: 10, countedOn: TODAY });
    expect(r.startedCount).toEqual(['สมาชิก ค']);
  });
});

describe('safety', () => {
  it('a refill that fails gives an error and the same root', () => {
    // a medicine of kind other whose two people count in different kinds: the second refill is refused by refillStock
    const base = world();
    const ao3: Assignment = { id: 'ao3', medicationId: 'mo', personId: 'p3', schedule: SCHED, stock: { kind: 'volume', ml: 5, countedOn: TODAY }, status: 'active', createdAt: NOW };
    const root = { ...base, assignments: [...base.assignments, ao3], orders: [order([line(med('mo', [['ao2', 5], ['ao3', 5]]), { qtyOrdered: 10, sellUnit: 'ซอง', perSellUnit: 1 })])] };
    expect(rootSchema.safeParse(root).success).toBe(true);
    const before = JSON.stringify(root);
    const r = receiveOrder(root, 'ox', [got(0, 10)], TODAY, NOW);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(root)).toBe(before);
  });
  it('all or nothing: a good line before a bad one changes nothing', () => {
    const root = world([order([line(med('m1', [['a1', 20]])), line(med('m4', [['a4', 1]]), { sellUnit: 'หลอด', perSellUnit: 1 })])]);
    const r = receiveOrder(root, 'ox', [got(0, 2), got(1, 1.5)], TODAY, NOW); // 1.5 tubes
    expect(r.ok).toBe(false);
    expect(asg(root, 'a1').stock).toMatchObject({ strips: 2, loose: 3 });
  });
  it.each(['received', 'cancelled'] as const)('refuses a %s order', (status) => {
    const root = world([order([line(med('m1', [['a1', 20]]))], status)]);
    const r = receiveOrder(root, 'ox', [got(0, 1)], TODAY, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/[ก-๙]/);
  });
  it('refuses an unknown order, a bad line index, a negative amount and a repeated line', () => {
    const root = world([order([line(med('m1', [['a1', 20]]))])]);
    expect(receiveOrder(root, 'nope', [], TODAY, NOW).ok).toBe(false);
    expect(receiveOrder(root, 'ox', [got(3, 1)], TODAY, NOW).ok).toBe(false);
    expect(receiveOrder(root, 'ox', [got(0, -1)], TODAY, NOW).ok).toBe(false);
    expect(receiveOrder(root, 'ox', [got(0, 1), got(0, 1)], TODAY, NOW).ok).toBe(false);
  });
  it('only the medicines of this order change; everything else is equal', () => {
    const root = world([order([line(med('m1', [['a1', 20]]))])]);
    const r = receive(root, [got(0, 2)]);
    const rest = (x: Root) => ({ ...x, assignments: x.assignments.filter((a) => a.id !== 'a1'), orders: [] });
    expect(rest(r.root)).toEqual(rest(root));
    expect(r.root.events).toEqual(root.events); // no MedEvent
    expect(r.root.events.length).toBe(root.events.length);
  });
  it('does not change the root it was given', () => {
    const root = world([order([line(med('m1', [['a1', 20]]))])]);
    const before = JSON.stringify(root);
    receive(root, [got(0, 2)]);
    expect(JSON.stringify(root)).toBe(before);
  });
  it('the result is valid data', () => {
    const root = world([order([line(med('m1', [['a1', 15], ['a1b', 6]]), { qtyOrdered: 1 }), line({ kind: 'free', name: 'ยาตัวอย่าง H' })])]);
    const r = receive(root, [got(0, 1), got(1, 1, null, false)]);
    expect(rootSchema.safeParse(r.root).success).toBe(true);
  });
});

describe('dropRest', () => {
  it('turns waiting leftovers into dropped, closes as received, stock untouched', () => {
    const root = world([order([line(med('m1', [['a1', 20]]), { qtyReceived: 1, leftover: 'waiting' }), line({ kind: 'house', houseItemId: 'h1' }, { perSellUnit: 1, qtyReceived: 2 })], 'partial')]);
    const r = dropRest(root, 'ox', NOW);
    if (!r.ok) throw new Error(r.error);
    expect(ord(r.root).status).toBe('received');
    expect(ord(r.root).closedAt).toBe(NOW);
    expect(ord(r.root).lines.map((l) => l.leftover)).toEqual(['dropped', null]);
    expect({ ...r.root, orders: [] }).toEqual({ ...root, orders: [] });
    expect(rootSchema.safeParse(r.root).success).toBe(true);
  });
  it.each(['waiting', 'received', 'cancelled'] as const)('refuses a %s order', (status) => {
    const root = world([order([line(med('m1', [['a1', 20]]))], status)]);
    expect(dropRest(root, 'ox', NOW).ok).toBe(false);
  });
  it('refuses an unknown order', () => {
    expect(dropRest(world(), 'nope', NOW).ok).toBe(false);
  });
});

describe('defaultReceive', () => {
  it('expects the rest of every line, never below 0, leftover null', () => {
    const o = order([line(med('m1', [['a1', 20]]), { qtyOrdered: 3, qtyReceived: 1, leftover: 'waiting' }), line({ kind: 'free', name: 'ยาตัวอย่าง H' }, { qtyOrdered: 2, qtyReceived: 3 })]);
    expect(defaultReceive(o)).toEqual([
      { lineIndex: 0, qtyReceivedNow: 2, leftover: null },
      { lineIndex: 1, qtyReceivedNow: 0, leftover: null },
    ]);
  });
});
