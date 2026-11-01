// Made-up houses for the secret demo links of the order page (#/n/order?demo=normal | nolow | nomeds), M4 PR 11.2.
// Built in memory from the medicine-list demo house; nothing here reads or writes storage. Made-up members; dates follow DEMO_TODAY (2026-10-28).
import { DEMO_TODAY } from './homeDemo';
import { blankRootV3 } from './fixtures';
import { medsDemoRoot } from './medsListDemo';
import type { Root } from './schema';

export const ORDER_DEMO_NAMES = ['normal', 'nolow', 'nomeds'] as const;
export type OrderDemoName = (typeof ORDER_DEMO_NAMES)[number];

export const isOrderDemoName = (v: string | null): v is OrderDemoName => v !== null && (ORDER_DEMO_NAMES as readonly string[]).includes(v);

/** normal = a medicine that is running low, one with no stock count, a cream with no spare tube, and house medicines that are low / out;
 * nolow = plenty of everything (nothing to suggest, but medicines to add by hand); nomeds = members only, no medicine at all. */
export function orderDemoRoot(name: OrderDemoName): Root {
  switch (name) {
    case 'nomeds':
      return { ...blankRootV3(), persons: medsDemoRoot('nomeds').persons };
    case 'nolow': {
      const r = structuredClone(medsDemoRoot('cream'));
      for (const a of r.assignments) {
        if (a.status === 'active' && a.stock?.kind === 'count') a.stock = { kind: 'count', strips: 0, loose: 900, countedOn: DEMO_TODAY };
      }
      r.houseItems = r.houseItems.map((h) => (h.stock ? { ...h, stock: { ...h.stock, qty: 10 }, lowAt: 1 } : h));
      return r;
    }
    case 'normal': {
      const r = structuredClone(medsDemoRoot('cream'));
      const cream = r.assignments.find((a) => a.id === 'a9');
      if (cream) cream.stock = { kind: 'tubes', opened: true, spare: 0 }; // in use, no spare: running low
      const unknown = r.assignments.find((a) => a.id === 'a3');
      if (unknown) unknown.stock = null; // never counted
      return r;
    }
  }
}
