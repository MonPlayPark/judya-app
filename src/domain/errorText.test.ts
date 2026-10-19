import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES, RESTORE_ERROR_CODES, SETTINGS_ERROR_CODES, errorText, restoreErrorText, settingsErrorText } from './errorText';

// Every code that medicine.ts can return is found in its source: `fail('code')` calls and the exported error types.
const source = readFileSync(resolve(process.cwd(), 'src/domain/medicine.ts'), 'utf8');
const declared = new Set<string>();
for (const m of source.matchAll(/fail\('([a-z_]+)'\)/g)) declared.add(m[1] as string);
for (const block of source.matchAll(/export type \w+Error =([^;]+);/g)) {
  for (const m of (block[1] as string).matchAll(/'([a-z_]+)'/g)) declared.add(m[1] as string);
}

describe('Thai error texts', () => {
  it('finds the codes in medicine.ts (guard against the scan silently matching nothing)', () => {
    expect(declared.size).toBeGreaterThanOrEqual(20);
    for (const code of ['sample_present', 'unit_mismatch', 'duplicate', 'name_taken', 'reason_required', 'no_change']) {
      expect(declared.has(code)).toBe(true);
    }
  });

  it('every code declared in medicine.ts has a Thai text', () => {
    for (const code of declared) {
      expect(ERROR_CODES, `missing text for ${code}`).toContain(code);
    }
  });

  it('every text is Thai, short, and not empty; save_failed is covered too', () => {
    expect(ERROR_CODES).toContain('save_failed');
    for (const code of ERROR_CODES) {
      const t = errorText(code);
      expect(t).toMatch(/[฀-๿]/);
      expect(t.length).toBeGreaterThan(8);
      expect(t.length).toBeLessThan(120);
    }
  });

  it('the O5 text says the sample must be deleted first', () => {
    expect(errorText('sample_present')).toBe('ตอนนี้เป็นข้อมูลตัวอย่าง ต้องลบตัวอย่างก่อนจึงจะเพิ่มข้อมูลจริงได้');
  });
});

// Step 3.3a: the codes of house medicines and shops live in house.ts, shop.ts and (the new part of) actions.ts.
const houseSources = ['house.ts', 'shop.ts', 'actions.ts'].map((f) => readFileSync(resolve(process.cwd(), 'src/domain', f), 'utf8'));
const houseDeclared = new Set<string>();
for (const src of houseSources) {
  for (const block of src.matchAll(/export type (\w+Error) =([^;]+);/g)) {
    if (block[1] === 'SettingsError') continue; // has its own texts below
    for (const m of (block[2] as string).matchAll(/'([a-z_]+)'/g)) houseDeclared.add(m[1] as string);
  }
}

describe('Thai error texts for house medicines and shops (step 3.3a)', () => {
  it('finds the codes (guard against the scan matching nothing)', () => {
    for (const code of ['invalid_house_name', 'low_at_needs_stock', 'cut_over_stock', 'house_item_removed', 'invalid_phone', 'shop_not_found']) {
      expect(houseDeclared.has(code), code).toBe(true);
    }
  });
  it('every code has a Thai text', () => {
    for (const code of houseDeclared) expect(ERROR_CODES, `missing text for ${code}`).toContain(code);
  });
  it('the over-cut text says the quantity stays', () => {
    expect(errorText('cut_over_stock')).toContain('จำนวนยังเท่าเดิม');
  });
});

describe('restore and settings texts (step 3.2d)', () => {
  it('every restore error has a Thai text, and each says the current data was not touched', () => {
    expect([...RESTORE_ERROR_CODES].sort()).toEqual(['invalid', 'not_json', 'save_failed', 'too_big', 'wrong_version']);
    for (const code of RESTORE_ERROR_CODES) {
      const t = restoreErrorText(code);
      expect(t).toMatch(/[฀-๿]/);
      expect(t).toContain('ข้อมูลปัจจุบันไม่ถูกแตะ');
    }
  });
  it('every settings error has a Thai text that says the old value stays', () => {
    expect([...SETTINGS_ERROR_CODES].sort()).toEqual(['invalid_expiry_days', 'invalid_low_stock_days', 'save_failed']);
    for (const code of SETTINGS_ERROR_CODES) {
      const t = settingsErrorText(code);
      expect(t).toMatch(/[฀-๿]/);
      expect(t).toContain('ค่าเดิมยังอยู่');
    }
  });
});
