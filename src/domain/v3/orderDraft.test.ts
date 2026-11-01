import { describe, expect, it } from 'vitest';
import { NOW, sampleRootV3 } from './fixtures';
import { makeBackup, summarizeBackup } from './backup';
import {
  KIND_ORDER, REASON_LABEL, SELL_UNITS, asksPerSellUnit, changeSellUnit, defaultPerSellUnit, hasLine, orderCandidates, perUnitWord, qtyText, sellUnitChoices, stepLine,
} from './orderDraft';
import { buildOrderLines, makeFreeLine, makeManualLine, type KnownDraftLine } from './orderLines';
import { PREV_KEY, STORAGE_KEY, loadRoot, restoreRoot, type KeyValueStore } from './storage';
import { orderSchema, rootSchema, type Assignment, type Medication, type Order, type Root } from './schema';

const TODAY = '2026-10-28';
const copy = (): Root => structuredClone(sampleRootV3());
const asg = (r: Root, id: string): Assignment => r.assignments.find((a) => a.id === id)!;
const med = (r: Root, id: string): Medication => r.medications.find((m) => m.id === id)!;
const manual = (r: Root, id: string): KnownDraftLine => makeManualLine(r, { kind: 'med', medicationId: id }, TODAY)!;

describe('C. sell-as choices by kind (owner answer 5)', () => {
  it('has the exact list for every kind', () => {
    expect(KIND_ORDER).toHaveLength(7);
    expect(sellUnitChoices('tablet')).toEqual({ units: ['กล่อง', 'แผง', 'ขวด', 'เม็ด'], custom: false });
    expect(sellUnitChoices('capsule')).toEqual({ units: ['กล่อง', 'แผง', 'ขวด', 'แคปซูล'], custom: false });
    expect(sellUnitChoices('liquid')).toEqual({ units: ['ขวด'], custom: false });
    expect(sellUnitChoices('cream')).toEqual({ units: ['หลอด'], custom: false });
    expect(sellUnitChoices('sachet')).toEqual({ units: ['กล่อง', 'ซอง'], custom: false });
    expect(sellUnitChoices('drops')).toEqual({ units: ['ขวด'], custom: false });
    expect(sellUnitChoices('other')).toEqual({ units: [], custom: true });
  });
  it('keeps the unit a line already has (e.g. from a remembered price) in the list, once', () => {
    expect(sellUnitChoices('tablet', 'ถุง').units).toEqual(['กล่อง', 'แผง', 'ขวด', 'เม็ด', 'ถุง']);
    expect(sellUnitChoices('tablet', 'แผง').units).toEqual(SELL_UNITS.tablet);
    expect(sellUnitChoices('other', 'ถุง')).toEqual({ units: [], custom: true });
  });
  it('asks "count per sell unit" only when the unit is not the smallest one and not cream / drops', () => {
    expect(asksPerSellUnit('tablet', 'กล่อง')).toBe(true);
    expect(asksPerSellUnit('tablet', 'เม็ด')).toBe(false);
    expect(asksPerSellUnit('liquid', 'ขวด')).toBe(true);
    expect(asksPerSellUnit('cream', 'หลอด')).toBe(false);
    expect(asksPerSellUnit('drops', 'ขวด')).toBe(false);
    expect(asksPerSellUnit('other', 'ถุง')).toBe(true);
    expect(asksPerSellUnit('other', '  ')).toBe(false);
    expect(perUnitWord('tablet')).toBe('เม็ด');
    expect(perUnitWord('liquid')).toBe('มล.');
  });
  it('reads a starting count from the pack, or null', () => {
    const r = copy();
    expect(defaultPerSellUnit(med(r, 'm1'), 'แผง')).toBe(10); // strip pack
    expect(defaultPerSellUnit(med(r, 'm1'), 'กล่อง')).toBeNull();
    expect(defaultPerSellUnit(med(r, 'm1'), 'เม็ด')).toBe(1);
    expect(defaultPerSellUnit(med(r, 'm2'), 'กล่อง')).toBe(30);
    expect(defaultPerSellUnit(med(r, 'm2'), 'แผง')).toBe(10);
    expect(defaultPerSellUnit(med(r, 'm3'), 'ขวด')).toBe(60);
    expect(defaultPerSellUnit(med(r, 'm4'), 'หลอด')).toBe(1);
    expect(defaultPerSellUnit(med(r, 'm5'), 'กล่อง')).toBe(10);
    expect(defaultPerSellUnit(med(r, 'm5'), 'ซอง')).toBe(1);
    expect(defaultPerSellUnit(med(r, 'm6'), 'ขวด')).toBe(1);
    expect(defaultPerSellUnit(med(r, 'm7'), 'ถุง')).toBeNull();
  });
});

