// The house-medicine sheet of the v3 medicine list (M4 PR 5b). Pure. House items have no pack size (5a), so a refill is
// one number in the item's own unit. No MedEvent is made.
import type { IsoDate } from '../calc';
import { expiryStatus } from '../calc';
import { formatAmount } from './home';
import { fullThaiDate, type Chip } from './medDetail';
import { label } from './medsList';
import { rootSchema, type MedKind, type Root } from './schema';
import { houseStatus, mergeExpiry } from './stock';

const KIND_NAME: Record<MedKind, string> = {
  tablet: 'ยาเม็ด',
  capsule: 'แคปซูล',
  liquid: 'ยาน้ำ',
  cream: 'ครีม',
  sachet: 'ผงชงดื่ม',
  drops: 'ยาหยอด',
  other: 'อื่นๆ',
};

export interface HouseDetail {
  id: string;
  name: string;
  kind: MedKind;
  subtitle: string; // 'ยาสามัญประจำบ้าน · ยาเม็ด'
  /** null = not counted ("ไม่ได้ใส่จำนวน" chip is shown by the page). */
  chip: Chip;
  counted: boolean;
  big: string | null; // '3 กล่อง'; null = not counted
  unit: string | null;
  expiry: { text: string; chip: Chip | null };
}

export function buildHouseDetail(root: Root, id: string, today: IsoDate): HouseDetail | null {
  const h = root.houseItems.find((x) => x.id === id && x.removedAt === undefined);
  if (!h) return null;
  const kind: MedKind = h.kind ?? 'other';
  const status = houseStatus(h);
  const chip: Chip =
    status === 'out' ? { tone: 'out', label: 'หมดแล้ว' } : status === 'low' ? { tone: 'low', label: 'ใกล้หมด' } : status === 'ok' ? { tone: 'ok', label: 'ปกติ' } : { tone: 'off', label: 'ไม่ได้ใส่จำนวน' };
  const e = expiryStatus(h.expiry, today, root.settings.expiryWarnDays);
  const expiry: HouseDetail['expiry'] = !h.expiry
    ? { text: 'ไม่ได้ระบุ', chip: null }
    : { text: fullThaiDate(h.expiry), chip: e.status === 'expired' ? { tone: 'out', label: 'หมดอายุแล้ว' } : e.status === 'soon' ? { tone: 'low', label: 'ใกล้หมดอายุ' } : null };
  return {
    id: h.id,
    name: label(h),
    kind,
    subtitle: `ยาสามัญประจำบ้าน · ${KIND_NAME[kind]}`,
    chip,
    counted: h.stock !== undefined,
    big: h.stock ? `${formatAmount(h.stock.qty)} ${h.stock.unit}` : null,
    unit: h.stock?.unit ?? null,
    expiry,
  };
}

export interface HouseRefill {
  root: Root;
  /** 'จำนวนรวม  3 กล่อง → 5 กล่อง' */
  total: string;
  expiry: IsoDate | undefined;
}

export type HouseRefillResult = { ok: true; refill: HouseRefill } | { ok: false; error: string };

/** Adds `add` to the item's quantity and keeps the nearer expiry (`mergeExpiry`). The item must be counted. */
export function refillHouseItem(root: Root, id: string, add: number, newExpiry: IsoDate | undefined): HouseRefillResult {
  const h = root.houseItems.find((x) => x.id === id && x.removedAt === undefined);
  if (!h) return { ok: false, error: 'ไม่พบยานี้' };
  if (!h.stock) return { ok: false, error: 'ยานี้ไม่ได้นับจำนวน' };
  if (!Number.isFinite(add) || add <= 0) return { ok: false, error: 'จำนวนที่เติมต้องมากกว่า 0' };
  const qty = h.stock.qty + add;
  const expiry = mergeExpiry(h.expiry, newExpiry);
  const { expiry: _old, ...rest } = h;
  const item = { ...rest, stock: { qty, unit: h.stock.unit }, ...(expiry !== undefined ? { expiry } : {}) };
  const next: Root = { ...root, houseItems: root.houseItems.map((x) => (x.id === id ? item : x)) };
  if (!rootSchema.safeParse(next).success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง บันทึกไม่ได้ ลองใหม่อีกครั้ง' };
  return { ok: true, refill: { root: next, total: `${formatAmount(h.stock.qty)} ${h.stock.unit} → ${formatAmount(qty)} ${h.stock.unit}`, expiry } };
}
