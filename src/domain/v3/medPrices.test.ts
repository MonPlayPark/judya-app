import { describe, expect, it } from 'vitest';
import { baht } from './orderShops';
import {
  hintText,
  perUnitText,
  removeShopPrice,
  savePriceOf,
  shopPriceRows,
  sheetStartOf,
  subjectOfHouse,
  subjectOfMedication,
  unitChoicesOf,
} from './medPrices';
import { medsDemoRoot } from './medsListDemo';
import { rootSchema, type Medication, type Price, type Root, type Shop } from './schema';

const SHOPS: Shop[] = [
  { id: 's1', name: 'ร้านทดสอบ ก', delivery: { kind: 'pickup' } },
  { id: 's2', name: 'ร้านทดสอบ ข', delivery: { kind: 'pickup' } },
  { id: 's3', name: 'ร้านทดสอบ ค', delivery: { kind: 'pickup' } },
];
const M4 = { kind: 'med', medicationId: 'm4' } as const; // VitaminD, box of 3 strips x 10
const pr = (id: string, shopId: string, price: number, sellUnit: string, perSellUnit: number, date: string, item: Price['item'] = M4): Price => ({ id, shopId, item, price, sellUnit, perSellUnit, date });
const house = (): Root => ({ ...medsDemoRoot('normal'), shops: SHOPS });
const ids = () => {
  let i = 0;
  return () => `new${++i}`;
};
const med = (over: Partial<Medication>): Medication => ({ id: 'mx', name: 'ยาทดสอบ', kind: 'tablet', pack: { type: 'none' }, ...over });
const labels = (m: Medication) => unitChoicesOf(m).map((c) => `${c.label}:${c.perSellUnit}`);

describe('unitChoicesOf (units a shop can sell, from the pack)', () => {
  it('box: box | strip | pill', () => expect(labels(med({ pack: { type: 'box', strips: 3, perStrip: 10 } }))).toEqual(['กล่อง:30', 'แผง:10', 'เม็ด:1']));
  it('strip: strip | pill', () => expect(labels(med({ pack: { type: 'strip', perStrip: 14 } }))).toEqual(['แผง:14', 'เม็ด:1']));
  it('bottle: bottle | pill', () => expect(labels(med({ pack: { type: 'bottle', perBottle: 100 } }))).toEqual(['ขวด:100', 'เม็ด:1']));
  it('sachet box: box | sachet', () => expect(labels(med({ kind: 'sachet', pack: { type: 'sachetBox', sachets: 10 } }))).toEqual(['กล่อง:10', 'ซอง:1']));
  it('liquid in a bottle: bottle holding the ml', () => expect(labels(med({ kind: 'liquid', pack: { type: 'container', amount: 60, unit: 'ml' } }))).toEqual(['ขวด:60']));
  it('cream is a tube, drops a bottle (1 each)', () => {
    expect(labels(med({ kind: 'cream', pack: { type: 'container', amount: 15, unit: 'g' } }))).toEqual(['หลอด:1']);
    expect(labels(med({ kind: 'drops', pack: { type: 'container', amount: 5, unit: 'ml' } }))).toEqual(['ขวด:1']);
    expect(labels(med({ kind: 'cream', pack: { type: 'none' } }))).toEqual(['หลอด:1']);
  });
  it('no pack: the medicine unit only', () => {
    expect(labels(med({}))).toEqual(['เม็ด:1']);
    expect(labels(med({ kind: 'capsule' }))).toEqual(['แคปซูล:1']);
    expect(labels(med({ kind: 'other' }))).toEqual(['หน่วย:1']);
    expect(labels(med({ kind: 'tablet', unit: 'เม็ดฟู่' }))).toEqual(['เม็ดฟู่:1']);
  });
});

describe('subjects', () => {
  it('a medicine: name, item, choices, per-unit word', () => {
    const s = subjectOfMedication(house(), 'm4');
    expect(s).toMatchObject({ item: M4, name: 'VitaminD', perUnitWord: 'เม็ด' });
    expect(s?.choices.map((c) => c.label)).toEqual(['กล่อง', 'แผง', 'เม็ด']);
  });
  it('cream has no per-unit word; liquid counts per ml', () => {
    expect(subjectOfMedication(medsDemoRoot('cream'), 'm8')?.perUnitWord).toBeNull();
    expect(subjectOfMedication(medsDemoRoot('dose'), 'm10')?.perUnitWord).toBe('มล.');
  });
  it('unknown medicine -> null', () => expect(subjectOfMedication(house(), 'nope')).toBeNull());
  it('house medicine: only the stock unit, 1 each, no per-unit word', () => {
    const s = subjectOfHouse(house(), 'h5');
    expect(s).toMatchObject({ item: { kind: 'house', houseItemId: 'h5' }, name: 'พาราเซตามอล 500 mg', perUnitWord: null });
    expect(s?.choices).toEqual([{ label: 'แผง', perSellUnit: 1 }]);
  });
  it('house medicine not counted: a unit by its kind', () => {
    expect(subjectOfHouse(house(), 'h4')?.choices).toEqual([{ label: 'หลอด', perSellUnit: 1 }]);
  });
  it('unknown or removed house medicine -> null', () => {
    expect(subjectOfHouse(house(), 'nope')).toBeNull();
    expect(subjectOfHouse(house(), 'h6')).toBeNull();
  });
});

