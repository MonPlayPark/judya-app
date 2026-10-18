// "ยาที่ต้องดูแล" (home screen) and the member cards. Pure: `today` is passed in.
// Three groups, in this order: expired, stock low or out, expiring soon. Inside a group the most urgent comes first.
// Left out: stopped medicines, removed members, removed house medicines. A member who sets out their own
// medicine (selfManaged) is included: the stock and the expiry date are still watched.
import type { IsoDate } from './calc';
import { expiryStatus } from './calc';
import { formatPills, thaiDateShort } from './format';
import type { Root } from './schema';
import { daysLeft, houseStatus, isLowStock, stockNow } from './stock';

export type CareGroup = 'expired' | 'lowStock' | 'expirySoon';

export interface CareItem {
  group: CareGroup;
  /** assignment id (member medicine) or house item id: one medicine in two groups has the same id */
  id: string;
  kind: 'member' | 'house';
  name: string;
  /** second line: owner (or "ยาสามัญประจำบ้าน") and a detail */
  sub: string;
  /** right-hand text: 'เกิน 16 วัน' / 'อีก 8 วัน' / 'วันนี้' / 'เหลือ 4 วัน' / 'ไม่พอสำหรับวันนี้' / 'เหลือ 8 เม็ด' / 'หมดแล้ว' */
  right: string;
}

export interface CareList {
  expired: CareItem[];
  lowStock: CareItem[];
  expirySoon: CareItem[];
  /** how many different medicines need care (one in two groups counts once) */
  count: number;
}

const HOUSE_LABEL = 'ยาสามัญประจำบ้าน';

interface Entry {
  item: CareItem;
  order: number; // smaller = more urgent
  tie: number; // inside a group members come before house medicines
}

const byUrgency = (a: Entry, b: Entry): number =>
  a.tie - b.tie || a.order - b.order || a.item.name.localeCompare(b.item.name, 'th');

export function careItems(root: Root, today: IsoDate): CareList {
  const { expiryWarnDays, lowStockDays } = root.settings;
  const expired: Entry[] = [];
  const lowStock: Entry[] = [];
  const expirySoon: Entry[] = [];

  const addExpiry = (id: string, kind: CareItem['kind'], name: string, owner: string, expiry: string | undefined, tie: number) => {
    const e = expiryStatus(expiry, today, expiryWarnDays);
    if (e.days === null) return;
    const sub = `${owner} · หมดอายุ ${thaiDateShort(expiry as string)}`;
    if (e.status === 'expired') {
      expired.push({ item: { group: 'expired', id, kind, name, sub, right: `เกิน ${-e.days} วัน` }, order: e.days, tie });
    } else if (e.status === 'soon') {
      const right = e.days === 0 ? 'วันนี้' : `อีก ${e.days} วัน`;
      expirySoon.push({ item: { group: 'expirySoon', id, kind, name, sub, right }, order: e.days, tie });
    }
  };

  for (const a of root.assignments) {
    if (a.status !== 'active') continue;
    const person = root.persons.find((p) => p.id === a.personId);
    const med = root.medications.find((m) => m.id === a.medicationId);
    if (!person || person.removedAt !== undefined || !med) continue;

    addExpiry(a.id, 'member', med.name, person.name, a.expiry, 0);

    if (isLowStock(a, today, lowStockDays, root.events)) {
      const left = daysLeft(a, today, root.events);
      const days = left.status === 'ok' ? left.days : 0;
      const qty = stockNow(a, today, root.events) ?? 0;
      lowStock.push({
        item: {
          group: 'lowStock',
          id: a.id,
          kind: 'member',
          name: med.name,
          sub: `${person.name} · มี ${formatPills(qty, med.unit)}`,
          right: days === 0 ? 'ไม่พอสำหรับวันนี้' : `เหลือ ${days} วัน`,
        },
        order: days,
        tie: 0,
      });
    }
  }

  for (const h of root.houseItems) {
    if (h.removedAt !== undefined) continue;
    addExpiry(h.id, 'house', h.name, HOUSE_LABEL, h.expiry, 1);
    const status = houseStatus(h);
    if ((status === 'low' || status === 'out') && h.stock) {
      lowStock.push({
        item: {
          group: 'lowStock',
          id: h.id,
          kind: 'house',
          name: h.name,
          sub: h.lowAt !== undefined && status === 'low' ? `${HOUSE_LABEL} · เตือนเมื่อเหลือไม่เกิน ${h.lowAt}` : HOUSE_LABEL,
          right: status === 'out' ? 'หมดแล้ว' : `เหลือ ${h.stock.qty} ${h.stock.unit}`,
        },
        order: h.stock.qty,
        tie: 1,
      });
    }
  }

  const items = (list: Entry[]): CareItem[] => [...list].sort(byUrgency).map((e) => e.item);
  const result = { expired: items(expired), lowStock: items(lowStock), expirySoon: items(expirySoon) };
  const ids = new Set([...result.expired, ...result.lowStock, ...result.expirySoon].map((i) => i.id));
  return { ...result, count: ids.size };
}

export type MemberStatus =
  | 'low' // some medicine is running low
  | 'selfManaged' // sets out their own medicine; we watch the stock
  | 'noMeds' // no active medicine
  | 'noStock' // no medicine has a stock count
  | 'ok';

export interface MemberCard {
  personId: string;
  name: string;
  color: Root['persons'][number]['color'];
  medCount: number;
  status: MemberStatus;
}

/** How the stock of one member stands: how many active medicines are low, or why nothing can be said. */
export type MemberStock = { status: 'low'; lowCount: number } | { status: 'ok' | 'noMeds' | 'noStock' };

/** Stock of one member's active medicines (stopped ones are left out). Only medicines with a count are judged. */
export function memberStock(root: Root, personId: string, today: IsoDate): MemberStock {
  const active = root.assignments.filter((a) => a.personId === personId && a.status === 'active');
  const lowCount = active.filter((a) => isLowStock(a, today, root.settings.lowStockDays, root.events)).length;
  if (lowCount > 0) return { status: 'low', lowCount };
  if (active.length === 0) return { status: 'noMeds' };
  return { status: active.some((a) => a.stock !== null) ? 'ok' : 'noStock' };
}

/** One card per member who is not removed. Low stock is shown even for a self-managed member (a warning is never hidden). */
export function memberCards(root: Root, today: IsoDate): MemberCard[] {
  return root.persons
    .filter((p) => p.removedAt === undefined)
    .map((p) => {
      const medCount = root.assignments.filter((a) => a.personId === p.id && a.status === 'active').length;
      const stock = memberStock(root, p.id, today);
      const status: MemberStatus = stock.status === 'low' ? 'low' : p.selfManaged ? 'selfManaged' : stock.status;
      return { personId: p.id, name: p.name, color: p.color, medCount, status };
    });
}
