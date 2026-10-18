// Medicine-name field with a list of suggestions. The list comes from a "source" given by the page, so a ready-made
// medicine list can be plugged in later; the person can always type any name (BRIEF Q7, owner decision 18 ต.ค. 2569).
import { useId, useState } from 'react';
import { MIN_QUERY, type SuggestionSource } from '../domain/suggest';
import { inputClass, hintClass } from './form';
import { EditIcon } from './icons';
import styles from './MedicineNameField.module.css';

export const NAME_MAX = 60;

export function MedicineNameField({
  value,
  onChange,
  source,
}: {
  value: string;
  onChange: (next: string) => void;
  source: SuggestionSource;
}) {
  const id = useId();
  // After picking a row (or "use the typed name") the list closes until the person types again.
  const [picked, setPicked] = useState(value.trim().length >= MIN_QUERY);
  const typed = value.trim();
  const searching = typed.length >= MIN_QUERY && !picked;
  const rows = searching ? source(value) : [];

  return (
    <div className={styles.wrap}>
      <label htmlFor={id} className={styles.label}>
        ชื่อยา
      </label>
      <p className={hintClass} id={`${id}-hint`}>
        พิมพ์ตั้งแต่ 2 ตัวอักษร จะมีชื่อยาที่เคยเพิ่มในบ้านให้เลือก หรือพิมพ์ชื่อเองก็ได้
      </p>
      <input
        id={id}
        type="text"
        className={inputClass}
        value={value}
        maxLength={NAME_MAX}
        autoComplete="off"
        aria-describedby={`${id}-hint`}
        placeholder="ชื่อยาและความแรง เช่น ยาตัวอย่าง 5 mg"
        onChange={(e) => {
          onChange(e.target.value);
          setPicked(false);
        }}
      />
      {searching && (
        <div role="listbox" aria-label="ชื่อยาที่เคยเพิ่มในบ้าน" className={styles.list}>
          {rows.map((r) => (
            <button
              key={r.label}
              type="button"
              role="option"
              aria-selected="false"
              className={styles.option}
              onClick={() => {
                onChange(r.label);
                setPicked(true);
              }}
            >
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{r.label}</span>
                {r.sub && <span className={styles.optionSub}>{r.sub}</span>}
              </span>
              <span className={styles.kind}>{r.kind}</span>
            </button>
          ))}
          {rows.length === 0 && <p className={styles.none}>ไม่พบชื่อที่เคยเพิ่มในบ้าน</p>}
          <button type="button" className={`${styles.option} ${styles.useTyped}`} onClick={() => setPicked(true)}>
            <EditIcon />
            <span>ใช้ชื่อ “{typed}” ตามที่พิมพ์</span>
          </button>
        </div>
      )}
    </div>
  );
}
