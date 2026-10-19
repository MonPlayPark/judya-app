// Step 3.3a logic for house medicines. Made-up data only. The numbers are the owner's hand examples
// (today = 2026-10-19, expiryWarnDays = 15).
import { describe, expect, it } from 'vitest';
import { expiryStatus } from './calc';
import { HOUSE_STATUS_TEXT, cutHouseStock, validateHouseItem } from './house';
import type { HouseItem } from './schema';
import { houseStatus } from './stock';

const TODAY = '2026-10-19';
const WARN = 15;

const item = (qty: number | null, lowAt?: number): HouseItem => ({
  id: 'h1',
  name: 'ยาสามัญทดสอบ',
  ...(qty === null ? {} : { stock: { qty, unit: 'เม็ด' } }),
  ...(lowAt === undefined ? {} : { lowAt }),
});

describe('houseStatus (words: ปกติ / ใกล้หมด / หมดแล้ว / ไม่นับ)', () => {
  const word = (qty: number | null, lowAt?: number) => HOUSE_STATUS_TEXT[houseStatus(item(qty, lowAt))];

  it('qty 10, lowAt 5 -> ปกติ', () => expect(word(10, 5)).toBe('ปกติ'));
  it('qty 6, lowAt 5 -> ปกติ (one above the limit)', () => expect(word(6, 5)).toBe('ปกติ'));
  it('qty 5, lowAt 5 -> ใกล้หมด (exactly at the limit)', () => expect(word(5, 5)).toBe('ใกล้หมด'));
  it('qty 0, lowAt 5 -> หมดแล้ว (beats ใกล้หมด)', () => expect(word(0, 5)).toBe('หมดแล้ว'));
  it('qty 0 without lowAt -> หมดแล้ว', () => expect(word(0)).toBe('หมดแล้ว'));
  it('no stock -> ไม่นับ (even if the old data had a lowAt)', () => {
    expect(word(null)).toBe('ไม่นับ');
    expect(HOUSE_STATUS_TEXT[houseStatus({ ...item(null), lowAt: 5 })]).toBe('ไม่นับ');
  });
  it('stock but no lowAt -> ปกติ', () => expect(word(3)).toBe('ปกติ'));
});

describe('cutHouseStock', () => {
  it('10 cut 3 -> 7', () => {
    const r = cutHouseStock(item(10, 5), 3);
    expect(r.status).toBe('cut');
    if (r.status === 'cut') expect(r.item.stock?.qty).toBe(7);
  });
  it('10 cut 10 -> 0 and the status is หมดแล้ว', () => {
    const r = cutHouseStock(item(10, 5), 10);
    expect(r.status).toBe('cut');
    if (r.status === 'cut') {
      expect(r.item.stock?.qty).toBe(0);
      expect(HOUSE_STATUS_TEXT[houseStatus(r.item)]).toBe('หมดแล้ว');
    }
  });
  it('10 cut 11 -> warning, quantity stays 10 (the very same item)', () => {
    const before = item(10, 5);
    const r = cutHouseStock(before, 11);
    expect(r.status).toBe('warn');
    if (r.status === 'warn') {
      expect(r.item.stock?.qty).toBe(10);
      expect(r.item).toBe(before);
    }
  });
  it.each([0, 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY])('cut %s is refused', (n) => {
    expect(cutHouseStock(item(10), n)).toEqual({ status: 'rejected', error: 'invalid_cut' });
  });
  it('an item that does not count its stock cannot be cut', () => {
    expect(cutHouseStock(item(null), 1)).toEqual({ status: 'rejected', error: 'no_stock' });
  });
  it('0 left: cutting 1 is a warning, never below 0', () => {
    const r = cutHouseStock(item(0), 1);
    expect(r.status).toBe('warn');
    if (r.status === 'warn') expect(r.item.stock?.qty).toBe(0);
  });
  it('does not change the item it was given', () => {
    const before = item(10, 5);
    cutHouseStock(before, 3);
    expect(before.stock?.qty).toBe(10);
  });
});

describe('expiry of a house medicine (expiryStatus with expiryWarnDays = 15)', () => {
  const at = (iso?: string) => expiryStatus(iso, TODAY, WARN);
  it('2026-11-03 -> soon, 15 days left', () => expect(at('2026-11-03')).toEqual({ status: 'soon', days: 15 }));
  it('2026-11-04 -> ok, 16 days left', () => expect(at('2026-11-04')).toEqual({ status: 'ok', days: 16 }));
  it('2026-10-19 (today) -> soon, 0 days', () => expect(at('2026-10-19')).toEqual({ status: 'soon', days: 0 }));
  it('2026-10-18 -> expired', () => expect(at('2026-10-18').status).toBe('expired'));
  it('no date -> unknown, no warning', () => expect(at(undefined)).toEqual({ status: 'unknown', days: null }));
});

