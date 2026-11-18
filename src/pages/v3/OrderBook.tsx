// The "สั่งแล้วใช่ไหม" sheet (M4 PR 11.3b-2b): the only place that saves an order. It shows the chosen shop, the number of lines and the total
// (the same figures as the comparison card), and for the lines this shop has no price for it asks for the price the shop charged (optional).
// "สั่งแล้ว" hands ONE new root (order + prices typed here) to the page, which writes it with one saveRoot. "ยังไม่ได้สั่ง" (or X, or the
// curtain) closes without saving anything; whatever was typed is dropped.
import { useState } from 'react';
import { InfoIcon, WarningIcon } from '../../components/icons';
import { Sheet } from '../../components/v3/Sheet';
import { sheetStyles } from '../../components/v3/sheetParts';
import type { IsoDate } from '../../domain/calc';
import { compareShops } from '../../domain/v3/orderCompare';
import type { DraftLine } from '../../domain/v3/orderLines';
import { placeOrder, type PlaceError } from '../../domain/v3/orderPlace';
import { baht, compareLinesOf, feeLine, priceableMissing } from '../../domain/v3/orderShops';
import type { Root, Shop } from '../../domain/v3/schema';
import styles from './OrderBook.module.css';
import { PriceRow } from './OrderCompare';

export const PLACE_ERROR_TEXT: Record<PlaceError, string> = {
  no_shop: 'ยังไม่ได้เลือกร้าน',
  no_lines: 'ยังไม่ได้ติ๊กยาที่จะสั่ง',
  no_user: 'ยาบางตัวไม่มีคนใช้แล้ว เอาออกจากรายการก่อน',
  invalid_price: 'ใส่ราคาเป็นตัวเลขมากกว่า 0 หรือเว้นว่างไว้',
  invalid_root: 'บันทึกไม่ได้ ข้อมูลเดิมยังอยู่ ลองใหม่อีกครั้ง',
};

export interface OrderBookProps {
  root: Root;
  lines: readonly DraftLine[];
  shop: Shop;
  includeShipping: boolean;
  today: IsoDate;
  nowIso: () => string;
  newId: () => string;
  titleOf: (line: DraftLine) => string;
  /** Writes the new root. The page answers ok only when it is really saved (a demo: kept in memory). */
  onConfirm: (next: Root) => { ok: true } | { ok: false; text: string };
  onClose: () => void;
}

export function OrderBook({ root, lines, shop, includeShipping, today, nowIso, newId, titleOf, onConfirm, onClose }: OrderBookProps) {
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, 'invalid_price'>>({});
  const [message, setMessage] = useState<string | null>(null);

  const ticked = lines.filter((l) => l.ticked && l.qtyOrdered > 0);
  const row = compareShops(compareLinesOf(ticked), [shop], root.prices, includeShipping).rows[0];
  const missing = row ? priceableMissing(row, ticked) : [];

  const set = (key: string, value: string): void => {
    setTyped((t) => ({ ...t, [key]: value.replace(/[^0-9.,]/g, '') }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
    setMessage(null);
  };

  const confirm = (): void => {
    const placed = placeOrder(root, lines, shop, includeShipping, typed, { today, iso: nowIso() }, newId);
    if (!placed.ok) {
      setErrors(placed.errors);
      setMessage(placed.error === 'invalid_price' ? null : PLACE_ERROR_TEXT[placed.error]);
      return;
    }
    const res = onConfirm(placed.root);
    if (!res.ok) setMessage(res.text);
  };

  return (
    <Sheet title="สั่งแล้วใช่ไหม" subtitle="ถ้าสั่งกับร้านแล้ว แอพจะจดไว้เป็นใบสั่งที่รอรับของ" onClose={onClose} closeButton tall>
      <div className={styles.box} role="group" aria-label="สรุปใบสั่ง">
        <p className={styles.name}>{shop.name}</p>
        <p className={styles.line}>{ticked.length} รายการ</p>
        <p className={styles.line}>{row && row.lines.length > 0 ? `ยอดรวม ${baht(row.total)}` : 'ร้านนี้ยังไม่มีราคายาที่สั่ง'}</p>
        <p className={styles.line}>{feeLine(shop, includeShipping)}</p>
        {row?.unpricedText && (
          <p className={styles.chip}>
            <WarningIcon />
            {row.unpricedText}
          </p>
        )}
      </div>

      {missing.length > 0 && (
        <section className={styles.prices} aria-labelledby="book-prices-title">
          <h3 id="book-prices-title" className={styles.pricesTitle}>
            ใส่ราคาที่ร้านคิด (ไม่บังคับ)
          </h3>
          {missing.map((l) => (
            <PriceRow key={l.key} line={l} title={titleOf(l)} value={typed[l.key] ?? ''} invalid={errors[l.key] !== undefined} onChange={(v) => set(l.key, v)} />
          ))}
          <p className={sheetStyles.hint}>
            <InfoIcon /> ราคาที่ใส่จะถูกจำของร้านนี้ ตรวจให้ถูกก่อนกด
          </p>
        </section>
      )}

      {message !== null && (
        <p className={styles.error} role="alert">
          <WarningIcon />
          {message}
        </p>
      )}
      <div className={sheetStyles.actions}>
        <button type="button" className={sheetStyles.primary} onClick={confirm}>
          สั่งแล้ว
        </button>
        <button type="button" className={sheetStyles.cancel} onClick={onClose}>
          ยังไม่ได้สั่ง
        </button>
      </div>
    </Sheet>
  );
}
