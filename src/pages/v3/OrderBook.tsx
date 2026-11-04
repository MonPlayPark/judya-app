// The "สั่งแล้วใช่ไหม" sheet (M4 PR 11.3b-2b): the only place that saves an order. It shows the chosen shop and the total, lets the owner add the
// prices that are missing, and on "ใช่ สั่งแล้ว" hands ONE new root (order + prices typed here) to the page, which writes it with one saveRoot.
// Closing without confirming writes nothing: prices typed here are kept in this sheet's own copy of the root until then.
import { useState } from 'react';
import { InfoIcon, WarningIcon } from '../../components/icons';
import { Sheet } from '../../components/v3/Sheet';
import { sheetStyles } from '../../components/v3/sheetParts';
import type { IsoDate } from '../../domain/calc';
import { buildOrder, type BuildOrderError } from '../../domain/v3/orderActions';
import { compareShops } from '../../domain/v3/orderCompare';
import type { DraftLine } from '../../domain/v3/orderLines';
import { baht, compareLinesOf, feeLine, priceableMissing, saveShopPrices } from '../../domain/v3/orderShops';
import type { Root, Shop } from '../../domain/v3/schema';
import styles from './OrderBook.module.css';
import { PriceSheet, type PriceOutcome } from './OrderCompare';

export const BOOK_ERROR_TEXT: Record<BuildOrderError, string> = {
  no_shop: 'ยังไม่ได้เลือกร้าน',
  no_lines: 'ยังไม่ได้ติ๊กยาที่จะสั่ง',
  no_user: 'ยาบางตัวไม่มีคนใช้แล้ว เอาออกจากรายการก่อน',
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
  const [work, setWork] = useState<Root>(root); // root + prices typed in this sheet; nothing is written until "ใช่ สั่งแล้ว"
  const [priceOpen, setPriceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ticked = lines.filter((l) => l.ticked && l.qtyOrdered > 0);
  const row = compareShops(compareLinesOf(ticked), [shop], work.prices, includeShipping).rows[0];
  const missing = row ? priceableMissing(row, ticked) : [];

  const savePrices: Parameters<typeof PriceSheet>[0]['onSave'] = (typed, priceLines): PriceOutcome => {
    const made = saveShopPrices(work, shop.id, priceLines, typed, today, newId);
    if (!made.ok) {
      if (made.error === 'nothing_typed') return { ok: false, message: 'ยังไม่ได้ใส่ราคา ใส่อย่างน้อย 1 ช่อง หรือกดยกเลิก' };
      if (made.error === 'invalid') return { ok: false, errors: made.errors };
      return { ok: false, message: 'บันทึกไม่ได้ ข้อมูลเดิมยังอยู่ ลองใหม่อีกครั้ง' };
    }
    setWork(made.root);
    return { ok: true };
  };

  const confirm = (): void => {
    const built = buildOrder(work, lines, shop, includeShipping, today, nowIso(), newId);
    if (!built.ok) return setError(BOOK_ERROR_TEXT[built.error]);
    const res = onConfirm(built.root);
    if (!res.ok) setError(res.text);
  };

  if (priceOpen && row) {
    return <PriceSheet row={row} missing={missing} titleOf={titleOf} onSave={savePrices} onClose={() => setPriceOpen(false)} onSaved={() => setPriceOpen(false)} />;
  }
  return (
    <Sheet title="สั่งแล้วใช่ไหม" subtitle="ถ้าสั่งกับร้านแล้ว แอพจะจดไว้เป็นใบสั่งที่รอรับของ" onClose={onClose} closeButton>
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
      {error !== null && (
        <p className={styles.error} role="alert">
          <WarningIcon />
          {error}
        </p>
      )}
      {missing.length > 0 && (
        <p className={sheetStyles.hint}>
          <InfoIcon /> ใส่ราคาตอนนี้ได้ แอพจะจำไว้ใช้เทียบราคาครั้งหน้า
        </p>
      )}
      <div className={sheetStyles.actions}>
        <button type="button" className={sheetStyles.primary} onClick={confirm}>
          ใช่ สั่งแล้ว
        </button>
        {missing.length > 0 && (
          <button type="button" className={sheetStyles.cancel} onClick={() => setPriceOpen(true)}>
            ใส่ราคา
          </button>
        )}
        <button type="button" className={sheetStyles.cancel} onClick={onClose}>
          ยังก่อน
        </button>
      </div>
    </Sheet>
  );
}
