import { describe, expect, it } from 'vitest';
import { sampleRootV3, NOW } from './fixtures';
import { buildOrderLines, findNameClash, makeFreeLine, normalizeName, sellUnitsFor } from './orderLines';
import { rootSchema, type Assignment, type Root } from './schema';

const TODAY = '2026-10-28';
const copy = (): Root => structuredClone(sampleRootV3());
const lineOf = (root: Root, key: string) => buildOrderLines(root, TODAY).find((l) => l.key === key);
const asg = (r: Root, id: string): Assignment => r.assignments.find((a) => a.id === id)!;

describe('buildOrderLines - which lines, which ticked', () => {
  it('lists the medicines that are running low, ticked, regular medicines first (house medicine only when low)', () => {
    const lines = buildOrderLines(copy(), TODAY);
    expect(lines.map((l) => l.key)).toEqual(['med:m1', 'med:m2', 'med:m3', 'med:m5']);
    expect(lines.every((l) => l.reason === 'low' && l.ticked)).toBe(true);
  });

  it('need = target over orderDays - stock now (never below 0)', () => {
    const l = lineOf(copy(), 'med:m1')!; // 23 pills left, 2 a day x 30 days
    expect(l.need).toBe(37);
    expect(l.source).toEqual({ kind: 'med', medicationId: 'm1', shares: [{ assignmentId: 'a1', qty: 37 }] });
  });

  it('a medicine with enough stock is not listed', () => {
    const r = copy();
    asg(r, 'a2').stock = { kind: 'count', strips: 20, loose: 0, countedOn: TODAY };
    expect(lineOf(r, 'med:m2')).toBeUndefined();
  });

  it('unknown stock: shown with the whole target, NOT ticked', () => {
    const r = copy();
    asg(r, 'a1').stock = null;
    expect(lineOf(r, 'med:m1')).toMatchObject({ reason: 'unknown', ticked: false, need: 60 });
  });

  it('stopped medicines and people taken out of the house are left out', () => {
    const r = copy();
    asg(r, 'a1').status = 'stopped';
    r.persons.find((p) => p.id === 'p2')!.removedAt = NOW;
    const keys = buildOrderLines(r, TODAY).map((l) => l.key);
    expect(keys).not.toContain('med:m1');
    expect(keys).not.toContain('med:m2');
    expect(keys).toContain('med:m3');
  });

  it('low with nothing to buy (need 0) stays listed but not ticked, with no shares', () => {
    const r = copy();
    r.settings.orderDays = 7;
    r.settings.lowStockDays = 14;
    asg(r, 'a1').stock = { kind: 'count', strips: 2, loose: 0, countedOn: TODAY }; // 20 pills, 14 needed in 7 days, 10 days left (low)
    expect(lineOf(r, 'med:m1')).toMatchObject({ reason: 'low', need: 0, ticked: false, qtyOrdered: 0, source: { shares: [] } });
  });
});

describe('buildOrderLines - tubes (cream / drops)', () => {
  const tube = (r: Root, id: string, opened: boolean, spare: number) => { asg(r, id).stock = { kind: 'tubes', opened, spare }; };

  it('a spare tube = enough = not listed', () => {
    expect(lineOf(copy(), 'med:m4')).toBeUndefined();
  });
  it('no spare but one open (low) -> listed and ticked, 1 tube', () => {
    const r = copy();
    tube(r, 'a4', true, 0);
    expect(lineOf(r, 'med:m4')).toMatchObject({ reason: 'low', ticked: true, need: 1, qtyOrdered: 1, source: { shares: [{ assignmentId: 'a4', qty: 1 }] } });
  });
  it('nothing at all (out) -> listed and ticked', () => {
    const r = copy();
    tube(r, 'a6', false, 0);
    expect(lineOf(r, 'med:m6')).toMatchObject({ reason: 'low', ticked: true, need: 1 });
  });
  it('never counted -> shown, not ticked', () => {
    const r = copy();
    asg(r, 'a4').stock = null;
    expect(lineOf(r, 'med:m4')).toMatchObject({ reason: 'unknown', ticked: false });
  });
  it('two people with the same tube: one line, one tube each when both need one', () => {
    const r = copy();
    tube(r, 'a4', true, 0);
    r.assignments.push({ ...structuredClone(asg(r, 'a4')), id: 'a8', personId: 'p2' });
    const l = lineOf(r, 'med:m4')!;
    expect(l.need).toBe(2);
    expect(l.source).toMatchObject({ shares: [{ assignmentId: 'a4', qty: 1 }, { assignmentId: 'a8', qty: 1 }] });
  });
});

