// Who receives the order (M4 PR 11.3b-1): address, name and phone typed by the owner, kept in `root.settings` (recipientAddress,
// recipientName, recipientPhone). Pure rules; the page writes through `saveRoot`. Not tied to any member. Not in a backup file.
import type { Recipient } from './orderMessage';
import type { Root } from './schema';

export const RECIPIENT_MAX = { address: 300, name: 60, phone: 20 } as const;
export const PHONE_CHARS = /^[0-9 +-]*$/;

export type RecipientField = 'address' | 'name' | 'phone';
export type RecipientError = 'address_too_long' | 'name_too_long' | 'phone_too_long' | 'phone_chars';

export const RECIPIENT_ERROR_TEXT: Record<RecipientError, string> = {
  address_too_long: `ที่อยู่ยาวได้ไม่เกิน ${RECIPIENT_MAX.address} ตัวอักษร`,
  name_too_long: `ชื่อยาวได้ไม่เกิน ${RECIPIENT_MAX.name} ตัวอักษร`,
  phone_too_long: `เบอร์โทรยาวได้ไม่เกิน ${RECIPIENT_MAX.phone} ตัวอักษร`,
  phone_chars: 'เบอร์โทรใส่ได้เฉพาะตัวเลข เครื่องหมาย + - และเว้นวรรค',
};

/** What the three boxes hold. */
export interface RecipientForm {
  address: string;
  name: string;
  phone: string;
}

export type RecipientCheck = { ok: true; value: Recipient } | { ok: false; errors: Partial<Record<RecipientField, RecipientError>> };

/** Trims the three texts (an empty one is left out). Address <= 300, name <= 60, phone <= 20 and only digits, + - and spaces. */
export function checkRecipient(form: RecipientForm): RecipientCheck {
  const address = form.address.trim();
  const name = form.name.trim();
  const phone = form.phone.trim();
  const errors: Partial<Record<RecipientField, RecipientError>> = {};
  if (address.length > RECIPIENT_MAX.address) errors.address = 'address_too_long';
  if (name.length > RECIPIENT_MAX.name) errors.name = 'name_too_long';
  if (phone.length > RECIPIENT_MAX.phone) errors.phone = 'phone_too_long';
  else if (!PHONE_CHARS.test(phone)) errors.phone = 'phone_chars';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { ...(address !== '' ? { address } : {}), ...(name !== '' ? { name } : {}), ...(phone !== '' ? { phone } : {}) } };
}

export const recipientOf = (root: Pick<Root, 'settings'>): Recipient => {
  const s = root.settings;
  return {
    ...(s.recipientAddress !== undefined ? { address: s.recipientAddress } : {}),
    ...(s.recipientName !== undefined ? { name: s.recipientName } : {}),
    ...(s.recipientPhone !== undefined ? { phone: s.recipientPhone } : {}),
  };
}

export const formOf = (r: Recipient): RecipientForm => ({ address: r.address ?? '', name: r.name ?? '', phone: r.phone ?? '' });

/** A new root with the recipient replaced (a missing part is removed). Every other setting and table stays as it was. */
export function withRecipient(root: Root, r: Recipient): Root {
  const { recipientAddress: _a, recipientName: _n, recipientPhone: _p, ...rest } = root.settings;
  return {
    ...root,
    settings: {
      ...rest,
      ...(r.address !== undefined && r.address !== '' ? { recipientAddress: r.address } : {}),
      ...(r.name !== undefined && r.name !== '' ? { recipientName: r.name } : {}),
      ...(r.phone !== undefined && r.phone !== '' ? { recipientPhone: r.phone } : {}),
    },
  };
}

/** The line on the small bar over the message: 'ชื่อ · เบอร์' (whatever is there), or the empty-state words. */
export function recipientBarText(r: Recipient): string {
  const parts = [r.name?.trim() ?? '', r.phone?.trim() ?? ''].filter((p) => p !== '');
  return parts.length > 0 ? parts.join(' · ') : 'ยังไม่ได้ใส่ข้อมูลผู้รับ';
}