describe('quantity text on a line', () => {
  const line = (over: Partial<KnownDraftLine>): KnownDraftLine => ({ ...manual(copy(), 'm1'), ...over });
  it('pills: the big number is pills, the note gives the sell units', () => {
    expect(qtyText(line({ sellUnit: 'กล่อง', perSellUnit: 30, qtyOrdered: 2 }), 'tablet')).toEqual({ big: 60, bigUnit: 'เม็ด', note: '= 2 กล่อง (60 เม็ด)' });
  });
  it('the pill itself as the unit: no note', () => {
    expect(qtyText(line({ sellUnit: 'เม็ด', unit: 'เม็ด', perSellUnit: 1, qtyOrdered: 37 }), 'tablet')).toEqual({ big: 37, bigUnit: 'เม็ด', note: null });
  });
  it('liquid, cream, drops and house medicine keep their own unit, no note', () => {
    expect(qtyText(line({ sellUnit: 'ขวด', perSellUnit: 60, qtyOrdered: 2 }), 'liquid')).toEqual({ big: 2, bigUnit: 'ขวด', note: null });
    expect(qtyText(line({ sellUnit: 'หลอด', perSellUnit: 1, qtyOrdered: 1 }), 'cream')).toEqual({ big: 1, bigUnit: 'หลอด', note: null });
    expect(qtyText(line({ sellUnit: 'ขวด', perSellUnit: 1, qtyOrdered: 3 }), 'drops').note).toBeNull();
    const house = makeManualLine(copy(), { kind: 'house', houseItemId: 'h1' }, TODAY)!;
    expect(qtyText(house, 'tablet')).toEqual({ big: 1, bigUnit: 'แผง', note: null });
  });
  it('a typed line: the count only when the owner gave it', () => {
    const r = copy();
    const without = makeFreeLine(r, { name: 'ยาใหม่ ก', qty: 2, sellUnit: 'กล่อง', medKind: 'tablet' });
    const withPer = makeFreeLine(r, { name: 'ยาใหม่ ข', qty: 2, sellUnit: 'กล่อง', perSellUnit: 10, medKind: 'tablet' });
    if (!without.ok || !withPer.ok) throw new Error('lines');
    expect(qtyText(without.line, 'tablet')).toEqual({ big: 2, bigUnit: 'กล่อง', note: null });
    expect(qtyText(withPer.line, 'tablet')).toEqual({ big: 20, bigUnit: 'เม็ด', note: '= 2 กล่อง (20 เม็ด)' });
  });
  it('sachet counts in sachets', () => {
    expect(qtyText(line({ sellUnit: 'กล่อง', perSellUnit: 10, qtyOrdered: 3 }), 'sachet')).toEqual({ big: 30, bigUnit: 'ซอง', note: '= 3 กล่อง (30 ซอง)' });
  });
});

describe('+ / - and reason labels', () => {
  it('steps by one sell unit, never below 1; + ticks, - keeps the tick', () => {
    const l = { ...manual(copy(), 'm1'), qtyOrdered: 1, ticked: false };
    expect(stepLine(l, -1)).toMatchObject({ qtyOrdered: 1, ticked: false });
    expect(stepLine(l, 1)).toMatchObject({ qtyOrdered: 2, ticked: true });
    expect(stepLine({ ...l, qtyOrdered: 5, ticked: true }, -1)).toMatchObject({ qtyOrdered: 4, ticked: true });
  });
  it('has a word for every reason', () => {
    expect(REASON_LABEL).toEqual({ low: 'ใกล้หมด', unknown: 'ไม่ทราบสต็อก', typed: 'ยาใหม่ ยังไม่อยู่ในรายการยา', manual: 'เลือกเพิ่มเอง' });
  });
});

