// "ราคาตามร้าน" card + price sheet (M4 PR 13), used by the medicine detail page and the house medicine sheet. View only: the page owns the data
// and the saving (`onSave` returns an error text, or null when saved). Prices live in `root.prices`, the store the order page compares.
import { useState } from 'react';
import type { IsoDate } from '../../domain/calc';
import { hintText, removeShopPrice, savePriceOf, shopPriceRows, sheetStartOf, type PriceSubject } from '../../domain/v3/medPrices';
import { parsePriceText } from '../../domain/v3/orderShops';
import type { Root } from '../../domain/v3/schema';
import { iconUrl } from '../../visual';
import { Sheet } from './Sheet';
import { sheetStyles as form } from './sheetParts';
import styles from './PriceCard.module.css';

const Chevron = () => (
  <svg className={styles.chev} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const TagIcon = () => <img className={styles.icon} src={iconUrl('shops')} alt="" />;

export function PriceCard({ root, subject, onPick, shopsHref, flat = false }: { root: Root; subject: PriceSubject; onPick: (shopId: string) => void; shopsHref: string; /** inside a sheet: no card box */ flat?: boolean }) {
  const rows = shopPriceRows(root, subject);
  return (
    <section className={flat ? `${styles.card} ${styles.flat}` : styles.card} aria-labelledby="card-price">
      <div className={styles.head}>
        <TagIcon />
        <h2 id="card-price" className={styles.title}>
          ราคาตามร้าน
        </h2>
        <span className={styles.chip}>ไม่บังคับ</span>
      </div>
      <p className={styles.help}>ใส่เฉพาะร้านที่ซื้อบ่อย ใช้เทียบราคาตอนสั่งยา</p>
      {rows.length === 0 ? (
        <a className={styles.addShop} href={shopsHref}>
          เพิ่มร้าน
        </a>
      ) : (
        <ul className={styles.rows}>
          {rows.map((r) => (
            <li key={r.shopId}>
              <button type="button" className={styles.row} aria-label={r.aria} onClick={() => onPick(r.shopId)}>
                <span className={styles.left}>
                  <span className={styles.name}>{r.shopName}</span>
                  <span className={styles.sub}>{r.sub}</span>
                </span>
                <span className={styles.right}>
                  <span className={r.hasPrice ? styles.main : `${styles.main} ${styles.mainAdd}`}>{r.main}</span>
                  {r.per !== '' && <span className={styles.sub}>{r.per}</span>}
                </span>
                <Chevron />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PriceSheet({
  root,
  subject,
  shopId,
  today,
  newId,
  onClose,
  onSave,
}: {
  root: Root;
  subject: PriceSubject;
  shopId: string;
  today: IsoDate;
  newId: () => string;
  onClose: () => void;
  /** Saves the new root and says `message`; returns an error text, or null when saved. */
  onSave: (next: Root, message: string) => string | null;
}) {
  const start = sheetStartOf(root, subject, shopId);
  const shop = root.shops.find((s) => s.id === shopId);
  const [unit, setUnit] = useState(start.unit);
  const [text, setText] = useState(start.text);
  const [error, setError] = useState<string | null>(null);
  if (!shop) return null;

  const typed = parsePriceText(text);
  const price = typed !== null && Number.isFinite(typed) ? typed : 0;
  const choice = start.choices.find((c) => c.label === unit);
  const hint = choice ? hintText(subject, price, choice.perSellUnit) : null;

  const save = (): void => {
    if (!(price > 0)) return;
    const res = savePriceOf(root, subject, shopId, unit, text, today, newId, start.choices);
    if (!res.ok) return setError('บันทึกราคาไม่สำเร็จ ลองใหม่อีกครั้ง');
    setError(onSave(res.root, `บันทึกราคาที่ ${res.shopName} แล้ว`));
  };
  const remove = (): void => {
    const res = removeShopPrice(root, subject, shopId);
    if (!res.ok) return setError('ลบราคาไม่สำเร็จ ลองใหม่อีกครั้ง');
    setError(onSave(res.root, `ลบราคาที่ ${res.shopName} แล้ว`));
  };

  return (
    <Sheet title={`ราคาที่ ${shop.name}`} subtitle={`${subject.name} · ใส่เมื่อรู้ราคา ไม่ใส่ก็ได้`} onClose={onClose} tall>
      <div role="group" aria-label="ราคายาที่ร้านนี้">
        <p className={styles.label}>ร้านนี้ขายเป็น</p>
        <div className={styles.units} role="group" aria-label="หน่วยที่ร้านขาย">
          {start.choices.map((c) => (
            <button key={c.label} type="button" className={c.label === unit ? `${styles.unit} ${styles.unitOn}` : styles.unit} aria-pressed={c.label === unit} onClick={() => setUnit(c.label)}>
              {c.label}
            </button>
          ))}
        </div>
        <p className={styles.label}>ราคา</p>
        <div className={styles.box}>
          <input className={styles.input} type="text" inputMode="decimal" autoComplete="off" placeholder="0" aria-label="ราคาเป็นบาท" value={text} onChange={(e) => { setText(e.target.value.replace(/[^0-9.,]/g, '')); setError(null); }} />
          <span className={styles.suffix}>บาท / {unit}</span>
        </div>
        {hint && <p className={styles.hint}>{hint}</p>}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={form.actions}>
          <button type="button" className={form.primary} disabled={!(price > 0)} onClick={save}>
            บันทึกราคา
          </button>
          {start.hasPrice && (
            <button type="button" className={styles.remove} onClick={remove}>
              ลบราคาร้านนี้
            </button>
          )}
          <button type="button" className={form.cancel} onClick={onClose}>
            ยกเลิก
          </button>
        </div>
      </div>
    </Sheet>
  );
}
