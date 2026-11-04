// The order message on the order page (M4 PR 11.3b-1, shop choice 11.3b-2a): the small bar with the recipient, the chosen shop (name, phone,
// total, fee), the read-only preview, and the buttons "คัดลอกข้อความ" / "เปิด LINE" / "โทรหาร้าน". The delivery / pick-up line follows the
// chosen shop (none chosen = no such line). The order itself is saved by the page (the "สั่งแล้วใช่ไหม" sheet). The recipient is saved by the page
// (`onSaveRecipient`, through saveRoot; a demo keeps it in memory only).
import { useState, type FormEvent } from 'react';
import { ChevronRightIcon, InfoIcon, WarningIcon } from '../../components/icons';
import { Sheet } from '../../components/v3/Sheet';
import { sheetStyles } from '../../components/v3/sheetParts';
import {
  buildOrderMessage,
  lineLink,
  lineLinkIsLong,
  recipientMissing,
  type MessageItem,
  type OrderMode,
  type Recipient,
} from '../../domain/v3/orderMessage';
import { RECIPIENT_ERROR_TEXT, RECIPIENT_MAX, checkRecipient, formOf, recipientBarText, type RecipientError, type RecipientField, type RecipientForm } from '../../domain/v3/recipient';
import styles from './OrderMessage.module.css';

/** What the "ร้านที่เลือก" part shows (ready text, made by the page from the comparison). */
export interface PickedShop {
  name: string;
  phone?: string | undefined;
  /** 'ยอดรวม ฿1,200', or null when the shop has no price for any line. */
  totalText: string | null;
  feeText: string;
  /** 'ไม่รวม N รายการที่ยังไม่มีราคา', or null. */
  unpricedText: string | null;
}

export type SendAction = 'copy' | 'line';
export type SaveOutcome = { ok: true } | { ok: false; text: string };

const FIELD_NAME: Record<RecipientField, string> = { address: 'ที่อยู่', name: 'ชื่อผู้รับ', phone: 'เบอร์โทร' };
export const LINE_TOO_LONG_TEXT = 'ข้อความยาว LINE อาจตัดท้าย แนะนำใช้คัดลอกข้อความ';
export const COPIED_TEXT = 'คัดลอกข้อความแล้ว';
export const COPY_FAILED_TEXT = 'คัดลอกไม่ได้ ลองกดค้างที่ข้อความแล้วเลือกคัดลอก';

type OpenSheet = { kind: 'edit' } | { kind: 'incomplete'; action: SendAction } | null;

export interface OrderMessageProps {
  /** The ticked lines as message items. */
  items: readonly MessageItem[];
  recipient: Recipient;
  /** How the medicine gets to the owner, from the chosen shop: null = no shop chosen (no delivery / pick-up line in the message). */
  mode: OrderMode | null;
  /** The chosen shop, or null. */
  shop: PickedShop | null;
  /** Saves the recipient. The page answers ok only when it is really saved (a demo: kept in memory). */
  onSaveRecipient: (r: Recipient) => SaveOutcome;
  showToast: (text: string) => void;
  /** Called after the text was really copied or LINE was opened (M4 PR 11.3b-2b): the page then asks "สั่งแล้วใช่ไหม". Only given when a shop is chosen. */
  onSent?: () => void;
  /** The button "บันทึกว่าสั่งแล้ว": opens the "สั่งแล้วใช่ไหม" sheet. */
  onBook?: () => void;
  /** Test links only. */
  initial?: { sheet?: 'recipient' | 'incomplete' };
}

