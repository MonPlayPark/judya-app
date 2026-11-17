// Receiving an order (M4 PR 11.5a): domain only. Pure functions on `Root`: no storage, no clock (`today` / `nowIso` are passed in), no UI.
// Stock goes up ONLY by what arrived this time (`qtyReceivedNow`), through `refillStock` (docs/M4-PR11-GAP.md section 3). No MedEvent is made.
// All or nothing: the new root is returned only when every step worked, so the screen writes ONE root once.
import type { IsoDate } from '../calc';
import { refillStock, type RefillAmount } from './stock';
import { rootSchema, type Assignment, type Medication, type Order, type OrderLine, type Root } from './schema';

export interface ReceiveInput {
  lineIndex: number;
  /** Sell units that arrived THIS time (>= 0). */
  qtyReceivedNow: number;
  /** What to do with the rest when the line is still short. null = decided by the domain (waiting). Ignored when the line is complete. */
  leftover: 'waiting' | 'dropped' | null;
  /** A typed (free) line: the owner's answer to "add to the medicine list?". */
  addToList?: boolean;
}

export interface ReceiveSummary {
  /** People whose share was skipped (assignment stopped or missing). */
  skipped: string[];
  /** People who got no tube / bottle (fewer tubes than people). */
  noTube: string[];
  /** People whose stock was never counted: counting now starts from what arrived (the screen warns). */
  startedCount: string[];
  /** Typed lines that arrived (> 0): the screen asks "add to the medicine list?". */
  askAdd: { lineIndex: number; name: string }[];
}

export type ReceiveResult = ({ ok: true; root: Root } & ReceiveSummary) | { ok: false; error: string };
export type DropResult = { ok: true; root: Root } | { ok: false; error: string };

class ReceiveError extends Error {}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const EPS = 1e-9;
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const isComplete = (l: Pick<OrderLine, 'qtyOrdered' | 'qtyReceived'>): boolean => l.qtyReceived + EPS >= l.qtyOrdered;

/** The sheet's starting values: every line gets "the rest of what was ordered" (never below 0), no leftover decision. */
export function defaultReceive(order: Order): ReceiveInput[] {
  return order.lines.map((l, lineIndex) => ({ lineIndex, qtyReceivedNow: Math.max(round4(l.qtyOrdered - l.qtyReceived), 0), leftover: null }));
}

/** Split `total` whole units over `weights`: proportional, rounded down; the rest one at a time to the largest weight first (a tie = the first in the list).
 * The parts add up to `total` exactly, never more. */
function splitWhole(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => (sum > 0 ? Math.floor((total * w) / sum + EPS) : 0));
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w || a.i - b.i);
  for (let k = 0; rest > 0 && order.length > 0; k = (k + 1) % order.length) {
    parts[order[k]!.i]! += 1;
    rest -= 1;
  }
  return parts;
}

/** Whole tubes handed out one at a time, the largest weight first (a tie = the first in the list), round and round until none are left. */
function oneAtATime(total: number, weights: readonly number[]): number[] {
  const parts = weights.map(() => 0);
  const order = weights.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w || a.i - b.i);
  for (let k = 0; k < total && order.length > 0; k++) parts[order[k % order.length]!.i]! += 1;
  return parts;
}

type Kind = RefillAmount['kind'];

/** Stock kind to refill: the kind the assignment already has; else by the medicine's kind. null = no rule (kind `other` never counted: rule 7). */
function refillKind(a: Assignment, m: Medication): Kind | null {
  if (a.stock) return a.stock.kind;
  switch (m.kind) {
    case 'tablet':
    case 'capsule':
    case 'sachet':
      return 'count';
    case 'liquid':
      return 'volume';
    case 'cream':
    case 'drops':
      return 'tubes';
    default:
      return null;
  }
}

const amountOf = (kind: Kind, n: number): RefillAmount =>
  kind === 'count' ? { kind: 'count', strips: 0, loose: n } : kind === 'volume' ? { kind: 'volume', ml: n } : { kind: 'tubes', spare: n };

/** Records an order's received amounts and raises the stock of the medicines in it. See the header for the rules. */
export function receiveOrder(root: Root, orderId: string, received: readonly ReceiveInput[], today: IsoDate, nowIso: string): ReceiveResult {
  try {
    return receive(root, orderId, received, today, nowIso);
  } catch (e) {
    if (e instanceof ReceiveError) return fail(e.message);
    throw e;
  }
}

