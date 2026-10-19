// Step 3.3b-1: validatePrice. Made-up data only.
import { describe, expect, it } from 'vitest';
import { validatePrice } from './price';

describe('validatePrice', () => {
  it('a regular medicine: 290 baht, กล่อง, 60 per box passes', () => {
    expect(validatePrice('med', { price: 290, sellUnit: 'กล่อง', perSellUnit: 60 })).toEqual({
      ok: true,
      value: { price: 290, sellUnit: 'กล่อง', perSellUnit: 60 },
    });
  });
  it('the sell unit is trimmed', () => {
    const res = validatePrice('med', { price: 290, sellUnit: '  กล่อง ', perSellUnit: 60 });
    expect(res.ok && res.value.sellUnit).toBe('กล่อง');
  });
  it('price 0, negative, NaN and Infinity are refused', () => {
    for (const price of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validatePrice('med', { price, sellUnit: 'กล่อง', perSellUnit: 60 })).toEqual({ ok: false, errors: { price: 'invalid_price' } });
    }
  });
  it('a sell unit of only spaces (or nothing) is refused', () => {
    expect(validatePrice('med', { price: 290, sellUnit: ' ', perSellUnit: 60 })).toEqual({ ok: false, errors: { sellUnit: 'invalid_sell_unit' } });
    expect(validatePrice('house', { price: 35, sellUnit: '' })).toEqual({ ok: false, errors: { sellUnit: 'invalid_sell_unit' } });
  });
  it('a regular medicine without perSellUnit is per_sell_unit_required (undefined and null)', () => {
    expect(validatePrice('med', { price: 290, sellUnit: 'กล่อง' })).toEqual({ ok: false, errors: { perSellUnit: 'per_sell_unit_required' } });
    expect(validatePrice('med', { price: 290, sellUnit: 'กล่อง', perSellUnit: null })).toEqual({
      ok: false,
      errors: { perSellUnit: 'per_sell_unit_required' },
    });
  });
  it('a regular medicine with perSellUnit 0, negative, NaN or Infinity is invalid_per_sell_unit', () => {
    for (const perSellUnit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validatePrice('med', { price: 290, sellUnit: 'กล่อง', perSellUnit })).toEqual({ ok: false, errors: { perSellUnit: 'invalid_per_sell_unit' } });
    }
  });
  it('a regular medicine may sell by a fraction (0.5 per unit)', () => {
    expect(validatePrice('med', { price: 10, sellUnit: 'ขวด', perSellUnit: 0.5 }).ok).toBe(true);
  });
  it('a house medicine without perSellUnit gets 1', () => {
    expect(validatePrice('house', { price: 35, sellUnit: 'ขวด' })).toEqual({ ok: true, value: { price: 35, sellUnit: 'ขวด', perSellUnit: 1 } });
    expect(validatePrice('house', { price: 35, sellUnit: 'ขวด', perSellUnit: null }).ok).toBe(true);
  });
  it('a house medicine with perSellUnit 1 passes, anything else (2, 0, NaN) is invalid_per_sell_unit', () => {
    expect(validatePrice('house', { price: 35, sellUnit: 'ขวด', perSellUnit: 1 }).ok).toBe(true);
    for (const perSellUnit of [2, 0, Number.NaN]) {
      expect(validatePrice('house', { price: 35, sellUnit: 'ขวด', perSellUnit })).toEqual({ ok: false, errors: { perSellUnit: 'invalid_per_sell_unit' } });
    }
  });
  it('every wrong field is reported, not just the first', () => {
    expect(validatePrice('med', { price: 0, sellUnit: ' ' })).toEqual({
      ok: false,
      errors: { price: 'invalid_price', sellUnit: 'invalid_sell_unit', perSellUnit: 'per_sell_unit_required' },
    });
  });
});
