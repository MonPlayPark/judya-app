// Step 3.3b-1: the LINE message. Made-up data only.
import { describe, expect, it } from 'vitest';
import { NOW } from './fixtures';
import { assignment, dailyMeal, person, rootWith } from './helpers.test-util';
import { compareShops, orderLines, type HouseOrderLine, type MedOrderLine } from './order';
import { DEFAULT_ORDER_TEMPLATE, buildOrderMessage, messageLines, orderLineText, type MessageLine } from './orderMessage';
import type { Price, Shop } from './schema';

const SHOP = 'ร้านทดสอบ ก';
const X: MessageLine = { kind: 'med', name: 'ยาทดสอบ เอ 10 mg', unit: 'เม็ด', qty: 73, buy: { sellUnits: 2, sellUnit: 'กล่อง', perSellUnit: 60 } };
const Y: MessageLine = { kind: 'house', name: 'ยาสามัญทดสอบ', unit: 'ขวด', qty: 2, buy: { sellUnits: 2, sellUnit: 'ขวด' } };
const noShop = (l: MessageLine): MessageLine => {
  const { buy: _b, ...rest } = l;
  return rest as MessageLine;
};

describe('buildOrderMessage', () => {
  it('the default text, shop chosen: exactly the owner example', () => {
    expect(buildOrderMessage('', SHOP, [X, Y])).toBe(
      [
        'สวัสดีค่ะ ร้านทดสอบ ก',
        'ขอสั่งยาตามรายการนี้',
        '1) ยาทดสอบ เอ 10 mg x 2 กล่อง (120 เม็ด)',
        '2) ยาสามัญทดสอบ x 2 ขวด',
        'รบกวนแจ้งราคารวมและเวลารับยาด้วย ขอบคุณค่ะ',
      ].join('\n'),
    );
  });
  it('the default template constant is exactly the agreed text', () => {
    expect(DEFAULT_ORDER_TEMPLATE).toBe('สวัสดีค่ะ {ร้าน}\nขอสั่งยาตามรายการนี้\n{รายการ}\nรบกวนแจ้งราคารวมและเวลารับยาด้วย ขอบคุณค่ะ');
  });
  it('no shop with every price: "ร้านยา" and plain quantities', () => {
    expect(buildOrderMessage('', null, [noShop(X), { ...noShop(Y), unit: 'ขวด' }])).toBe(
      'สวัสดีค่ะ ร้านยา\nขอสั่งยาตามรายการนี้\n1) ยาทดสอบ เอ 10 mg x 73 เม็ด\n2) ยาสามัญทดสอบ x 2 ขวด\nรบกวนแจ้งราคารวมและเวลารับยาด้วย ขอบคุณค่ะ',
    );
  });
  it('a template with both variables', () => {
    expect(buildOrderMessage('{ร้าน} ขอสั่งยา\n{รายการ}\nขอบคุณค่ะ', SHOP, [X, Y])).toBe(
      'ร้านทดสอบ ก ขอสั่งยา\n1) ยาทดสอบ เอ 10 mg x 2 กล่อง (120 เม็ด)\n2) ยาสามัญทดสอบ x 2 ขวด\nขอบคุณค่ะ',
    );
  });
  it('a template without {รายการ} gets the list on a new line at the end', () => {
    expect(buildOrderMessage('ขอสั่งยา {ร้าน}', SHOP, [X, Y])).toBe(
      'ขอสั่งยา ร้านทดสอบ ก\n1) ยาทดสอบ เอ 10 mg x 2 กล่อง (120 เม็ด)\n2) ยาสามัญทดสอบ x 2 ขวด',
    );
  });
  it('an empty template or spaces and new lines only = the default text', () => {
    const def = buildOrderMessage(DEFAULT_ORDER_TEMPLATE, SHOP, [X]);
    expect(buildOrderMessage('', SHOP, [X])).toBe(def);
    expect(buildOrderMessage('   \n  ', SHOP, [X])).toBe(def);
  });
  it('{ร้าน} twice: both places are replaced; {รายการ} twice: both get the list', () => {
    expect(buildOrderMessage('{ร้าน} / {ร้าน}', SHOP, [Y])).toBe('ร้านทดสอบ ก / ร้านทดสอบ ก\n1) ยาสามัญทดสอบ x 2 ขวด');
    expect(buildOrderMessage('{รายการ}-{รายการ}', SHOP, [Y])).toBe('1) ยาสามัญทดสอบ x 2 ขวด-1) ยาสามัญทดสอบ x 2 ขวด');
  });
  it('special characters in a name stay as typed ($&, $1, $$, $`)', () => {
    const weird: MessageLine = { kind: 'house', name: 'ยา $& ทดสอบ $1 $$ $`', unit: 'ขวด', qty: 1 };
    const out = buildOrderMessage('{ร้าน}: {รายการ}', 'ร้าน $& ก', [weird]);
    expect(out).toBe('ร้าน $& ก: 1) ยา $& ทดสอบ $1 $$ $` x 1 ขวด');
  });
  it('a name that looks like a variable is not replaced a second time', () => {
    const tricky: MessageLine = { kind: 'house', name: 'ยา {ร้าน} {รายการ}', unit: 'ขวด', qty: 1 };
    expect(buildOrderMessage('{ร้าน} {รายการ}', 'ร้านทดสอบ ก', [tricky])).toBe('ร้านทดสอบ ก 1) ยา {ร้าน} {รายการ} x 1 ขวด');
  });
  it('no lines = an empty string, whatever the template', () => {
    expect(buildOrderMessage('', SHOP, [])).toBe('');
    expect(buildOrderMessage('ขอสั่งยา {ร้าน}', null, [])).toBe('');
  });
  it('numbering goes 1) 2) 3) ... one per line', () => {
    const lines = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i): MessageLine => ({ kind: 'house', name: `ยาสามัญทดสอบ ${i}`, unit: 'ขวด', qty: 1 }));
    const out = buildOrderMessage('{รายการ}', null, lines).split('\n');
    expect(out).toHaveLength(11);
    expect(out[0]).toBe('1) ยาสามัญทดสอบ 1 x 1 ขวด');
    expect(out[10]).toBe('11) ยาสามัญทดสอบ 11 x 1 ขวด');
  });
  it('a blank shop name counts as no shop', () => {
    expect(buildOrderMessage('{ร้าน}', '  ', [Y])).toMatch(/^ร้านยา\n/);
  });
});

