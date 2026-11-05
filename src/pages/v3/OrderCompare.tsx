// The shop comparison card of the order page (M4 PR 11.3b-2a): one card per shop (cheapest first, as ranked by domain/v3/orderCompare.ts),
// the "รวมค่าส่ง" switch, choosing ONE shop by tapping its card, and the "ใส่ราคา" sheet for the lines a shop has no price for. View only:
// the page owns the data and the saving. A shop that misses prices can still be chosen. Nothing here saves an order.
import { useState, type FormEvent } from 'react';
import { CheckCircleIcon, InfoIcon, PlusIcon, WarningIcon } from '../../components/icons';
import { Sheet } from '../../components/v3/Sheet';
import { sheetStyles } from '../../components/v3/sheetParts';
import { shopSub } from '../../domain/shop';
import type { ShopComparison, ShopRow } from '../../domain/v3/orderCompare';
import type { DraftLine, KnownDraftLine } from '../../domain/v3/orderLines';
import { baht, cheapestShopIds, priceableMissing } from '../../domain/v3/orderShops';
import type { Shop } from '../../domain/v3/schema';
import styles from './OrderCompare.module.css';

export type PriceOutcome = { ok: true } | { ok: false; errors?: Record<string, 'invalid_price'>; message?: string };

export interface OrderCompareProps {
  shops: readonly Shop[];
  comparison: ShopComparison;
  lines: readonly DraftLine[];
  titleOf: (line: DraftLine) => string;
  includeShipping: boolean;
  onIncludeShipping: (on: boolean) => void;
  selectedId: string | null;
  onSelect: (shopId: string) => void;
  onAddShop: () => void;
  /** Saves the typed prices (text by line key) of one shop. */
  onSavePrices: (shopId: string, lines: readonly KnownDraftLine[], typed: Record<string, string>) => PriceOutcome;
  /** Test links only: opens the price sheet of this shop. */
  initialPriceShop?: string;
}

