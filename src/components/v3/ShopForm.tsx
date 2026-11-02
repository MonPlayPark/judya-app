// The shop form (M4 PR 11.3a): add or edit ONE shop, drawn as a tall bottom sheet. It knows nothing about the order page, so the
// settings page (PR 14) can import it too. It owns only what the boxes hold; the page owns the data and the saving:
// `onSave` / `onDelete` answer at once with ok or with the reason, and the form keeps what was typed when they say no.
// The "free delivery over N baht" value is not shown or asked for; a shop that has one keeps it (see domain/v3/shops.ts).
import { useState, type FormEvent, type ReactNode } from 'react';
import { InfoIcon, WarningIcon } from '../icons';
import { blankShopForm, shopFormFromShop, shopFormToInput, validateShop, type ShopField, type ShopForm as ShopFormState, type ShopInput } from '../../domain/shop';
import { SHOP_ERROR_TEXT, type ShopFormError, type ShopFormErrors } from '../../domain/v3/shops';
import type { Shop } from '../../domain/v3/schema';
import { Sheet } from './Sheet';
import { sheetStyles } from './sheetParts';
import styles from './ShopForm.module.css';

/** What `onSave` / `onDelete` answer. `errors` go under the boxes, `message` above the buttons. */
export type ShopOutcome = { ok: true } | { ok: false; errors?: ShopFormErrors; message?: string };

export interface ShopFormProps {
  /** The shop to change. Left out = a new shop. */
  shop?: Shop;
  onSave: (input: ShopInput) => ShopOutcome;
  onCancel: () => void;
  /** Edit mode only: the delete button shows when this is given. */
  onDelete?: () => ShopOutcome;
}

const TruckIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" />
    <circle cx="7.5" cy="17.5" r="1.8" />
    <circle cx="17.5" cy="17.5" r="1.8" />
  </svg>
);
const StoreIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10h18M9 20v-6h6v6" />
  </svg>
);

function FieldError({ id, error }: { id: string; error: ShopFormError | undefined }) {
  if (error === undefined) return null;
  return (
    <p id={id} className={styles.error}>
      <WarningIcon />
      {SHOP_ERROR_TEXT[error]}
    </p>
  );
}

/** Only digits and one dot, for the fee box. */
const feeText = (v: string): string => {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  return dot < 0 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
};

