// JudYa — calculation module (pure functions, no DOM, no storage).
// Ported to TypeScript from reference/calc.mjs of MonPlayPark/JudYa (commit 8245a01), logic unchanged.
// Dates are calendar dates 'YYYY-MM-DD' in Asia/Bangkok. Day differences use Date.UTC(y,m-1,d) of the
// calendar PARTS only (never local-time milliseconds), so DST/timezone cannot shift a day (DS-14).

export const CAP_DAYS = 3650;

export type IsoDate = string;

export const parseDate = (iso: IsoDate): { y: number; m: number; d: number } => {
  const [y = 0, m = 0, d = 0] = iso.split('-').map(Number);
  return { y, m, d };
};
export const dayNum = (iso: IsoDate): number => {
  const { y, m, d } = parseDate(iso);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
export const addDays = (iso: IsoDate, n: number): IsoDate =>
  new Date((dayNum(iso) + n) * 86400000).toISOString().slice(0, 10);
export const diffDays = (a: IsoDate, b: IsoDate): number => dayNum(b) - dayNum(a); // b - a
export const dow = (iso: IsoDate): number => new Date(dayNum(iso) * 86400000).getUTCDay(); // 0 = Sunday
export const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

export type DaySchedule =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: number[] } // 0 = Sunday
  | { kind: 'interval'; everyNDays: number; anchorDate: IsoDate } // everyNDays >= 2
  | { kind: 'monthDays'; days: number[] }; // 1..31

export function isTakeDay(schedule: DaySchedule, iso: IsoDate): boolean {
  switch (schedule.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return schedule.days.includes(dow(iso));
    case 'interval': {
      const n = schedule.everyNDays;
      const k = diffDays(schedule.anchorDate, iso);
      return n >= 2 && k >= 0 && k % n === 0;
    }
    case 'monthDays': {
      const { d } = parseDate(iso);
      return schedule.days.includes(d); // a short month simply has no such day (skipped, DS-4)
    }
    default:
      return false;
  }
}

const isIntInRange = (x: unknown, min: number, max: number): boolean =>
  typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;

const isIntList = (v: unknown, min: number, max: number): boolean =>
  Array.isArray(v) && v.length > 0 && v.every((x) => isIntInRange(x, min, max));

export const validateSchedule = (s: unknown): boolean => {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  if (o.kind === 'daily') return true;
  if (o.kind === 'weekdays') return isIntList(o.days, 0, 6);
  if (o.kind === 'interval') {
    return (
      typeof o.everyNDays === 'number' &&
      Number.isInteger(o.everyNDays) &&
      o.everyNDays >= 2 &&
      typeof o.anchorDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(o.anchorDate)
    );
  }
  if (o.kind === 'monthDays') return isIntList(o.days, 1, 31);
  return false;
};

export const DOSE_SLOTS = ['morning', 'noon', 'evening', 'bedtime'] as const;
export type DoseSlot = (typeof DOSE_SLOTS)[number];
export type Doses = Partial<Record<DoseSlot, number>>;

export const doseTotal = (doses: Doses): number =>
  DOSE_SLOTS.reduce((a, k) => a + (Number(doses[k]) || 0), 0);

export type StockWalkStatus = 'ok' | 'noStock' | 'noDose' | 'beyondCap';
export interface StockWalkResult {
  status: StockWalkStatus;
  daysRemaining: number | null;
  depletionDate: IsoDate | null;
}

/** Day-by-day stock walk (DS-7). Never use an average.
 * depletionDate = first day whose scheduled dose cannot be covered; daysRemaining = calendar days from today to it. */
