import { describe, expect, it } from 'vitest';
import { makeBackup, summarizeBackup } from './backup';
import { DEMO_TODAY } from './homeDemo';
import { orderDemoRoot, withDemoShops, withDemoWaitingOrder } from './orderDemo';
import { buildOrderLines, makeFreeLine, makeManualLine, markOnOrder, type DraftLine, type KnownDraftLine } from './orderLines';
import { placeOrder, shortestAssignmentId } from './orderPlace';
import { rootSchema, type Root } from './schema';

const root = (): Root => withDemoShops(orderDemoRoot('normal'));
const NOW = { today: DEMO_TODAY, iso: `${DEMO_TODAY}T10:00:00+07:00` };
let n = 0;
const newId = () => `x${(n += 1)}`;
const suggested = (r = root()): DraftLine[] => buildOrderLines(r, DEMO_TODAY);
const place = (r: Root, lines: DraftLine[], shopId: string, include = true, typed: Record<string, string> = {}) =>
  placeOrder(r, lines, r.shops.find((s) => s.id === shopId), include, typed, NOW, newId);

describe('placeOrder: the order', () => {
  it('one waiting order with every field, the root stays valid and the root passed in is not changed', () => {
    const r = root();
    const lines = suggested(r).filter((l) => l.ticked);
    const res = place(r, lines, 's1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.root.orders).toHaveLength(1);
    expect(res.order).toMatchObject({ shopId: 's1', shopName: 'ร้านทดสอบ ก', status: 'waiting', createdAt: NOW.iso, includeShipping: true, shippingFee: 40 });
    expect(res.order.closedAt).toBeUndefined();
    expect(res.order.lines).toHaveLength(lines.length);
    const m1 = res.order.lines.find((l) => l.source.kind === 'med' && l.source.medicationId === 'm1');
    expect(m1).toMatchObject({ qtyOrdered: 27, sellUnit: 'เม็ด', perSellUnit: 1, unitPrice: 2, qtyReceived: 0, leftover: null });
    expect(rootSchema.safeParse(res.root).success).toBe(true);
    expect(r.orders).toHaveLength(0);
  });
  it('a pick-up shop has no shippingFee; a delivery shop keeps its fee even when the switch is off', () => {
    const r = root();
    const lines = suggested(r).filter((l) => l.ticked);
    const pickup = place(r, lines, 's2');
    expect(pickup.ok && pickup.order.shippingFee).toBeUndefined();
    expect(pickup.ok && 'shippingFee' in pickup.order).toBe(false);
    const off = place(r, lines, 's1', false);
    expect(off.ok && off.order.includeShipping).toBe(false);
    expect(off.ok && off.order.shippingFee).toBe(40);
  });
  it('only ticked lines with a quantity go in; none = refused; no shop (or a shop not in the app) = refused', () => {
    const r = root();
    const all = suggested(r);
    const some = place(r, all.map((l, i) => ({ ...l, ticked: i === 0 })), 's1');
    expect(some.ok && some.order.lines).toHaveLength(1);
    expect(place(r, all.map((l) => ({ ...l, ticked: false })), 's1')).toMatchObject({ ok: false, error: 'no_lines' });
    expect(place(r, all.map((l) => ({ ...l, qtyOrdered: 0 })), 's1')).toMatchObject({ ok: false, error: 'no_lines' });
    expect(placeOrder(r, all, undefined, true, {}, NOW, newId)).toMatchObject({ ok: false, error: 'no_shop' });
    expect(placeOrder(r, all, { id: 'gone', name: 'x', delivery: { kind: 'pickup' } }, true, {}, NOW, newId)).toMatchObject({ ok: false, error: 'no_shop' });
  });
  it('a line with no price at this shop has no unitPrice', () => {
    const r = root();
    const res = place(r, suggested(r).filter((l) => l.ticked), 's3'); // ร้านทดสอบ ค misses m8 and h1
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const price = (k: string) => res.order.lines.find((l) => (l.source.kind === 'med' ? l.source.medicationId : l.source.kind === 'house' ? l.source.houseItemId : '') === k)?.unitPrice;
    expect(price('m1')).toBe(1.5);
    expect(price('m8')).toBeUndefined();
    expect(price('h1')).toBeUndefined();
  });
  it('a typed medicine: perSellUnit only when it was typed, no unitPrice, addToList as chosen', () => {
    const r = root();
    const mk = (extra: object) => {
      const made = makeFreeLine(r, { name: 'ยาตัวอย่าง', qty: 2, sellUnit: 'กล่อง', ...extra });
      if (!made.ok) throw new Error('free line expected');
      return made.line;
    };
    const without = place(r, [mk({ addToList: true })], 's1');
    expect(without.ok && without.order.lines[0]).toMatchObject({ qtyOrdered: 2, sellUnit: 'กล่อง', addToList: true });
    expect(without.ok && 'perSellUnit' in (without.order.lines[0] ?? {})).toBe(false);
    expect(without.ok && without.order.lines[0]?.unitPrice).toBeUndefined();
    const withPer = place(r, [mk({ perSellUnit: 10 })], 's1');
    expect(withPer.ok && withPer.order.lines[0]?.perSellUnit).toBe(10);
    expect(withPer.ok && 'addToList' in (withPer.order.lines[0] ?? {})).toBe(false);
  });
});

describe('placeOrder: prices typed in the same step', () => {
  const missingLines = (r: Root) => suggested(r).filter((l) => l.ticked);
  it('are remembered for the shop (one new row each, today) and become the line unitPrice; blank boxes are skipped', () => {
    const r = root();
    const res = place(r, missingLines(r), 's3', true, { 'med:m8': '80', 'house:h1': '' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.root.prices).toHaveLength(r.prices.length + 1);
    expect(res.root.prices.at(-1)).toMatchObject({ shopId: 's3', item: { kind: 'med', medicationId: 'm8' }, price: 80, sellUnit: 'หลอด', date: DEMO_TODAY });
    expect(res.order.lines.find((l) => l.source.kind === 'med' && l.source.medicationId === 'm8')?.unitPrice).toBe(80);
    expect(rootSchema.safeParse(res.root).success).toBe(true);
  });
  it('0 or text refuses everything and names the box', () => {
    const r = root();
    for (const bad of ['0', 'abc', '-5', '1.2.3']) {
      const res = place(r, missingLines(r), 's3', true, { 'med:m8': bad, 'house:h1': '5' });
      expect(res).toMatchObject({ ok: false, error: 'invalid_price', errors: { 'med:m8': 'invalid_price' } });
    }
  });
  it('a price typed for a unit different from the one remembered adds a row for that unit (the old row stays)', () => {
    const r = root();
    const lines = missingLines(r).map((l) => (l.key === 'med:m8' ? { ...l, sellUnit: 'กล่อง', perSellUnit: 5 } : l));
    const res = place(r, lines, 's1', true, { 'med:m8': '400' });
    expect(res.ok && res.root.prices.filter((p) => p.shopId === 's1' && p.item.kind === 'med' && p.item.medicationId === 'm8')).toHaveLength(2);
    expect(res.ok && res.order.lines.find((l) => l.source.kind === 'med' && l.source.medicationId === 'm8')?.unitPrice).toBe(400);
  });
});

describe('placeOrder: empty shares', () => {
  const emptyLine = (r: Root): KnownDraftLine => {
    const line = makeManualLine(r, { kind: 'med', medicationId: 'm6' }, DEMO_TODAY);
    if (!line || line.source.kind !== 'med') throw new Error('manual line expected');
    return { ...line, source: { ...line.source, shares: [] }, qtyOrdered: 3 }; // stock enough: no shares
  };
  it('gets ONE share = qtyOrdered x perSellUnit for the only user', () => {
    const r = root();
    expect(makeManualLine(r, { kind: 'med', medicationId: 'm6' }, DEMO_TODAY)?.source).toMatchObject({ shares: [] });
    const res = place(r, [{ ...emptyLine(r), perSellUnit: 10 }], 's1');
    expect(res.ok && res.order.lines[0]?.source).toEqual({ kind: 'med', medicationId: 'm6', shares: [{ assignmentId: 'a6', qty: 30 }] });
    expect(res.ok && rootSchema.safeParse(res.root).success).toBe(true);
  });
  it('shares that exist are kept as they are', () => {
    const r = root();
    const line = suggested(r).find((l) => l.key === 'med:m1');
    const res = place(r, [{ ...line!, qtyOrdered: 99 }], 's1');
    expect(res.ok && res.order.lines[0]?.source).toEqual(line?.source);
  });
  it('goes to the person whose stock runs out first; the same stock = the first member in the app', () => {
    const r = root();
    const a6 = r.assignments.find((a) => a.id === 'a6')!;
    const twin = { ...structuredClone(a6), id: 'a6x', personId: 'p1' };
    const base: Root = { ...r, assignments: [...r.assignments, twin] };
    // same stock: member order decides (p1 first, then reversed)
    expect(shortestAssignmentId(base, 'm6', DEMO_TODAY)).toBe('a6x');
    expect(shortestAssignmentId({ ...base, persons: [...base.persons].reverse() }, 'm6', DEMO_TODAY)).toBe('a6');
    // a smaller stock wins whatever the member order
    const few = { ...base, assignments: base.assignments.map((a) => (a.id === 'a6' ? { ...a, stock: { kind: 'count' as const, strips: 0, loose: 2, countedOn: DEMO_TODAY } } : a)) };
    const many = { ...few, assignments: few.assignments.map((a) => (a.id === 'a6x' ? { ...a, stock: { kind: 'count' as const, strips: 0, loose: 900, countedOn: DEMO_TODAY } } : a)) };
    expect(shortestAssignmentId(many, 'm6', DEMO_TODAY)).toBe('a6');
    const res = place(many, [emptyLine(many)], 's1');
    expect(res.ok && res.order.lines[0]?.source).toMatchObject({ shares: [{ assignmentId: 'a6' }] });
  });
  it('nobody uses the medicine = refused', () => {
    const r = root();
    const line = emptyLine(r);
    const none: Root = { ...r, assignments: r.assignments.map((a) => (a.medicationId === 'm6' ? { ...a, status: 'stopped' as const } : a)) };
    expect(place(none, [line], 's1')).toMatchObject({ ok: false, error: 'no_user' });
  });
});

describe('a saved order survives the backup file', () => {
  it('the backup of a root with the new order is restored with the order and the prices', () => {
    const r = root();
    const res = place(r, suggested(r).filter((l) => l.ticked), 's3', true, { 'med:m8': '80' });
    if (!res.ok) throw new Error('order expected');
    const file = makeBackup(res.root, NOW.iso);
    const back = summarizeBackup(file.text);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.root.orders).toEqual(res.root.orders);
      expect(back.root.prices).toEqual(res.root.prices);
    }
  });
});

