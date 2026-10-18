// What the medicine screens show about one medicine of one member (step 3.2b-2): status badges, the stock and
// expiry blocks, and the history list. Pure: `today` is passed in. The numbers come from stock.ts and calc.ts;
// nothing about stock or days left is calculated here.
import { addDays, expiryStatus, type IsoDate } from './calc';
import { formatPills, thaiDateShort } from './format';
import { describeSchedule } from './scheduleForm';
import type { Assignment, MedEvent, Person, Root } from './schema';
import { daysLeft, isLowStock, stockNow } from './stock';

export type BadgeKind = 'expired' | 'low' | 'soon' | 'ok' | 'noStock' | 'stopped' | 'active';

export const BADGE_TEXT: Record<BadgeKind, string> = {
  expired: 'หมดอายุแล้ว',
  low: 'ใกล้หมด',
  soon: 'ใกล้หมดอายุ',
  ok: 'สต๊อกพอ',
  noStock: 'ไม่ได้ใส่จำนวน',
  stopped: 'หยุดใช้แล้ว',
  active: 'กำลังใช้',
};

/** Warnings only, most urgent first: expired, low on stock (settings.lowStockDays), expiring (settings.expiryWarnDays). */
export function warnings(root: Root, a: Assignment, today: IsoDate): BadgeKind[] {
  const out: BadgeKind[] = [];
  const e = expiryStatus(a.expiry, today, root.settings.expiryWarnDays);
  if (e.status === 'expired') out.push('expired');
  if (isLowStock(a, today, root.settings.lowStockDays, root.events)) out.push('low');
  if (e.status === 'soon') out.push('soon');
  return out;
}

/** Badges of one row in "ยาทั้งหมด": stopped = only "หยุดใช้แล้ว"; warnings; else "สต๊อกพอ" or "ไม่ได้ใส่จำนวน". */
export function listBadges(root: Root, a: Assignment, today: IsoDate): BadgeKind[] {
  if (a.status === 'stopped') return ['stopped'];
  const w = warnings(root, a, today);
  if (w.length > 0) return w;
  return [a.stock ? 'ok' : 'noStock'];
}

/** Badges at the top of the detail screen: "กำลังใช้" / "หยุดใช้แล้ว" and then the warnings. */
export function detailBadges(root: Root, a: Assignment, today: IsoDate): BadgeKind[] {
  return [a.status === 'stopped' ? 'stopped' : 'active', ...warnings(root, a, today)];
}

/** The amount the person sees today: stockNow while active, the frozen count while stopped, null without a count. */
export function shownQty(root: Root, a: Assignment, today: IsoDate): number | null {
  if (!a.stock) return null;
  return a.status === 'stopped' ? a.stock.qty : (stockNow(a, today, root.events) ?? a.stock.qty);
}

export interface InfoBlock {
  value: string;
  sub: string;
}

/** "เหลืออยู่": '14 เม็ด' + 'พอทาน 7 วัน (ถึง 24 ต.ค. 2569)'. No count = 'ไม่ได้ใส่จำนวนคงเหลือ' (never 0). */
export function stockBlock(root: Root, a: Assignment, unit: string, today: IsoDate): InfoBlock {
  const qty = shownQty(root, a, today);
  if (qty === null) return { value: 'ไม่ได้ใส่จำนวนคงเหลือ', sub: '' };
  const value = formatPills(qty, unit);
  if (a.status === 'stopped') return { value, sub: 'หยุดใช้อยู่ ไม่หักสต๊อก' };
  if (qty === 0) return { value, sub: 'หมดแล้ว' };
  const left = daysLeft(a, today, root.events);
  if (left.status === 'ok') {
    if (left.days === 0) return { value, sub: 'ไม่พอสำหรับวันนี้' };
    return { value, sub: `พอทาน ${left.days} วัน (ถึง ${thaiDateShort(addDays(left.depletionDate, -1))})` };
  }
  return { value, sub: 'พอทานตามวิธีกินที่ตั้งไว้' };
}

