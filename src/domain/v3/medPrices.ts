// Price per shop on the medicine page (M4 PR 13). Pure: no storage, no clock (`today` is passed in), no UI.
// The card and sheet of the detail page and of the house medicine sheet read and write the ONE price store `root.prices`
// (through `upsertPrice`), the same rows the order page compares. Nothing new is kept.
import type { IsoDate } from '../calc';
import { unitWord } from './home';
import { fullThaiDate } from './medDetail';
import { baht, parsePriceText } from './orderShops';
import { checkEnteredPrice, latestPrice, sameItem, upsertPrice, type PriceItem } from './prices';
import { rootSchema, type HouseItem, type Medication, type Root } from './schema';

/** One unit a shop can sell in, and how many medicine units it holds (a house medicine: always 1). */
export interface UnitChoice {
  label: string;
  perSellUnit: number;
}

/** What a price card / sheet is about: one medicine or one house medicine. */
export interface PriceSubject {
  item: PriceItem;
  /** Shown in the sheet's sub line. */
  name: string;
  choices: UnitChoice[];
  /** The word of the "≈ ฿Y ต่อ<word>" line; null = no such line (tubes, bottles of drops, house medicines). */
  perUnitWord: string | null;
}

const isTube = (m: Pick<Medication, 'kind'>): boolean => m.kind === 'cream' || m.kind === 'drops';

/** The units a shop can sell a medicine in, taken from its pack (the first one is the default). A cream is sold by the tube, drops by the
 * bottle; a medicine with no pack only has its own unit word. */
export function unitChoicesOf(m: Medication): UnitChoice[] {
  const piece = unitWord(m);
  if (m.kind === 'cream') return [{ label: 'หลอด', perSellUnit: 1 }];
  if (m.kind === 'drops') return [{ label: 'ขวด', perSellUnit: 1 }];
  const pack = m.pack;
  switch (pack.type) {
    case 'box':
      return [
        { label: 'กล่อง', perSellUnit: pack.strips * pack.perStrip },
        { label: 'แผง', perSellUnit: pack.perStrip },
        { label: piece, perSellUnit: 1 },
      ];
    case 'strip':
      return [
        { label: 'แผง', perSellUnit: pack.perStrip },
        { label: piece, perSellUnit: 1 },
      ];
    case 'bottle':
      return [
        { label: 'ขวด', perSellUnit: pack.perBottle },
        { label: piece, perSellUnit: 1 },
      ];
    case 'sachetBox':
      return [
        { label: 'กล่อง', perSellUnit: pack.sachets },
        { label: piece, perSellUnit: 1 },
      ];
    case 'container':
      return m.kind === 'liquid' && pack.unit === 'ml' ? [{ label: 'ขวด', perSellUnit: pack.amount }] : [{ label: piece, perSellUnit: 1 }];
    case 'none':
      return [{ label: piece, perSellUnit: 1 }];
  }
}

export function subjectOfMedication(root: Root, medicationId: string): PriceSubject | null {
  const m = root.medications.find((x) => x.id === medicationId);
  if (!m) return null;
  return { item: { kind: 'med', medicationId }, name: m.name, choices: unitChoicesOf(m), perUnitWord: isTube(m) ? null : unitWord(m) };
}

const HOUSE_KIND_UNIT: Record<NonNullable<HouseItem['kind']>, string> = {
  tablet: 'เม็ด',
  capsule: 'แคปซูล',
  liquid: 'ขวด',
  cream: 'หลอด',
  sachet: 'ซอง',
  drops: 'ขวด',
  other: 'หน่วย',
};

