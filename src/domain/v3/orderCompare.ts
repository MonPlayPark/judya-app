// Shop comparison for an order on the v3 model (M4 PR 11.1). Pure: no storage, no clock, no UI.
// Rule (owner's answer): a shop is compared on the lines it has a price for; the lines it has none for are not counted and
// are reported as "ไม่รวม N รายการที่ยังไม่มีราคา". Not the all-or-nothing rule of the removed v2 code.
import { pricesOf, type PriceItem } from './prices';
import type { OrderSource, Price, Shop } from './schema';

/** A line to compare: a draft line or a stored order line. `ticked: false` leaves it out (undefined = in). */
export interface CompareLine {
  key: string;
  source: OrderSource;
  /** Sell units asked for. */
  qtyOrdered: number;
  sellUnit: string;
  /** Medicine units in one sell unit of the line (unknown = only a price in the same sell unit name can be used). */
  perSellUnit?: number;
  ticked?: boolean;
}

export interface PricedLine {
  key: string;
  price: Price;
  /** Sell units bought at this shop (the line's own when the unit matches; otherwise rounded up in the shop's unit). */
  sellUnits: number;
  sellUnit: string;
  /** Price of the shop's sell unit x sellUnits, rounded to the satang. */
  cost: number;
  /** true = the shop's sell unit differs from the line's and the amount was converted through perSellUnit. */
  converted: boolean;
}

export interface ShopRow {
  shopId: string;
  shopName: string;
  pickup: boolean;
  /** Lines this shop has a price for (counted in the total). */
  lines: PricedLine[];
  /** Keys of the lines left out because this shop has no usable price for them. */
  unpricedKeys: string[];
  unpricedCount: number;
  /** 'ไม่รวม N รายการที่ยังไม่มีราคา', or null when nothing is left out. */
  unpricedText: string | null;
  /** Sum of the priced lines. */
  itemsTotal: number;
  /** What the shop charges for delivery: its fee for a delivery shop with at least one priced line, else 0 (pick-up, or nothing priced).
   * `delivery.freeOver` is not read: the screens no longer have that field, so old data carrying it must not cut the fee silently. */
  shipping: number;
  /** itemsTotal, plus `shipping` when `includeShipping`. */
  total: number;
}

export interface ShopComparison {
  /** Best first: shops with every line priced (cheapest total first), then shops missing some prices (fewer missing first, then cheaper),
   * then shops with no price at all. The same everything: by shop name. */
  rows: ShopRow[];
  /** Lines compared (ticked, quantity above 0). 0 = nothing to compare and `rows` is empty. */
  lineCount: number;
}

/** Money to the satang, so 0.1 + 0.2 is 0.3. */
const money = (x: number): number => Math.round(x * 100) / 100;

export const unpricedText = (n: number): string => `ไม่รวม ${n} รายการที่ยังไม่มีราคา`;

/** What a remembered price is looked up by; a typed medicine (`free`) has none, so it never has a price. */
export function itemOfSource(source: OrderSource): PriceItem | null {
  if (source.kind === 'med') return { kind: 'med', medicationId: source.medicationId };
  if (source.kind === 'house') return { kind: 'house', houseItemId: source.houseItemId };
  return null;
}

const newest = (rows: readonly Price[]): Price | undefined => rows.reduce<Price | undefined>((best, p) => (best === undefined || p.date >= best.date ? p : best), undefined);

/** The shop's usable price for the line. Same sell unit (same name, and the same count per unit when both are known) first, newest
 * of those; otherwise the newest price that can be converted. Conversion: medicine units = qtyOrdered x line.perSellUnit, shop's sell
 * units = that / price.perSellUnit rounded UP (at least 1). Both counts must be known; a house medicine only matches the same
 * sell unit name (its count per unit is always 1, so there is nothing to convert through). null = no usable price. */
function usablePrice(line: CompareLine, item: PriceItem, rows: readonly Price[]): PricedLine | null {
  const exact = rows.filter(
    (p) => p.sellUnit === line.sellUnit && (item.kind === 'house' || line.perSellUnit === undefined || p.perSellUnit === undefined || p.perSellUnit === line.perSellUnit),
  );
  const same = newest(exact);
  if (same) return { key: line.key, price: same, sellUnits: line.qtyOrdered, sellUnit: same.sellUnit, cost: money(line.qtyOrdered * same.price), converted: false };

  if (item.kind !== 'med' || line.perSellUnit === undefined) return null;
  const perLine = line.perSellUnit;
  const convertible = newest(rows.filter((p) => p.perSellUnit !== undefined));
  if (!convertible || convertible.perSellUnit === undefined) return null;
  const sellUnits = Math.max(Math.ceil((line.qtyOrdered * perLine) / convertible.perSellUnit - 1e-9), 1);
  return { key: line.key, price: convertible, sellUnits, sellUnit: convertible.sellUnit, cost: money(sellUnits * convertible.price), converted: true };
}

function rowFor(shop: Shop, lines: readonly CompareLine[], prices: readonly Price[], includeShipping: boolean): ShopRow {
  const priced: PricedLine[] = [];
  const unpricedKeys: string[] = [];
  for (const line of lines) {
    const item = itemOfSource(line.source);
    const found = item ? usablePrice(line, item, pricesOf(prices, shop.id, item)) : null;
    if (found) priced.push(found);
    else unpricedKeys.push(line.key);
  }

  const itemsTotal = money(priced.reduce((sum, l) => sum + l.cost, 0));
  const { delivery } = shop;
  const anyPriced = priced.length > 0;
  const deliver = delivery.kind === 'deliver';
  const shipping = anyPriced && delivery.kind === 'deliver' ? delivery.fee : 0;
  return {
    shopId: shop.id,
    shopName: shop.name,
    pickup: !deliver,
    lines: priced,
    unpricedKeys,
    unpricedCount: unpricedKeys.length,
    unpricedText: unpricedKeys.length > 0 ? unpricedText(unpricedKeys.length) : null,
    itemsTotal,
    shipping,
    total: money(itemsTotal + (includeShipping ? shipping : 0)),
  };
}

/** Compares every shop for the lines that are ticked and above 0. No lines or no shops: `rows` is empty (not an error). */
export function compareShops(lines: readonly CompareLine[], shops: readonly Shop[], prices: readonly Price[], includeShipping: boolean): ShopComparison {
  const wanted = lines.filter((l) => l.ticked !== false && l.qtyOrdered > 0);
  if (wanted.length === 0) return { rows: [], lineCount: 0 };
  const rows = shops.map((s) => rowFor(s, wanted, prices, includeShipping));
  const rank = (r: ShopRow): number => (r.lines.length === 0 ? 2 : r.unpricedCount === 0 ? 0 : 1);
  rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 1 ? a.unpricedCount - b.unpricedCount : 0) ||
      a.total - b.total ||
      a.shopName.localeCompare(b.shopName, 'th'),
  );
  return { rows, lineCount: wanted.length };
}