describe('A. a line for a medicine the owner picked', () => {
  it('regular medicine: reason manual, ticked, 1 sell unit, no need to be low', () => {
    const r = copy();
    asg(r, 'a2').stock = { kind: 'count', strips: 20, loose: 0, countedOn: TODAY }; // plenty
    const l = manual(r, 'm2');
    expect(l).toMatchObject({ key: 'med:m2', reason: 'manual', ticked: true, qtyOrdered: 1, name: 'ยาตัวอย่าง B' });
    expect(l.source).toMatchObject({ kind: 'med', medicationId: 'm2', shares: [] }); // nobody needs anything: the save step rebuilds shares
  });
  it('uses the 11.1 start unit: a remembered price, else the medicine own unit', () => {
    const r = copy();
    expect(manual(r, 'm1')).toMatchObject({ sellUnit: 'แผง', perSellUnit: 10 }); // newest remembered price (pr1, today)
    expect(manual(r, 'm2')).toMatchObject({ sellUnit: 'แคปซูล', perSellUnit: 1 });
  });
  it('cream / drops start in the tube / bottle, a liquid in a bottle of its pack', () => {
    const r = copy();
    expect(manual(r, 'm4')).toMatchObject({ sellUnit: 'หลอด', perSellUnit: 1 });
    expect(manual(r, 'm6')).toMatchObject({ sellUnit: 'ขวด', perSellUnit: 1 });
    expect(manual(r, 'm3')).toMatchObject({ sellUnit: 'ขวด', perSellUnit: 60 });
  });
  it('keeps the people who really need it as shares', () => {
    const l = manual(copy(), 'm1'); // a1 has 23 pills, 30 days at 2 a day
    expect(l.source).toMatchObject({ kind: 'med', shares: [{ assignmentId: 'a1', qty: 37 }] });
  });
  it('house medicine: its stock unit, 1, reason manual, ticked', () => {
    expect(makeManualLine(copy(), { kind: 'house', houseItemId: 'h1' }, TODAY)).toMatchObject({ key: 'house:h1', reason: 'manual', ticked: true, sellUnit: 'แผง', perSellUnit: 1, qtyOrdered: 1 });
  });
  it('null for: unknown id, stopped medicine, house medicine not counted, removed house medicine', () => {
    const r = copy();
    expect(makeManualLine(r, { kind: 'med', medicationId: 'nope' }, TODAY)).toBeNull();
    expect(makeManualLine(r, { kind: 'med', medicationId: 'm7' }, TODAY)).toBeNull(); // only a stopped assignment
    expect(makeManualLine(r, { kind: 'house', houseItemId: 'h2' }, TODAY)).toBeNull(); // no stock = no unit
    r.houseItems.find((h) => h.id === 'h1')!.removedAt = NOW;
    expect(makeManualLine(r, { kind: 'house', houseItemId: 'h1' }, TODAY)).toBeNull();
  });
  it('does not change how the suggested lines are made (ticked / reason stay)', () => {
    const lines = buildOrderLines(copy(), TODAY);
    expect(lines.every((l) => l.reason !== 'manual')).toBe(true);
  });
});

