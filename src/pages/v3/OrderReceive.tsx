// The receiving sheets of the order history (M4 PR 11.5b): "รับของ" (how much arrived per line), "เพิ่มยาเข้ารายการไหม" (typed medicines that arrived)
// and "ไม่รอของที่เหลือแล้วใช่ไหม". View only: the rules are in src/domain/v3/orderReceive.ts. The sheet runs `receiveOrder` as a dry run on the
// current numbers to show its notes, and hands ONE new root to the page, which writes it with one saveRoot (OrderBook pattern).
import { useMemo, useState } from 'react';
import { InfoIcon, MinusIcon, PlusIcon, WarningIcon } from '../../components/icons';
import { Sheet } from '../../components/v3/Sheet';
import { sheetStyles } from '../../components/v3/sheetParts';
import type { IsoDate } from '../../domain/calc';
import { orderDateText, orderLineName, stillWaiting } from '../../domain/v3/orderHistory';
import { defaultReceive, receiveOrder, type ReceiveInput } from '../../domain/v3/orderReceive';
import type { Order, OrderLine, Root } from '../../domain/v3/schema';
import styles from './OrderReceive.module.css';

export type ReceiveOutcome = { ok: true } | { ok: false; text: string };
export const SAVE_FAILED_TEXT = 'บันทึกไม่สำเร็จ ลองอีกครั้ง';

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const remainingOf = (l: OrderLine): number => Math.max(round4(l.qtyOrdered - l.qtyReceived), 0);
const joined = (names: readonly string[]): string => names.join(', ');

/** Lines the sheet has a row for: not finished and not dropped. */
const waitingIndexes = (o: Order): number[] => o.lines.flatMap((l, i) => (l.leftover !== 'dropped' && remainingOf(l) > 0 ? [i] : []));

/** Members a medicine line is for ("ของ ..."), by the people behind the shares. Empty for a house or typed line. */
function membersOf(root: Root, l: OrderLine): string[] {
  if (l.source.kind !== 'med') return [];
  const names = l.source.shares.flatMap((s) => {
    const a = root.assignments.find((x) => x.id === s.assignmentId);
    const p = a ? root.persons.find((x) => x.id === a.personId) : undefined;
    return p ? [p.name] : [];
  });
  return [...new Set(names)];
}

/** Lines whose stock the app will not update (typed; house without a stock count; a medicine of kind `other` with no stock rule). */
function notCounted(root: Root, l: OrderLine): boolean {
  if (l.source.kind === 'free') return true;
  if (l.source.kind === 'house') {
    const id = l.source.houseItemId;
    const h = root.houseItems.find((x) => x.id === id);
    return h !== undefined && !h.stock;
  }
  const { medicationId, shares } = l.source;
  const m = root.medications.find((x) => x.id === medicationId);
  if (!m || m.kind !== 'other') return false;
  const live = shares.flatMap((s) => root.assignments.filter((a) => a.id === s.assignmentId && a.status !== 'stopped'));
  return live.length > 0 && live.every((a) => !a.stock);
}

export interface ReceiveSheetProps {
  root: Root;
  order: Order;
  today: IsoDate;
  nowIso: () => string;
  /** Writes the new root (ONE write). `toast` is the message after it worked. The page answers ok only when it is really saved. */
  onSave: (next: Root, toast: string) => ReceiveOutcome;
  /** Called after a good save with the typed medicines that arrived. */
  onDone: (askAdd: string[]) => void;
  onClose: () => void;
}

