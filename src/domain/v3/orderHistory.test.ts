import { describe, expect, it } from 'vitest';
import { makeBackup, summarizeBackup } from './backup';
import { DEMO_TODAY } from './homeDemo';
import { HISTORY_FILTERS, bangkokDay, cancelOrder, filterOrders, orderTotal, reorderLines, reorderMessage, stillWaiting, REORDER_TOAST } from './orderHistory';
import { orderDemoRoot, withDemoHistory } from './orderDemo';
import { buildOrderLines, clearOnOrder, markOnOrder } from './orderLines';
import { rootSchema, type Order, type Root } from './schema';

const base = (): Root => withDemoHistory(orderDemoRoot('normal'));
const byId = (r: Root, id: string): Order => r.orders.find((o) => o.id === id)!;
const NOW = '2026-10-28T10:00:00+07:00';

describe('dates', () => {
  it('shows the Thai day: a UTC time after 17:00 is already the next day', () => {
    expect(bangkokDay('2026-10-28T18:30:00.000Z')).toBe('2026-10-29');
    expect(bangkokDay('2026-10-28T09:00:00+07:00')).toBe('2026-10-28');
    expect(bangkokDay('not a date')).toBeNull();
  });
});

describe('the demo house', () => {
  it('has one order of each status and is valid data', () => {
    const r = base();
    expect(r.orders.map((o) => o.status).sort()).toEqual(['cancelled', 'partial', 'received', 'waiting']);
    expect(rootSchema.safeParse(r).success).toBe(true);
  });
});

