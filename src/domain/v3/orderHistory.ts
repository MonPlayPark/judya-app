// The order history (M4 PR 11.4): the saved orders as rows for the screen, and "สั่งซ้ำ" (reorder) = draft lines made from an old order.
// Pure: no storage, no clock (`today` is passed in), no UI. Nothing here writes; the page keeps the new lines in its draft.
import type { IsoDate } from '../calc';
import { thaiDateShort } from '../format';
import { label } from './medsList';
import { makeFreeLine, makeManualLine, type DraftLine } from './orderLines';
import type { Order, OrderLine, Root } from './schema';

export const STATUS_LABEL: Record<Order['status'], string> = {
  waiting: 'รอรับของ',
  partial: 'รับบางส่วน',
  received: 'รับครบแล้ว',
  cancelled: 'ยกเลิก',
};

const BANGKOK_OFFSET_MS = 7 * 3_600_000;

/** The calendar day in Thailand (UTC+7, no summer time) of an ISO date-time, as 'YYYY-MM-DD'. A phone saves `createdAt` in UTC ('...Z'), so
 * cutting the first 10 letters would show the day before between 00:00 and 07:00. null = not a date-time. */
export function bangkokDay(iso: string): IsoDate | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + BANGKOK_OFFSET_MS).toISOString().slice(0, 10) as IsoDate;
}

export const DELETED_MEDICINE = 'ยาที่ถูกลบแล้ว';

/** The name of a line's medicine as it is now (with strength); the name kept in the order for a typed one; a house medicine by its name. */
export function orderLineName(root: Root, line: OrderLine): string {
  switch (line.source.kind) {
    case 'med': {
      const id = line.source.medicationId;
      const m = root.medications.find((x) => x.id === id);
      return m ? label(m) : DELETED_MEDICINE;
    }
    case 'house': {
      const id = line.source.houseItemId;
      return root.houseItems.find((h) => h.id === id)?.name ?? DELETED_MEDICINE;
    }
    case 'free':
      return label({ name: line.source.name, strength: line.source.strength });
  }
}

export interface HistoryLine {
  name: string;
  /** "2 กล่อง" */
  qty: string;
}

export interface HistoryRow {
  id: string;
  shopName: string;
  /** "12 ต.ค. 2569" ('' when the date cannot be read). */
  dateText: string;
  status: Order['status'];
  statusText: string;
  count: number;
  /** "฿1,250" - only when every line has a price (a total with missing prices would look cheaper than it is); null otherwise. */
  total: number | null;
  lines: HistoryLine[];
}

const money = (n: number): number => Math.round(n * 100) / 100;

/** The orders, newest first (the order of adding when the time is the same). */
export function historyRows(root: Root): HistoryRow[] {
  return root.orders
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (a.o.createdAt < b.o.createdAt ? 1 : a.o.createdAt > b.o.createdAt ? -1 : b.i - a.i))
    .map(({ o }) => {
      const day = bangkokDay(o.createdAt);
      const allPriced = o.lines.length > 0 && o.lines.every((l) => l.unitPrice !== undefined);
      const items = o.lines.reduce((sum, l) => sum + (l.unitPrice ?? 0) * l.qtyOrdered, 0);
      const fee = o.includeShipping ? (o.shippingFee ?? 0) : 0;
      return {
        id: o.id,
        shopName: o.shopName,
        dateText: day ? thaiDateShort(day) : '',
        status: o.status,
        statusText: STATUS_LABEL[o.status],
        count: o.lines.length,
        total: allPriced ? money(items + fee) : null,
        lines: o.lines.map((l) => ({ name: orderLineName(root, l), qty: `${l.qtyOrdered} ${l.sellUnit}` })),
      };
    });
}

export interface SkippedLine {
  name: string;
  reason: 'stopped_or_deleted' | 'not_counted' | 'already_in_list';
}
export interface ReorderResult {
  lines: DraftLine[];
  skipped: SkippedLine[];
}