export function stockWalk(args: {
  stock: number | null;
  doses: Doses;
  schedule: DaySchedule;
  today: IsoDate;
  cap?: number;
}): StockWalkResult {
  const { stock, doses, schedule, today, cap = CAP_DAYS } = args;
  const per = doseTotal(doses);
  if (stock == null || Number.isNaN(stock)) return { status: 'noStock', daysRemaining: null, depletionDate: null };
  if (!(per > 0)) return { status: 'noDose', daysRemaining: null, depletionDate: null };
  let left = stock;
  for (let i = 0; i < cap; i++) {
    const day = addDays(today, i);
    if (!isTakeDay(schedule, day)) continue;
    if (left + 1e-9 < per) return { status: 'ok', daysRemaining: i, depletionDate: day };
    left -= per;
  }
  return { status: 'beyondCap', daysRemaining: null, depletionDate: null };
}
export const reorderDate = (depletionDate: IsoDate | null, leadDays: number): IsoDate | null =>
  depletionDate ? addDays(depletionDate, -leadDays) : null;

/** DS-8: sum of scheduled doses on every day inside [today, today+targetDays). */
export function targetQuantity(args: {
  doses: Doses;
  schedule: DaySchedule;
  today: IsoDate;
  targetDays: number;
}): number {
  const { doses, schedule, today, targetDays } = args;
  const per = doseTotal(doses);
  let q = 0;
  for (let i = 0; i < targetDays; i++) if (isTakeDay(schedule, addDays(today, i))) q += per;
  return q;
}

export interface PurchasePlan {
  additional: number;
  packages: number | null;
  actual: number;
}
/** L-6. packageSize may be null/0 (unknown): then no rounding to full packs. */
export function purchasePlan(args: { target: number; stock: number; packageSize: number | null }): PurchasePlan {
  const { target, stock, packageSize } = args;
  const additional = Math.max(target - stock, 0);
  if (!packageSize) return { additional, packages: null, actual: additional };
  const packages = Math.max(0, Math.ceil(additional / packageSize - 1e-9)) || 0; // `|| 0` turns -0 into 0
  return { additional, packages, actual: packages * packageSize };
}

export interface PriceItem {
  baseUnit: string;
  packUnit: string;
  packSize: number | null;
}
export interface UnitPrice {
  price: number | null;
  unit: string;
}
/** Price unit conversion. qtyBase = base units to buy.
 * Returns THB or null when the price unit matches neither base nor pack unit (=> "เทียบไม่ได้"), never a guess. */
export function lineCost(item: PriceItem, price: UnitPrice | undefined, qtyBase: number): number | null {
  if (!price || price.price == null || !(qtyBase > 0)) return null;
  if (price.unit === item.baseUnit) return price.price * qtyBase;
  if (price.unit === item.packUnit && item.packSize) return price.price * Math.ceil(qtyBase / item.packSize - 1e-9);
  return null;
}

export interface ShopLine {
  id: string;
  item: PriceItem;
  qtyBase: number;
  prices: (UnitPrice & { pharmacyId: string })[];
}
export interface Pharmacy {
  id: string;
  name: string;
  shipping: number | null; // 0 = pickup, null = unknown
  freeOver: number | null;
}
export interface ShopRow {
  pharmacy: Pharmacy;
  sub: number;
  missing: string[];
  fee: number | null;
  total: number | null;
  ok: boolean;
}
export interface CompareResult {
  rows: ShopRow[];
  best: ShopRow | null;
  next: ShopRow | null;
  split: { total: number; pharmacies: string[] } | null;
}

/** L-7. A pharmacy is rankable only if every line is priced AND shipping is known (0 = pickup). Cheapest first.
 * Also reports an optional split-order hint when buying each line at its cheapest pharmacy
 * (shipping per used pharmacy) beats the best single shop. */