describe('filterOrders', () => {
  it('all = every order, newest first, the cancelled one too', () => {
    expect(filterOrders(base().orders, 'all').map((o) => o.id)).toEqual(['o1', 'o2', 'o3', 'o4']);
  });
  it('waiting = waiting + partial; received = received; a cancelled order is only under all', () => {
    const r = base();
    expect(filterOrders(r.orders, 'waiting').map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(filterOrders(r.orders, 'received').map((o) => o.id)).toEqual(['o3']);
    for (const f of HISTORY_FILTERS.filter((x) => x !== 'all')) expect(filterOrders(r.orders, f).some((o) => o.status === 'cancelled')).toBe(false);
  });
  it('sorts by createdAt, not by the order of adding; the same time = the later one first', () => {
    const r = base();
    const a = byId(r, 'o1');
    const shuffled = [byId(r, 'o4'), { ...a, id: 'x1', createdAt: '2026-11-01T09:00:00+07:00' }, byId(r, 'o2'), { ...a, id: 'x2', createdAt: '2026-11-01T09:00:00+07:00' }];
    expect(filterOrders(shuffled, 'all').map((o) => o.id)).toEqual(['x2', 'x1', 'o2', 'o4']);
  });
  it('100 orders are all listed (no cap)', () => {
    const r = base();
    const many = Array.from({ length: 100 }, (_, i) => ({ ...byId(r, 'o3'), id: `m${i}` }));
    expect(filterOrders(many, 'all')).toHaveLength(100);
  });
});

describe('orderTotal', () => {
  it('sum of unitPrice x qtyOrdered of priced lines + the shipping fee when it was included; unpriced lines are counted apart', () => {
    const r = base();
    expect(orderTotal(byId(r, 'o1'))).toEqual({ kind: 'amount', amount: 100, unpriced: 1 }); // 30 x 2 + 40 ; one line has no price
    expect(orderTotal(byId(r, 'o2'))).toEqual({ kind: 'amount', amount: 50, unpriced: 1 }); // 10 x 2.5 + 20 x 1.25 ; no fee (not included); the typed line has no price
    expect(orderTotal(byId(r, 'o3'))).toEqual({ kind: 'amount', amount: 190, unpriced: 0 }); // 60 + 90 + 40
  });
  it('the fee is not added when the shipping switch was off, even if a fee was kept', () => {
    const o = { ...byId(base(), 'o3'), includeShipping: false };
    expect(orderTotal(o)).toEqual({ kind: 'amount', amount: 150, unpriced: 0 });
  });
  it('no price on any line = none (a bare fee is never a total)', () => {
    expect(orderTotal(byId(base(), 'o4'))).toEqual({ kind: 'none' });
    expect(orderTotal({ ...byId(base(), 'o4'), includeShipping: true, shippingFee: 40 })).toEqual({ kind: 'none' });
  });
});

describe('stillWaiting', () => {
  it('counts lines not fully received whose rest is not dropped', () => {
    const o = byId(base(), 'o2');
    expect(stillWaiting(o)).toBe(2);
    expect(stillWaiting({ ...o, lines: o.lines.map((l, i) => (i === 1 ? { ...l, leftover: 'dropped' as const } : l)) })).toBe(1);
  });
});

describe('cancelOrder', () => {
  it('a waiting order becomes cancelled with closedAt = now; nothing else changes', () => {
    const r = base();
    const res = cancelOrder(r, 'o1', NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(byId(res.root, 'o1')).toEqual({ ...byId(r, 'o1'), status: 'cancelled', closedAt: NOW });
    expect({ ...res.root, orders: [] }).toEqual({ ...r, orders: [] }); // stock, prices, shops ... untouched
    expect(res.root.orders.filter((o) => o.id !== 'o1')).toEqual(r.orders.filter((o) => o.id !== 'o1'));
    expect(rootSchema.safeParse(res.root).success).toBe(true);
  });
  it('only a waiting order can be cancelled (partial, received, cancelled and unknown are refused)', () => {
    const r = base();
    expect(cancelOrder(r, 'o2', NOW)).toEqual({ ok: false, error: 'not_waiting' });
    expect(cancelOrder(r, 'o3', NOW)).toEqual({ ok: false, error: 'not_waiting' });
    expect(cancelOrder(r, 'o4', NOW)).toEqual({ ok: false, error: 'not_waiting' });
    expect(cancelOrder(r, 'zz', NOW)).toEqual({ ok: false, error: 'not_found' });
  });
  it('a cancelled order survives a backup file and a restore check', () => {
    const cancelled = cancelOrder(base(), 'o1', NOW);
    if (!cancelled.ok) throw new Error('cancel failed');
    const file = makeBackup(cancelled.root, NOW);
    const checked = summarizeBackup(file.text);
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(byId(checked.root, 'o1')).toMatchObject({ status: 'cancelled', closedAt: NOW });
  });
});

describe('medicines of a cancelled order come back as normal suggestions', () => {
  const waitingKey = (r: Root): string => {
    const o = byId(r, 'o1');
    const l = o.lines[0]!;
    return l.source.kind === 'med' ? `med:${l.source.medicationId}` : '';
  };
  it('markOnOrder counts a waiting order but not a cancelled one', () => {
    const r = base();
    const key = waitingKey(r);
    const suggested = buildOrderLines(r, DEMO_TODAY);
    expect(suggested.some((l) => l.key === key)).toBe(true);
    expect(markOnOrder(suggested, r, true).find((l) => l.key === key)).toMatchObject({ onOrder: true, ticked: false });
    const done = cancelOrder(r, 'o1', NOW);
    if (!done.ok) throw new Error('cancel failed');
    const after = markOnOrder(suggested, done.root, true);
    expect(after.find((l) => l.key === key)?.onOrder).toBeUndefined();
  });
  it('clearOnOrder drops the badge and ticks the line again as the suggestion says; a line ticked by hand keeps its tick', () => {
    const r = base();
    const key = waitingKey(r);
    const lines = markOnOrder(buildOrderLines(r, DEMO_TODAY), r, true);
    const done = cancelOrder(r, 'o1', NOW);
    if (!done.ok) throw new Error('cancel failed');
    const fresh = buildOrderLines(done.root, DEMO_TODAY).find((l) => l.key === key)!;
    const cleared = clearOnOrder(lines, done.root, DEMO_TODAY).find((l) => l.key === key)!;
    expect(cleared.onOrder).toBeUndefined();
    expect(cleared.ticked).toBe(fresh.ticked);
    const byHand = lines.map((l) => (l.key === key ? { ...l, ticked: true } : l));
    expect(clearOnOrder(byHand, done.root, DEMO_TODAY).find((l) => l.key === key)).toMatchObject({ ticked: true });
    expect(clearOnOrder(byHand, done.root, DEMO_TODAY).find((l) => l.key === key)?.onOrder).toBeUndefined();
  });
  it('a medicine that is still on another open order keeps its badge', () => {
    const r = base();
    const key = waitingKey(r);
    const lines = markOnOrder(buildOrderLines(r, DEMO_TODAY), r, true);
    const other: Order = { ...byId(r, 'o1'), id: 'o9' };
    const done = cancelOrder({ ...r, orders: [...r.orders, other] }, 'o1', NOW);
    if (!done.ok) throw new Error('cancel failed');
    expect(clearOnOrder(lines, done.root, DEMO_TODAY).find((l) => l.key === key)?.onOrder).toBe(true);
  });
});

describe('reorderLines', () => {
  it('works on a received and on a cancelled order: ticked "repeat" lines with the old quantity and unit, shares from today, no price, root untouched', () => {
    const r = base();
    const before = JSON.stringify(r);
    for (const id of ['o3', 'o4']) {
      const o = byId(r, id);
      const res = reorderLines(r, o, DEMO_TODAY);
      expect(res.skipped).toBe(0);
      expect(res.lines).toHaveLength(o.lines.length);
      res.lines.forEach((l, i) => {
        expect(l).toMatchObject({ reason: 'repeat', ticked: true, qtyOrdered: o.lines[i]!.qtyOrdered, sellUnit: o.lines[i]!.sellUnit });
        expect('unitPrice' in l).toBe(false);
        if (l.source.kind === 'med') expect(l.source.shares.length).toBeGreaterThanOrEqual(0);
      });
    }
    expect(JSON.stringify(r)).toBe(before);
  });
  it('a medicine already in the list is not added again (the line there stays); a medicine twice in the order is added once', () => {
    const r = base();
    const o = byId(r, 'o3');
    const first = o.lines[0]!;
    const key = first.source.kind === 'med' ? `med:${first.source.medicationId}` : '';
    const res = reorderLines(r, o, DEMO_TODAY, [key]);
    expect(res.lines.map((l) => l.key)).not.toContain(key);
    expect(res.skipped).toBe(0);
    expect(reorderLines(r, { ...o, lines: [first, first] }, DEMO_TODAY).lines).toHaveLength(1);
  });
  it('a deleted or stopped medicine is skipped and counted; the rest is still added', () => {
    const r = base();
    const o = byId(r, 'o3');
    const first = o.lines[0]!;
    const medId = first.source.kind === 'med' ? first.source.medicationId : '';
    const stopped: Root = { ...r, assignments: r.assignments.map((a) => (a.medicationId === medId ? { ...a, status: 'stopped' as const } : a)) };
    const a = reorderLines(stopped, o, DEMO_TODAY);
    expect(a.skipped).toBe(1);
    expect(a.lines).toHaveLength(o.lines.length - 1);
    const gone: Root = { ...r, medications: r.medications.filter((m) => m.id !== medId), assignments: r.assignments.filter((x) => x.medicationId !== medId) };
    expect(reorderLines(gone, o, DEMO_TODAY).skipped).toBe(1);
  });
  it('a house medicine that was removed or is not counted is skipped; otherwise it keeps the old quantity in the unit of its stock', () => {
    const r = base();
    const h = r.houseItems.find((x) => x.stock)!;
    const o: Order = { ...byId(r, 'o3'), lines: [{ source: { kind: 'house', houseItemId: h.id }, qtyOrdered: 3, sellUnit: 'หน่วยเก่า', qtyReceived: 3, leftover: null }] };
    expect(reorderLines(r, o, DEMO_TODAY).lines[0]).toMatchObject({ key: `house:${h.id}`, qtyOrdered: 3, sellUnit: h.stock!.unit, reason: 'repeat' });
    const removed = { ...r, houseItems: r.houseItems.map((x) => (x.id === h.id ? { ...x, removedAt: '2026-10-01' } : x)) } as Root;
    expect(reorderLines(removed, o, DEMO_TODAY).skipped).toBe(1);
    const noStock = { ...r, houseItems: r.houseItems.map((x) => (x.id === h.id ? { ...x, stock: undefined } : x)) } as Root;
    expect(reorderLines(noStock, o, DEMO_TODAY).skipped).toBe(1);
  });
  it('a typed medicine comes back typed (name, kind, strength, ask-later) - even when its name is now a medicine of the app', () => {
    const r = base();
    const typed = (name: string): Order => ({
      ...byId(r, 'o3'),
      lines: [{ source: { kind: 'free', name, medKind: 'tablet', strength: { value: 5, unit: 'mg' } }, qtyOrdered: 2, sellUnit: 'กล่อง', perSellUnit: 30, qtyReceived: 2, leftover: null, addToList: true }],
    });
    expect(reorderLines(r, typed('ยาพิมพ์เองตัวอย่าง'), DEMO_TODAY).lines[0]).toMatchObject({ key: 'free:ยาพิมพ์เองตัวอย่าง', reason: 'repeat', ticked: true, qtyOrdered: 2, perSellUnit: 30, medKind: 'tablet', strength: { value: 5, unit: 'mg' }, addToList: true });
    const clash = reorderLines(r, typed(r.medications[0]!.name), DEMO_TODAY).lines[0]!;
    expect(clash.source.kind).toBe('free');
  });
  it('the floating message', () => {
    expect(reorderMessage({ skipped: 0 })).toBe('คัดลอกรายการมาแล้ว ใช้ราคาล่าสุดของแต่ละร้าน');
    expect(reorderMessage({ skipped: 2 })).toBe(`${REORDER_TOAST} · ข้าม 2 รายการที่ไม่มีในรายการยาแล้ว`);
  });
});