/** Draft lines for ordering `order` again: reason 'repeat', ticked, with the old quantity, sell unit and count per sell unit.
 * - A medicine of the app is built as the "add by hand" line is (its `shares` are what the people need now, never the old ones). It is left out
 *   when it was deleted or nobody uses it any more (all stopped / people taken out).
 * - A house medicine is left out when it was removed or its stock is not counted (its unit is not known). Its unit stays the unit of its stock
 *   NOW (an old unit that differs is not kept); the old quantity is.
 * - A typed medicine is made again with its kind, strength and "ask later" choice. If its name is now a medicine of the app, that medicine is
 *   used instead (as the "ใช้ยาในระบบ" button does), or it is left out when that cannot be used.
 * - A line whose key is already in `existingKeys` (or twice in the order) is left out: `already_in_list`.
 * Every medicine left out is reported with a reason, so the screen can say it. */
export function reorderLines(root: Root, order: Order, today: IsoDate, existingKeys: Iterable<string> = []): ReorderResult {
  const seen = new Set(existingKeys);
  const lines: DraftLine[] = [];
  const skipped: SkippedLine[] = [];
  const add = (line: DraftLine, name: string): void => {
    if (seen.has(line.key)) {
      skipped.push({ name, reason: 'already_in_list' });
      return;
    }
    seen.add(line.key);
    lines.push(line);
  };

  for (const l of order.lines) {
    const name = orderLineName(root, l);
    if (l.source.kind === 'free') {
      const made = makeFreeLine(root, {
        name: l.source.name,
        qty: l.qtyOrdered,
        sellUnit: l.sellUnit,
        perSellUnit: l.perSellUnit ?? null,
        medKind: l.source.medKind ?? null,
        strength: l.source.strength ?? null,
        ...(l.addToList === undefined ? {} : { addToList: l.addToList }),
      });
      if (!made.ok) {
        skipped.push({ name, reason: 'stopped_or_deleted' });
        continue;
      }
      if (made.clash) {
        const ref = made.clash.kind === 'med' ? ({ kind: 'med', medicationId: made.clash.medicationId } as const) : ({ kind: 'house', houseItemId: made.clash.houseItemId } as const);
        const own = makeManualLine(root, ref, today);
        if (own) add({ ...own, qtyOrdered: Math.max(1, Math.round(l.qtyOrdered)), reason: 'repeat' }, name);
        else skipped.push({ name, reason: made.clash.kind === 'house' ? 'not_counted' : 'stopped_or_deleted' });
        continue;
      }
      add({ ...made.line, reason: 'repeat' }, name);
      continue;
    }
    const ref = l.source.kind === 'med' ? ({ kind: 'med', medicationId: l.source.medicationId } as const) : ({ kind: 'house', houseItemId: l.source.houseItemId } as const);
    const base = makeManualLine(root, ref, today);
    if (!base) {
      const house = l.source.kind === 'house' ? root.houseItems.find((h) => h.id === (l.source as { houseItemId: string }).houseItemId) : undefined;
      skipped.push({ name, reason: house && house.removedAt === undefined ? 'not_counted' : 'stopped_or_deleted' });
      continue;
    }
    if (l.source.kind === 'house') {
      add({ ...base, qtyOrdered: l.qtyOrdered, reason: 'repeat' }, name);
    } else {
      // the old unit and count are kept as they were ordered (any unit text is allowed by the schema; the unit sheet can change it)
      add({ ...base, sellUnit: l.sellUnit, perSellUnit: l.perSellUnit ?? base.perSellUnit, qtyOrdered: l.qtyOrdered, reason: 'repeat' }, name);
    }
  }
  return { lines, skipped };
}

/** The floating message after "สั่งซ้ำ": how many were put in, and how many were left out and why. */
export function reorderMessage(r: ReorderResult): string {
  if (r.lines.length === 0) return 'ไม่มีรายการที่สั่งซ้ำได้ (ยาหยุดใช้ ถูกลบ หรืออยู่ในรายการแล้ว)';
  const head = `ใส่ ${r.lines.length} รายการในรายการสั่งแล้ว`;
  return r.skipped.length === 0 ? head : `${head} ข้าม ${r.skipped.length} รายการ (ยาหยุดใช้ ถูกลบ หรืออยู่ในรายการแล้ว)`;
}