describe('buildOrderLines - the same medicine for several people', () => {
  it('one line, one share per person who needs some', () => {
    const r = copy();
    r.assignments.push({ ...structuredClone(asg(r, 'a1')), id: 'a8', personId: 'p2', schedule: asg(r, 'a2').schedule, stock: { kind: 'count', strips: 1, loose: 0, countedOn: TODAY } });
    const l = buildOrderLines(r, TODAY).filter((x) => x.key === 'med:m1');
    expect(l).toHaveLength(1);
    expect(l[0]!.source).toEqual({ kind: 'med', medicationId: 'm1', shares: [{ assignmentId: 'a1', qty: 37 }, { assignmentId: 'a8', qty: 20 }] });
    expect(l[0]!.need).toBe(57);
  });

  it('a person who has enough is not in the shares, but the line is listed because another is low', () => {
    const r = copy();
    r.assignments.push({ ...structuredClone(asg(r, 'a1')), id: 'a8', personId: 'p2', stock: { kind: 'count', strips: 50, loose: 0, countedOn: TODAY } });
    const l = lineOf(r, 'med:m1')!;
    expect(l.source).toMatchObject({ shares: [{ assignmentId: 'a1', qty: 37 }] });
  });
});

describe('buildOrderLines - house medicines and sell units', () => {
  it('house medicine low or out: 1 sell unit in the unit of its stock, ticked', () => {
    const r = copy();
    r.houseItems[0]!.stock = { qty: 1, unit: 'แผง' };
    expect(lineOf(r, 'house:h1')).toMatchObject({ sellUnit: 'แผง', unit: 'แผง', qtyOrdered: 1, reason: 'low', ticked: true, source: { kind: 'house', houseItemId: 'h1' } });
    r.houseItems[0]!.stock = { qty: 0, unit: 'แผง' };
    expect(lineOf(r, 'house:h1')?.ticked).toBe(true);
  });
  it('house medicine that is ok, not counted, or removed is not listed', () => {
    const r = copy();
    expect(lineOf(r, 'house:h1')).toBeUndefined(); // 2 > lowAt 1
    expect(lineOf(r, 'house:h2')).toBeUndefined(); // not counted
    r.houseItems[0]!.stock = { qty: 0, unit: 'แผง' };
    r.houseItems[0]!.removedAt = NOW;
    expect(lineOf(r, 'house:h1')).toBeUndefined();
  });
  it('a new line starts in the sell unit of the newest remembered price; qtyOrdered is rounded up', () => {
    const l = lineOf(copy(), 'med:m1')!; // newest price: แผง x 10 -> 37 pills = 4 strips
    expect(l).toMatchObject({ sellUnit: 'แผง', perSellUnit: 10, qtyOrdered: 4 });
  });
  it('no price anywhere: starts in the medicine unit', () => {
    expect(lineOf(copy(), 'med:m2')).toMatchObject({ sellUnit: 'แคปซูล', perSellUnit: 1, qtyOrdered: 23 });
  });
  it('sellUnitsFor rounds up, never below 1 when something is needed', () => {
    expect(sellUnitsFor(37, 10)).toBe(4);
    expect(sellUnitsFor(40, 10)).toBe(4);
    expect(sellUnitsFor(0.5, 30)).toBe(1);
    expect(sellUnitsFor(0, 30)).toBe(0);
  });
  it('the lines can be saved in an order: the whole root still passes the schema', () => {
    const r = copy();
    const lines = buildOrderLines(r, TODAY);
    r.orders.push({
      id: 'o9', shopId: 's1', shopName: 'ร้านตัวอย่าง 1', createdAt: NOW, status: 'waiting', includeShipping: false,
      lines: lines.map((l) => ({ source: l.source, qtyOrdered: l.qtyOrdered, sellUnit: l.sellUnit, perSellUnit: l.perSellUnit, qtyReceived: 0, leftover: null })),
    });
    expect(rootSchema.safeParse(r).success).toBe(true);
  });
});

