// Choosing a shop on the order page (M4 PR 11.3b-2a). Pure: no storage, no clock (`today` is passed in), no UI.
// Glue between the draft lines, the shop comparison (orderCompare.ts), the remembered prices (prices.ts) and the message (orderMessage.ts).
import type { IsoDate } from '../calc';
import type { CompareLine, ShopRow } from './orderCompare';
import type { DraftLine, KnownDraftLine } from './orderLines';
import type { OrderMode } from './orderMessage';
import { checkEnteredPrice, upsertPrice } from './prices';
import { rootSchema, type Root, type Shop } from './schema';

/** The draft lines as the lines to compare (the ticked ones count; a line that is not ticked is left out by `compareShops`). */
export const compareLinesOf = (lines: readonly DraftLine[]): CompareLine[] =>
  lines.map((l) => ({
    key: l.key,
    source: l.source,
    qtyOrdered: l.qtyOrdered,
    sellUnit: l.sellUnit,
    ...(l.perSellUnit !== undefined ? { perSellUnit: l.perSellUnit } : {}),
    ticked: l.ticked,
  }));

/** What the message says about getting the medicine: a delivery shop -> 'delivery', a pick-up shop -> 'pickup', no shop chosen -> null. */
export const modeOfShop = (shop: Shop | undefined): OrderMode | null => (shop === undefined ? null : shop.delivery.kind === 'deliver' ? 'delivery' : 'pickup');

/** "฿1,234" / "฿1,234.50": whole baht without decimals, otherwise two decimals. */
export function baht(n: number): string {
  const whole = Math.abs(n - Math.round(n)) < 1e-9;
  return `฿${n.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** The lines of the draft that `row`'s shop has no usable price for AND that can hold a price (medicines and house medicines; a typed
 * medicine has no place for one). These are the boxes the "ใส่ราคา" sheet shows. */
export function priceableMissing(row: ShopRow, lines: readonly DraftLine[]): KnownDraftLine[] {
  const missing = new Set(row.unpricedKeys);
  const out: KnownDraftLine[] = [];
  for (const l of lines) if (missing.has(l.key) && l.source.kind !== 'free') out.push(l as KnownDraftLine);
  return out;
}

/** The shops that earn the "ถูกที่สุด" chip: every price present and the lowest total among such shops. Needs at least two shops to compare. */
export function cheapestShopIds(rows: readonly ShopRow[]): Set<string> {
  if (rows.length < 2) return new Set();
  const complete = rows.filter((r) => r.lines.length > 0 && r.unpricedCount === 0);
  if (complete.length === 0) return new Set();
  const min = Math.min(...complete.map((r) => r.total));
  return new Set(complete.filter((r) => r.total === min).map((r) => r.shopId));
}

export type PriceBoxError = 'invalid_price';
export type SavePricesResult =
  | { ok: true; root: Root; saved: number }
  | { ok: false; error: 'nothing_typed' | 'invalid' | 'invalid_root'; /** by line key */ errors: Record<string, PriceBoxError> };

/** Parses what a price box holds. '' = nothing typed; commas are dropped. NaN-like text is returned as NaN so the check refuses it. */
export function parsePriceText(text: string): number | null {
  const t = text.replace(/[,\s]/g, '');
  if (t === '') return null;
  return /^\d*\.?\d+$|^\d+\.$/.test(t) ? Number(t) : Number.NaN;
}

/** Remembers the typed prices of ONE shop through `upsertPrice` (the only writer of `root.prices`). `typed` = box text by line key; a line with
 * nothing typed is skipped. A wrong value stops everything (nothing is changed). The price is for one unit of the line's order unit
 * (`sellUnit`, holding `perSellUnit` medicine units; a house medicine always 1). Returns a new root; the one passed in is not changed. */
export function saveShopPrices(
  root: Root,
  shopId: string,
  lines: readonly KnownDraftLine[],
  typed: Readonly<Record<string, string>>,
  today: IsoDate,
  newId: () => string,
): SavePricesResult {
  const errors: Record<string, PriceBoxError> = {};
  const entries: { line: KnownDraftLine; price: number }[] = [];
  for (const line of lines) {
    const value = parsePriceText(typed[line.key] ?? '');
    const checked = checkEnteredPrice(value);
    if (!checked.ok) errors[line.key] = 'invalid_price';
    else if (checked.value !== null) entries.push({ line, price: checked.value });
  }
  if (Object.keys(errors).length > 0) return { ok: false, error: 'invalid', errors };
  if (entries.length === 0) return { ok: false, error: 'nothing_typed', errors };

  let prices = root.prices;
  for (const { line, price } of entries) {
    const item = line.source.kind === 'med' ? ({ kind: 'med', medicationId: line.source.medicationId } as const) : ({ kind: 'house', houseItemId: line.source.houseItemId } as const);
    const res = upsertPrice(prices, { shopId, item, price, sellUnit: line.sellUnit, ...(item.kind === 'med' ? { perSellUnit: line.perSellUnit } : {}) }, today, newId);
    if (!res.ok) return { ok: false, error: 'invalid', errors: { [line.key]: 'invalid_price' } };
    prices = res.prices;
  }
  const next: Root = { ...root, prices };
  if (!rootSchema.safeParse(next).success) return { ok: false, error: 'invalid_root', errors };
  return { ok: true, root: next, saved: entries.length };
}

/** The fee line of the chosen shop: pick-up has none; a delivery shop shows its fee (or free), and says so when the switch leaves it out of the total. */
export function feeLine(shop: Shop, includeShipping: boolean): string {
  if (shop.delivery.kind === 'pickup') return 'มารับเอง ไม่มีค่าส่ง';
  const text = `ค่าส่ง ${baht(shop.delivery.fee)}`;
  return includeShipping || shop.delivery.fee === 0 ? text : `${text} (ไม่รวมในยอด)`;
}
