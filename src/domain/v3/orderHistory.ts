// The order history (M4 PR 11.4): the saved orders as rows for the screen, cancelling a waiting order, and "สั่งซ้ำ" (reorder) = draft lines made from
// an old order. Pure: no storage, no clock (`today` / `nowIso` are passed in), no UI. Nothing here changes stock or the status of a received order.
import type { IsoDate } from '../calc';
import { thaiDateShort } from '../format';
import { label } from './medsList';
import { makeFreeLine, makeManualLine, type DraftLine } from './orderLines';
import { rootSchema, type Order, type OrderLine, type Root } from './schema';

export const STATUS_LABEL: Record<Order['status'], string> = {
  waiting: 'รอรับของ',
  partial: 'รับบางส่วน',
  received: 'รับแล้ว',
  cancelled: 'ยกเลิก',
};

export const HISTORY_FILTERS = ['all', 'waiting', 'received'] as const;
export type HistoryFilter = (typeof HISTORY_FILTERS)[number];
export const FILTER_LABEL: Record<HistoryFilter, string> = { all: 'ทั้งหมด', waiting: 'รอรับของ', received: 'รับแล้ว' };

const BANGKOK_OFFSET_MS = 7 * 3_600_000;

/** The calendar day in Thailand (UTC+7, no summer time) of an ISO date-time, as 'YYYY-MM-DD'. A phone saves `createdAt` in UTC ('...Z'), so
 * cutting the first 10 letters would show the day before between 00:00 and 07:00. null = not a date-time. */
export function bangkokDay(iso: string): IsoDate | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + BANGKOK_OFFSET_MS).toISOString().slice(0, 10) as IsoDate;
}

/** '12 ต.ค. 2569' ('' when the date cannot be read). */
export const orderDateText = (o: Pick<Order, 'createdAt'>): string => {
  const day = bangkokDay(o.createdAt);
  return day ? thaiDateShort(day) : '';
};

export const DELETED_MEDICINE = 'ยาที่ถูกลบแล้ว';

/** The name of a line's medicine as it is now (with strength); the name kept in the order for a typed one. */
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

// ---------- the list ----------

/** Filter: all = every order (cancelled ones too); waiting = `waiting` + `partial`; received = `received`. A cancelled order shows only under all.
 * Newest first by `createdAt` (the order of adding when the time is the same). */
export function filterOrders(orders: readonly Order[], filter: HistoryFilter): Order[] {
  const keep = (o: Order): boolean => (filter === 'all' ? true : filter === 'waiting' ? o.status === 'waiting' || o.status === 'partial' : o.status === 'received');
  return orders
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => keep(o))
    .sort((a, b) => (a.o.createdAt < b.o.createdAt ? 1 : a.o.createdAt > b.o.createdAt ? -1 : b.i - a.i))
    .map(({ o }) => o);
}

export type OrderTotal = { kind: 'none' } | { kind: 'amount'; amount: number; unpriced: number };

const money = (n: number): number => Math.round(n * 100) / 100;

/** Sum of unitPrice x qtyOrdered of the lines that have a price, plus `shippingFee` when `includeShipping`. A line with no price is not counted
 * (`unpriced` says how many). No price on any line = `none` (never a bare shipping fee). */
export function orderTotal(o: Order): OrderTotal {
  const priced = o.lines.filter((l) => l.unitPrice !== undefined);
  if (priced.length === 0) return { kind: 'none' };
  const items = priced.reduce((sum, l) => sum + (l.unitPrice ?? 0) * l.qtyOrdered, 0);
  const fee = o.includeShipping ? (o.shippingFee ?? 0) : 0;
  return { kind: 'amount', amount: money(items + fee), unpriced: o.lines.length - priced.length };
}

/** Lines still waited for: not fully received and the rest not dropped ("ยังรอ N รายการ"). */
export const stillWaiting = (o: Order): number => o.lines.filter((l) => l.leftover !== 'dropped' && l.qtyReceived < l.qtyOrdered).length;

// ---------- cancel ----------

export type CancelError = 'not_found' | 'not_waiting' | 'invalid_root';
export type CancelResult = { ok: true; root: Root } | { ok: false; error: CancelError };

/** Cancels a `waiting` order: status `cancelled`, `closedAt` = now. Nothing else changes (stock included). Only `waiting` can be cancelled here
 * (a partly received order is 11.5). */
export function cancelOrder(root: Root, orderId: string, nowIso: string): CancelResult {
  const o = root.orders.find((x) => x.id === orderId);
  if (!o) return { ok: false, error: 'not_found' };
  if (o.status !== 'waiting') return { ok: false, error: 'not_waiting' };
  const next: Root = { ...root, orders: root.orders.map((x) => (x.id === orderId ? { ...x, status: 'cancelled' as const, closedAt: nowIso } : x)) };
  if (!rootSchema.safeParse(next).success) return { ok: false, error: 'invalid_root' };
  return { ok: true, root: next };
}

// ---------- reorder ----------

export interface ReorderResult {
  lines: DraftLine[];
  /** Medicines that are no longer usable (deleted, stopped, a house medicine removed or not counted). */
  skipped: number;
}

/** Draft lines for ordering `order` again: reason 'repeat', ticked, with the old quantity, sell unit and count per sell unit. Prices are not copied
 * (the remembered price of the shop chosen later is used). `shares` are what the people need now, never the old ones.
 * - A medicine whose key is in `existingKeys` (or twice in the order) is left out silently: the line already in the list stays as it is.
 * - A deleted or stopped medicine (nobody uses it), a removed house medicine or one whose stock is not counted is left out and counted in `skipped`.
 * - A house medicine keeps the old quantity in the unit of its stock now.
 * - A typed medicine is made again from what was typed (name, kind, strength, ask-later); it is never swapped for a medicine of the app. */
export function reorderLines(root: Root, order: Order, today: IsoDate, existingKeys: Iterable<string> = []): ReorderResult {
  const seen = new Set(existingKeys);
  const lines: DraftLine[] = [];
  let skipped = 0;
  const add = (line: DraftLine): void => {
    if (seen.has(line.key)) return;
    seen.add(line.key);
    lines.push(line);
  };

  for (const l of order.lines) {
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
      if (made.ok) add({ ...made.line, reason: 'repeat' });
      else skipped += 1;
      continue;
    }
    const ref = l.source.kind === 'med' ? ({ kind: 'med', medicationId: l.source.medicationId } as const) : ({ kind: 'house', houseItemId: l.source.houseItemId } as const);
    const base = makeManualLine(root, ref, today);
    if (!base) {
      skipped += 1;
      continue;
    }
    // the old unit and count are kept as they were ordered (any unit text is allowed; the unit sheet can change it). A house medicine keeps its stock unit.
    if (l.source.kind === 'house') add({ ...base, qtyOrdered: l.qtyOrdered, reason: 'repeat' });
    else add({ ...base, sellUnit: l.sellUnit, perSellUnit: l.perSellUnit ?? base.perSellUnit, qtyOrdered: l.qtyOrdered, reason: 'repeat' });
  }
  return { lines, skipped };
}

export const REORDER_TOAST = 'คัดลอกรายการมาแล้ว ใช้ราคาล่าสุดของแต่ละร้าน';

/** The floating message after "สั่งซ้ำ". */
export const reorderMessage = (r: Pick<ReorderResult, 'skipped'>): string => (r.skipped > 0 ? `${REORDER_TOAST} · ข้าม ${r.skipped} รายการที่ไม่มีในรายการยาแล้ว` : REORDER_TOAST);