function receive(root: Root, orderId: string, received: readonly ReceiveInput[], today: IsoDate, nowIso: string): ReceiveResult {
  const order = root.orders.find((o) => o.id === orderId);
  if (!order) return fail('ไม่พบใบสั่งนี้');
  if (order.status !== 'waiting' && order.status !== 'partial') return fail('รับของได้เฉพาะใบสั่งที่ยังรอรับของหรือรับบางส่วน');

  const byLine = new Map<number, ReceiveInput>();
  for (const r of received) {
    if (!Number.isInteger(r.lineIndex) || r.lineIndex < 0 || r.lineIndex >= order.lines.length) return fail('ไม่พบรายการยาในใบสั่ง');
    if (!Number.isFinite(r.qtyReceivedNow) || r.qtyReceivedNow < 0) return fail('จำนวนที่รับต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    if (byLine.has(r.lineIndex)) return fail('มีรายการยาซ้ำกันในข้อมูลที่รับ');
    byLine.set(r.lineIndex, r);
  }

  const summary: ReceiveSummary = { skipped: [], noTube: [], startedCount: [], askAdd: [] };
  const assignments = new Map<string, Assignment>(root.assignments.map((a) => [a.id, a]));
  const houseStock = new Map<string, { qty: number; unit: string }>();
  const personName = (a: Assignment | undefined, fallback: string): string => root.persons.find((p) => p.id === a?.personId)?.name ?? fallback;

  const lines: OrderLine[] = order.lines.map((l, lineIndex) => {
    const input = byLine.get(lineIndex);
    const now = input?.qtyReceivedNow ?? 0;
    const qtyReceived = round4(l.qtyReceived + now);
    const complete = isComplete({ qtyOrdered: l.qtyOrdered, qtyReceived });
    const leftover: OrderLine['leftover'] = complete ? null : (input?.leftover ?? l.leftover ?? 'waiting');
    const next: OrderLine = { ...l, qtyReceived, leftover, ...(input?.addToList === undefined ? {} : { addToList: input.addToList }) };

    if (l.source.kind === 'free') {
      if (now > 0) summary.askAdd.push({ lineIndex, name: l.source.name });
      return next;
    }
    if (now <= 0) return next;

    if (l.source.kind === 'house') {
      const houseItemId = l.source.houseItemId;
      const item = root.houseItems.find((h) => h.id === houseItemId);
      if (!item?.stock) return next; // not counted (rule 8): no update
      if (l.sellUnit.trim() !== item.stock.unit.trim()) throw new ReceiveError('หน่วยที่สั่งไม่ตรงกับหน่วยที่นับสต็อกของยาสามัญ');
      const cur = houseStock.get(item.id) ?? item.stock;
      houseStock.set(item.id, { ...cur, qty: round4(cur.qty + now) });
      return next;
    }

    // a medicine of the app
    const { medicationId, shares } = l.source;
    const m = root.medications.find((x) => x.id === medicationId);
    if (!m) throw new ReceiveError('ไม่พบข้อมูลยาของรายการนี้');
    const eligible: { a: Assignment; qty: number }[] = [];
    for (const s of shares) {
      const a = assignments.get(s.assignmentId);
      if (!a || a.status === 'stopped') {
        summary.skipped.push(personName(a, s.assignmentId));
        continue;
      }
      if (refillKind(a, m) === null) continue; // kind `other`, never counted: no update (rule 7)
      eligible.push({ a, qty: s.qty });
    }
    if (eligible.length === 0) return next;
    const kind = refillKind(eligible[0]!.a, m)!;
    let total: number;
    if (kind === 'tubes') {
      if (!Number.isInteger(now)) throw new ReceiveError('จำนวนหลอดหรือขวดที่รับต้องเป็นจำนวนเต็ม');
      total = now; // whole tubes: perSellUnit is not used
    } else {
      total = Math.floor(now * (l.perSellUnit ?? 1) + EPS); // whole pills / sachets / ml
    }
    const weights = eligible.map((e) => e.qty);
    const parts = kind === 'tubes' ? oneAtATime(total, weights) : splitWhole(total, weights);
    eligible.forEach(({ a }, i) => {
      const n = parts[i]!;
      if (n <= 0) {
        if (kind === 'tubes') summary.noTube.push(personName(a, a.id));
        return;
      }
      const cur = assignments.get(a.id)!;
      const res = refillStock(cur, m, root.events, today, amountOf(kind, n));
      if (!res.ok) throw new ReceiveError(res.error);
      if (cur.stock === null) summary.startedCount.push(personName(a, a.id));
      assignments.set(a.id, res.assignment);
    });
    return next;
  });

  const allDone = lines.every((l) => l.leftover === 'dropped' || isComplete(l));
  const nextOrder: Order = allDone ? { ...order, lines, status: 'received', closedAt: nowIso } : { ...order, lines, status: 'partial' };
  const nextRoot: Root = {
    ...root,
    assignments: root.assignments.map((a) => assignments.get(a.id) ?? a),
    houseItems: root.houseItems.map((h) => (houseStock.has(h.id) ? { ...h, stock: houseStock.get(h.id)! } : h)),
    orders: root.orders.map((o) => (o.id === orderId ? nextOrder : o)),
  };
  if (!rootSchema.safeParse(nextRoot).success) return fail('ข้อมูลหลังรับของไม่ถูกต้อง จึงไม่บันทึก');
  return { ok: true, root: nextRoot, ...summary };
}

/** "ไม่รอแล้ว": every line still waited for is dropped and the order is closed as received. Only a `partial` order. Stock is not touched. */
export function dropRest(root: Root, orderId: string, nowIso: string): DropResult {
  const order = root.orders.find((o) => o.id === orderId);
  if (!order) return fail('ไม่พบใบสั่งนี้');
  if (order.status !== 'partial') return fail('ใช้ได้เฉพาะใบสั่งที่รับบางส่วน');
  const lines = order.lines.map((l): OrderLine => (isComplete(l) || l.leftover === 'dropped' ? l : { ...l, leftover: 'dropped' }));
  const nextRoot: Root = { ...root, orders: root.orders.map((o) => (o.id === orderId ? { ...o, lines, status: 'received' as const, closedAt: nowIso } : o)) };
  if (!rootSchema.safeParse(nextRoot).success) return fail('ข้อมูลไม่ถูกต้อง จึงไม่บันทึก');
  return { ok: true, root: nextRoot };
}
