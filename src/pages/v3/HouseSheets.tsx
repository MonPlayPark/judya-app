// The two bottom sheets of a house medicine on the v3 medicine list (M4 PR 5b): details, and refill.
// House items have no pack size, so a refill is one number in the item's own unit. No MedEvent is made.
import { useState } from 'react';
import { ComingSoon } from '../../components/v3/ComingSoon';
import { KindIcon } from '../../components/v3/KindIcon';
import { Sheet } from '../../components/v3/Sheet';
import { ExpiryPart, NumberField, sheetStyles as form } from '../../components/v3/sheetParts';
import { buildHouseDetail, refillHouseItem } from '../../domain/v3/houseDetail';
import type { Chip } from '../../domain/v3/medDetail';
import type { IsoDate } from '../../domain/calc';
import type { Root } from '../../domain/v3/schema';
import styles from './HouseSheets.module.css';

export type HouseSheetKind = 'info' | 'refill';

function ToneChip({ chip }: { chip: Chip }) {
  return (
    <span className={`${styles.chip} ${styles[`tone_${chip.tone}`]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {chip.label}
    </span>
  );
}

export function HouseInfoSheet({ root, id, today, onClose, onRefill }: { root: Root; id: string; today: IsoDate; onClose: () => void; onRefill: () => void }) {
  const d = buildHouseDetail(root, id, today);
  if (!d) return null;
  return (
    <Sheet title="รายละเอียดยาสามัญ" onClose={onClose}>
      <div className={form.body}>
        <div className={styles.top}>
          <span className={styles.circle}>
            <KindIcon kind={d.kind} size={36} />
          </span>
          <div>
            <p className={styles.name}>{d.name}</p>
            <p className={styles.sub}>{d.subtitle}</p>
          </div>
        </div>
        <div className={styles.stockRow}>
          <span className={styles.sub}>ยาคงเหลือ</span>
          <ToneChip chip={d.chip} />
        </div>
        {d.big !== null && <p className={styles.big}>{d.big}</p>}
        <div className={styles.stockRow}>
          <span className={styles.sub}>วันหมดอายุ</span>
          <span className={styles.expiryValue}>{d.expiry.text}</span>
          {d.expiry.chip && <ToneChip chip={d.expiry.chip} />}
        </div>
        <p className={form.hint}>
          {d.counted ? 'ยาสามัญไม่ตัดสต็อกอัตโนมัติ ถ้าใช้ไปแล้วให้แก้จำนวนที่เหลือในแก้ข้อมูลยา' : 'ยานี้ไม่ได้นับจำนวน'}
        </p>
        <div className={form.actions}>
          {d.counted && (
            <button type="button" className={form.primary} onClick={onRefill}>
              เติมสต็อก
            </button>
          )}
          <ComingSoon className={form.cancel}>แก้ข้อมูลยา</ComingSoon>
          <button type="button" className={form.cancel} onClick={onClose}>
            ปิด
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function HouseRefillSheet({
  root,
  id,
  onClose,
  commit,
}: {
  root: Root;
  id: string;
  onClose: () => void;
  /** Saves; returns an error text, or null when saved (the list then closes the sheet and says "เติมสต็อกแล้ว"). */
  commit: (next: Root) => string | null;
}) {
  const item = root.houseItems.find((h) => h.id === id && h.removedAt === undefined);
  const [text, setText] = useState('');
  const [expiry, setExpiry] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  if (!item?.stock) return null;

  const t = text.trim();
  const bad = t !== '' && !/^\d+(\.\d+)?$/.test(t);
  const amount = t === '' || bad ? 0 : Number(t);
  const result = amount > 0 ? refillHouseItem(root, id, amount, expiry === '' ? undefined : expiry) : null;
  const problem = bad ? 'ใส่ได้เฉพาะตัวเลข' : result && !result.ok ? result.error : null;
  const ok = result?.ok ? result.refill : null;

  const save = (): void => {
    if (!ok) return;
    const err = commit(ok.root);
    if (err) setSaveError(err);
  };

  return (
    <Sheet title="เติมสต็อก" subtitle={`${item.name} · ใส่จำนวนที่ซื้อเพิ่ม`} onClose={onClose}>
      <div className={form.body}>
        <div className={form.fields}>
          <NumberField unit={item.stock.unit} value={text} onChange={setText} />
        </div>
        {problem && (
          <p className={form.error} role="alert">
            {problem}
          </p>
        )}
        {ok && (
          <div className={form.summary}>
            <p className={form.summaryRow}>
              <span>จำนวนรวม</span>
              <strong>{ok.total}</strong>
            </p>
          </div>
        )}
        <ExpiryPart oldExpiry={item.expiry} value={expiry} onChange={setExpiry} kept={ok?.expiry} />
        {saveError && (
          <p className={form.error} role="alert">
            {saveError}
          </p>
        )}
        <div className={form.actions}>
          <button type="button" className={form.primary} disabled={!ok} onClick={save}>
            บันทึก
          </button>
          <button type="button" className={form.cancel} onClick={onClose}>
            ยกเลิก
          </button>
        </div>
      </div>
    </Sheet>
  );
}