describe('markOnOrder', () => {
  const waiting = () => withDemoWaitingOrder(orderDemoRoot('normal'));
  it('no open order = the very same lines', () => {
    const r = root();
    const lines = suggested(r);
    expect(markOnOrder(lines, r, true)).toEqual(lines);
  });
  it('a suggested medicine on a waiting order starts unticked with onOrder; the others are untouched', () => {
    const r = waiting();
    const out = markOnOrder(buildOrderLines(r, DEMO_TODAY), r, true);
    const marked = out.filter((l) => l.onOrder);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.ticked).toBe(false);
    const rest = out.filter((l) => !l.onOrder);
    expect(rest).toEqual(buildOrderLines(r, DEMO_TODAY).filter((l) => l.key !== marked[0]?.key));
  });
  it('a medicine added by hand keeps its tick but gets the badge', () => {
    const r = waiting();
    const key = markOnOrder(buildOrderLines(r, DEMO_TODAY), r, true).find((l) => l.onOrder)!.key;
    const hand = makeManualLine(r, { kind: 'med', medicationId: key.replace('med:', '') }, DEMO_TODAY)!;
    const out = markOnOrder([hand], r, false)[0];
    expect(out).toMatchObject({ onOrder: true, ticked: true });
  });
  it('partial: the part still to come counts; fully received, dropped, received or cancelled orders do not', () => {
    const base = waiting();
    const key = markOnOrder(buildOrderLines(base, DEMO_TODAY), base, true).find((l) => l.onOrder)!.key;
    const withOrder = (status: 'partial' | 'received' | 'cancelled' | 'waiting', received: number, leftover: 'waiting' | 'dropped' | null): Root => {
      const o = base.orders[0]!;
      return { ...base, orders: [{ ...o, status, lines: o.lines.map((l) => ({ ...l, qtyReceived: received, leftover })) }] };
    };
    const count = (r: Root) => markOnOrder(buildOrderLines(r, DEMO_TODAY), r, true).filter((l) => l.onOrder && l.key === key).length;
    expect(count(withOrder('partial', 1, 'waiting'))).toBe(1);
    expect(count(withOrder('partial', 1, 'dropped'))).toBe(0);
    expect(count(withOrder('partial', 9999, null))).toBe(0);
    expect(count(withOrder('received', 9999, null))).toBe(0);
    expect(count(withOrder('cancelled', 0, null))).toBe(0);
  });
  it('typed medicines are never matched, and buildOrderLines does not depend on orders', () => {
    const r = waiting();
    const free = makeFreeLine(r, { name: 'ยาตัวอย่าง', qty: 1, sellUnit: 'กล่อง' });
    if (!free.ok) throw new Error('free line expected');
    expect(markOnOrder([free.line], r, true)[0]).toEqual(free.line);
    expect(buildOrderLines(r, DEMO_TODAY)).toEqual(buildOrderLines(orderDemoRoot('normal'), DEMO_TODAY));
  });
});