export function ShopForm({ shop, onSave, onCancel, onDelete }: ShopFormProps) {
  const editing = shop !== undefined;
  const [form, setForm] = useState<ShopFormState>(() => (shop ? shopFormFromShop(shop) : { ...blankShopForm(), ship: 'deliver' }));
  const [errors, setErrors] = useState<ShopFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  const set = (patch: Partial<ShopFormState>, clear: ShopField[]): void => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of clear) delete next[k];
      return next;
    });
    setMessage(null);
  };

  const blocked = form.name.trim() === '';
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (blocked) return;
    const input = shopFormToInput(form);
    const checked = validateShop(input);
    if (!checked.ok) {
      setErrors(checked.errors);
      setMessage(null);
      return;
    }
    const out = onSave(input);
    if (!out.ok) {
      setErrors(out.errors ?? {});
      setMessage(out.message ?? null);
    }
  };
  const remove = (): void => {
    if (!onDelete) return;
    const out = onDelete();
    if (!out.ok) setDeleteMessage(out.message ?? 'ลบไม่ได้ ข้อมูลเดิมยังอยู่');
  };

  const ship = (kind: 'deliver' | 'pickup', icon: ReactNode, label: string) => {
    const on = form.ship === kind;
    return (
      <button type="button" className={on ? `${styles.tile} ${styles.tileOn}` : styles.tile} aria-pressed={on} onClick={() => set({ ship: kind }, ['fee'])}>
        {icon}
        {label}
      </button>
    );
  };

  return (
    <>
      <Sheet title={editing ? 'แก้ไขร้านค้า' : 'เพิ่มร้านค้า'} onClose={onCancel} closeButton tall>
        <form className={styles.form} onSubmit={submit} noValidate>
          <div className={styles.field}>
            <label className={sheetStyles.label} htmlFor="sf-name">
              ชื่อร้าน
            </label>
            <input
              id="sf-name"
              className={`${sheetStyles.textInput} ${errors.name ? styles.invalid : ''}`}
              type="text"
              autoComplete="off"
              placeholder="เช่น ร้านยาหน้าปากซอย"
              value={form.name}
              aria-invalid={errors.name !== undefined}
              aria-describedby={errors.name ? 'sf-name-err' : undefined}
              onChange={(e) => set({ name: e.target.value }, ['name'])}
            />
            <FieldError id="sf-name-err" error={errors.name} />
          </div>

          <div className={styles.field}>
            <label className={sheetStyles.label} htmlFor="sf-phone">
              เบอร์โทร (ไม่บังคับ)
            </label>
            <input
              id="sf-phone"
              className={`${sheetStyles.textInput} ${errors.phone ? styles.invalid : ''}`}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="เช่น 021234567"
              value={form.phone}
              aria-invalid={errors.phone !== undefined}
              aria-describedby={errors.phone ? 'sf-phone-err' : undefined}
              onChange={(e) => set({ phone: e.target.value }, ['phone'])}
            />
            <FieldError id="sf-phone-err" error={errors.phone} />
          </div>

          <div className={styles.field} role="group" aria-labelledby="sf-ship">
            <span id="sf-ship" className={sheetStyles.label}>
              รูปแบบ
            </span>
            <div className={styles.tiles}>
              {ship('deliver', <TruckIcon />, 'ส่งถึงบ้าน')}
              {ship('pickup', <StoreIcon />, 'ไปรับเอง')}
            </div>
          </div>

          {form.ship === 'deliver' && (
            <div className={styles.field}>
              <label className={sheetStyles.label} htmlFor="sf-fee">
                ค่าส่ง (บาท)
              </label>
              <div className={`${sheetStyles.numberBox} ${styles.feeBox} ${errors.fee ? styles.invalid : ''}`}>
                <input
                  id="sf-fee"
                  className={sheetStyles.numberInput}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="เช่น 40"
                  value={form.fee}
                  aria-invalid={errors.fee !== undefined}
                  aria-describedby={errors.fee ? 'sf-fee-err' : 'sf-fee-hint'}
                  onChange={(e) => set({ fee: feeText(e.target.value) }, ['fee'])}
                />
                <span className={sheetStyles.unit}>บาท</span>
              </div>
              {errors.fee ? (
                <FieldError id="sf-fee-err" error={errors.fee} />
              ) : (
                <p id="sf-fee-hint" className={sheetStyles.hint}>
                  ถ้าร้านส่งฟรีเสมอ ให้ใส่ 0
                </p>
              )}
            </div>
          )}

          {message !== null && (
            <p className={styles.error} role="alert">
              <WarningIcon />
              {message}
            </p>
          )}
          {blocked && (
            <p className={styles.reason}>
              <InfoIcon />
              พิมพ์ชื่อร้านก่อน
            </p>
          )}

          <div className={sheetStyles.actions}>
            <button type="submit" className={sheetStyles.primary} disabled={blocked}>
              บันทึก
            </button>
            <button type="button" className={sheetStyles.cancel} onClick={onCancel}>
              ยกเลิก
            </button>
            {editing && onDelete && (
              <button type="button" className={sheetStyles.danger} onClick={() => setConfirming(true)}>
                ลบร้านนี้
              </button>
            )}
          </div>
        </form>
      </Sheet>

      {confirming && (
        <Sheet
          title="ลบร้านนี้?"
          subtitle="ใบสั่งเก่ายังเห็นชื่อร้าน แต่ราคาที่จำไว้ของร้านนี้จะถูกลบ"
          onClose={() => {
            setConfirming(false);
            setDeleteMessage(null);
          }}
        >
          <div className={sheetStyles.body}>
            {deleteMessage !== null && (
              <p className={styles.error} role="alert">
                <WarningIcon />
                {deleteMessage}
              </p>
            )}
            <div className={sheetStyles.actions}>
              <button type="button" className={sheetStyles.danger} onClick={remove}>
                ลบร้าน
              </button>
              <button
                type="button"
                className={sheetStyles.cancel}
                onClick={() => {
                  setConfirming(false);
                  setDeleteMessage(null);
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
