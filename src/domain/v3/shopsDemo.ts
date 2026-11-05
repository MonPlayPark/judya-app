// Made-up houses for the secret demo links of the shops page (#/n/shops?demo=normal | empty | long), M4 PR 11.3a.
// Built in memory; nothing here reads or writes storage. Shops and the phone number are made up.
import { blankRootV3 } from './fixtures';
import type { Root } from './schema';

export const SHOPS_DEMO_NAMES = ['normal', 'empty', 'long'] as const;
export type ShopsDemoName = (typeof SHOPS_DEMO_NAMES)[number];

export const isShopsDemoName = (v: string | null): v is ShopsDemoName => v !== null && (SHOPS_DEMO_NAMES as readonly string[]).includes(v);

/** normal = three shops (delivery with a fee, pick-up with a phone, one with a "free over" value the screens do not show);
 * empty = none; long = a 40-letter name and a long phone number. */
export function shopsDemoRoot(name: ShopsDemoName): Root {
  const base = blankRootV3();
  switch (name) {
    case 'empty':
      return base;
    case 'long':
      return {
        ...base,
        shops: [
          { id: 's1', name: `ร้านทดสอบ${'ก'.repeat(31)}`, phone: '+66 2 123 4567 000', delivery: { kind: 'deliver', fee: 1234.5 } },
          { id: 's2', name: 'ร้านทดสอบ ข', delivery: { kind: 'pickup' } },
        ],
      };
    case 'normal':
      return {
        ...base,
        shops: [
          { id: 's1', name: 'ร้านทดสอบ ก', phone: '021234567', delivery: { kind: 'deliver', fee: 40 } },
          { id: 's2', name: 'ร้านทดสอบ ข', phone: '021234568', delivery: { kind: 'pickup' } },
          { id: 's3', name: 'ร้านทดสอบ ค', delivery: { kind: 'deliver', fee: 30, freeOver: 500 } },
        ],
      };
  }
}