describe('orderLineText', () => {
  it('a regular medicine with a shop: sell units, sell unit and the pills in brackets', () => {
    expect(orderLineText(X)).toBe('ยาทดสอบ เอ 10 mg x 2 กล่อง (120 เม็ด)');
  });
  it('a regular medicine without a shop: the quantity with halves as ½ (12.5 and 0.5)', () => {
    expect(orderLineText({ kind: 'med', name: 'ยาทดสอบ', unit: 'เม็ด', qty: 12.5 })).toBe('ยาทดสอบ x 12½ เม็ด');
    expect(orderLineText({ kind: 'med', name: 'ยาทดสอบ', unit: 'เม็ด', qty: 0.5 })).toBe('ยาทดสอบ x ½ เม็ด');
    expect(orderLineText({ kind: 'med', name: 'ยาทดสอบ', unit: 'เม็ด', qty: 73 })).toBe('ยาทดสอบ x 73 เม็ด');
  });
  it('the bracket shows the bought pills even with a half pack size (3 packs of 30.5)', () => {
    expect(orderLineText({ kind: 'med', name: 'ยาทดสอบ', unit: 'เม็ด', qty: 60, buy: { sellUnits: 2, sellUnit: 'ซอง', perSellUnit: 30.5 } })).toBe('ยาทดสอบ x 2 ซอง (61 เม็ด)');
  });
  it('a house medicine: with a shop its sell unit, without a shop the unit of its stock', () => {
    expect(orderLineText(Y)).toBe('ยาสามัญทดสอบ x 2 ขวด');
    expect(orderLineText({ kind: 'house', name: 'ยาสามัญทดสอบ', unit: 'หลอด', qty: 3 })).toBe('ยาสามัญทดสอบ x 3 หลอด');
    expect(orderLineText({ kind: 'house', name: 'ยาสามัญทดสอบ', unit: 'หลอด', qty: 3, buy: { sellUnits: 3, sellUnit: 'กล่อง' } })).toBe('ยาสามัญทดสอบ x 3 กล่อง');
  });
});