export function OrderCompare({ shops, comparison, lines, titleOf, includeShipping, onIncludeShipping, selectedId, onSelect, onAddShop, onSavePrices, initialPriceShop }: OrderCompareProps) {
  const [priceShop, setPriceShop] = useState<string | null>(initialPriceShop ?? null);
  const cheapest = cheapestShopIds(comparison.rows);
  const sheetRow = comparison.rows.find((r) => r.shopId === priceShop);

  if (shops.length === 0) {
    return (
      <section className={styles.card} aria-labelledby="order-compare-title">
        <h2 id="order-compare-title" className={styles.title}>
          เทียบราคา
        </h2>
        <p className={styles.emptyTitle}>ยังไม่มีร้านค้า</p>
        <p className={styles.emptyText}>เพิ่มร้านที่ซื้อยาประจำ แล้วแอพจะเทียบราคาให้ ข้อความสั่งยาด้านล่างคัดลอกหรือส่ง LINE ได้เลย</p>
        <button type="button" className={styles.bigButton} onClick={onAddShop}>
          <PlusIcon />
          เพิ่มร้านแรก
        </button>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="order-compare-title">
      <h2 id="order-compare-title" className={styles.title}>
        เทียบราคา {comparison.rows.length} ร้าน
      </h2>
      <button type="button" role="switch" aria-checked={includeShipping} className={styles.switchRow} onClick={() => onIncludeShipping(!includeShipping)}>
        <span className={styles.switchText}>รวมค่าส่ง</span>
        <span className={includeShipping ? `${styles.track} ${styles.trackOn}` : styles.track} aria-hidden="true">
          <span className={styles.thumb} />
        </span>
        <span className={styles.switchState}>{includeShipping ? 'เปิด' : 'ปิด'}</span>
      </button>
      <ul className={styles.rows}>
        {comparison.rows.map((r) => {
          const shop = shops.find((s) => s.id === r.shopId);
          const picked = r.shopId === selectedId;
          const missing = priceableMissing(r, lines);
          return (
            <li key={r.shopId} className={picked ? `${styles.shop} ${styles.shopOn}` : styles.shop}>
              <button type="button" className={styles.pick} aria-pressed={picked} aria-label={`เลือกร้าน ${r.shopName}`} onClick={() => onSelect(r.shopId)}>
                <span className={styles.top}>
                  <span className={styles.name}>{r.shopName}</span>
                  <span className={styles.total}>{r.lines.length === 0 ? 'ยังไม่มีราคา' : baht(r.total)}</span>
                </span>
                {shop && <span className={styles.sub}>{shopSub(shop)}</span>}
                <span className={styles.chips}>
                  {cheapest.has(r.shopId) && (
                    <span className={`${styles.chip} ${styles.chipGood}`}>
                      <CheckCircleIcon />
                      ถูกที่สุด
                    </span>
                  )}
                  {picked && (
                    <span className={`${styles.chip} ${styles.chipPicked}`}>
                      <CheckCircleIcon />
                      เลือกแล้ว
                    </span>
                  )}
                  {r.unpricedText && (
                    <span className={`${styles.chip} ${styles.chipWarn}`}>
                      <WarningIcon />
                      {r.unpricedText}
                    </span>
                  )}
                </span>
              </button>
              {missing.length > 0 && (
                <button type="button" className={styles.addPrice} aria-label={`ใส่ราคา ร้าน ${r.shopName}`} onClick={() => setPriceShop(r.shopId)}>
                  ใส่ราคา
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {sheetRow && (
        <PriceSheet
          row={sheetRow}
          missing={priceableMissing(sheetRow, lines)}
          titleOf={titleOf}
          onSave={(typed, missingLines) => onSavePrices(sheetRow.shopId, missingLines, typed)}
          onClose={() => setPriceShop(null)}
          onSaved={() => setPriceShop(null)}
        />
      )}
    </section>
  );
}

/** Boxes for the lines this shop has no price for. A price is for ONE unit of the order unit (the unit the line is ordered in). Optional. */
export function PriceSheet({
  row,
  missing,
  titleOf,
  onSave,
  onClose,
  onSaved,
}: {
  row: ShopRow;
  missing: readonly KnownDraftLine[];
  titleOf: (line: DraftLine) => string;
  onSave: (typed: Record<string, string>, lines: readonly KnownDraftLine[]) => PriceOutcome;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, 'invalid_price'>>({});
  const [message, setMessage] = useState<string | null>(null);
  const set = (key: string, value: string): void => {
    setTyped((t) => ({ ...t, [key]: value.replace(/[^0-9.,]/g, '') }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
    setMessage(null);
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const res = onSave(typed, missing);
    if (res.ok) return onSaved();
    setErrors(res.errors ?? {});
    setMessage(res.message ?? null);
  };
  return (
    <Sheet title={`ใส่ราคา · ${row.shopName}`} subtitle="ราคาต่อหน่วยที่สั่ง ไม่ใส่ก็ได้ ใส่เท่าที่รู้" onClose={onClose} closeButton tall>
      <form className={styles.form} onSubmit={submit} noValidate>
        {missing.map((l) => (
          <PriceRow key={l.key} line={l} title={titleOf(l)} value={typed[l.key] ?? ''} invalid={errors[l.key] !== undefined} onChange={(v) => set(l.key, v)} />
        ))}
        <p className={sheetStyles.hint}>
          <InfoIcon /> ยาที่พิมพ์เองไม่มีที่เก็บราคา จึงไม่ขึ้นในหน้านี้
        </p>
        {message !== null && (
          <p className={styles.error} role="alert">
            <WarningIcon />
            {message}
          </p>
        )}
        <div className={sheetStyles.actions}>
          <button type="submit" className={sheetStyles.primary}>
            บันทึกราคา
          </button>
          <button type="button" className={styles.plainCancel} onClick={onClose}>
            ยกเลิก
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** One price box row (label, number box with "บาท / <order unit>", and the error under it). Used by the "ใส่ราคา" sheet and by the
 * "สั่งแล้วใช่ไหม" sheet, so both look and read the same. The text is only the characters of a number; checking is done by the caller. */
export function PriceRow({ line, title, value, invalid, onChange }: { line: KnownDraftLine; title: string; value: string; invalid: boolean; onChange: (value: string) => void }) {
  const id = `price-${line.key.replace(/[^a-zA-Z0-9]/g, '-')}`;
  return (
    <div className={styles.field}>
      <label className={sheetStyles.label} htmlFor={id}>
        {title}
      </label>
      <div className={styles.priceBox}>
        <input
          id={id}
          className={invalid ? `${sheetStyles.textInput} ${styles.invalid}` : sheetStyles.textInput}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          aria-label={`ราคาต่อ ${line.sellUnit} ของ ${title} (บาท)`}
          value={value}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className={styles.unit}>บาท / {line.sellUnit}</span>
      </div>
      {invalid && (
        <p className={styles.error}>
          <WarningIcon />
          ใส่ราคาเป็นตัวเลขมากกว่า 0
        </p>
      )}
    </div>
  );
}
