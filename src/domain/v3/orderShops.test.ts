import { describe, expect, it } from 'vitest';
import { DEMO_TODAY } from './homeDemo';
import { compareShops } from './orderCompare';
import { orderDemoRoot, withDemoShops } from './orderDemo';
import { buildOrderLines, type DraftLine, type KnownDraftLine } from './orderLines';
import { buildOrderMessage, messageItems } from './orderMessage';
import { baht, cheapestShopIds, compareLinesOf, feeLine, modeOfShop, parsePriceText, priceableMissing, saveShopPrices } from './orderShops';
import { rootSchema } from './schema';

const root = () => withDemoShops(orderDemoRoot('normal'));
const draft = (r = root()): DraftLine[] => buildOrderLines(r, DEMO_TODAY);
const rows = (include: boolean, r = root()) => compareShops(compareLinesOf(draft(r)), r.shops, r.prices, include);
let n = 0;
const newId = () => `np${(n += 1)}`;

describe('shop order and totals', () => {
  it('every price first (cheapest first), then missing prices; with the switch on the delivery fee counts', () => {
    const on = rows(true).rows;
    expect(on.map((r) => r.shopName)).toEqual(['ร้านทดสอบ ข', 'ร้านทดสอบ ก', 'ร้านทดสอบ ค']);
    expect(on.map((r) => r.total)).toEqual([234.5, 242, 69.5 + 30]);
  });
  it('switch off: no fee is added and the cheapest shop changes', () => {
    const off = rows(false).rows;
    expect(off.map((r) => r.shopName)).toEqual(['ร้านทดสอบ ก', 'ร้านทดสอบ ข', 'ร้านทดสอบ ค']);
    expect(off.map((r) => r.total)).toEqual([202, 234.5, 69.5]);
  });
  it('a pick-up shop adds 0 either way', () => {
    for (const include of [true, false]) expect(rows(include).rows.find((r) => r.shopId === 's2')?.total).toBe(234.5);
  });
  it('"ไม่รวม N รายการที่ยังไม่มีราคา" only for the shop that misses prices', () => {
    const all = rows(true).rows;
    expect(all.find((r) => r.shopId === 's3')?.unpricedText).toBe('ไม่รวม 2 รายการที่ยังไม่มีราคา');
    expect(all.find((r) => r.shopId === 's1')?.unpricedText).toBeNull();
  });
  it('"ถูกที่สุด" goes to the cheapest shop with every price, never to a shop that misses prices', () => {
    expect([...cheapestShopIds(rows(true).rows)]).toEqual(['s2']);
    expect([...cheapestShopIds(rows(false).rows)]).toEqual(['s1']);
    const one = rows(true).rows.filter((r) => r.shopId === 's1');
    expect(cheapestShopIds(one).size).toBe(0); // one shop alone is not "cheapest"
  });
  it('a shop with no price at all comes last', () => {
    const r = root();
    r.prices = r.prices.filter((p) => p.shopId !== 's3');
    const out = rows(true, r).rows;
    expect(out.at(-1)?.shopId).toBe('s3');
    expect(out.at(-1)?.lines.length).toBe(0);
  });
});

describe('mode, fee line and money text', () => {
  it('the message follows the shop type', () => {
    const r = root();
    expect(modeOfShop(r.shops[0])).toBe('delivery');
    expect(modeOfShop(r.shops[1])).toBe('pickup');
    expect(modeOfShop(undefined)).toBeNull();
    const items = messageItems(r, draft(r));
    const who = { address: 'บ้านเลขที่ 99', name: 'คุณสมมติ', phone: '081-000-0000' };
    expect(buildOrderMessage(items, modeOfShop(r.shops[0]), who)).toContain('ส่ง บ้านเลขที่ 99');
    expect(buildOrderMessage(items, modeOfShop(r.shops[1]), who)).toContain('มารับเองค่ะ');
    const none = buildOrderMessage(items, modeOfShop(undefined), who);
    expect(none).not.toContain('ส่ง บ้าน');
    expect(none).not.toContain('มารับเอง');
    expect(none.endsWith('คุณสมมติ 081-000-0000')).toBe(true);
  });
  it('the message never holds a price, a shop name or a member name', () => {
    const r = root();
    const text = buildOrderMessage(messageItems(r, draft(r)), 'delivery', { address: 'x', name: 'y', phone: '1' });
    expect(text).not.toContain('฿');
    expect(text).not.toContain('ร้านทดสอบ');
    for (const p of r.persons) expect(text).not.toContain(p.name);
  });
  it('fee line', () => {
    const r = root();
    const [a, b] = [rows(true).rows.find((x) => x.shopId === 's1')!, rows(true).rows.find((x) => x.shopId === 's2')!];
    expect(feeLine(r.shops[0]!, a, true)).toBe('ค่าส่ง ฿40');
    expect(feeLine(r.shops[0]!, a, false)).toBe('ค่าส่ง ฿40 (ไม่รวมในยอด)');
    expect(feeLine(r.shops[1]!, b, true)).toBe('มารับเอง ไม่มีค่าส่ง');
  });
  it('baht', () => {
    expect(baht(1234)).toBe('฿1,234');
    expect(baht(234.5)).toBe('฿234.50');
  });
  it('parsePriceText', () => {
    expect(parsePriceText('')).toBeNull();
    expect(parsePriceText(' 1,250.5 ')).toBe(1250.5);
    expect(Number.isNaN(parsePriceText('abc'))).toBe(true);
    expect(Number.isNaN(parsePriceText('1.2.3'))).toBe(true);
  });
});