describe('texts', () => {
  it('per-unit text: whole number or two decimals, rounded', () => {
    expect(perUnitText(180, 30, 'เม็ด')).toBe('≈ ฿6 ต่อเม็ด');
    expect(perUnitText(65, 10, 'เม็ด')).toBe('≈ ฿6.50 ต่อเม็ด');
    expect(perUnitText(100, 30, 'เม็ด')).toBe('≈ ฿3.33 ต่อเม็ด');
    expect(perUnitText(1234, 1, 'เม็ด')).toBe('≈ ฿1,234 ต่อเม็ด');
  });
  it('hint: only for a price above 0 and a medicine that has a per-unit word', () => {
    const s = subjectOfMedication(house(), 'm4');
    if (!s) throw new Error('no subject');
    expect(hintText(s, 180, 30)).toBe('คิดเป็นประมาณ ฿6 ต่อเม็ด (ใช้เทียบกับร้านอื่น)');
    expect(hintText(s, 0, 30)).toBeNull();
    const cream = subjectOfMedication(medsDemoRoot('cream'), 'm8');
    if (!cream) throw new Error('no subject');
    expect(hintText(cream, 45, 1)).toBeNull();
    const h = subjectOfHouse(house(), 'h5');
    if (!h) throw new Error('no subject');
    expect(hintText(h, 25, 1)).toBeNull();
  });
});

describe('shopPriceRows', () => {
  const root = (): Root => ({
    ...house(),
    prices: [pr('p1', 's1', 180, 'กล่อง', 30, '2026-10-20'), pr('p2', 's2', 65, 'แผง', 10, '2026-10-12'), pr('p3', 's2', 70, 'แผง', 10, '2026-10-01'), pr('px', 's3', 99, 'เม็ด', 1, '2026-10-01', { kind: 'med', medicationId: 'm1' })],
  });
  it('one row per real shop, in the shop list order', () => {
    const s = subjectOfMedication(root(), 'm4');
    if (!s) throw new Error('no subject');
    const rows = shopPriceRows(root(), s);
    expect(rows.map((r) => r.shopId)).toEqual(['s1', 's2', 's3']);
    expect(rows[0]).toMatchObject({ shopName: 'ร้านทดสอบ ก', hasPrice: true, sub: 'อัปเดต 20 ต.ค. 2569', main: '฿180 / กล่อง', per: '≈ ฿6 ต่อเม็ด', aria: 'แก้ราคาที่ ร้านทดสอบ ก' });
    expect(rows[1]).toMatchObject({ hasPrice: true, sub: 'อัปเดต 12 ต.ค. 2569', main: '฿65 / แผง', per: '≈ ฿6.50 ต่อเม็ด', aria: 'แก้ราคาที่ ร้านทดสอบ ข' });
    expect(rows[2]).toMatchObject({ hasPrice: false, sub: 'ยังไม่มีราคา', main: 'ใส่ราคา', per: '', aria: 'ใส่ราคาที่ ร้านทดสอบ ค' });
  });
  it('a price of another medicine does not count', () => {
    const s = subjectOfMedication(root(), 'm4');
    if (!s) throw new Error('no subject');
    expect(shopPriceRows(root(), s)[2]?.hasPrice).toBe(false);
  });
  it('a tube has no per-unit line; a price with no count has none either', () => {
    const r: Root = { ...medsDemoRoot('cream'), shops: SHOPS, prices: [pr('p1', 's1', 45, 'หลอด', 1, '2026-10-20', { kind: 'med', medicationId: 'm8' })] };
    const s = subjectOfMedication(r, 'm8');
    if (!s) throw new Error('no subject');
    expect(shopPriceRows(r, s)[0]).toMatchObject({ main: '฿45 / หลอด', per: '' });
    const noCount: Root = { ...house(), prices: [{ id: 'p1', shopId: 's1', item: M4, price: 10, sellUnit: 'กล่อง', date: '2026-10-20' }] };
    const s2 = subjectOfMedication(noCount, 'm4');
    if (!s2) throw new Error('no subject');
    expect(shopPriceRows(noCount, s2)[0]).toMatchObject({ main: '฿10 / กล่อง', per: '' });
  });
  it('no shops -> no rows', () => {
    const r = medsDemoRoot('normal');
    const s = subjectOfMedication(r, 'm4');
    if (!s) throw new Error('no subject');
    expect(shopPriceRows(r, s)).toEqual([]);
  });
  it('house medicine: price and unit only', () => {
    const r: Root = { ...house(), prices: [pr('p1', 's1', 25, 'แผง', 1, '2026-10-20', { kind: 'house', houseItemId: 'h5' })] };
    const s = subjectOfHouse(r, 'h5');
    if (!s) throw new Error('no subject');
    expect(shopPriceRows(r, s)[0]).toMatchObject({ main: `${baht(25)} / แผง`, per: '' });
  });
});