export function ReceiveSheet({ root, order, today, nowIso, onSave, onDone, onClose }: ReceiveSheetProps) {
  const rows = useMemo(() => waitingIndexes(order), [order]);
  const [n, setN] = useState<Record<number, number>>(() => Object.fromEntries(defaultReceive(order).map((d) => [d.lineIndex, d.qtyReceivedNow])));
  const [drop, setDrop] = useState<Record<number, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);

  const inputs: ReceiveInput[] = rows.map((i) => {
    const l = order.lines[i]!;
    const now = n[i] ?? 0;
    return { lineIndex: i, qtyReceivedNow: now, leftover: now + 1e-9 < remainingOf(l) ? (drop[i] ? 'dropped' : 'waiting') : null };
  });
  const dry = receiveOrder(root, order.id, inputs, today, nowIso());
  const anyDropped = inputs.some((x) => x.leftover === 'dropped');
  const nothing = inputs.every((x) => x.qtyReceivedNow <= 0) && !anyDropped;
  const plain = rows.filter((i) => (n[i] ?? 0) > 0 && notCounted(root, order.lines[i]!)).map((i) => orderLineName(root, order.lines[i]!));

  const step = (i: number, delta: 1 | -1): void => {
    const max = remainingOf(order.lines[i]!);
    setN((cur) => ({ ...cur, [i]: round4(Math.min(Math.max((cur[i] ?? 0) + delta, 0), max)) }));
    setMessage(null);
  };

  const save = (): void => {
    const made = receiveOrder(root, order.id, inputs, today, nowIso());
    if (!made.ok) {
      setMessage(made.error);
      return;
    }
    const after = made.root.orders.find((o) => o.id === order.id);
    const toast = after && after.status === 'partial' ? `บันทึกรับของแล้ว ยังรอ ${stillWaiting(after)} รายการ` : 'บันทึกรับของแล้ว สต็อกอัปเดตแล้ว';
    const res = onSave(made.root, toast);
    if (!res.ok) {
      setMessage(SAVE_FAILED_TEXT);
      return;
    }
    onDone(made.askAdd.map((a) => a.name));
  };

  return (
    <Sheet title="รับของ" subtitle={`${order.shopName} · ${orderDateText(order)} · ${order.lines.length} รายการ`} onClose={onClose} closeButton tall>
      <ul className={styles.rows}>
        {rows.map((i) => {
          const l = order.lines[i]!;
          const name = orderLineName(root, l);
          const members = membersOf(root, l);
          const now = n[i] ?? 0;
          const max = remainingOf(l);
          const short = now + 1e-9 < max;
          return (
            <li key={i} className={styles.row}>
              <div className={styles.rowTop}>
                <div className={styles.rowText}>
                  <p className={styles.name}>{name}</p>
                  {members.length > 0 && <p className={styles.small}>ของ {joined(members)}</p>}
                  <p className={styles.small}>
                    สั่ง {l.qtyOrdered} {l.sellUnit}
                    {l.qtyReceived > 0 && ` · รับแล้ว ${l.qtyReceived}`}
                  </p>
                </div>
                <div className={styles.stepper} role="group" aria-label={`จำนวนที่รับ ${name}`}>
                  <button type="button" className={styles.step} aria-label={`ลดจำนวน ${name}`} disabled={now <= 0} onClick={() => step(i, -1)}>
                    <MinusIcon />
                  </button>
                  <p className={styles.qty} aria-live="polite">
                    {now}
                  </p>
                  <button type="button" className={styles.step} aria-label={`เพิ่มจำนวน ${name}`} disabled={!short} onClick={() => step(i, 1)}>
                    <PlusIcon />
                  </button>
                </div>
              </div>
              {short && (
                <div className={styles.pills} role="group" aria-label={`ส่วนที่เหลือของ ${name}`}>
                  <button type="button" className={styles.pill} aria-pressed={!drop[i]} onClick={() => setDrop((d) => ({ ...d, [i]: false }))}>
                    ยังรอส่วนที่เหลือ
                  </button>
                  <button type="button" className={styles.pill} aria-pressed={drop[i] === true} onClick={() => setDrop((d) => ({ ...d, [i]: true }))}>
                    ไม่รอแล้ว
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {dry.ok && dry.startedCount.length > 0 && (
        <p className={styles.warn}>
          <WarningIcon />
          ยาที่ยังไม่เคยนับ จะเริ่มนับจากของที่รับนี้ ไม่รวมที่มีอยู่เดิม: {joined(dry.startedCount)}
        </p>
      )}
      {dry.ok && dry.skipped.length > 0 && (
        <p className={styles.warn}>
          <WarningIcon />
          ข้ามสต็อกของ {joined(dry.skipped)} เพราะหยุดยาหรือนำออกแล้ว
        </p>
      )}
      {dry.ok && dry.noTube.length > 0 && (
        <p className={styles.warn}>
          <WarningIcon />
          หลอดไม่พอทุกคน {joined(dry.noTube)} ยังไม่ได้
        </p>
      )}
      {plain.length > 0 && (
        <p className={styles.grey}>
          <InfoIcon />
          ไม่อัปเดตสต็อก: {joined(plain)}
        </p>
      )}
      {message !== null && (
        <p className={styles.error} role="alert">
          <WarningIcon />
          {message}
        </p>
      )}
      <div className={sheetStyles.actions}>
        <button type="button" className={sheetStyles.primary} disabled={nothing} onClick={save}>
          บันทึกรับของ
        </button>
        <button type="button" className={sheetStyles.cancel} onClick={onClose}>
          ยกเลิก
        </button>
      </div>
    </Sheet>
  );
}

/** After a good save: the typed medicines that arrived. One "เพิ่ม" link per name goes to the add-medicine page with the name filled in. */
export function AddAskSheet({ names, demo, onClose }: { names: readonly string[]; demo: string | null; onClose: () => void }) {
  return (
    <Sheet title="เพิ่มยาเข้ารายการไหม" onClose={onClose} closeButton>
      <p className={styles.askText}>ยาที่พิมพ์เอง ยังไม่อยู่ในรายการยา เพิ่มเพื่อให้แอพนับสต็อกและเตือนได้</p>
      <ul className={styles.rows}>
        {names.map((name) => (
          <li key={name} className={`${styles.row} ${styles.askRow}`}>
            <p className={`${styles.name} ${styles.askName}`}>{name}</p>
            <a className={styles.addLink} aria-label={`เพิ่ม ${name}`} href={`#/n/meds/new?${demo ? `demo=${encodeURIComponent(demo)}&` : ''}name=${encodeURIComponent(name)}`}>
              เพิ่ม
            </a>
          </li>
        ))}
      </ul>
      <div className={sheetStyles.actions}>
        <button type="button" className={sheetStyles.cancel} onClick={onClose}>
          ไว้ทีหลัง
        </button>
      </div>
    </Sheet>
  );
}

/** "ไม่รอแล้ว" on a partial card: asks first. */
export function DropSheet({ order, onConfirm, onClose }: { order: Order; onConfirm: () => ReceiveOutcome; onClose: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const confirm = (): void => {
    const res = onConfirm();
    if (!res.ok) setMessage(SAVE_FAILED_TEXT);
  };
  return (
    <Sheet title="ไม่รอของที่เหลือแล้วใช่ไหม" onClose={onClose} closeButton>
      <p className={styles.askText}>
        {order.shopName} · {stillWaiting(order)} รายการที่ยังไม่มา
      </p>
      {message !== null && (
        <p className={styles.error} role="alert">
          <WarningIcon />
          {message}
        </p>
      )}
      <div className={sheetStyles.actions}>
        <button type="button" className={sheetStyles.primary} onClick={confirm}>
          ไม่รอแล้ว
        </button>
        <button type="button" className={sheetStyles.cancel} onClick={onClose}>
          รอต่อ
        </button>
      </div>
    </Sheet>
  );
}
