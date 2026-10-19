// What the order page (#/order, step 3.3b-3) needs besides order.ts / orderMessage.ts: the +/− step, the lines with the owner's
// changes on top, and the choice of the shop. Pure: no storage, no clock, no UI. The page writes nothing; every change lives in
// the page only.
import type { OrderLine } from './order';

/** Floating point safe: 3 x 0.1 is 0.3, not 0.30000000000000004. */
const clean = (n: number): number => Number(n.toFixed(6));

/** The quantity after one tap of + (`up`) or − (`down`), in the line's own unit (pills for a regular medicine, sell units for a
 * house medicine).
 * - Regular medicine with a shop chosen (`perSellUnit` = pills in one sell unit): moves by whole sell units. n = the sell units the
 *   quantity needs now = max(ceil(qty / perSellUnit), 1); up -> (n + 1) x perSellUnit, down -> max(n - 1, 1) x perSellUnit.
 * - Regular medicine with no shop that has every price (`null`) and a house medicine: up -> qty + 1, down -> max(qty - 1, 1).
 * - Quantity 0 (stock already covers the target): up gives the first sell unit (1 x perSellUnit, or 1 without a shop); down stays 0
 *   (a "−" never raises a quantity from 0). */
export function stepQty(line: OrderLine, dir: 'up' | 'down', perSellUnit: number | null): number {
  const qty = line.qty;
  const bySellUnit = line.kind === 'med' && perSellUnit !== null && perSellUnit > 0;
  if (qty <= 0) return dir === 'up' ? (bySellUnit ? clean(perSellUnit) : 1) : 0;
  if (bySellUnit) {
    const n = Math.max(Math.ceil(qty / perSellUnit - 1e-9), 1);
    return clean((dir === 'up' ? n + 1 : Math.max(n - 1, 1)) * perSellUnit);
  }
  return clean(dir === 'up' ? qty + 1 : Math.max(qty - 1, 1));
}

/** The lines with the owner's quantity and tick on top (the originals are not changed). A key that is not in an override keeps the
 * line's own value. A line whose quantity is 0 or less is never ticked, whatever the override says. */
export function effectiveLines(
  lines: readonly OrderLine[],
  qtyOverride: Readonly<Record<string, number | undefined>>,
  tickOverride: Readonly<Record<string, boolean | undefined>>,
): OrderLine[] {
  return lines.map((l) => {
    const qty = qtyOverride[l.key] ?? l.qty;
    const ticked = qty > 0 && (tickOverride[l.key] ?? l.ticked);
    return { ...l, qty, ticked };
  });
}

/** The shop the page works with: the one the owner tapped if it is still in `rows`, otherwise the first row (the cheapest);
 * no rows, no shop. */
export function pickShop<T extends { shopId: string }>(rows: readonly T[], chosenId: string | null): T | null {
  if (chosenId !== null) {
    const chosen = rows.find((r) => r.shopId === chosenId);
    if (chosen) return chosen;
  }
  return rows[0] ?? null;
}
