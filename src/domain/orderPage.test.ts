// Step 3.3b-3: stepQty, effectiveLines and pickShop with the owner's order-page example (today = 2026-10-19). Made-up data only.
import { describe, expect, it } from 'vitest';
import { compareShops, orderLines, type HouseOrderLine, type MedOrderLine, type OrderLine } from './order';
import { effectiveLines, pickShop, stepQty } from './orderPage';
import { exampleRoot, EXAMPLE_TODAY, NAME_X, NAME_Y, PRICES, SHOPS } from './orderExample.test-util';

const X = (qty = 73, over: Partial<MedOrderLine> = {}): MedOrderLine => ({
  kind: 'med',
  key: 'med:mX',
  medicationId: 'mX',
  name: NAME_X,
  unit: 'เม็ด',
  qty,
  reason: 'low',
  ticked: true,
  assignmentIds: ['a1', 'a2'],
  ...over,
});
const Y = (qty = 1, over: Partial<HouseOrderLine> = {}): HouseOrderLine => ({
  kind: 'house',
  key: 'house:hY',
  houseItemId: 'hY',
  name: NAME_Y,
  unit: 'ขวด',
  qty,
  reason: 'low',
  ticked: true,
  ...over,
});

describe('stepQty: regular medicine with a shop chosen moves by whole sell units', () => {
  it('shop ก (60 per box): 73 + -> 180 (3 boxes), because 73 already needs 2 boxes', () => {
    expect(stepQty(X(73), 'up', 60)).toBe(180);
  });
  it('shop ก: 180 − -> 120, 120 − -> 60, 60 − stays 60 (at least 1 sell unit)', () => {
    expect(stepQty(X(180), 'down', 60)).toBe(120);
    expect(stepQty(X(120), 'down', 60)).toBe(60);
    expect(stepQty(X(60), 'down', 60)).toBe(60);
  });
  it('example B: after + (180), one − gives 120 (2 boxes), not 73', () => {
    const up = stepQty(X(73), 'up', 60);
    expect(stepQty(X(up), 'down', 60)).toBe(120);
  });
  it('shop ค (30 per box): 73 needs 3 boxes = 90, so + -> 120 and − -> 60', () => {
    expect(stepQty(X(73), 'up', 30)).toBe(120);
    expect(stepQty(X(73), 'down', 30)).toBe(60);
  });
  it('an exact multiple is not pushed up by floating point: 120 / 60 is 2 boxes', () => {
    expect(stepQty(X(120), 'up', 60)).toBe(180);
    expect(stepQty(X(120), 'down', 60)).toBe(60);
  });
  it('a sell unit of 0.1 does not drift (3 x 0.1 is 0.3)', () => {
    expect(stepQty(X(0.25), 'up', 0.1)).toBe(0.4);
  });
});

describe('stepQty: no shop, or a house medicine, moves by 1', () => {
  it('example E: no shop with every price (null): 73 + -> 74, 74 − -> 73', () => {
    expect(stepQty(X(73), 'up', null)).toBe(74);
    expect(stepQty(X(74), 'down', null)).toBe(73);
  });
  it('a regular medicine never goes under 1 pill', () => {
    expect(stepQty(X(1), 'down', null)).toBe(1);
  });
  it('a house medicine: 1 + -> 2, 2 − -> 1, 1 − stays 1; perSellUnit is not used', () => {
    expect(stepQty(Y(1), 'up', null)).toBe(2);
    expect(stepQty(Y(2), 'down', null)).toBe(1);
    expect(stepQty(Y(1), 'down', null)).toBe(1);
    expect(stepQty(Y(1), 'up', 60)).toBe(2);
  });
});

describe('stepQty: quantity 0 (stock already covers the target)', () => {
  it('+ gives the first sell unit: 60 with shop ก, 1 pill with no shop, 1 for a house medicine', () => {
    expect(stepQty(X(0, { ticked: false }), 'up', 60)).toBe(60);
    expect(stepQty(X(0, { ticked: false }), 'up', null)).toBe(1);
    expect(stepQty(Y(0, { ticked: false }), 'up', null)).toBe(1);
  });
  it('− stays 0 (it never raises a quantity)', () => {
    expect(stepQty(X(0, { ticked: false }), 'down', 60)).toBe(0);
    expect(stepQty(X(0, { ticked: false }), 'down', null)).toBe(0);
  });
});

