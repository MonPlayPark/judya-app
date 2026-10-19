// The order list and the shop comparison (step 3.3b-1, BRIEF section 4). Pure: no storage, no clock (`today` is passed in),
// no UI. Not the old `compareShops` / `lineCost` of calc.ts: those stay as they are and are not used here.
// A line never carries a member's name (the LINE message must not have one), only the assignment ids it came from.
import type { IsoDate } from './calc';
import type { HouseItem, Medication, Root, Shop } from './schema';
import { houseStatus, isLowStock, stockNow, targetDoses } from './stock';

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, 'th');

/** Why a line is on the list: 'low' = running low (ticked for the owner), 'unknown' = no stock count (shown, not ticked). */
export type OrderReason = 'low' | 'unknown';

export interface MedOrderLine {
  kind: 'med';
  /** 'med:<medicationId>' */
  key: string;
  medicationId: string;
  name: string;
  /** Medicine unit (เม็ด ...). `qty` is in this unit. */
  unit: string;
  qty: number;
  reason: OrderReason;
  ticked: boolean;
  /** The assignments (one per member who uses the medicine) added into this line. No names. */
  assignmentIds: string[];
}

export interface HouseOrderLine {
  kind: 'house';
  /** 'house:<houseItemId>' */
  key: string;
  houseItemId: string;
  name: string;
  /** The unit of the house medicine's stock. `qty` counts sell units (1 to start with). */
  unit: string;
  qty: number;
  reason: 'low';
  ticked: boolean;
}

export type OrderLine = MedOrderLine | HouseOrderLine;

/** The suggested order, one line per medicine: regular medicines first, then house medicines, each group by name.
 * Regular medicine: every active assignment of a member who is still in the house (self-managed too), summed per medication (Q6).
 * need of one assignment = max(target - stock now, 0), or the whole target when the stock is unknown; target = what the real schedule
 * takes over `settings.orderDays` days from today. A line is listed when any assignment is low (reason 'low') or else any has no stock
 * count (reason 'unknown'). Ticked = low and qty > 0. House medicine: only when low or out, qty 1 sell unit, ticked. */
export function orderLines(root: Root, today: IsoDate): OrderLine[] {
  const { orderDays, lowStockDays } = root.settings;
  const meds = new Map<string, MedOrderLine & { anyLow: boolean; anyUnknown: boolean }>();

  for (const a of root.assignments) {
    if (a.status !== 'active') continue;
    const person = root.persons.find((p) => p.id === a.personId);
    const med: Medication | undefined = root.medications.find((m) => m.id === a.medicationId);
    if (!person || person.removedAt !== undefined || !med) continue;

    const target = targetDoses(a, today, orderDays, root.events);
    const have = stockNow(a, today, root.events);
    const need = have === null ? target : Math.max(target - have, 0);

    let line = meds.get(med.id);
    if (!line) {
      line = {
        kind: 'med',
        key: `med:${med.id}`,
        medicationId: med.id,
        name: med.name,
        unit: med.unit,
        qty: 0,
        reason: 'unknown',
        ticked: false,
        assignmentIds: [],
        anyLow: false,
        anyUnknown: false,
      };
      meds.set(med.id, line);
    }
    line.qty += need;
    line.assignmentIds.push(a.id);
    if (have === null) line.anyUnknown = true;
    else if (isLowStock(a, today, lowStockDays, root.events)) line.anyLow = true;
  }

  const medLines: MedOrderLine[] = [];
  for (const { anyLow, anyUnknown, ...line } of meds.values()) {
    if (!anyLow && !anyUnknown) continue;
    const reason: OrderReason = anyLow ? 'low' : 'unknown';
    medLines.push({ ...line, reason, ticked: reason === 'low' && line.qty > 0 });
  }
  medLines.sort(byName);

  const houseLines: HouseOrderLine[] = [];
  for (const h of root.houseItems) {
    if (h.removedAt !== undefined || !h.stock) continue;
    const status = houseStatus(h);
    if (status !== 'low' && status !== 'out') continue;
    houseLines.push(houseLine(h, h.stock.unit));
  }
  houseLines.sort(byName);

  return [...medLines, ...houseLines];
}

const houseLine = (h: HouseItem, unit: string): HouseOrderLine => ({
  kind: 'house',
  key: `house:${h.id}`,
  houseItemId: h.id,
  name: h.name,
  unit,
  qty: 1,
  reason: 'low',
  ticked: true,
});

