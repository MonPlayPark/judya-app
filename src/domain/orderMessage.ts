// The LINE message to a shop (step 3.3b-1, BRIEF section 4). Pure text building, no UI. It never holds a member's name:
// nothing here receives one.
import { formatPills } from './format';
import type { OrderLine, ShopRow } from './order';

export const DEFAULT_ORDER_TEMPLATE =
  'สวัสดีค่ะ {ร้าน}\nขอสั่งยาตามรายการนี้\n{รายการ}\nรบกวนแจ้งราคารวมและเวลารับยาด้วย ขอบคุณค่ะ';

/** Used for {ร้าน} when no shop has every price. */
export const GENERIC_SHOP_NAME = 'ร้านยา';

const SHOP_TOKEN = '{ร้าน}';
const LIST_TOKEN = '{รายการ}';

/** One line of the message. `buy` is what the chosen shop sells (sell units and its unit); without a shop the plain quantity is used. */
export type MessageLine =
  | { kind: 'med'; name: string; unit: string; qty: number; buy?: { sellUnits: number; sellUnit: string; perSellUnit: number } }
  | { kind: 'house'; name: string; unit: string; qty: number; buy?: { sellUnits: number; sellUnit: string } };

/** 'ชื่อ x 2 กล่อง (120 เม็ด)' (regular medicine, shop chosen) / 'ชื่อ x 73 เม็ด' (no shop) /
 * 'ชื่อ x 2 ขวด' (house medicine, with a shop its sell unit, without the unit of its stock). */
export function orderLineText(line: MessageLine): string {
  if (line.kind === 'med') {
    if (!line.buy) return `${line.name} x ${formatPills(line.qty, line.unit)}`;
    const pills = Number((line.buy.sellUnits * line.buy.perSellUnit).toFixed(6));
    return `${line.name} x ${line.buy.sellUnits} ${line.buy.sellUnit} (${formatPills(pills, line.unit)})`;
  }
  return `${line.name} x ${line.qty} ${line.buy ? line.buy.sellUnit : line.unit}`;
}

/** The ticked lines (with the owner's quantities) as message lines. With the chosen shop's row the amounts are what is bought there;
 * with `null` (no shop has every price) they are the plain quantities. */
export function messageLines(lines: readonly OrderLine[], row: ShopRow | null): MessageLine[] {
  const out: MessageLine[] = [];
  for (const l of lines) {
    if (!l.ticked || l.qty <= 0) continue;
    const priced = row?.lines.find((p) => p.key === l.key);
    if (l.kind === 'med') {
      out.push({
        kind: 'med',
        name: l.name,
        unit: l.unit,
        qty: l.qty,
        ...(priced ? { buy: { sellUnits: priced.sellUnits, sellUnit: priced.sellUnit, perSellUnit: priced.perSellUnit } } : {}),
      });
    } else {
      out.push({
        kind: 'house',
        name: l.name,
        unit: l.unit,
        qty: l.qty,
        ...(priced ? { buy: { sellUnits: priced.sellUnits, sellUnit: priced.sellUnit } } : {}),
      });
    }
  }
  return out;
}

/** Fills the template. An empty (or spaces only) template means the default text. {ร้าน} (every place) = the shop name, or 'ร้านยา'
 * without a shop; {รายการ} = "1) ...", "2) ..." one per line; a template without {รายการ} gets the list on a new line at the end.
 * No lines = ''. The text is built in one pass over the template, so special characters in a name (like $& or {ร้าน}) stay as typed. */
export function buildOrderMessage(template: string, shopName: string | null, lines: readonly MessageLine[]): string {
  if (lines.length === 0) return '';
  const text = template.trim() === '' ? DEFAULT_ORDER_TEMPLATE : template;
  const shop = shopName !== null && shopName.trim() !== '' ? shopName : GENERIC_SHOP_NAME;
  const list = lines.map((l, i) => `${i + 1}) ${orderLineText(l)}`).join('\n');

  const parts = text.split(/(\{ร้าน\}|\{รายการ\})/);
  const hasList = parts.includes(LIST_TOKEN);
  const body = parts.map((p) => (p === SHOP_TOKEN ? shop : p === LIST_TOKEN ? list : p)).join('');
  return hasList ? body : `${body}\n${list}`;
}