describe('validateHouseItem', () => {
  it('a name of 2..60 characters passes (spaces at both ends are cut)', () => {
    const r = validateHouseItem({ name: '  ยาทดสอบ  ' });
    expect(r).toEqual({ ok: true, value: { name: 'ยาทดสอบ' } });
    expect(validateHouseItem({ name: 'กข' }).ok).toBe(true);
    expect(validateHouseItem({ name: 'ก'.repeat(60) }).ok).toBe(true);
  });
  it('a name of 1 or 61 characters (after trimming) fails', () => {
    expect(validateHouseItem({ name: ' ก ' })).toMatchObject({ ok: false, errors: { name: 'invalid_house_name' } });
    expect(validateHouseItem({ name: 'ก'.repeat(61) })).toMatchObject({ ok: false, errors: { name: 'invalid_house_name' } });
  });
  it('lowAt without stock is refused', () => {
    expect(validateHouseItem({ name: 'ยาทดสอบ', lowAt: 5 })).toMatchObject({ ok: false, errors: { lowAt: 'low_at_needs_stock' } });
    expect(validateHouseItem({ name: 'ยาทดสอบ', stock: null, lowAt: 5 })).toMatchObject({ ok: false, errors: { lowAt: 'low_at_needs_stock' } });
  });
  it('lowAt with stock passes; lowAt 0 passes; negative lowAt fails', () => {
    expect(validateHouseItem({ name: 'ยาทดสอบ', stock: { qty: 10, unit: 'เม็ด' }, lowAt: 5 })).toEqual({
      ok: true,
      value: { name: 'ยาทดสอบ', stock: { qty: 10, unit: 'เม็ด' }, lowAt: 5 },
    });
    expect(validateHouseItem({ name: 'ยาทดสอบ', stock: { qty: 10, unit: 'เม็ด' }, lowAt: 0 }).ok).toBe(true);
    expect(validateHouseItem({ name: 'ยาทดสอบ', stock: { qty: 10, unit: 'เม็ด' }, lowAt: -1 })).toMatchObject({
      ok: false,
      errors: { lowAt: 'invalid_low_at' },
    });
  });
  it('stock.qty must be >= 0: 0 passes, -1 and NaN fail', () => {
    expect(validateHouseItem({ name: 'ยาทดสอบ', stock: { qty: 0, unit: 'ขวด' } }).ok).toBe(true);
    expect(validateHouseItem({ name: 'ยาทดสอบ', stock: { qty: -1, unit: 'ขวด' } })).toMatchObject({ ok: false, errors: { qty: 'invalid_house_qty' } });
    expect(validateHouseItem({ name: 'ยาทดสอบ', stock: { qty: Number.NaN, unit: 'ขวด' } })).toMatchObject({ ok: false, errors: { qty: 'invalid_house_qty' } });
  });
  it('stock needs a unit', () => {
    expect(validateHouseItem({ name: 'ยาทดสอบ', stock: { qty: 3, unit: '  ' } })).toMatchObject({ ok: false, errors: { unit: 'invalid_house_unit' } });
  });
  it('expiry is optional; a real date passes, a wrong one fails', () => {
    expect(validateHouseItem({ name: 'ยาทดสอบ' }).ok).toBe(true);
    expect(validateHouseItem({ name: 'ยาทดสอบ', expiry: '' }).ok).toBe(true);
    expect(validateHouseItem({ name: 'ยาทดสอบ', expiry: '2027-09-30' })).toMatchObject({ ok: true, value: { expiry: '2027-09-30' } });
    expect(validateHouseItem({ name: 'ยาทดสอบ', expiry: '2027-02-30' })).toMatchObject({ ok: false, errors: { expiry: 'invalid_expiry' } });
  });
  it('a blank note is no note; a note is kept trimmed', () => {
    expect(validateHouseItem({ name: 'ยาทดสอบ', note: '   ' })).toEqual({ ok: true, value: { name: 'ยาทดสอบ' } });
    expect(validateHouseItem({ name: 'ยาทดสอบ', note: ' ตู้ชั้นล่าง ' })).toMatchObject({ ok: true, value: { note: 'ตู้ชั้นล่าง' } });
  });
  it('reports every wrong field, not just the first', () => {
    const r = validateHouseItem({ name: 'ก', stock: { qty: -1, unit: '' }, lowAt: -2, expiry: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['expiry', 'lowAt', 'name', 'qty', 'unit']);
  });
});
