import { describe, expect, it } from 'vitest';
import { DEMO_TODAY } from './homeDemo';
import { bangkokDay, historyRows, reorderLines, reorderMessage } from './orderHistory';
import { orderDemoRoot, withDemoWaitingOrder } from './orderDemo';
import { buildOrderLines } from './orderLines';
import { rootSchema, type Order, type Root } from './schema';

const base = (): Root => withDemoWaitingOrder(orderDemoRoot('normal'));
const order = (r: Root): Order => r.orders[0]!;

describe('dates', () => {
  it('shows the Thai day: a UTC time after 17:00 is already the next day', () => {
    expect(bangkokDay('2026-10-28T18:30:00.000Z')).toBe('2026-10-29');
    expect(bangkokDay('2026-10-28T09:00:00+07:00')).toBe('2026-10-28');
    expect(bangkokDay('not a date')).toBeNull();
  });
});

describe('historyRows', () => {
  it('newest first, with the Buddhist date, status words, the count and lines', () => {
    const r = base();
    const o = order(r);
    const older: Order = { ...o, id: 'w0', createdAt: '2026-09-01T10:00:00+07:00', status: 'received', shopName: 'ร้านเก่า' };
    const rows = historyRows({ ...r, orders: [older, o] });
    expect(rows.map((x) => x.id)).toEqual(['w1', 'w0']);
    expect(rows[0]).toMatchObject({ shopName: 'ร้านทดสอบ ก', dateText: '28 ต.ค. 2569', statusText: 'รอรับของ', count: 1, total: null });
    expect(rows[1]).toMatchObject({ dateText: '1 ก.ย. 2569', statusText: 'รับครบแล้ว' });
    expect(rows[0]!.lines[0]!.qty).toMatch(/^\d+ /);
  });

  it('total only when every line has a price; the fee counts only when the order included it', () => {
    const r = base();
    const o = order(r);
    const priced = (inc: boolean): Root => ({ ...r, orders: [{ ...o, includeShipping: inc, lines: o.lines.map((l) => ({ ...l, qtyOrdered: 2, unitPrice: 10 })) }] });
    expect(historyRows(priced(true))[0]!.total).toBe(60);
    expect(historyRows(priced(false))[0]!.total).toBe(20);
  });

  it('a deleted medicine reads "ยาที่ถูกลบแล้ว"', () => {
    const r = base();
    const gone: Root = { ...r, medications: [], assignments: [], events: [] };
    expect(historyRows(gone)[0]!.lines[0]!.name).toBe('ยาที่ถูกลบแล้ว');
  });
});

describe('reorderLines', () => {
  it('makes a ticked "repeat" line with the old quantity and unit, shares from today, and leaves the root alone', () => {
    const r = base();
    const before = JSON.stringify(r);
    const o = order(r);
    const res = reorderLines(r, o, DEMO_TODAY);
    expect(res.skipped).toEqual([]);
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0]).toMatchObject({ reason: 'repeat', ticked: true, qtyOrdered: o.lines[0]!.qtyOrdered, sellUnit: o.lines[0]!.sellUnit });
    expect(JSON.stringify(r)).toBe(before);
  });

  it('skips a deleted medicine, a stopped one, and one already in the list - each with a reason', () => {
    const r = base();
    const o = order(r);
    expect(reorderLines({ ...r, medications: [], assignments: [] }, o, DEMO_TODAY).skipped[0]?.reason).toBe('stopped_or_deleted');
    const stopped: Root = { ...r, assignments: r.assignments.map((a) => ({ ...a, status: 'stopped' as const })) };
    expect(reorderLines(stopped, o, DEMO_TODAY).lines).toEqual([]);
    const key = buildOrderLines(r, DEMO_TODAY).find((l) => l.source.kind === 'med')!.key;
    const have = reorderLines(r, o, DEMO_TODAY, [key]);
    expect(have.lines).toEqual([]);
    expect(have.skipped[0]?.reason).toBe('already_in_list');
    expect(reorderMessage(have)).toContain('ไม่มีรายการที่สั่งซ้ำได้');
  });

  it('house medicine: removed or not counted is skipped; otherwise the quantity is kept in the unit of its stock', () => {
    const r = base();
    const h = r.houseItems.find((x) => x.stock)!;
    const o: Order = { ...order(r), lines: [{ source: { kind: 'house', houseItemId: h.id }, qtyOrdered: 3, sellUnit: 'หน่วยเก่า', qtyReceived: 3, leftover: null }] };
    const ok = reorderLines(r, o, DEMO_TODAY);
    expect(ok.lines[0]).toMatchObject({ key: `house:${h.id}`, qtyOrdered: 3, sellUnit: h.stock!.unit, reason: 'repeat' });
    const removed = { ...r, houseItems: r.houseItems.map((x) => (x.id === h.id ? { ...x, removedAt: '2026-10-01' } : x)) } as Root;
    expect(reorderLines(removed, o, DEMO_TODAY).skipped[0]?.reason).toBe('stopped_or_deleted');
    const noStock = { ...r, houseItems: r.houseItems.map((x) => (x.id === h.id ? { ...x, stock: undefined } : x)) } as Root;
    expect(reorderLines(noStock, o, DEMO_TODAY).skipped[0]?.reason).toBe('not_counted');
  });

  it('typed medicine: made again with kind, strength and the ask-later choice; a name that is now a medicine of the app uses that medicine', () => {
    const r = base();
    const free = (name: string): Order => ({
      ...order(r),
      lines: [{ source: { kind: 'free', name, medKind: 'tablet', strength: { value: 5, unit: 'mg' } }, qtyOrdered: 2, sellUnit: 'กล่อง', perSellUnit: 30, qtyReceived: 2, leftover: null, addToList: true }],
    });
    const again = reorderLines(r, free('ยาพิมพ์เองตัวอย่าง'), DEMO_TODAY);
    expect(again.lines[0]).toMatchObject({ key: 'free:ยาพิมพ์เองตัวอย่าง', reason: 'repeat', qtyOrdered: 2, perSellUnit: 30, medKind: 'tablet', addToList: true });
    const m = r.medications[0]!;
    const used = reorderLines(r, free(m.name), DEMO_TODAY);
    expect(used.lines[0]).toMatchObject({ key: `med:${m.id}`, reason: 'repeat' });
  });

  it('the same medicine twice in an order is put in once', () => {
    const r = base();
    const o = order(r);
    const twice: Order = { ...o, lines: [...o.lines, ...o.lines] };
    const res = reorderLines(r, twice, DEMO_TODAY);
    expect(res.lines).toHaveLength(1);
    expect(res.skipped).toHaveLength(1);
  });

  it('the demo root with its order is valid data', () => {
    expect(rootSchema.safeParse(base()).success).toBe(true);
  });
});
