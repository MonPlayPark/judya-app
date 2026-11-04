import { describe, expect, it } from 'vitest';
import { buildOrder, buildShares, shortestFirst } from './orderActions';
import { DEMO_TODAY } from './homeDemo';
import { orderDemoRoot, withDemoShops } from './orderDemo';
import { buildOrderLines, markOnOrder, type DraftLine, type KnownDraftLine } from './orderLines';
import { saveShopPrices } from './orderShops';
import { rootSchema, type Order, type Root } from './schema';

const root = (): Root => withDemoShops(orderDemoRoot('normal'));
const NOW = `${DEMO_TODAY}T10:00:00+07:00`;
let n = 0;
const newId = () => `x${(n += 1)}`;
const tickedAll = (lines: DraftLine[]): DraftLine[] => lines.map((l) => ({ ...l, ticked: true }));

describe('buildOrder', () => {
  it('makes one waiting order with the shop name, the fee and prices; the root stays valid', () => {
    const r = root();
    const lines = tickedAll(buildOrderLines(r, DEMO_TODAY));
    const shop = r.shops.find((s) => s.id === 's1');
    const res = buildOrder(r, lines, shop, true, DEMO_TODAY, NOW, newId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(rootSchema.safeParse(res.root).success).toBe(true);
    expect(res.root.orders).toHaveLength(r.orders.length + 1);
    const o = res.order;
    expect(o).toMatchObject({ shopId: 's1', shopName: shop?.name, status: 'waiting', createdAt: NOW, includeShipping: true, shippingFee: 40 });
    expect(o.lines).toHaveLength(lines.length);
    expect(o.lines.every((l) => l.qtyReceived === 0 && l.leftover === null)).toBe(true);
    expect(o.lines.some((l) => l.unitPrice !== undefined)).toBe(true);
    expect(r.orders).toHaveLength(0); // the root passed in is not changed
  });
  it('a pick-up shop keeps no shippingFee; includeShipping follows the switch', () => {
    const r = root();
    const res = buildOrder(r, tickedAll(buildOrderLines(r, DEMO_TODAY)), r.shops.find((s) => s.id === 's2'), false, DEMO_TODAY, NOW, newId);
    expect(res.ok && res.order.shippingFee).toBeUndefined();
    expect(res.ok && res.order.includeShipping).toBe(false);
  });
  it('only ticked lines go in; nothing ticked or no shop is refused', () => {
    const r = root();
    const lines = buildOrderLines(r, DEMO_TODAY).map((l, i) => ({ ...l, ticked: i === 0 }));
    const one = buildOrder(r, lines, r.shops[0], true, DEMO_TODAY, NOW, newId);
    expect(one.ok && one.order.lines).toHaveLength(1);
    expect(buildOrder(r, lines.map((l) => ({ ...l, ticked: false })), r.shops[0], true, DEMO_TODAY, NOW, newId)).toEqual({ ok: false, error: 'no_lines' });
    expect(buildOrder(r, lines, undefined, true, DEMO_TODAY, NOW, newId)).toEqual({ ok: false, error: 'no_shop' });
  });
  it('prices typed in the same step are in the saved root together with the order (one root, one write)', () => {
    const r = root();
    const lines = tickedAll(buildOrderLines(r, DEMO_TODAY));
    const missing = lines.filter((l): l is KnownDraftLine => l.source.kind !== 'free');
    const typed = Object.fromEntries(missing.map((l) => [l.key, '10']));
    const priced = saveShopPrices(r, 's3', missing, typed, DEMO_TODAY, newId);
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    const res = buildOrder(priced.root, lines, r.shops.find((s) => s.id === 's3'), true, DEMO_TODAY, NOW, newId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.root.prices.length).toBeGreaterThan(r.prices.length);
    expect(res.root.orders).toHaveLength(1);
  });
  it('a typed medicine goes in without a price', () => {
    const r = root();
    const free: DraftLine = { key: 'free:x', source: { kind: 'free', name: 'ยาตัวอย่าง' }, name: 'ยาตัวอย่าง', unit: 'กล่อง', need: 2, sellUnit: 'กล่อง', qtyOrdered: 2, reason: 'typed', ticked: true, addToList: true };
    const res = buildOrder(r, [free], r.shops[0], true, DEMO_TODAY, NOW, newId);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.order.lines[0]).toMatchObject({ qtyOrdered: 2, addToList: true, qtyReceived: 0 });
    if (res.ok) expect(res.order.lines[0]?.unitPrice).toBeUndefined();
  });
});