describe('saving prices', () => {
  const missingOf = (r = root()) => {
    const lines = draft(r);
    const row = compareShops(compareLinesOf(lines), r.shops, r.prices, true).rows.find((x) => x.shopId === 's3')!;
    return { lines, missing: priceableMissing(row, lines) };
  };
  it('only the ticked lines without a price for that shop, and never a typed medicine', () => {
    const { missing } = missingOf();
    expect(missing.map((l) => l.key).sort()).toEqual(['house:h1', 'med:m8']);
    const r = root();
    const lines: DraftLine[] = [
      ...draft(r),
      { key: 'free:xyz', name: 'ยาพิมพ์เอง', unit: 'เม็ด', need: 3, sellUnit: 'เม็ด', qtyOrdered: 3, reason: 'typed', ticked: true, source: { kind: 'free', name: 'ยาพิมพ์เอง' } },
    ];
    const row = compareShops(compareLinesOf(lines), r.shops, r.prices, true).rows.find((x) => x.shopId === 's3')!;
    expect(row.unpricedKeys).toContain('free:xyz');
    expect(priceableMissing(row, lines).map((l) => l.key)).not.toContain('free:xyz');
  });
  it('the typed price goes through upsertPrice into root.prices, the total changes, the old root is untouched', () => {
    const r = root();
    const before = JSON.stringify(r);
    const { missing } = missingOf(r);
    const res = saveShopPrices(r, 's3', missing, { 'med:m8': '80', 'house:h1': '' }, DEMO_TODAY, newId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.saved).toBe(1);
    expect(JSON.stringify(r)).toBe(before);
    expect(res.root.prices.length).toBe(r.prices.length + 1);
    expect(res.root.prices.at(-1)).toMatchObject({ shopId: 's3', item: { kind: 'med', medicationId: 'm8' }, price: 80, sellUnit: 'หลอด', perSellUnit: 1, date: DEMO_TODAY });
    expect(rootSchema.safeParse(res.root).success).toBe(true);
    const was = rows(true, r).rows.find((x) => x.shopId === 's3')!;
    const now = rows(true, res.root).rows.find((x) => x.shopId === 's3')!;
    expect(now.total).toBe(was.total + 80);
    expect(now.unpricedCount).toBe(1);
  });
  it('a house medicine has its price saved too (per unit 1)', () => {
    const r = root();
    const res = saveShopPrices(r, 's3', missingOf(r).missing, { 'house:h1': '12.5' }, DEMO_TODAY, newId);
    expect(res.ok && res.root.prices.at(-1)).toMatchObject({ item: { kind: 'house', houseItemId: 'h1' }, price: 12.5, sellUnit: 'อัน' });
  });
  it('nothing typed, 0, a negative number or text: refused, nothing changes', () => {
    const r = root();
    const { missing } = missingOf(r);
    expect(saveShopPrices(r, 's3', missing, {}, DEMO_TODAY, newId)).toMatchObject({ ok: false, error: 'nothing_typed' });
    for (const bad of ['0', 'abc', '-5']) {
      expect(saveShopPrices(r, 's3', missing, { 'med:m8': bad }, DEMO_TODAY, newId)).toMatchObject({ ok: false, error: 'invalid', errors: { 'med:m8': 'invalid_price' } });
    }
  });
  it('typing the price again for the same unit replaces it (no second row)', () => {
    const r = root();
    const first = saveShopPrices(r, 's3', missingOf(r).missing, { 'med:m8': '80' }, DEMO_TODAY, newId);
    if (!first.ok) throw new Error('first');
    const again = saveShopPrices(first.root, 's3', [missingOf(r).missing.find((l) => l.key === 'med:m8') as KnownDraftLine], { 'med:m8': '75' }, DEMO_TODAY, newId);
    expect(again.ok && again.root.prices.length).toBe(first.root.prices.length);
  });
});