export function compareShops(lines: ShopLine[], pharmacies: Pharmacy[]): CompareResult {
  const priceOf = (ln: ShopLine, ph: Pharmacy): number | null =>
    lineCost(ln.item, ln.prices.find((x) => x.pharmacyId === ph.id), ln.qtyBase);
  const rows: ShopRow[] = pharmacies.map((ph) => {
    let sub = 0;
    const missing: string[] = [];
    for (const ln of lines) {
      const c = priceOf(ln, ph);
      if (c == null) missing.push(ln.id);
      else sub += c;
    }
    const fee = ph.shipping == null ? null : ph.freeOver != null && sub >= ph.freeOver ? 0 : ph.shipping;
    return { pharmacy: ph, sub, missing, fee, total: fee == null ? null : sub + fee, ok: lines.length > 0 && !missing.length && fee != null };
  });
  const ranked = rows.filter((r) => r.ok).sort((a, b) => (a.total ?? 0) - (b.total ?? 0));
  const first = ranked[0] ?? null;
  let split: CompareResult['split'] = null;
  if (lines.length > 1 && first) {
    let total = 0;
    let fail = false;
    const used = new Map<string, { ph: Pharmacy; sub: number }>();
    for (const ln of lines) {
      let best: { c: number; ph: Pharmacy } | null = null;
      for (const r of rows) {
        if (r.pharmacy.shipping == null) continue;
        const c = priceOf(ln, r.pharmacy);
        if (c != null && (best == null || c < best.c)) best = { c, ph: r.pharmacy };
      }
      if (!best) {
        fail = true;
        break;
      }
      total += best.c;
      used.set(best.ph.id, { ph: best.ph, sub: (used.get(best.ph.id)?.sub || 0) + best.c });
    }
    if (!fail) {
      let fee = 0;
      for (const u of used.values()) fee += u.ph.freeOver != null && u.sub >= u.ph.freeOver ? 0 : (u.ph.shipping ?? 0);
      if (used.size > 1 && total + fee < (first.total ?? 0)) {
        split = { total: total + fee, pharmacies: [...used.values()].map((u) => u.ph.id) };
      }
    }
  }
  return { rows, best: first, next: ranked[1] ?? null, split };
}

/** Common household medicines are reminded by EXPIRY, not by stock (owner, review round 7).
 * NOTE: fixed 30 days as in the reference; BRIEF section 4 replaces it with settings.expiryWarnDays in step 3.2. */
export const EXPIRY_WARN_DAYS = 30;
export type ExpiryStatus = 'unknown' | 'expired' | 'soon' | 'ok';
export const expiryStatus = (
  expiryIso: IsoDate | null | undefined,
  today: IsoDate,
): { status: ExpiryStatus; days: number | null } => {
  if (!expiryIso) return { status: 'unknown', days: null };
  const days = diffDays(today, expiryIso);
  return { status: days < 0 ? 'expired' : days <= EXPIRY_WARN_DAYS ? 'soon' : 'ok', days };
};

/** Allergy match is by GENERIC name (case-insensitive, either contains the other, >= 3 chars), so every brand is covered. */
export const allergyHits = <T extends { drug: string }>(genericName: string | null | undefined, allergies: T[]): T[] => {
  const n = (genericName || '').trim().toLowerCase();
  if (n.length < 3) return [];
  return allergies.filter((a) => {
    const d = a.drug.toLowerCase();
    return d.includes(n) || n.includes(d);
  });
};

export interface ScheduledDoses {
  schedule: DaySchedule;
  doses: Doses;
}
export type ScheduleDiff =
  | { field: 'schedule'; from: DaySchedule; to: DaySchedule }
  | { field: DoseSlot; from: number; to: number };

/** Dose-change diff (for the confirm sheet and the history entry). */
export const diffSchedule = (a: ScheduledDoses, b: ScheduledDoses): ScheduleDiff[] => {
  const out: ScheduleDiff[] = [];
  if (JSON.stringify(a.schedule) !== JSON.stringify(b.schedule)) out.push({ field: 'schedule', from: a.schedule, to: b.schedule });
  for (const k of DOSE_SLOTS) {
    if ((a.doses[k] || 0) !== (b.doses[k] || 0)) out.push({ field: k, from: a.doses[k] || 0, to: b.doses[k] || 0 });
  }
  return out;
};