describe('E. change the sell unit of a line of the app', () => {
  it('returns a new line, keeps the amount of medicine, and does not touch the root or the old line', () => {
    const r = copy();
    const before = JSON.stringify(r);
    const old = manual(r, 'm1'); // 1 x แผง of 10
    const frozen = JSON.stringify(old);
    const res = changeSellUnit({ ...old, qtyOrdered: 4 }, { sellUnit: 'กล่อง', perSellUnit: 30 });
    if (!res.ok) throw new Error('should work');
    expect(res.line).toMatchObject({ sellUnit: 'กล่อง', perSellUnit: 30, qtyOrdered: 2, key: 'med:m1' }); // 40 pills -> 2 boxes of 30
    expect(JSON.stringify(r)).toBe(before);
    expect(JSON.stringify(old)).toBe(frozen);
    expect(res.line).not.toBe(old);
  });
  it('rounds up, at least 1, trims the unit, keeps tick and reason', () => {
    const l = { ...manual(copy(), 'm2'), ticked: false };
    const res = changeSellUnit(l, { sellUnit: '  ขวด ', perSellUnit: 100 });
    expect(res).toMatchObject({ ok: true, line: { sellUnit: 'ขวด', qtyOrdered: 1, ticked: false, reason: 'manual' } });
  });
  it('refuses a house medicine and a typed medicine', () => {
    const house = makeManualLine(copy(), { kind: 'house', houseItemId: 'h1' }, TODAY)!;
    expect(changeSellUnit(house, { sellUnit: 'ขวด', perSellUnit: 1 })).toMatchObject({ ok: false, error: 'house_locked' });
    const free = makeFreeLine(copy(), { name: 'ยาใหม่ ค', qty: 1, sellUnit: 'ขวด' });
    if (!free.ok) throw new Error('free');
    expect(changeSellUnit(free.line, { sellUnit: 'กล่อง', perSellUnit: 1 })).toMatchObject({ ok: false, error: 'not_in_app' });
  });
  it('refuses an empty / long unit and a count that is not above 0, reporting every wrong field', () => {
    const l = manual(copy(), 'm1');
    expect(changeSellUnit(l, { sellUnit: '  ', perSellUnit: 0 })).toEqual({ ok: false, error: 'invalid', errors: { sellUnit: 'invalid_sell_unit', perSellUnit: 'invalid_per_sell_unit' } });
    expect(changeSellUnit(l, { sellUnit: 'ก'.repeat(21), perSellUnit: 5 })).toMatchObject({ ok: false, errors: { sellUnit: 'invalid_sell_unit' } });
    expect(changeSellUnit(l, { sellUnit: 'กล่อง', perSellUnit: Number.NaN })).toMatchObject({ ok: false, errors: { perSellUnit: 'invalid_per_sell_unit' } });
    expect(changeSellUnit(l, { sellUnit: 'กล่อง', perSellUnit: -1 })).toMatchObject({ ok: false });
  });
});