describe('sheetStartOf', () => {
  const r: Root = { ...house(), prices: [pr('p1', 's1', 180, 'กล่อง', 30, '2026-10-20'), pr('p2', 's2', 65, 'แผง', 10, '2026-10-12')] };
  const subject = () => {
    const s = subjectOfMedication(r, 'm4');
    if (!s) throw new Error('no subject');
    return s;
  };
  it('new price: first unit, empty box, nothing to delete', () => expect(sheetStartOf(r, subject(), 's3')).toMatchObject({ unit: 'กล่อง', text: '', hasPrice: false }));
  it('existing price: its unit and its number', () => {
    expect(sheetStartOf(r, subject(), 's2')).toMatchObject({ unit: 'แผง', text: '65', hasPrice: true });
    expect(sheetStartOf(r, subject(), 's1')).toMatchObject({ unit: 'กล่อง', text: '180', hasPrice: true });
  });
  it('a saved unit that the pack does not offer is added as a choice', () => {
    const odd: Root = { ...r, prices: [pr('p1', 's1', 50, 'ถุง', 5, '2026-10-20')] };
    const s = sheetStartOf(odd, subject(), 's1');
    expect(s.unit).toBe('ถุง');
    expect(s.choices.map((c) => `${c.label}:${c.perSellUnit}`)).toEqual(['กล่อง:30', 'แผง:10', 'เม็ด:1', 'ถุง:5']);
  });
});

describe('savePriceOf', () => {
  const base: Root = house();
  const subject = () => {
    const s = subjectOfMedication(base, 'm4');
    if (!s) throw new Error('no subject');
    return s;
  };
  it('saves through the price store with the count of the unit and today', () => {
    const res = savePriceOf(base, subject(), 's3', 'แผง', '65.5', '2026-10-28', ids());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.root.prices).toEqual([{ id: 'new1', shopId: 's3', item: M4, price: 65.5, sellUnit: 'แผง', perSellUnit: 10, date: '2026-10-28' }]);
    expect(res.shopName).toBe('ร้านทดสอบ ค');
    expect(rootSchema.safeParse(res.root).success).toBe(true);
    expect(base.prices).toEqual([]);
  });
  it('same shop and unit updates the row (the order page reads the same one)', () => {
    const r: Root = { ...base, prices: [pr('p1', 's1', 180, 'กล่อง', 30, '2026-10-01')] };
    const res = savePriceOf(r, subject(), 's1', 'กล่อง', '1,200', '2026-10-28', ids());
    expect(res.ok && res.root.prices).toEqual([pr('p1', 's1', 1200, 'กล่อง', 30, '2026-10-28')]);
  });
  it('empty, 0, text and negative are refused', () => {
    for (const t of ['', '0', 'abc', '-5', '0.0']) expect(savePriceOf(base, subject(), 's1', 'กล่อง', t, '2026-10-28', ids())).toEqual({ ok: false, error: 'invalid_price' });
  });
  it('a unit that is not offered, or a missing shop, is refused', () => {
    expect(savePriceOf(base, subject(), 's1', 'ถุง', '5', '2026-10-28', ids())).toEqual({ ok: false, error: 'invalid_unit' });
    expect(savePriceOf(base, subject(), 'zz', 'กล่อง', '5', '2026-10-28', ids())).toEqual({ ok: false, error: 'no_shop' });
  });
  it('house medicine: perSellUnit is 1', () => {
    const s = subjectOfHouse(base, 'h5');
    if (!s) throw new Error('no subject');
    const res = savePriceOf(base, s, 's1', 'แผง', '25', '2026-10-28', ids());
    expect(res.ok && res.root.prices[0]).toMatchObject({ item: { kind: 'house', houseItemId: 'h5' }, sellUnit: 'แผง', perSellUnit: 1, price: 25 });
  });
});

describe('removeShopPrice', () => {
  const r: Root = {
    ...house(),
    prices: [
      pr('p1', 's1', 180, 'กล่อง', 30, '2026-10-20'),
      pr('p2', 's1', 65, 'แผง', 10, '2026-10-12'),
      pr('p3', 's2', 60, 'แผง', 10, '2026-10-12'),
      pr('p4', 's1', 9, 'เม็ด', 1, '2026-10-12', { kind: 'med', medicationId: 'm1' }),
    ],
  };
  it('removes every row of this shop and this medicine, nothing else', () => {
    const s = subjectOfMedication(r, 'm4');
    if (!s) throw new Error('no subject');
    const res = removeShopPrice(r, s, 's1');
    expect(res.ok && res.root.prices.map((p) => p.id)).toEqual(['p3', 'p4']);
    expect(res.ok && res.removed).toBe(2);
    expect(r.prices).toHaveLength(4);
  });
  it('nothing to remove -> not ok', () => {
    const s = subjectOfMedication(r, 'm4');
    if (!s) throw new Error('no subject');
    expect(removeShopPrice(r, s, 's3')).toEqual({ ok: false, error: 'no_price' });
  });
});