/** Puts the text on the clipboard; false when the browser refuses or has no clipboard. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function OrderMessage({ items, recipient, mode, shop, onSaveRecipient, showToast, onSent, onBook, initial }: OrderMessageProps) {
  const [sheet, setSheet] = useState<OpenSheet>(() => {
    if (initial?.sheet === 'recipient') return { kind: 'edit' };
    if (initial?.sheet === 'incomplete') return { kind: 'incomplete', action: 'copy' };
    return null;
  });

  const text = buildOrderMessage(items, mode, recipient);
  const empty = items.length === 0;
  const isLong = !empty && lineLinkIsLong(text);

  /** Does the sending itself with the text of `r` (the recipient to use). */
  const send = async (action: SendAction, r: Recipient): Promise<void> => {
    const body = buildOrderMessage(items, mode, r);
    if (body === '') return;
    if (action === 'copy') {
      const copied = await copyText(body);
      showToast(copied ? COPIED_TEXT : COPY_FAILED_TEXT);
      if (copied) onSent?.();
      return;
    }
    if (lineLinkIsLong(body)) showToast(LINE_TOO_LONG_TEXT); // a warning only: LINE still opens
    window.open(lineLink(body), '_blank', 'noopener,noreferrer');
    onSent?.();
  };

  const press = (action: SendAction): void => {
    if (empty) return;
    if (!recipientMissing(mode, recipient).length) void send(action, recipient);
    else setSheet({ kind: 'incomplete', action });
  };

  return (
    <section id="order-message" className={styles.card} aria-labelledby="order-message-title">
      <h2 id="order-message-title" className={styles.title}>
        ข้อความสั่งยา
      </h2>

      <button type="button" className={styles.recipientBar} aria-label={`ข้อมูลผู้รับ: ${recipientBarText(recipient)} แก้ไข`} onClick={() => setSheet({ kind: 'edit' })}>
        <span className={styles.recipientLabel}>ผู้รับ</span>
        <span className={recipient.name || recipient.phone ? styles.recipientText : `${styles.recipientText} ${styles.recipientEmpty}`}>{recipientBarText(recipient)}</span>
        <ChevronRightIcon />
      </button>

      {shop && (
        <div className={styles.picked} role="group" aria-label="ร้านที่เลือก">
          <p className={styles.pickedLabel}>ร้านที่เลือก</p>
          <p className={styles.pickedName}>{shop.name}</p>
          <p className={styles.pickedLine}>{shop.phone ?? 'ยังไม่ใส่เบอร์โทร'}</p>
          <p className={styles.pickedLine}>{shop.totalText ?? 'ร้านนี้ยังไม่มีราคายาที่สั่ง'}</p>
          <p className={styles.pickedLine}>{shop.feeText}</p>
          {shop.unpricedText && (
            <p className={styles.chip}>
              <WarningIcon />
              {shop.unpricedText}
            </p>
          )}
        </div>
      )}

      <pre className={empty ? `${styles.preview} ${styles.previewEmpty}` : styles.preview} tabIndex={0} aria-label="ตัวอย่างข้อความ">
        {empty ? 'ติ๊กยาที่ต้องการสั่ง แล้วข้อความจะขึ้นที่นี่' : text}
      </pre>

      {isLong && (
        <p className={styles.warn} role="note">
          <WarningIcon />
          {LINE_TOO_LONG_TEXT}
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.copy} disabled={empty} onClick={() => press('copy')}>
          คัดลอกข้อความ
        </button>
        <button type="button" className={styles.line} disabled={empty} onClick={() => press('line')}>
          เปิด LINE
        </button>
      </div>

      {shop && (
        <div className={styles.actions}>
          {shop.phone ? (
            <a className={styles.call} href={`tel:${shop.phone.replace(/[^0-9+]/g, '')}`}>
              โทรหาร้าน
            </a>
          ) : null}
          <button type="button" className={styles.call} disabled={empty || onBook === undefined} onClick={() => onBook?.()}>
            บันทึกว่าสั่งแล้ว
          </button>
        </div>
      )}

      {sheet?.kind === 'edit' && (
        <RecipientSheet
          recipient={recipient}
          missing={[]}
          onSave={(r) => {
            const res = onSaveRecipient(r);
            if (res.ok) {
              setSheet(null);
              showToast('บันทึกข้อมูลผู้รับแล้ว');
            }
            return res;
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'incomplete' && (
        <RecipientSheet
          recipient={recipient}
          missing={recipientMissing(mode, recipient)}
          action={sheet.action}
          onSave={(r) => {
            const res = onSaveRecipient(r);
            if (res.ok) {
              const action = sheet.action;
              setSheet(null);
              void send(action, r);
            }
            return res;
          }}
          onSendWithout={(r) => {
            const action = sheet.action;
            setSheet(null);
            void send(action, r); // what is typed in the boxes, not saved
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}

function RecipientSheet({
  recipient,
  missing,
  action,
  onSave,
  onSendWithout,
  onClose,
}: {
  recipient: Recipient;
  missing: readonly RecipientField[];
  /** Given when the sheet opened because the owner pressed copy / LINE with the recipient not complete. */
  action?: SendAction;
  onSave: (r: Recipient) => SaveOutcome;
  /** Sends with what is typed in the boxes now (an empty recipient when all are empty). Saves nothing. */
  onSendWithout?: (r: Recipient) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RecipientForm>(() => formOf(recipient));
  const [errors, setErrors] = useState<Partial<Record<RecipientField, RecipientError>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const set = (patch: Partial<RecipientForm>): void => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch) as RecipientField[]) delete next[k];
      return next;
    });
    setMessage(null);
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const checked = checkRecipient(form);
    if (!checked.ok) return setErrors(checked.errors);
    const res = onSave(checked.value);
    if (!res.ok) setMessage(res.text);
  };
  const typed = checkRecipient(form);
  const nothingTyped = typed.ok && Object.keys(typed.value).length === 0;
  const sendWithout = (): void => {
    const checked = checkRecipient(form);
    if (!checked.ok) return setErrors(checked.errors);
    onSendWithout?.(checked.value);
  };
  const err = (f: RecipientField): JSX.Element | null =>
    errors[f] ? (
      <p id={`rc-${f}-err`} className={styles.error}>
        <WarningIcon />
        {RECIPIENT_ERROR_TEXT[errors[f] as RecipientError]}
      </p>
    ) : null;

  return (
    <Sheet
      title={action ? 'ข้อมูลผู้รับยังไม่ครบ' : 'ข้อมูลผู้รับ'}
      subtitle={action ? `ยังไม่ได้ใส่: ${missing.map((f) => FIELD_NAME[f]).join(', ')}` : 'ใส่ให้ร้านรู้ว่าส่งยาหรือติดต่อใคร (พิมพ์เอง ไม่ผูกกับสมาชิก)'}
      onClose={onClose}
      closeButton
      tall
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label className={sheetStyles.label} htmlFor="rc-address">
            ที่อยู่ (ใช้เมื่อให้ส่งถึงบ้าน)
          </label>
          <textarea
            id="rc-address"
            className={`${styles.area} ${errors.address ? styles.invalid : ''}`}
            rows={3}
            placeholder="เช่น บ้านเลขที่ 99 ซอยตัวอย่าง 1 เขตสมมติ"
            value={form.address}
            aria-invalid={errors.address !== undefined}
            aria-describedby={errors.address ? 'rc-address-err' : undefined}
            onChange={(e) => set({ address: e.target.value })}
          />
          <p className={sheetStyles.hint}>ไม่เกิน {RECIPIENT_MAX.address} ตัวอักษร</p>
          {err('address')}
        </div>
        <div className={styles.field}>
          <label className={sheetStyles.label} htmlFor="rc-name">
            ชื่อผู้รับ
          </label>
          <input
            id="rc-name"
            className={`${sheetStyles.textInput} ${errors.name ? styles.invalid : ''}`}
            type="text"
            autoComplete="off"
            placeholder="เช่น คุณสมมติ"
            value={form.name}
            aria-invalid={errors.name !== undefined}
            aria-describedby={errors.name ? 'rc-name-err' : undefined}
            onChange={(e) => set({ name: e.target.value })}
          />
          {err('name')}
        </div>
        <div className={styles.field}>
          <label className={sheetStyles.label} htmlFor="rc-phone">
            เบอร์โทร
          </label>
          <input
            id="rc-phone"
            className={`${sheetStyles.textInput} ${errors.phone ? styles.invalid : ''}`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="เช่น 081-000-0000"
            value={form.phone}
            aria-invalid={errors.phone !== undefined}
            aria-describedby={errors.phone ? 'rc-phone-err' : undefined}
            onChange={(e) => set({ phone: e.target.value })}
          />
          {err('phone')}
        </div>
        <p className={sheetStyles.hint}>
          <InfoIcon /> เก็บในเครื่องนี้เท่านั้น ไม่เข้าไฟล์สำรอง
        </p>
        {message !== null && (
          <p className={styles.error} role="alert">
            <WarningIcon />
            {message}
          </p>
        )}
        <div className={sheetStyles.actions}>
          <button type="submit" className={sheetStyles.primary}>
            {action ? 'บันทึกแล้วส่ง' : 'บันทึก'}
          </button>
          {action && onSendWithout && (
            <button type="button" className={sheetStyles.cancel} onClick={sendWithout}>
              {nothingTyped ? 'ส่งโดยไม่ใส่ผู้รับ' : 'ส่งเท่าที่กรอกไว้'}
            </button>
          )}
          <button type="button" className={styles.plainCancel} onClick={onClose}>
            ยกเลิก
          </button>
        </div>
      </form>
    </Sheet>
  );
}