// ---------- price comparison ----------

/** Money to the satang, so 0.1 + 0.2 is 0.3. */
const money = (x: number): number => Math.round(x * 100) / 100;

export interface PricedLine {
  key: string;
  /** Sell units bought (regular medicine: ceil(qty / perSellUnit), house medicine: qty). */
  sellUnits: number;
  sellUnit: string;
  perSellUnit: number;
  /** Price of one sell unit. */
  price: number;
  /** sellUnits x price. */
  cost: number;
}

export interface ShopRow {
  shopId: string;
  shopName: string;
  /** Sum of the lines. */
  itemsTotal: number;
  /** What the shop would charge for delivery (0 for pick-up, or when the free-delivery amount is reached). */
  shipping: number;
  /** itemsTotal, plus the shipping when `includeShipping`. */
  total: number;
  lines: PricedLine[];
  /** Delivery shop with a fee and a free-over amount not reached yet: how much more to buy for free delivery. */
  buyMore: number | null;
}

export interface MissingPrices {
  shopId: string;
  shopName: string;
  /** Keys of the lines that have no price in this shop (the screen links each to its medicine page). */
  keys: string[];
}

export interface ShopComparison {
  /** Shops that have a price for every line, cheapest first (same total: by shop name). */
  rows: ShopRow[];
  /** Shops left out because a price is missing. */
  missing: MissingPrices[];
}

/** Sell units of a regular medicine: ceil(qty / perSellUnit) with a tiny allowance for floating point, at least 1. */
const sellUnitsOf = (qty: number, perSellUnit: number): number => Math.max(Math.ceil(qty / perSellUnit - 1e-9), 1);

/** Compares the shops for the ticked lines (`ticked` and `qty` > 0; the others are left out), with the `qty` the owner may have
 * changed. A shop is compared only if it has a price for every line. Delivery: pick-up 0; deliver: items >= freeOver (if any) is 0,
 * else the fee. Totals are rounded to the satang before sorting. No lines, no shops or no complete shop: `rows` is empty (no error). */
export function compareShops(
  lines: readonly OrderLine[],
  shops: readonly Shop[],
  prices: Root['prices'],
  includeShipping: boolean,
): ShopComparison {
  const wanted = lines.filter((l) => l.ticked && l.qty > 0);
  const rows: ShopRow[] = [];
  const missing: MissingPrices[] = [];
  if (wanted.length === 0) return { rows, missing };

  for (const shop of shops) {
    const priced: PricedLine[] = [];
    const lacking: string[] = [];
    for (const line of wanted) {
      const p = prices.find(
        (x) =>
          x.shopId === shop.id &&
          (line.kind === 'med'
            ? x.item.kind === 'med' && x.item.medicationId === line.medicationId
            : x.item.kind === 'house' && x.item.houseItemId === line.houseItemId),
      );
      if (!p) {
        lacking.push(line.key);
        continue;
      }
      const sellUnits = line.kind === 'med' ? sellUnitsOf(line.qty, p.perSellUnit) : line.qty;
      priced.push({
        key: line.key,
        sellUnits,
        sellUnit: p.sellUnit,
        perSellUnit: p.perSellUnit,
        price: p.price,
        cost: money(sellUnits * p.price),
      });
    }
    if (lacking.length > 0) {
      missing.push({ shopId: shop.id, shopName: shop.name, keys: lacking });
      continue;
    }

    const itemsTotal = money(priced.reduce((sum, l) => sum + l.cost, 0));
    const { delivery } = shop;
    const shipping = delivery.kind === 'pickup' ? 0 : delivery.freeOver !== undefined && itemsTotal >= delivery.freeOver ? 0 : delivery.fee;
    const buyMore =
      delivery.kind === 'deliver' && delivery.freeOver !== undefined && delivery.fee > 0 && itemsTotal < delivery.freeOver
        ? money(delivery.freeOver - itemsTotal)
        : null;
    rows.push({
      shopId: shop.id,
      shopName: shop.name,
      itemsTotal,
      shipping,
      total: money(itemsTotal + (includeShipping ? shipping : 0)),
      lines: priced,
      buyMore,
    });
  }

  rows.sort((a, b) => a.total - b.total || a.shopName.localeCompare(b.shopName, 'th'));
  missing.sort((a, b) => a.shopName.localeCompare(b.shopName, 'th'));
  return { rows, missing };
}
