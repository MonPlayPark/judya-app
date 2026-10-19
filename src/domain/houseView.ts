// What the house-medicine screens show about one item (step 3.3a): the list rows, the warnings at the top of the edit
// page. Pure: `today` is passed in. Status rules are in stock.ts (houseStatus) and calc.ts (expiryStatus).
import { expiryStatus, type IsoDate } from './calc';
import { thaiDateShort } from './format';
import type { BadgeKind } from './medView';
import type { HouseItem, Root } from './schema';
import { houseStatus } from './stock';

/** Warnings (most urgent first), else "สต๊อกพอ" / "ไม่ได้ใส่จำนวน". Every badge is an icon AND a word. */
export function houseBadges(item: HouseItem, today: IsoDate, warnDays: number): BadgeKind[] {
  const out: BadgeKind[] = [];
  const e = expiryStatus(item.expiry, today, warnDays);
  const s = houseStatus(item);
  if (e.status === 'expired') out.push('expired');
  if (s === 'out') out.push('out');
  if (s === 'low') out.push('low');
  if (e.status === 'soon') out.push('soon');
  if (out.length > 0) return out;
  return [s === 'untracked' ? 'noStock' : 'ok'];
}

/** Second line of a row: 'เหลือ 8 เม็ด · เตือนเมื่อเหลือไม่เกิน 10 · หมดอายุ 30 ก.ย. 2570' / 'หมดแล้ว' / 'ไม่นับสต๊อก'. */
export function houseSub(item: HouseItem): string {
  const parts: string[] = [];
  if (!item.stock) parts.push('ไม่นับสต๊อก');
  else {
    parts.push(item.stock.qty === 0 ? 'หมดแล้ว' : `เหลือ ${item.stock.qty} ${item.stock.unit}`);
    if (item.lowAt !== undefined) parts.push(`เตือนเมื่อเหลือไม่เกิน ${item.lowAt}`);
  }
  if (item.expiry) parts.push(`หมดอายุ ${thaiDateShort(item.expiry)}`);
  return parts.join(' · ');
}

export interface HouseRow {
  id: string;
  name: string;
  sub: string;
  badges: BadgeKind[];
}

/** Items that are not hidden, in the order they were added. */
export function houseRows(root: Root, today: IsoDate): HouseRow[] {
  return root.houseItems
    .filter((h) => h.removedAt === undefined)
    .map((h) => ({ id: h.id, name: h.name, sub: houseSub(h), badges: houseBadges(h, today, root.settings.expiryWarnDays) }));
}

/** The deleted items ("ยาสามัญที่ลบแล้ว"), in the order they were added. Nothing is erased, so they can be brought back. */
export const removedHouseItems = (root: Root): HouseItem[] => root.houseItems.filter((h) => h.removedAt !== undefined);

export interface HouseNotice {
  tone: 'error' | 'warn';
  title: string;
  detail: string;
}

/** The boxes at the top of the edit page: expired, out / low, expiring soon. Nothing for a healthy item. */
export function houseNotices(item: HouseItem, today: IsoDate, warnDays: number): HouseNotice[] {
  const out: HouseNotice[] = [];
  const e = expiryStatus(item.expiry, today, warnDays);
  const s = houseStatus(item);
  if (e.status === 'expired' && item.expiry && e.days !== null) {
    out.push({
      tone: 'error',
      title: `หมดอายุแล้ว ${-e.days} วัน (${thaiDateShort(item.expiry)})`,
      detail: 'ยาที่หมดอายุแล้วไม่ควรใช้ ถามเภสัชกรได้ถ้าไม่แน่ใจเรื่องการทิ้ง',
    });
  }
  if (s === 'out') {
    out.push({
      tone: 'error',
      title: 'หมดแล้ว',
      detail: item.lowAt !== undefined ? `เตือนเมื่อเหลือไม่เกิน ${item.lowAt} แก้ได้ในช่องด้านล่าง` : 'ซื้อมาเพิ่มแล้ว แก้จำนวนคงเหลือในช่องด้านล่าง',
    });
  } else if (s === 'low' && item.stock) {
    out.push({
      tone: 'warn',
      title: `ใกล้หมด เหลือ ${item.stock.qty} ${item.stock.unit}`,
      detail: `เตือนเมื่อเหลือไม่เกิน ${item.lowAt ?? 0} แก้ได้ในช่องด้านล่าง`,
    });
  }
  if (e.status === 'soon' && item.expiry && e.days !== null) {
    out.push({
      tone: 'warn',
      title: e.days === 0 ? 'หมดอายุวันนี้' : `ใกล้หมดอายุ อีก ${e.days} วัน (${thaiDateShort(item.expiry)})`,
      detail: `เตือนก่อนหมดอายุ ${warnDays} วัน ปรับได้ที่ตั้งค่า`,
    });
  }
  return out;
}