/** A house medicine is sold in the unit its stock is counted in (rule 8 of the order data); not counted -> a unit by its kind. */
export function subjectOfHouse(root: Root, houseItemId: string): PriceSubject | null {
  const h = root.houseItems.find((x) => x.id === houseItemId && x.removedAt === undefined);
  if (!h) return null;
  const unit = h.stock?.unit ?? HOUSE_KIND_UNIT[h.kind ?? 'other'];
  return { item: { kind: 'house', houseItemId }, name: h.name, choices: [{ label: unit, perSellUnit: 1 }], perUnitWord: null };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** "≈ ฿6.50 ต่อเม็ด": the price of one sell unit divided by what it holds. */
export const perUnitText = (price: number, perSellUnit: number, word: string): string => `≈ ${baht(round2(price / perSellUnit))} ต่อ${word}`;

/** The hint under the price box. null = nothing to say (no price yet, a tube, a house medicine). */
export function hintText(subject: PriceSubject, price: number, perSellUnit: number): string | null {
  if (!(price > 0) || subject.perUnitWord === null || !(perSellUnit > 0)) return null;
  return `คิดเป็นประมาณ ${baht(round2(price / perSellUnit))} ต่อ${subject.perUnitWord} (ใช้เทียบกับร้านอื่น)`;
}

export interface ShopPriceRow {
  shopId: string;
  shopName: string;
  hasPrice: boolean;
  /** "อัปเดต 20 ต.ค. 2569" or "ยังไม่มีราคา". */
  sub: string;
  /** "฿180 / กล่อง" or "ใส่ราคา". */
  main: string;
  /** "≈ ฿6 ต่อเม็ด" or '' (none). */
  per: string;
  aria: string;
}

/** One row per shop of the house (in the order of `root.shops`), with the newest price that shop has for the subject. */
export function shopPriceRows(root: Root, subject: PriceSubject): ShopPriceRow[] {
  return root.shops.map((shop) => {
    const p = latestPrice(root.prices, shop.id, subject.item);
    if (!p) return { shopId: shop.id, shopName: shop.name, hasPrice: false, sub: 'ยังไม่มีราคา', main: 'ใส่ราคา', per: '', aria: `ใส่ราคาที่ ${shop.name}` };
    const showPer = subject.perUnitWord !== null && p.perSellUnit !== undefined && p.perSellUnit > 0;
    return {
      shopId: shop.id,
      shopName: shop.name,
      hasPrice: true,
      sub: `อัปเดต ${fullThaiDate(p.date)}`,
      main: `${baht(p.price)} / ${p.sellUnit}`,
      per: showPer && subject.perUnitWord !== null && p.perSellUnit !== undefined ? perUnitText(p.price, p.perSellUnit, subject.perUnitWord) : '',
      aria: `แก้ราคาที่ ${shop.name}`,
    };
  });
}

export interface SheetStart {
  /** The unit that is pressed when the sheet opens: the saved one, else the first. */
  unit: string;
  /** What the price box holds: the saved price, else ''. */
  text: string;
  hasPrice: boolean;
  /** The pack's units, plus the saved unit when the pack does not offer it. */
  choices: UnitChoice[];
}

export function sheetStartOf(root: Root, subject: PriceSubject, shopId: string): SheetStart {
  const p = latestPrice(root.prices, shopId, subject.item);
  const first = subject.choices[0];
  if (!p) return { unit: first?.label ?? '', text: '', hasPrice: false, choices: subject.choices };
  const known = subject.choices.some((c) => c.label === p.sellUnit);
  const choices = known ? subject.choices : [...subject.choices, { label: p.sellUnit, perSellUnit: p.perSellUnit ?? 1 }];
  return { unit: p.sellUnit, text: String(p.price), hasPrice: true, choices };
}

export type SavePriceResult =
  | { ok: true; root: Root; shopName: string }
  | { ok: false; error: 'invalid_price' | 'invalid_unit' | 'no_shop' | 'invalid_root' };

/** Remembers the typed price of ONE shop through `upsertPrice` (the only writer of `root.prices`), dated `today`. `unit` is one of the
 * sheet's choices (`sheetStartOf(...).choices`). Returns a new root; the one passed in is not changed. */
export function savePriceOf(
  root: Root,
  subject: PriceSubject,
  shopId: string,
  unit: string,
  priceText: string,
  today: IsoDate,
  newId: () => string,
  choices: readonly UnitChoice[] = subject.choices,
): SavePriceResult {
  const shop = root.shops.find((s) => s.id === shopId);
  if (!shop) return { ok: false, error: 'no_shop' };
  const checked = checkEnteredPrice(parsePriceText(priceText));
  if (!checked.ok || checked.value === null) return { ok: false, error: 'invalid_price' };
  const choice = choices.find((c) => c.label === unit);
  if (!choice) return { ok: false, error: 'invalid_unit' };
  const res = upsertPrice(root.prices, { shopId, item: subject.item, price: checked.value, sellUnit: choice.label, ...(subject.item.kind === 'med' ? { perSellUnit: choice.perSellUnit } : {}) }, today, newId);
  if (!res.ok) return { ok: false, error: res.errors.price ? 'invalid_price' : 'invalid_unit' };
  const next: Root = { ...root, prices: res.prices };
  if (!rootSchema.safeParse(next).success) return { ok: false, error: 'invalid_root' };
  return { ok: true, root: next, shopName: shop.name };
}

export type RemovePriceResult = { ok: true; root: Root; removed: number; shopName: string } | { ok: false; error: 'no_price' | 'no_shop' };

/** "ลบราคาร้านนี้": removes every price row of this shop for the subject (any sell unit); the prices of other medicines and shops stay. */
export function removeShopPrice(root: Root, subject: PriceSubject, shopId: string): RemovePriceResult {
  const shop = root.shops.find((s) => s.id === shopId);
  if (!shop) return { ok: false, error: 'no_shop' };
  const prices = root.prices.filter((p) => !(p.shopId === shopId && sameItem(p.item, subject.item)));
  const removed = root.prices.length - prices.length;
  if (removed === 0) return { ok: false, error: 'no_price' };
  return { ok: true, root: { ...root, prices }, removed, shopName: shop.name };
}