describe('the message never holds a member name', () => {
  const MEMBER = 'ชื่อสมาชิกทดสอบ';
  const shops: Shop[] = [{ id: 'sA', name: 'ร้านทดสอบ ก', delivery: { kind: 'pickup' } }];
  const prices: Price[] = [
    { id: 'p1', shopId: 'sA', item: { kind: 'med', medicationId: 'mX' }, price: 290, sellUnit: 'กล่อง', perSellUnit: 60 },
    { id: 'p2', shopId: 'sA', item: { kind: 'house', houseItemId: 'hY' }, price: 35, sellUnit: 'ขวด', perSellUnit: 1 },
  ];
  const root = rootWith({
    persons: [person({ id: 'p1', name: MEMBER })],
    medications: [{ id: 'mX', name: 'ยาทดสอบ เอ 10 mg', unit: 'เม็ด' }],
    assignments: [
      assignment({
        id: 'B',
        medicationId: 'mX',
        personId: 'p1',
        schedule: dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } }),
        stock: { qty: 10, countedOn: '2026-10-19' },
      }),
    ],
    houseItems: [{ id: 'hY', name: 'ยาสามัญทดสอบ', stock: { qty: 2, unit: 'ขวด' }, lowAt: 5 }],
    shops,
    prices,
    meta: { createdAt: NOW },
  });

  it('from orderLines through compareShops to the finished text: no member name anywhere, with or without a shop', () => {
    const lines = orderLines(root, '2026-10-19');
    expect(lines.map((l) => l.key)).toEqual(['med:mX', 'house:hY']);
    const row = compareShops(lines, shops, prices, true).rows[0] ?? null;
    expect(row?.shopName).toBe('ร้านทดสอบ ก');
    const withShop = buildOrderMessage('', row?.shopName ?? null, messageLines(lines, row));
    const without = buildOrderMessage('', null, messageLines(lines, null));
    expect(withShop).not.toContain(MEMBER);
    expect(without).not.toContain(MEMBER);
    expect(JSON.stringify(lines)).not.toContain(MEMBER);
    expect(withShop).toContain('1) ยาทดสอบ เอ 10 mg x 1 กล่อง (60 เม็ด)'); // need 50 -> 1 box of 60
    expect(withShop).toContain('2) ยาสามัญทดสอบ x 1 ขวด');
    expect(without).toContain('1) ยาทดสอบ เอ 10 mg x 50 เม็ด');
    expect(without).toContain('2) ยาสามัญทดสอบ x 1 ขวด');
  });
  it('messageLines leaves out lines that are not ticked or have qty 0 and uses the changed quantities', () => {
    const lines = orderLines(root, '2026-10-19');
    const x = lines[0] as MedOrderLine;
    const y = lines[1] as HouseOrderLine;
    expect(messageLines([{ ...x, ticked: false }, y], null)).toEqual([{ kind: 'house', name: 'ยาสามัญทดสอบ', unit: 'ขวด', qty: 1 }]);
    expect(messageLines([x, { ...y, qty: 0 }], null)).toHaveLength(1);
    expect(messageLines([x, { ...y, qty: 4 }], null)[1]).toMatchObject({ qty: 4 });
  });
  it('the owner example end to end: X 73 (2 boxes = 120 pills) and Y 2 bottles', () => {
    const lines: (MedOrderLine | HouseOrderLine)[] = [
      { kind: 'med', key: 'med:mX', medicationId: 'mX', name: 'ยาทดสอบ เอ 10 mg', unit: 'เม็ด', qty: 73, reason: 'low', ticked: true, assignmentIds: ['B', 'C'] },
      { kind: 'house', key: 'house:hY', houseItemId: 'hY', name: 'ยาสามัญทดสอบ', unit: 'ขวด', qty: 2, reason: 'low', ticked: true },
    ];
    const row = compareShops(lines, shops, prices, true).rows[0] ?? null;
    expect(buildOrderMessage('', row?.shopName ?? null, messageLines(lines, row))).toBe(
      'สวัสดีค่ะ ร้านทดสอบ ก\nขอสั่งยาตามรายการนี้\n1) ยาทดสอบ เอ 10 mg x 2 กล่อง (120 เม็ด)\n2) ยาสามัญทดสอบ x 2 ขวด\nรบกวนแจ้งราคารวมและเวลารับยาด้วย ขอบคุณค่ะ',
    );
  });
});
