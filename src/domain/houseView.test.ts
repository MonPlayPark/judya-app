// What the house-medicine screens read (step 3.3a). Made-up data; today = 2026-10-19, expiryWarnDays = 15.
import { describe, expect, it } from 'vitest';
import { blankHouseForm, houseFormFromItem, houseFormToInput } from './houseForm';
import { houseBadges, houseNotices, houseRows, houseSub } from './houseView';
import { validateHouseItem } from './house';
import { rootWith } from './helpers.test-util';
import type { HouseItem } from './schema';

const TODAY = '2026-10-19';
const W = 15;
const item = (over: Partial<HouseItem> = {}): HouseItem => ({ id: 'h1', name: 'ยาสามัญทดสอบ', ...over });
const tracked = (qty: number, lowAt?: number, over: Partial<HouseItem> = {}): HouseItem =>
  item({ stock: { qty, unit: 'เม็ด' }, ...(lowAt === undefined ? {} : { lowAt }), ...over });

describe('houseBadges (icon + word, several allowed)', () => {
  it('healthy: qty 10 lowAt 5 -> สต๊อกพอ', () => expect(houseBadges(tracked(10, 5), TODAY, W)).toEqual(['ok']));
  it('no stock and no date -> ไม่ได้ใส่จำนวน', () => expect(houseBadges(item(), TODAY, W)).toEqual(['noStock']));
  it('qty 5 lowAt 5 -> low', () => expect(houseBadges(tracked(5, 5), TODAY, W)).toEqual(['low']));
  it('qty 0 -> out (not low as well)', () => expect(houseBadges(tracked(0, 5), TODAY, W)).toEqual(['out']));
  it('expiry 2026-10-18 -> expired; 2026-11-03 -> soon; 2026-11-04 -> not soon', () => {
    expect(houseBadges(item({ expiry: '2026-10-18' }), TODAY, W)).toEqual(['expired']);
    expect(houseBadges(item({ expiry: '2026-11-03' }), TODAY, W)).toEqual(['soon']);
    expect(houseBadges(item({ expiry: '2026-11-04' }), TODAY, W)).toEqual(['noStock']);
  });
  it('uses the threshold it is given: 16 days is soon with 16', () => {
    expect(houseBadges(item({ expiry: '2026-11-04' }), TODAY, 16)).toEqual(['soon']);
  });
  it('expired and out together: both, most urgent first', () => {
    expect(houseBadges(tracked(0, 5, { expiry: '2026-10-01' }), TODAY, W)).toEqual(['expired', 'out']);
  });
});

describe('houseSub', () => {
  it('counted, with a warn level and a date', () => {
    expect(houseSub(tracked(8, 10, { expiry: '2027-09-30' }))).toBe('เหลือ 8 เม็ด · เตือนเมื่อเหลือไม่เกิน 10 · หมดอายุ 30 ก.ย. 2570');
  });
  it('0 left says หมดแล้ว; no stock says ไม่นับสต๊อก', () => {
    expect(houseSub(tracked(0))).toBe('หมดแล้ว');
    expect(houseSub(item())).toBe('ไม่นับสต๊อก');
  });
});

describe('houseRows', () => {
  it('lists only items that are not hidden, in the order they were added', () => {
    const root = rootWith({
      houseItems: [item({ id: 'a', name: 'ยาสามัญ ก' }), item({ id: 'b', name: 'ยาสามัญ ข', removedAt: '2026-10-19T09:00:00+07:00' }), item({ id: 'c', name: 'ยาสามัญ ค' })],
    });
    expect(houseRows(root, TODAY).map((r) => r.id)).toEqual(['a', 'c']);
  });
});

describe('houseNotices (top of the edit page)', () => {
  it('a healthy item has none', () => expect(houseNotices(tracked(10, 5, { expiry: '2027-09-30' }), TODAY, W)).toEqual([]));
  it('expired: how many days over', () => {
    const [n] = houseNotices(item({ expiry: '2026-10-18' }), TODAY, W);
    expect(n).toMatchObject({ tone: 'error', title: 'หมดอายุแล้ว 1 วัน (18 ต.ค. 2569)' });
  });
  it('low: says how many are left and the limit', () => {
    expect(houseNotices(tracked(5, 5), TODAY, W)).toEqual([
      { tone: 'warn', title: 'ใกล้หมด เหลือ 5 เม็ด', detail: 'เตือนเมื่อเหลือไม่เกิน 5 แก้ได้ในช่องด้านล่าง' },
    ]);
  });
  it('out: หมดแล้ว', () => expect(houseNotices(tracked(0), TODAY, W)[0]).toMatchObject({ tone: 'error', title: 'หมดแล้ว' }));
  it('soon: today and later', () => {
    expect(houseNotices(item({ expiry: '2026-10-19' }), TODAY, W)[0]?.title).toBe('หมดอายุวันนี้');
    expect(houseNotices(item({ expiry: '2026-11-03' }), TODAY, W)[0]?.title).toBe('ใกล้หมดอายุ อีก 15 วัน (3 พ.ย. 2569)');
    expect(houseNotices(item({ expiry: '2026-11-03' }), TODAY, W)[0]?.detail).toBe('เตือนก่อนหมดอายุ 15 วัน ปรับได้ที่ตั้งค่า');
  });
});

describe('the form <-> input step', () => {
  it('a new form is blank except the unit chip "เม็ด"; with a name only it is a valid item', () => {
    const f = { ...blankHouseForm(), name: 'ยาสามัญทดสอบ' };
    expect(validateHouseItem(houseFormToInput(f))).toEqual({ ok: true, value: { name: 'ยาสามัญทดสอบ' } });
  });
  it('typed numbers become numbers; empty boxes become "not given"', () => {
    const f = { ...blankHouseForm(), name: 'ยาสามัญทดสอบ', stock: '10', lowAt: '5', unit: 'ขวด' };
    expect(houseFormToInput(f)).toMatchObject({ stock: { qty: 10, unit: 'ขวด' }, lowAt: 5, expiry: '' });
  });
  it('text that is not a number is refused by the check', () => {
    const f = { ...blankHouseForm(), name: 'ยาสามัญทดสอบ', stock: 'abc' };
    expect(validateHouseItem(houseFormToInput(f))).toMatchObject({ ok: false, errors: { qty: 'invalid_house_qty' } });
  });
  it('lowAt typed but stock empty is refused', () => {
    const f = { ...blankHouseForm(), name: 'ยาสามัญทดสอบ', lowAt: '5' };
    expect(validateHouseItem(houseFormToInput(f))).toMatchObject({ ok: false, errors: { lowAt: 'low_at_needs_stock' } });
  });
  it('an item -> form -> item round trip gives the same item', () => {
    const i = tracked(8, 10, { expiry: '2027-09-30', note: 'ตู้ชั้นล่าง' });
    const r = validateHouseItem(houseFormToInput(houseFormFromItem(i)));
    expect(r).toEqual({ ok: true, value: { name: i.name, stock: i.stock, lowAt: 10, expiry: '2027-09-30', note: 'ตู้ชั้นล่าง' } });
  });
});
