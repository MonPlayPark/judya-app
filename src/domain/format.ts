// Text for numbers and dates shown on screens (pure, no clock).
import { dow, parseDate, type IsoDate } from './calc';

const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** '2026-10-16' -> '16 ต.ค. 2569' (Buddhist year). */
export function thaiDateShort(iso: IsoDate): string {
  const { y, m, d } = parseDate(iso);
  return `${d} ${MONTHS[m - 1] ?? ''} ${y + 543}`;
}

/** '2026-10-16' -> 'ศุกร์ 16 ต.ค. 2569'. */
export const thaiDate = (iso: IsoDate): string => `${WEEKDAYS[dow(iso)] ?? ''} ${thaiDateShort(iso)}`;

/** Amount with a half shown as ½: 1 -> '1 เม็ด', 0.5 -> '½ เม็ด', 1.5 -> '1½ เม็ด'.
 * Doses are whole or half units (BRIEF section 2); any other number is shown as it is. */
export function formatPills(n: number, unit: string): string {
  const whole = Math.floor(n);
  const isHalf = n - whole === 0.5;
  const text = isHalf ? `${whole > 0 ? whole : ''}½` : String(n);
  return `${text} ${unit}`;
}
