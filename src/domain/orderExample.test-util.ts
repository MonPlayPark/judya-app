// The owner's order-page example (step 3.3b-3), for tests only. Made-up names (BRIEF 3.6). Today = 2026-10-19 (Monday).
// Two members take medicine X: 73 pills to order together. House medicine Y is low (2 bottles, warn at 5).
// Five shops (ก ข ค ง จ); shop จ has no price for Y.
import { assignment, dailyMeal, person, rootWith } from './helpers.test-util';
import type { Price, Root, Shop } from './schema';

export const EXAMPLE_TODAY = '2026-10-19';
export const NAME_X = 'ยาทดสอบ เอ็กซ์';
export const NAME_Y = 'ยาสามัญทดสอบ วาย';
export const NAME_Z = 'ยาทดสอบ แซด';

const shop = (id: string, name: string, delivery: Shop['delivery'], phone?: string): Shop => ({ id, name, delivery, ...(phone ? { phone } : {}) });
export const SHOPS: Shop[] = [
  shop('sA', 'ร้านทดสอบ ก', { kind: 'pickup' }, '081-234-5678'),
  shop('sB', 'ร้านทดสอบ ข', { kind: 'deliver', fee: 40, freeOver: 1000 }),
  shop('sC', 'ร้านทดสอบ ค', { kind: 'deliver', fee: 30, freeOver: 700 }),
  shop('sD', 'ร้านทดสอบ ง', { kind: 'deliver', fee: 50, freeOver: 650 }),
  shop('sE', 'ร้านทดสอบ จ', { kind: 'pickup' }),
];

const mp = (shopId: string, medicationId: string, price: number, sellUnit: string, perSellUnit: number): Price => ({
  id: `${shopId}-${medicationId}`,
  shopId,
  item: { kind: 'med', medicationId },
  price,
  sellUnit,
  perSellUnit,
});
const hp = (shopId: string, houseItemId: string, price: number, sellUnit: string): Price => ({
  id: `${shopId}-${houseItemId}`,
  shopId,
  item: { kind: 'house', houseItemId },
  price,
  sellUnit,
  perSellUnit: 1,
});
export const PRICES: Price[] = [
  mp('sA', 'mX', 290, 'กล่อง', 60),
  hp('sA', 'hY', 35, 'ขวด'),
  mp('sB', 'mX', 240, 'แผง', 30),
  hp('sB', 'hY', 40, 'ขวด'),
  mp('sC', 'mX', 250, 'กล่อง', 30),
  hp('sC', 'hY', 30, 'ขวด'),
  mp('sD', 'mX', 290, 'กล่อง', 60),
  hp('sD', 'hY', 35, 'ขวด'),
  mp('sE', 'mX', 100, 'แผง', 10), // no price for Y
];

/** The house of the example. `shops` / `prices` can be left out to get the cases with no shop or no price. */
export function exampleRoot(over: Partial<Root> = {}): Root {
  return rootWith({
    persons: [person({ id: 'p1', name: 'ชื่อสมาชิกทดสอบ หนึ่ง' }), person({ id: 'p2', name: 'ชื่อสมาชิกทดสอบ สอง', color: 'green' })],
    medications: [{ id: 'mX', name: NAME_X, unit: 'เม็ด' }],
    assignments: [
      // 2 a day, 10 left today -> 60 - 10 = 50
      assignment({
        id: 'a1',
        medicationId: 'mX',
        personId: 'p1',
        schedule: dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } }),
        stock: { qty: 10, countedOn: EXAMPLE_TODAY },
      }),
      // 1 a day, 12 counted on 14 Oct -> 7 left today -> 30 - 7 = 23
      assignment({
        id: 'a2',
        medicationId: 'mX',
        personId: 'p2',
        schedule: dailyMeal({ morning: { pills: 1, meal: 'after' } }),
        stock: { qty: 12, countedOn: '2026-10-14' },
      }),
    ],
    houseItems: [{ id: 'hY', name: NAME_Y, stock: { qty: 2, unit: 'ขวด' }, lowAt: 5 }],
    shops: SHOPS,
    prices: PRICES,
    ...over,
  });
}
