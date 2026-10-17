import { describe, expect, it } from 'vitest';
import { formatPills, thaiDate, thaiDateShort } from './format';

describe('thaiDate', () => {
  it('writes weekday, day, month and Buddhist year (owner example)', () => {
    expect(thaiDate('2026-10-16')).toBe('ศุกร์ 16 ต.ค. 2569');
    expect(thaiDateShort('2026-10-16')).toBe('16 ต.ค. 2569');
  });
  it('covers Sunday, year change and a single-digit day', () => {
    expect(thaiDate('2026-01-04')).toBe('อาทิตย์ 4 ม.ค. 2569');
    expect(thaiDate('2026-12-31')).toBe('พฤหัสบดี 31 ธ.ค. 2569');
  });
});

describe('formatPills', () => {
  it('shows whole numbers and halves', () => {
    expect(formatPills(1, 'เม็ด')).toBe('1 เม็ด');
    expect(formatPills(0.5, 'เม็ด')).toBe('½ เม็ด');
    expect(formatPills(1.5, 'เม็ด')).toBe('1½ เม็ด');
    expect(formatPills(4, 'ซอง')).toBe('4 ซอง');
  });
});