describe('B. the medicines to pick from', () => {
  it('lists regular and counted house medicines, nearest to empty first, without stopped ones', () => {
    const r = copy();
    const rows = orderCandidates(r, TODAY, []);
    expect(rows.map((c) => c.key)).not.toContain('med:m7'); // stopped
    expect(rows.map((c) => c.key)).not.toContain('house:h2'); // house medicine not counted
    expect(rows.map((c) => c.key)).toContain('house:h1');
    const first = rows[0]!;
    expect(first.sub).toMatch(/^(เหลือ \d+ วัน|สำรอง \d+ )/);
  });
  it('sub line: days and member name, unknown stock, tubes by the tube', () => {
    const r = copy();
    asg(r, 'a2').stock = null;
    const rows = orderCandidates(r, TODAY, []);
    const by = (k: string) => rows.find((c) => c.key === k)!;
    expect(by('med:m1').sub).toBe('เหลือ 11 วัน · สมาชิก ก'); // 23 pills at 2 a day, "11 days then the 12th cannot be covered"
    expect(by('med:m2').sub).toBe('ไม่ทราบสต็อก · สมาชิก ข');
    expect(by('med:m4').sub).toBe('สำรอง 1 หลอด · สมาชิก ค');
    expect(by('med:m6').sub).toBe('สำรอง 2 ขวด · สมาชิก ค');
    expect(by('house:h1').sub).toBe('ยาสามัญ · เหลือ 2 แผง');
  });
  it('order: running out first, unknown stock last; tubes with none first', () => {
    const r = copy();
    asg(r, 'a2').stock = null; // unknown -> last
    asg(r, 'a6').stock = { kind: 'tubes', opened: false, spare: 0 }; // out
    const keys = orderCandidates(r, TODAY, []).map((c) => c.key);
    expect(keys[0]).toBe('med:m6');
    expect(keys.at(-1)).toBe('med:m2');
    const days = (k: string) => orderCandidates(r, TODAY, []).find((c) => c.key === k)!.sub;
    expect(keys.indexOf('med:m1')).toBeLessThan(keys.indexOf('med:m4')); // 11 days before a spare tube
    expect(days('med:m1')).toContain('เหลือ');
  });
  it('same medicine for two people is one row: the one who runs out first, all names', () => {
    const r = copy();
    r.assignments.push({ ...asg(r, 'a1'), id: 'a1b', personId: 'p2', stock: { kind: 'count', strips: 0, loose: 4, countedOn: TODAY } });
    const rows = orderCandidates(r, TODAY, []).filter((c) => c.key === 'med:m1');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sub).toBe('เหลือ 2 วัน · สมาชิก ก, สมาชิก ข'); // 4 pills at 2 a day = 2 days (the other person has 11)
  });
  it('leaves out what is already in the draft, people taken out, and removed house medicines', () => {
    const r = copy();
    expect(orderCandidates(r, TODAY, ['med:m1', 'house:h1']).map((c) => c.key)).not.toEqual(expect.arrayContaining(['med:m1']));
    expect(orderCandidates(r, TODAY, ['med:m1', 'house:h1']).some((c) => c.key === 'house:h1')).toBe(false);
    r.persons.find((p) => p.id === 'p3')!.removedAt = NOW;
    expect(orderCandidates(r, TODAY, []).map((c) => c.key)).not.toContain('med:m4');
    r.houseItems.find((h) => h.id === 'h1')!.removedAt = NOW;
    expect(orderCandidates(r, TODAY, []).map((c) => c.key)).not.toContain('house:h1');
  });
  it('a medicine with no active user is not offered (its order would have nobody to go to)', () => {
    const r = copy();
    asg(r, 'a5').status = 'stopped';
    expect(orderCandidates(r, TODAY, []).map((c) => c.key)).not.toContain('med:m5');
  });
  it('search ignores case and every space; no match = empty list', () => {
    const r = copy();
    expect(orderCandidates(r, TODAY, [], 'ยาตัวอย่างa').map((c) => c.key)).toEqual(['med:m1']);
    expect(orderCandidates(r, TODAY, [], '  ยา ตัวอย่าง  A ').map((c) => c.key)).toEqual(['med:m1']);
    expect(orderCandidates(r, TODAY, [], 'zzz')).toEqual([]);
    expect(orderCandidates(r, TODAY, [], '').length).toBeGreaterThan(3);
  });
  it('the name shows the strength', () => {
    expect(orderCandidates(copy(), TODAY, [], 'ตัวอย่าง A')[0]!.name).toBe('ยาตัวอย่าง A 500 mg');
  });
  it('hasLine finds a key', () => {
    const l = manual(copy(), 'm1');
    expect(hasLine([l], 'med:m1')).toBe(true);
    expect(hasLine([l], 'med:m2')).toBe(false);
  });
});

