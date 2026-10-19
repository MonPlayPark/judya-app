// The house-medicine form (add and edit screens): what the boxes hold as text, and the step from text to the
// `HouseItemInput` that `validateHouseItem` checks. Pure.
import type { HouseItemInput } from './house';
import type { HouseItem } from './schema';

export const HOUSE_UNIT_CHIPS = ['เม็ด', 'แคปซูล', 'ขวด', 'หลอด', 'ซอง', 'แผง', 'กล่อง'] as const;

export interface HouseForm {
  name: string;
  /** Quantity as typed; empty = the stock is not counted. */
  stock: string;
  unit: string;
  /** Warn level as typed; empty = no warning. */
  lowAt: string;
  expiry: string;
  note: string;
}

/** A new item: the unit starts as "เม็ด" like on the board; it only matters once a quantity is typed. */
export const blankHouseForm = (): HouseForm => ({ name: '', stock: '', unit: 'เม็ด', lowAt: '', expiry: '', note: '' });

export const houseFormFromItem = (item: HouseItem): HouseForm => ({
  name: item.name,
  stock: item.stock ? String(item.stock.qty) : '',
  unit: item.stock?.unit ?? 'เม็ด',
  lowAt: item.lowAt === undefined ? '' : String(item.lowAt),
  expiry: item.expiry ?? '',
  note: item.note ?? '',
});

/** Typed number -> number; empty -> null; anything that is not a number -> NaN (the check then refuses it). */
const num = (s: string): number | null => {
  const t = s.trim();
  return t === '' ? null : Number(t);
};

export function houseFormToInput(f: HouseForm): HouseItemInput {
  const qty = num(f.stock);
  return {
    name: f.name,
    stock: qty === null ? null : { qty, unit: f.unit },
    lowAt: num(f.lowAt),
    expiry: f.expiry,
    note: f.note,
  };
}