describe('buildShares', () => {
  const medLine = (r: Root): KnownDraftLine => {
    const l = buildOrderLines(r, DEMO_TODAY).find((x) => x.source.kind === 'med' && x.source.shares.length > 0 && x.source.shares.length <= 1);
    if (!l) throw new Error('no med line in the demo');
    return l;
  };
  it('keeps the suggested shares when the quantity matches, and the total always equals qty x perSellUnit', () => {
    const r = root();
    const line = medLine(r);
    for (const qty of [1, 2, 5]) {
      const shares = buildShares(r, { ...line, qtyOrdered: qty }, DEMO_TODAY);
      expect(shares).not.toBeNull();
      const total = (shares ?? []).reduce((s, x) => s + x.qty, 0);
      expect(total).toBeCloseTo(qty * line.perSellUnit, 6);
      expect((shares ?? []).every((x) => x.qty > 0)).toBe(true);
    }
  });
  it('a line with no shares (nothing needed) goes whole to the person running out soonest', () => {
    const r = root();
    const line = medLine(r);
    if (line.source.kind !== 'med') throw new Error('med line expected');
    const empty: KnownDraftLine = { ...line, source: { ...line.source, shares: [] }, qtyOrdered: 2 };
    const shares = buildShares(r, empty, DEMO_TODAY);
    expect(shares).toHaveLength(1);
    expect(shares?.[0]?.assignmentId).toBe(shortestFirst(r, line.source.medicationId, DEMO_TODAY)[0]);
  });
  it('a house medicine has no shares (null)', () => {
    const r = root();
    const h = buildOrderLines(r, DEMO_TODAY).find((x) => x.source.kind === 'house');
    expect(h && buildShares(r, h as KnownDraftLine, DEMO_TODAY)).toBeNull();
  });
});

describe('markOnOrder', () => {
  const withOrder = (status: Order['status'], extra: { qtyReceived?: number; leftover?: 'waiting' | 'dropped' | null } = {}): { r: Root; lines: DraftLine[] } => {
    const r = root();
    const lines = tickedAll(buildOrderLines(r, DEMO_TODAY));
    const made = buildOrder(r, lines, r.shops[0], true, DEMO_TODAY, NOW, newId);
    if (!made.ok) throw new Error('order expected');
    const o: Order = { ...made.order, status, lines: made.order.lines.map((l) => ({ ...l, qtyReceived: extra.qtyReceived ?? l.qtyReceived, leftover: extra.leftover ?? l.leftover })) };
    return { r: { ...made.root, orders: [o] }, lines };
  };
  it('a medicine on a waiting order starts unticked with the shop and the amount still to come', () => {
    const { r, lines } = withOrder('waiting');
    const out = markOnOrder(lines, r);
    expect(out.every((l) => !l.ticked && l.onOrder !== undefined)).toBe(true);
    expect(out[0]?.onOrder?.shopName).toBe(r.orders[0]?.shopName);
    expect(out[0]?.onOrder?.qtyLeft).toBe(lines[0]?.qtyOrdered);
  });
  it('partial: only the part not yet received counts; fully received or dropped lines do not', () => {
    const { r, lines } = withOrder('partial', { qtyReceived: 1, leftover: 'waiting' });
    const first = markOnOrder(lines, r)[0];
    expect(first?.onOrder?.qtyLeft).toBe(Math.max((lines[0]?.qtyOrdered ?? 0) - 1, 0));
    const dropped = withOrder('partial', { qtyReceived: 1, leftover: 'dropped' });
    expect(markOnOrder(dropped.lines, dropped.r).every((l) => l.onOrder === undefined && l.ticked)).toBe(true);
    const done = withOrder('received', { qtyReceived: 99 });
    expect(markOnOrder(done.lines, done.r).every((l) => l.onOrder === undefined && l.ticked)).toBe(true);
  });
  it('a cancelled order and typed medicines are ignored; buildOrderLines itself is not changed by orders', () => {
    const { r, lines } = withOrder('cancelled');
    expect(markOnOrder(lines, r).every((l) => l.onOrder === undefined)).toBe(true);
    const other = withOrder('waiting');
    expect(buildOrderLines(other.r, DEMO_TODAY)).toEqual(buildOrderLines(root(), DEMO_TODAY));
  });
});
