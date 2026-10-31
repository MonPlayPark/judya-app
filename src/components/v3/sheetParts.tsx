// Small parts shared by the bottom sheets of the v3 detail page and medicine list (M4 PR 5b).
import type { ReactNode } from 'react';
import { CheckIcon } from '../icons';
import { fullThaiDate } from '../../domain/v3/medDetail';
import styles from './SheetForm.module.css';

export { styles as sheetStyles };

/** One number box with its unit after it ("12 | กล่อง"). */
export function NumberField({ unit, value, onChange }: { unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={styles.numberBox}>
      <input className={styles.numberInput} type="text" inputMode="numeric" placeholder="0" aria-label={`จำนวน ${unit}`} value={value} onChange={(e) => onChange(e.target.value)} />
      <span className={styles.unit}>{unit}</span>
    </label>
  );
}

/** "Choose date" button (the browser's own date picker lies on top of it) with a clear button once a date is chosen. */
export function DateField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className={styles.dateRow}>
      <label className={styles.datePick}>
        {value === '' ? 'เลือกวันที่' : fullThaiDate(value)}
        <input className={styles.dateInput} type="date" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      {value !== '' && (
        <button type="button" className={styles.dateClear} onClick={() => onChange('')}>
          ล้าง
        </button>
      )}
    </div>
  );
}

/** A reason button: round mark on the left (filled with a tick when chosen), `aria-pressed`. */
export function OptionButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={on ? `${styles.option} ${styles.optionOn}` : styles.option} aria-pressed={on} onClick={onClick}>
      <span className={styles.radio}>{on && <CheckIcon />}</span>
      {children}
    </button>
  );
}

/** Optional expiry date of the new box + the sentence that says which date will be kept (the nearer one, `mergeExpiry`). */
export function ExpiryPart({ oldExpiry, value, onChange, kept }: { oldExpiry: string | undefined; value: string; onChange: (v: string) => void; kept: string | undefined }) {
  return (
    <div className={styles.expiryPart}>
      <p className={styles.label}>วันหมดอายุของกล่องใหม่ (ไม่บังคับ)</p>
      <DateField value={value} onChange={onChange} label="วันหมดอายุของกล่องใหม่" />
      <p className={styles.hint}>
        {oldExpiry
          ? `รวมกล่องเก่าที่ยังเหลือ ใช้วันหมดอายุที่ใกล้ที่สุด: ${fullThaiDate(kept ?? oldExpiry)}`
          : value !== ''
            ? `ยาตัวนี้ยังไม่มีวันหมดอายุ จะใช้วันที่ของกล่องใหม่: ${fullThaiDate(value)}`
            : 'ยาตัวนี้ยังไม่มีวันหมดอายุ ถ้าใส่วันที่ จะใช้วันที่ของกล่องใหม่'}
      </p>
    </div>
  );
}