describe('effectiveLines', () => {
  const lines: OrderLine[] = [X(73), Y(1), X(40, { key: 'med:mU', medicationId: 'mU', reason: 'unknown', ticked: false })];

  it('without overrides it gives the same values (a copy, not the same objects)', () => {
    const out = effectiveLines(lines, {}, {});
    expect(out).toEqual(lines);
    expect(out[0]).not.toBe(lines[0]);
  });
  it('a quantity override replaces qty and keeps the tick', () => {
    const out = effectiveLines(lines, { 'house:hY': 2 }, {});
    expect(out[1]).toMatchObject({ qty: 2, ticked: true });
    expect(out[0]).toMatchObject({ qty: 73, ticked: true });
  });
  it('a tick override replaces ticked', () => {
    const out = effectiveLines(lines, {}, { 'house:hY': false, 'med:mU': true });
    expect(out.map((l) => l.ticked)).toEqual([true, false, true]);
  });
  it('quantity 0 is never ticked, even when an override or the line says ticked', () => {
    const out = effectiveLines(lines, { 'med:mX': 0 }, { 'med:mX': true });
    expect(out[0]).toMatchObject({ qty: 0, ticked: false });
    expect(effectiveLines([X(0, { ticked: true })], {}, {})[0]?.ticked).toBe(false);
  });
  it('a line at 0 that gets + (qty 60) stays unticked until the owner ticks it', () => {
    const zero = X(0, { ticked: false });
    expect(effectiveLines([zero], { 'med:mX': 60 }, {})[0]).toMatchObject({ qty: 60, ticked: false });
    expect(effectiveLines([zero], { 'med:mX': 60 }, { 'med:mX': true })[0]).toMatchObject({ qty: 60, ticked: true });
  });
  it('does not change the lines it was given', () => {
    const before = JSON.stringify(lines);
    effectiveLines(lines, { 'med:mX': 5 }, { 'house:hY': false });
    expect(JSON.stringify(lines)).toBe(before);
  });
});

describe('pickShop', () => {
  const rows = [{ shopId: 'sA' }, { shopId: 'sD' }, { shopId: 'sC' }];
  it('no rows: no shop', () => {
    expect(pickShop([], null)).toBeNull();
    expect(pickShop([], 'sA')).toBeNull();
  });
  it('nothing chosen: the first row (the cheapest)', () => {
    expect(pickShop(rows, null)?.shopId).toBe('sA');
  });
  it('a chosen shop that is in the rows', () => {
    expect(pickShop(rows, 'sC')?.shopId).toBe('sC');
  });
  it('a chosen shop that dropped out of the rows: back to the first row', () => {
    expect(pickShop(rows, 'sB')?.shopId).toBe('sA');
  });
});

describe('the example through orderLines + effectiveLines + stepQty + compareShops', () => {
  const lines0 = orderLines(exampleRoot(), EXAMPLE_TODAY);
  const totals = (lines: OrderLine[], inc = true) => compareShops(lines, SHOPS, PRICES, inc).rows.map((r) => `${r.shopName.slice(-1)}:${r.total}`);

  it('starts with X = 73 (50 + 23) and Y = 1, both ticked', () => {
    expect(lines0.map((l) => [l.key, l.qty, l.ticked])).toEqual([
      ['med:mX', 73, true],
      ['house:hY', 1, true],
    ]);
  });
  it('example A: Y + once (2 bottles): ก 650, ง 650, ค 810, ข 840', () => {
    const y = lines0[1]!;
    const lines = effectiveLines(lines0, { [y.key]: stepQty(y, 'up', null) }, {});
    expect(totals(lines)).toEqual(['ก:650', 'ง:650', 'ค:810', 'ข:840']);
  });
  it('example B: X + at shop ก -> 180 pills, ก 940, ง 940, ข 1520, ค 1560; then − -> 120, ก 650, ง 650, ข 1040, ค 1060', () => {
    const x = lines0[0]!;
    const base = { 'house:hY': 2 };
    const up = stepQty(x, 'up', 60);
    expect(up).toBe(180);
    expect(totals(effectiveLines(lines0, { ...base, 'med:mX': up }, {}))).toEqual(['ก:940', 'ง:940', 'ข:1520', 'ค:1560']);
    const down = stepQty({ ...x, qty: up }, 'down', 60);
    expect(down).toBe(120);
    expect(totals(effectiveLines(lines0, { ...base, 'med:mX': down }, {}))).toEqual(['ก:650', 'ง:650', 'ข:1040', 'ค:1060']);
  });
  it('example C: Y unticked -> shop จ joins; with shipping ก 580 ง 630 ค 750 ข 760 จ 800, without ก 580 ง 580 ข 720 ค 750 จ 800', () => {
    const lines = effectiveLines(lines0, {}, { 'house:hY': false });
    expect(totals(lines, true)).toEqual(['ก:580', 'ง:630', 'ค:750', 'ข:760', 'จ:800']);
    expect(totals(lines, false)).toEqual(['ก:580', 'ง:580', 'ข:720', 'ค:750', 'จ:800']);
  });
  it('example D: shop ค chosen, X 73 -> + gives 120 (4 boxes of 30)', () => {
    expect(stepQty(lines0[0]!, 'up', 30)).toBe(120);
  });
});
