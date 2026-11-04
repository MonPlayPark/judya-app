// Made-up houses for the secret demo links of the order page (#/n/order?demo=normal | nolow | nomeds), M4 PR 11.2.
// Built in memory from the medicine-list demo house; nothing here reads or writes storage. Made-up members; dates follow DEMO_TODAY (2026-10-28).
import { DEMO_TODAY } from './homeDemo';
import { blankRootV3 } from './fixtures';
import { medsDemoRoot } from './medsListDemo';
import { buildOrderLines } from './orderLines';
import type { Order, Price, Root } from './schema';

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

/** A made-up recipient for the test link `&recipient=full` (demo only; the address, name and phone are not real). */
export const DEMO_RECIPIENT = { address: 'บ้านเลขที่ 99 ซอยตัวอย่าง 1 เขตสมมติ 10000', name: 'คุณสมมติ ทดสอบ', phone: '081-000-0000' } as const;

/** Shops for the test link `&shops=three` (made-up; nothing is stored). Prices are for the ticked lines of the `normal` house:
 * ร้านทดสอบ ก (delivery, fee 40) and ร้านทดสอบ ข (pick-up) have every price; ร้านทดสอบ ค (delivery, fee 30, no phone) misses two. */
export const DEMO_SHOP_IDS = { a: 's1', b: 's2', c: 's3' } as const;

export function withDemoShops(root: Root): Root {
  const row = (shopId: string, id: string, item: Price['item'], price: number, sellUnit: string): Price => ({ id, shopId, item, price, sellUnit, perSellUnit: 1, date: DEMO_TODAY });
  const med = (medicationId: string): Price['item'] => ({ kind: 'med', medicationId });
  const house = (houseItemId: string): Price['item'] => ({ kind: 'house', houseItemId });
  const prices: Price[] = [
    row('s1', 'pr1', med('m1'), 2, 'เม็ด'),
    row('s1', 'pr2', med('m2'), 1, 'เม็ด'),
    row('s1', 'pr3', med('m8'), 85, 'หลอด'),
    row('s1', 'pr4', house('h3'), 6, 'ซอง'),
    row('s1', 'pr5', house('h1'), 25, 'อัน'),
    row('s2', 'pr6', med('m1'), 2.5, 'เม็ด'),
    row('s2', 'pr7', med('m2'), 1.25, 'เม็ด'),
    row('s2', 'pr8', med('m8'), 90, 'หลอด'),
    row('s2', 'pr9', house('h3'), 7, 'ซอง'),
    row('s2', 'pr10', house('h1'), 30, 'อัน'),
    row('s3', 'pr11', med('m1'), 1.5, 'เม็ด'),
    row('s3', 'pr12', med('m2'), 0.75, 'เม็ด'),
    row('s3', 'pr13', house('h3'), 5, 'ซอง'),
  ];
  return {
    ...root,
    shops: [
      { id: 's1', name: 'ร้านทดสอบ ก', phone: '021234567', delivery: { kind: 'deliver', fee: 40 } },
      { id: 's2', name: 'ร้านทดสอบ ข', phone: '021234568', delivery: { kind: 'pickup' } },
      { id: 's3', name: 'ร้านทดสอบ ค', delivery: { kind: 'deliver', fee: 30 } },
    ],
    prices,
  };
}

/** For the test link `&orders=waiting` (demo only): one made-up shop (ร้านทดสอบ ก) and one `waiting` order holding the first suggested
 * medicine, so that medicine shows the badge "สั่งแล้ว รอรับ" and starts unticked. Nothing is stored. */
export function withDemoWaitingOrder(root: Root): Root {
  const line = buildOrderLines(root, DEMO_TODAY).find((l) => l.source.kind === 'med' && l.source.shares.length > 0);
  if (!line) return root;
  const order: Order = {
    id: 'w1',
    shopId: 's1',
    shopName: 'ร้านทดสอบ ก',
    createdAt: `${DEMO_TODAY}T09:00:00+07:00`,
    status: 'waiting',
    includeShipping: true,
    shippingFee: 40,
    lines: [{ source: line.source, qtyOrdered: line.qtyOrdered, sellUnit: line.sellUnit, perSellUnit: line.perSellUnit, qtyReceived: 0, leftover: null }],
  };
  return { ...root, shops: [{ id: 's1', name: 'ร้านทดสอบ ก', phone: '021234567', delivery: { kind: 'deliver', fee: 40 } }], orders: [order] };
}