describe('D. a typed medicine keeps its kind and strength', () => {
  const free = (extra: Record<string, unknown>) => makeFreeLine(copy(), { name: 'ยาใหม่ ง', qty: 2, sellUnit: 'กล่อง', ...extra });
  it('stores them in the source and on the line', () => {
    const res = free({ medKind: 'capsule', strength: { value: 250, unit: 'mg' } });
    if (!res.ok) throw new Error('should work');
    expect(res.line.source).toEqual({ kind: 'free', name: 'ยาใหม่ ง', medKind: 'capsule', strength: { value: 250, unit: 'mg' } });
    expect(res.line).toMatchObject({ medKind: 'capsule', strength: { value: 250, unit: 'mg' } });
  });
  it('leaves them out when not given (the old shape)', () => {
    const res = free({});
    if (!res.ok) throw new Error('should work');
    expect(res.line.source).toEqual({ kind: 'free', name: 'ยาใหม่ ง' });
    expect('medKind' in res.line).toBe(false);
    expect('strength' in res.line).toBe(false);
  });
  it('checks them when given: every unit of the schema, nothing else', () => {
    for (const unit of ['mg', 'mcg', 'g', '%', 'IU', 'mg/5 ml']) expect(free({ strength: { value: 1, unit } }).ok).toBe(true);
    expect(free({ strength: { value: 1, unit: 'kg' } })).toMatchObject({ ok: false, errors: { strength: 'invalid_strength' } });
    expect(free({ strength: { value: 0, unit: 'mg' } })).toMatchObject({ ok: false, errors: { strength: 'invalid_strength' } });
    expect(free({ strength: { value: -5, unit: 'mg' } })).toMatchObject({ ok: false });
    expect(free({ strength: { value: Number.NaN, unit: 'mg' } })).toMatchObject({ ok: false });
    expect(free({ medKind: 'syrup' })).toMatchObject({ ok: false, errors: { medKind: 'invalid_kind' } });
    expect(free({ medKind: null, strength: null }).ok).toBe(true);
  });
  it('a line made this way passes the schema inside an order and survives a backup round trip', () => {
    const r = copy();
    const res = makeFreeLine(r, { name: 'ยาใหม่ จ', qty: 3, sellUnit: 'ขวด', perSellUnit: 60, medKind: 'liquid', strength: { value: 120, unit: 'mg/5 ml' } });
    if (!res.ok) throw new Error('line');
    const order: Order = {
      id: 'o9', shopId: 's1', shopName: 'ร้านตัวอย่าง 1', createdAt: NOW, status: 'waiting', includeShipping: false,
      lines: [{ source: res.line.source, qtyOrdered: 3, sellUnit: 'ขวด', perSellUnit: 60, qtyReceived: 0, leftover: null }],
    };
    expect(orderSchema.safeParse(order).success).toBe(true);
    const root: Root = { ...r, orders: [...r.orders, order] };
    expect(rootSchema.safeParse(root).success).toBe(true);
    const backup = makeBackup(root, NOW);
    const checked = summarizeBackup(backup.text);
    if (!checked.ok) throw new Error('backup should read back');
    expect(checked.root.orders.at(-1)!.lines[0]!.source).toEqual({ kind: 'free', name: 'ยาใหม่ จ', medKind: 'liquid', strength: { value: 120, unit: 'mg/5 ml' } });
  });
  it('old data without them (the sample orders) still passes, and a wrong value inside an order is refused', () => {
    expect(rootSchema.safeParse(sampleRootV3()).success).toBe(true);
    const bad = { kind: 'free', name: 'x', medKind: 'syrup' };
    expect(orderSchema.safeParse({ id: 'o', shopId: 's1', shopName: 'ร', createdAt: NOW, status: 'waiting', includeShipping: false, lines: [{ source: bad, qtyOrdered: 1, sellUnit: 'ขวด', qtyReceived: 0, leftover: null }] }).success).toBe(false);
  });
});


describe('old data and restore', () => {
  const memory = (): KeyValueStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  };
  it('a backup of the house (its typed order line has no kind / strength) restores and loads back the same', () => {
    const r = sampleRootV3(); // order o3 has a typed line in the old shape
    expect(r.orders.find((o) => o.id === 'o3')!.lines[0]!.source).toEqual({ kind: 'free', name: 'ยาตัวอย่าง H' });
    const checked = summarizeBackup(makeBackup(r, NOW).text);
    if (!checked.ok) throw new Error('backup should read back');
    const store = memory();
    expect(restoreRoot(checked.root, store)).toEqual({ ok: true });
    const loaded = loadRoot(store);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') expect(loaded.root).toMatchObject(JSON.parse(JSON.stringify({ orders: r.orders, medications: r.medications, assignments: r.assignments, prices: r.prices }))); // JSON drops an `undefined` field of the fixture
    for (const k of store.data.keys()) expect([STORAGE_KEY, PREV_KEY]).toContain(k); // no other key
  });
  it('the data version stays 3', () => {
    expect(sampleRootV3().version).toBe(3);
  });
});
