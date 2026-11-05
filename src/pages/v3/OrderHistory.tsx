// The order history view (M4 PR 11.4): the saved orders, newest first, each with "สั่งซ้ำ". View only; OrderView owns the draft.
import { CheckCircleIcon, ClockIcon, InfoIcon, WarningIcon, XCircleIcon } from '../../components/icons';
import { baht } from '../../domain/v3/orderShops';
import { historyRows, type HistoryRow } from '../../domain/v3/orderHistory';
import type { Order, Root } from '../../domain/v3/schema';
import styles from './OrderV3.module.css';

const STATUS_ICON: Record<Order['status'], () => JSX.Element> = { waiting: ClockIcon, partial: WarningIcon, received: CheckCircleIcon, cancelled: XCircleIcon };

export function OrderHistory({ root, onAgain }: { root: Root; onAgain: (orderId: string) => void }) {
  const rows = historyRows(root);
  if (rows.length === 0) {
    return (
      <section className={styles.card} aria-labelledby="history-title">
        <h2 id="history-title" className={styles.cardTitle}>
          ประวัติการสั่งซื้อ
        </h2>
        <div className={styles.emptyBox}>
          <p className={styles.emptyTitle}>ยังไม่มีใบสั่งซื้อ</p>
          <p className={styles.emptyText}>เมื่อกด "สั่งแล้ว" ในหน้าสั่งซื้อยา ใบสั่งจะมาอยู่ที่นี่</p>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="ใบสั่งซื้อทั้งหมด">
      <p className={styles.histSum}>
        <InfoIcon /> ทั้งหมด {rows.length} ใบ
      </p>
      <ul className={styles.histList}>
        {rows.map((r) => (
          <HistoryCard key={r.id} row={r} onAgain={() => onAgain(r.id)} />
        ))}
      </ul>
    </section>
  );
}

function HistoryCard({ row, onAgain }: { row: HistoryRow; onAgain: () => void }) {
  const Icon = STATUS_ICON[row.status];
  return (
    <li className={styles.histCard}>
      <div className={styles.histTop}>
        <div>
          <h2 className={styles.histShop}>{row.shopName}</h2>
          {row.dateText && <p className={styles.histDate}>{row.dateText}</p>}
        </div>
        <span className={styles.histStatus}>
          <Icon />
          {row.statusText}
        </span>
      </div>
      <p className={styles.histSum}>
        {row.count} รายการ{row.total === null ? '' : ` · ยอดรวม ${baht(row.total)}`}
      </p>
      <ul className={styles.histItems}>
        {row.lines.map((l, i) => (
          <li key={`${l.name}-${i}`} className={styles.histItem}>
            <span>{l.name}</span>
            <span className={styles.histQty}>{l.qty}</span>
          </li>
        ))}
      </ul>
      <button type="button" className={styles.again} aria-label={`สั่งซ้ำ ${row.shopName} ${row.dateText}`} onClick={onAgain}>
        สั่งซ้ำ
      </button>
    </li>
  );
}
