import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES, errorText } from './errorText';

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
