// Step 3.3a logic for shops. Made-up data only; the numbers are the owner's hand examples.
import { describe, expect, it } from 'vitest';
import { validateShop } from './shop';

const pickup = { kind: 'pickup' } as const;

describe('validateShop', () => {
  it('name " ก " (1 character after trimming) fails', () => {
    expect(validateShop({ name: ' ก ', delivery: pickup })).toMatchObject({ ok: false, errors: { name: 'invalid_shop_name' } });
  });
  it('a name of 2..40 characters passes and is trimmed; 41 fails', () => {
    expect(validateShop({ name: '  ร้านทดสอบ  ', delivery: pickup })).toEqual({ ok: true, value: { name: 'ร้านทดสอบ', delivery: pickup } });
    expect(validateShop({ name: 'ก'.repeat(40), delivery: pickup }).ok).toBe(true);
    expect(validateShop({ name: 'ก'.repeat(41), delivery: pickup }).ok).toBe(false);
  });
  it('phone "081-234-5678" passes', () => {
    expect(validateShop({ name: 'ร้านทดสอบ', phone: '081-234-5678', delivery: pickup })).toMatchObject({
      ok: true,
      value: { phone: '081-234-5678' },
    });
  });
  it('phone "12" fails (too short); "+66 81 234 5678" passes; letters fail; 21 characters fail', () => {
    expect(validateShop({ name: 'ร้านทดสอบ', phone: '12', delivery: pickup })).toMatchObject({ ok: false, errors: { phone: 'invalid_phone' } });
    expect(validateShop({ name: 'ร้านทดสอบ', phone: '+66 81 234 5678', delivery: pickup }).ok).toBe(true);
    expect(validateShop({ name: 'ร้านทดสอบ', phone: '081-abc-5678', delivery: pickup }).ok).toBe(false);
    expect(validateShop({ name: 'ร้านทดสอบ', phone: '1'.repeat(21), delivery: pickup }).ok).toBe(false);
    expect(validateShop({ name: 'ร้านทดสอบ', phone: '1'.repeat(6), delivery: pickup }).ok).toBe(true);
  });
  it('an empty phone is allowed and is left out', () => {
    expect(validateShop({ name: 'ร้านทดสอบ', phone: '  ', delivery: pickup })).toEqual({ ok: true, value: { name: 'ร้านทดสอบ', delivery: pickup } });
    expect(validateShop({ name: 'ร้านทดสอบ', phone: null, delivery: pickup }).ok).toBe(true);
  });
  it('deliver with fee 0 passes (free delivery)', () => {
    expect(validateShop({ name: 'ร้านทดสอบ', delivery: { kind: 'deliver', fee: 0 } })).toEqual({
      ok: true,
      value: { name: 'ร้านทดสอบ', delivery: { kind: 'deliver', fee: 0 } },
    });
  });
  it('a negative or missing fee fails', () => {
    expect(validateShop({ name: 'ร้านทดสอบ', delivery: { kind: 'deliver', fee: -1 } })).toMatchObject({ ok: false, errors: { fee: 'invalid_fee' } });
    expect(validateShop({ name: 'ร้านทดสอบ', delivery: { kind: 'deliver', fee: Number.NaN } })).toMatchObject({ ok: false, errors: { fee: 'invalid_fee' } });
  });
  it('freeOver 0 fails, 500 passes, empty passes', () => {
    expect(validateShop({ name: 'ร้านทดสอบ', delivery: { kind: 'deliver', fee: 40, freeOver: 0 } })).toMatchObject({
      ok: false,
      errors: { freeOver: 'invalid_free_over' },
    });
    expect(validateShop({ name: 'ร้านทดสอบ', delivery: { kind: 'deliver', fee: 40, freeOver: 500 } })).toMatchObject({
      ok: true,
      value: { delivery: { kind: 'deliver', fee: 40, freeOver: 500 } },
    });
    expect(validateShop({ name: 'ร้านทดสอบ', delivery: { kind: 'deliver', fee: 40, freeOver: null } })).toMatchObject({
      ok: true,
      value: { delivery: { kind: 'deliver', fee: 40 } },
    });
  });
  it('a pick-up shop keeps no fee', () => {
    const r = validateShop({ name: 'ร้านทดสอบ', delivery: pickup });
    expect(r).toMatchObject({ ok: true, value: { delivery: { kind: 'pickup' } } });
  });
  it('reports every wrong field', () => {
    const r = validateShop({ name: 'ก', phone: '1', delivery: { kind: 'deliver', fee: -1, freeOver: 0 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['fee', 'freeOver', 'name', 'phone']);
  });
});