describe('typed medicines and name clashes', () => {
  it('normalizeName ignores case and spaces', () => {
    expect(normalizeName('  Para  Cetamol ')).toBe('paracetamol');
  });
  it('a typed name equal to a medicine in the app (ignoring case and spaces) is a clash', () => {
    const r = copy();
    r.medications[0]!.name = 'Sample Med A';
    expect(findNameClash(r, ' sample  MED a ')).toEqual({ kind: 'med', medicationId: 'm1', name: 'Sample Med A' });
  });
  it('a clash with a house medicine; a removed house medicine does not clash', () => {
    const r = copy();
    expect(findNameClash(r, 'ยาสามัญตัวอย่างก')).toMatchObject({ kind: 'house', houseItemId: 'h1' });
    r.houseItems[0]!.removedAt = NOW;
    expect(findNameClash(r, 'ยาสามัญตัวอย่างก')).toBeNull();
  });
  it('no clash for a new name or an empty one', () => {
    expect(findNameClash(copy(), 'ยาที่ไม่มี')).toBeNull();
    expect(findNameClash(copy(), '   ')).toBeNull();
  });
  it('a typed line: trimmed name, ticked, no price remembered (key is by name), clash reported', () => {
    const r = copy();
    const res = makeFreeLine(r, { name: '  ยาพิมพ์เอง   ตัวอย่าง ', qty: 2, sellUnit: ' กล่อง ' });
    expect(res.ok && res.line).toMatchObject({ key: 'free:ยาพิมพ์เองตัวอย่าง', name: 'ยาพิมพ์เอง ตัวอย่าง', source: { kind: 'free', name: 'ยาพิมพ์เอง ตัวอย่าง' }, qtyOrdered: 2, sellUnit: 'กล่อง', ticked: true, reason: 'typed' });
    expect(res.ok && res.clash).toBeNull();
    const clash = makeFreeLine(r, { name: 'ยาตัวอย่าง a', qty: 1, sellUnit: 'กล่อง' });
    expect(clash.ok && clash.clash).toMatchObject({ kind: 'med', medicationId: 'm1' });
  });
  it('a typed line needs a name (at most 60), a quantity above 0 and a sell unit', () => {
    const r = copy();
    expect(makeFreeLine(r, { name: ' ', qty: 1, sellUnit: 'กล่อง' })).toEqual({ ok: false, errors: { name: 'invalid_name' } });
    expect(makeFreeLine(r, { name: 'x'.repeat(61), qty: 1, sellUnit: 'กล่อง' })).toEqual({ ok: false, errors: { name: 'invalid_name' } });
    expect(makeFreeLine(r, { name: 'ก', qty: 0, sellUnit: 'กล่อง' })).toEqual({ ok: false, errors: { qty: 'invalid_qty' } });
    expect(makeFreeLine(r, { name: 'ก', qty: 1, sellUnit: '' })).toEqual({ ok: false, errors: { sellUnit: 'invalid_sell_unit' } });
  });

  it('perSellUnit left out: the line has none (not 1), and it still fits the order schema', () => {
    const r = copy();
    const res = makeFreeLine(r, { name: 'ยาพิมพ์เอง', qty: 2, sellUnit: 'กล่อง' });
    expect(res.ok && 'perSellUnit' in res.line).toBe(false);
    expect(res.ok && res.line.perSellUnit).toBeUndefined();
    if (!res.ok) throw new Error('expected ok');
    const l = res.line;
    r.orders.push({
      id: 'o9', shopId: 's1', shopName: 'ร้านตัวอย่าง 1', createdAt: NOW, status: 'waiting', includeShipping: false,
      lines: [{ source: l.source, qtyOrdered: l.qtyOrdered, sellUnit: l.sellUnit, qtyReceived: 0, leftover: null }],
    });
    expect(rootSchema.safeParse(r).success).toBe(true);
    expect(makeFreeLine(r, { name: 'ยาพิมพ์เอง', qty: 2, sellUnit: 'กล่อง', perSellUnit: null }).ok).toBe(true);
  });

  it('perSellUnit given is kept as given', () => {
    const res = makeFreeLine(copy(), { name: 'ยาพิมพ์เอง', qty: 2, sellUnit: 'กล่อง', perSellUnit: 10 });
    expect(res.ok && res.line.perSellUnit).toBe(10);
  });

  it('perSellUnit given as 0, negative or NaN -> invalid_per_sell_unit', () => {
    for (const perSellUnit of [0, -3, Number.NaN]) {
      expect(makeFreeLine(copy(), { name: 'ยาพิมพ์เอง', qty: 2, sellUnit: 'กล่อง', perSellUnit })).toEqual({ ok: false, errors: { perSellUnit: 'invalid_per_sell_unit' } });
    }
  });
});
