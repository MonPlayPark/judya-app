// The message to the shop (M4 PR 11.3b-1). Pure: no storage, no clock, no UI. The text is a fixed shape kept in the code (it does not
// read `settings.orderTemplate`):
//
//   สั่งยาค่ะ
//
//   1) <name> <strength> <qty> <sell unit> <pack size>
//   2) ...
//
//   ส่ง <address>            (delivery, only when there is an address)  /  มารับเองค่ะ   (pick-up)
//
//   <recipient name> <phone>  (only when there is a name or a phone)
//
// Every part that is empty is left out whole, with no double space and no extra blank line. The text never holds a member's name, a price
// or a shop's name: nothing here receives one (`messageItems` reads only medicines and house medicines, never `persons`).
import { asksPerSellUnit } from './orderDraft';
import type { DraftLine } from './orderLines';
import { strengthText } from './medsList';
import { SMALL_UNIT } from './addMedicine';
import type { Root, Strength } from './schema';

export type OrderMode = 'delivery' | 'pickup';

/** Typed by the owner; none of it is tied to a member. All parts are optional. */
export interface Recipient {
  address?: string | undefined;
  name?: string | undefined;
  phone?: string | undefined;
}

/** One ready line of the message. `pack` = the pack size text ('60 เม็ด'), left out when not known. */
export interface MessageItem {
  name: string;
  strength?: string | undefined;
  qty: number;
  unit: string;
  pack?: string | undefined;
}

export const MESSAGE_HEADER = 'สั่งยาค่ะ';
export const PICKUP_LINE = 'มารับเองค่ะ';
export const DELIVERY_PREFIX = 'ส่ง';

/** Squeezes every run of spaces / tabs / line breaks into one space and trims. */
export const oneLine = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

const clean = (n: number): string => String(Number(n.toFixed(6)));

/** 'name strength qty unit pack', the empty parts left out. */
export function itemText(item: MessageItem): string {
  return [oneLine(item.name), oneLine(item.strength), clean(item.qty), oneLine(item.unit), oneLine(item.pack)].filter((p) => p !== '').join(' ');
}

/** The ticked lines (quantity above 0) of the draft as message items. A medicine of the app gets its strength and pack size from the
 * medicine; a typed medicine from what the owner gave. The pack size is the count in one sell unit, with the small unit ('60 เม็ด'); it is
 * left out when it is not known, when the sell unit is the small unit itself, for cream / drops (counted by the tube) and for house
 * medicines (ordered in the unit of their stock). */
export function messageItems(root: Pick<Root, 'medications' | 'houseItems'>, lines: readonly DraftLine[]): MessageItem[] {
  const out: MessageItem[] = [];
  for (const l of lines) {
    if (!l.ticked || !(l.qtyOrdered > 0)) continue;
    let strength: Strength | undefined;
    let kind: keyof typeof SMALL_UNIT | null = null;
    let smallUnit: string | null = null;
    switch (l.source.kind) {
      case 'med': {
        const id = l.source.medicationId;
        const m = root.medications.find((x) => x.id === id);
        strength = m?.strength;
        kind = m?.kind ?? null;
        smallUnit = l.unit; // the medicine's own unit word (เม็ด, มล. ...)
        break;
      }
      case 'house': {
        const id = l.source.houseItemId;
        strength = root.houseItems.find((x) => x.id === id)?.strength;
        break;
      }
      case 'free':
        strength = l.source.strength;
        kind = l.source.medKind ?? 'other';
        smallUnit = SMALL_UNIT[kind];
        break;
    }
    const per = l.perSellUnit;
    const pack =
      kind !== null && smallUnit !== null && per !== undefined && per > 0 && asksPerSellUnit(kind, l.sellUnit) && l.sellUnit.trim() !== smallUnit
        ? `${clean(per)} ${smallUnit}`
        : undefined;
    out.push({ name: l.name, strength: strength ? strengthText(strength) : undefined, qty: l.qtyOrdered, unit: l.sellUnit, pack });
  }
  return out;
}

/** The whole message. No items = '' (nothing to send). */
/** `mode` null = no shop chosen yet: no delivery / pick-up line (the recipient's name and phone stay). */
export function buildOrderMessage(items: readonly MessageItem[], mode: OrderMode | null, recipient: Recipient): string {
  if (items.length === 0) return '';
  const blocks: string[] = [MESSAGE_HEADER, items.map((it, i) => `${i + 1}) ${itemText(it)}`).join('\n')];
  if (mode === 'pickup') blocks.push(PICKUP_LINE);
  else if (mode === 'delivery') {
    const address = oneLine(recipient.address);
    if (address !== '') blocks.push(`${DELIVERY_PREFIX} ${address}`);
  }
  const who = [oneLine(recipient.name), oneLine(recipient.phone)].filter((p) => p !== '').join(' ');
  if (who !== '') blocks.push(who);
  return blocks.join('\n\n');
}

/** Is what the owner typed enough for this mode? Delivery needs address, name and phone; pick-up needs name and phone. */
export function recipientMissing(mode: OrderMode | null, recipient: Recipient): ('address' | 'name' | 'phone')[] {
  const missing: ('address' | 'name' | 'phone')[] = [];
  if (mode === 'delivery' && oneLine(recipient.address) === '') missing.push('address');
  if (oneLine(recipient.name) === '') missing.push('name');
  if (oneLine(recipient.phone) === '') missing.push('phone');
  return missing;
}
export const recipientComplete = (mode: OrderMode | null, recipient: Recipient): boolean => recipientMissing(mode, recipient).length === 0;

// ---------- the LINE link ----------

export const LINE_LINK_PREFIX = 'https://line.me/R/msg/text/?';
/** GUESS, not a limit published by LINE: when the finished link (after encoding; each Thai letter becomes 9 characters) is longer than this,
 * the page warns that LINE may cut the end of the text and suggests "คัดลอกข้อความ". The LINE button stays on and still opens LINE.
 * To be tried on a real phone (DECISIONS.md, M4 PR 11.3b-1). */
export const LINE_LINK_WARN_LENGTH = 8000;

/** The link that opens LINE with the text ready to send. Line breaks become %0A (encodeURIComponent). */
export const lineLink = (text: string): string => LINE_LINK_PREFIX + encodeURIComponent(text);
export const lineLinkIsLong = (text: string): boolean => lineLink(text).length > LINE_LINK_WARN_LENGTH;
