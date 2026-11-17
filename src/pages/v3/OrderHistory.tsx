// The order history view (M4 PR 11.4): filter pills, one card per saved order, the cancel sheet and "สั่งซ้ำ". View only: OrderView owns the draft
// and the write. Receiving (M4 PR 11.5c): the screen is in OrderReceive.tsx; "รับของแล้ว" / "รับของที่เหลือ" only open it, "ไม่รอแล้ว" closes the order at once.
import { useState } from 'react';
import { CheckCircleIcon, ClockIcon, WarningIcon, XCircleIcon } from '../../components/icons';
import { Sheet } from '../../components/v3/Sheet';
import { sheetStyles } from '../../components/v3/sheetParts';
import { AddAskSheet, SAVE_FAILED_TEXT, type AddItem, type ReceiveOutcome } from './OrderReceive';
import { FILTER_LABEL, HISTORY_FILTERS, filterOrders, orderDateText, orderTotal, stillWaiting, type HistoryFilter } from '../../domain/v3/orderHistory';
import { baht } from '../../domain/v3/orderShops';
import type { Order, Root } from '../../domain/v3/schema';
import { iconUrl } from '../../visual';
import { STATUS_LABEL } from '../../domain/v3/orderHistory';
import styles from './OrderHistory.module.css';

const STATUS_ICON: Record<Order['status'], () => JSX.Element> = { waiting: ClockIcon, partial: WarningIcon, received: CheckCircleIcon, cancelled: XCircleIcon };
const STATUS_CLASS: Record<Order['status'], string> = { waiting: styles.warn ?? '', partial: styles.warn ?? '', received: styles.ok ?? '', cancelled: styles.grey ?? '' };

const RepeatGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" />
    <path d="M20 4v4.5h-4.5" />
    <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" />
    <path d="M4 20v-4.5h4.5" />
  </svg>
);

export type CancelOutcome = { ok: true } | { ok: false; text: string };

export interface OrderHistoryProps {
  root: Root;
  /** Opens the receiving screen of an order. */
  onReceive: (orderId: string) => void;
  /** After receiving: the typed medicines the owner wants to add (more than one); the sheet "เพิ่มยาเข้ารายการไหม" lists them. null = no sheet. */
  addAsk: readonly AddItem[] | null;
  onCloseAddAsk: () => void;
  onAgain: (orderId: string) => void;
  onCancel: (orderId: string) => CancelOutcome;
  /** "ไม่รอแล้ว": drops what is still waited for, ONE write, toast "ปิดใบสั่ง ไม่รอของที่เหลือแล้ว" (board #72: no question first). */
  onDrop: (orderId: string) => ReceiveOutcome;
}

export function OrderHistory({ root, onReceive, addAsk, onCloseAddAsk, onAgain, onCancel, onDrop }: OrderHistoryProps) {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [askId, setAskId] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const orders = filterOrders(root.orders, filter);
  const asked = askId === null ? undefined : root.orders.find((o) => o.id === askId);
  const drop = (orderId: string): void => {
    const res = onDrop(orderId);
    setDropError(res.ok ? null : SAVE_FAILED_TEXT);
  };
  return (
    <>
      <div className={styles.filters} role="group" aria-label="กรองใบสั่ง">
        {HISTORY_FILTERS.map((f) => (
          <button key={f} type="button" className={styles.pill} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>
      {dropError !== null && (
        <p className={styles.sheetError} role="alert">
          <WarningIcon />
          {dropError}
        </p>
      )}
      {orders.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>ยังไม่มีใบสั่งในหมวดนี้</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {orders.map((o) => (
            <Card key={o.id} order={o} onAgain={() => onAgain(o.id)} onAskCancel={() => setAskId(o.id)} onReceive={() => onReceive(o.id)} onDrop={() => drop(o.id)} />
          ))}
        </ul>
      )}
      {asked && <CancelSheet order={asked} onClose={() => setAskId(null)} onConfirm={() => onCancel(asked.id)} onDone={() => setAskId(null)} />}
      {addAsk && <AddAskSheet items={addAsk} onClose={onCloseAddAsk} />}
    </>
  );
}

function Card({ order: o, onAgain, onAskCancel, onReceive, onDrop }: { order: Order; onAgain: () => void; onAskCancel: () => void; onReceive: () => void; onDrop: () => void }) {
  const Icon = STATUS_ICON[o.status];
  const total = orderTotal(o);
  const waiting = stillWaiting(o);
  const date = orderDateText(o);
  return (
    <li className={styles.card}>
      <div className={styles.top}>
        <img className={styles.cardIcon} src={iconUrl('order')} alt="" />
        <div className={styles.who}>
          {date && <p className={styles.date}>{date}</p>}
          <h2 className={styles.shop}>{o.shopName}</h2>
          <p className={styles.count}>{o.lines.length} รายการ</p>
        </div>
        <div className={styles.side}>
          <span className={`${styles.chip} ${STATUS_CLASS[o.status]}`}>
            <Icon />
            {STATUS_LABEL[o.status]}
          </span>
          {total.kind === 'amount' ? (
            <>
              <p className={styles.total}>{baht(total.amount)}</p>
              {total.unpriced > 0 && <p className={styles.unpriced}>ไม่รวม {total.unpriced} รายการที่ยังไม่มีราคา</p>}
            </>
          ) : (
            <p className={styles.noPrice}>ยังไม่มีราคา</p>
          )}
        </div>
      </div>
      {o.status === 'partial' && (
        <p className={`${styles.chip} ${styles.warn} ${styles.waitChip}`}>
          <WarningIcon />
          ยังรอ {waiting} รายการ
        </p>
      )}
      <div className={styles.buttons}>
        {o.status === 'waiting' && (
          <>
            <button type="button" className={styles.receive} onClick={onReceive}>
              รับของแล้ว
            </button>
            <button type="button" className={styles.cancel} onClick={onAskCancel}>
              ยกเลิกใบสั่ง
            </button>
          </>
        )}
        {o.status === 'partial' && (
          <>
            <button type="button" className={styles.receive} onClick={onReceive}>
              รับของที่เหลือ
            </button>
            <button type="button" className={styles.cancel} onClick={onDrop}>
              ไม่รอแล้ว
            </button>
          </>
        )}
        {(o.status === 'received' || o.status === 'cancelled') && (
          <button type="button" className={styles.again} onClick={onAgain}>
            <RepeatGlyph />
            สั่งซ้ำ
          </button>
        )}
      </div>
    </li>
  );
}

function CancelSheet({ order: o, onClose, onConfirm, onDone }: { order: Order; onClose: () => void; onConfirm: () => CancelOutcome; onDone: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const confirm = (): void => {
    const res = onConfirm();
    if (res.ok) onDone();
    else setMessage(res.text);
  };
  return (
    <Sheet title="ยกเลิกใบสั่งนี้ไหม" onClose={onClose} closeButton>
      <p className={styles.sheetMain}>
        {o.shopName} · {orderDateText(o)} · {o.lines.length} รายการ
      </p>
      <p className={styles.sheetSmall}>ใบสั่งจะเป็นสถานะ "ยกเลิก" สต็อกยาไม่เปลี่ยน</p>
      {message !== null && (
        <p className={styles.sheetError} role="alert">
          <WarningIcon />
          {message}
        </p>
      )}
      <div className={sheetStyles.actions}>
        <button type="button" className={styles.dangerOutline} onClick={confirm}>
          ยกเลิกใบสั่ง
        </button>
        <button type="button" className={sheetStyles.cancel} onClick={onClose}>
          ไม่ยกเลิก
        </button>
      </div>
    </Sheet>
  );
}