/** "หมดอายุ": the Thai date and how far away it is; no date = 'ไม่ระบุ'. */
export function expiryBlock(root: Root, a: Assignment, today: IsoDate): InfoBlock {
  const e = expiryStatus(a.expiry, today, root.settings.expiryWarnDays);
  if (e.days === null || !a.expiry) return { value: 'ไม่ระบุ', sub: '' };
  const sub = e.days < 0 ? `หมดอายุแล้ว (เกิน ${-e.days} วัน)` : e.days === 0 ? 'วันนี้' : `อีก ${e.days} วัน`;
  return { value: thaiDateShort(a.expiry), sub };
}

export interface MemberMeds {
  person: Person;
  active: Assignment[];
  stopped: Assignment[];
}

/** Members who are still in the house, each with their active and stopped medicines (order they were added). */
export function medsByMember(root: Root): MemberMeds[] {
  return root.persons
    .filter((p) => p.removedAt === undefined)
    .map((person) => {
      const mine = root.assignments.filter((a) => a.personId === person.id && root.medications.some((m) => m.id === a.medicationId));
      return {
        person,
        active: mine.filter((a) => a.status === 'active'),
        stopped: mine.filter((a) => a.status === 'stopped'),
      };
    });
}

export interface HistoryEntry {
  id: string;
  type: MedEvent['type'];
  date: string;
  title: string;
  lines: string[];
  reason?: string;
  note?: string;
}

const TITLE: Record<MedEvent['type'], string> = {
  start: 'เริ่มใช้ยา',
  adjust: 'ปรับโดส',
  stop: 'หยุดยา',
  resume: 'กลับมาใช้ยา',
  edit: 'แก้ไขข้อมูลยา',
};

/** History of one medicine of one member, newest first (events are only ever appended, so the list is reversed). */
export function historyEntries(root: Root, assignmentId: string, name: string, unit: string): HistoryEntry[] {
  const qty = (n: number | null | undefined): string => (n === null || n === undefined ? 'ไม่ได้ใส่' : formatPills(n, unit));
  const day = (d: string | null | undefined): string => (d ? thaiDateShort(d) : 'ไม่ระบุ');
  const text = (t: string | null | undefined): string => (t ? `“${t}”` : 'ไม่มี');
  return root.events
    .filter((e) => e.assignmentId === assignmentId)
    .reverse()
    .map((e) => {
      const lines: string[] = [];
      if (e.type === 'start' && e.to?.schedule) lines.push(describeSchedule(e.to.schedule, unit, true));
      if (e.type === 'adjust' && e.from?.schedule && e.to?.schedule) {
        lines.push(`จาก ${describeSchedule(e.from.schedule, unit, true)}`, `เป็น ${describeSchedule(e.to.schedule, unit, true)}`);
      }
      if (e.type === 'stop') lines.push(`หยุดทาน ${name}`);
      if (e.type === 'resume') lines.push(`กลับมาทาน ${name}`);
      if (e.type === 'edit' && e.from && e.to) {
        if (e.to.name !== undefined) lines.push(`ชื่อ: ${e.from.name ?? ''} → ${e.to.name}`);
        if (e.to.stockQty !== undefined) lines.push(`จำนวนที่เหลือ: ${qty(e.from.stockQty)} → ${qty(e.to.stockQty)}`);
        if (e.to.expiry !== undefined) lines.push(`วันหมดอายุ: ${day(e.from.expiry)} → ${day(e.to.expiry)}`);
        if (e.to.note !== undefined) lines.push(`บันทึก: ${text(e.from.note)} → ${text(e.to.note)}`);
      }
      return {
        id: e.id,
        type: e.type,
        date: thaiDateShort(e.effectiveOn),
        title: TITLE[e.type],
        lines,
        ...(e.reason ? { reason: e.reason } : {}),
        ...(e.note ? { note: e.note } : {}),
      };
    });
}
