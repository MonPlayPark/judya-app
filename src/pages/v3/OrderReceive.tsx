// The receiving screen of the order history (M4 PR 11.5c, boards #67 / #75). A full screen inside OrderView (`?screen=receive&order=<id>`): a summary card,
// one card per line still to come (how many arrived, price per unit, what to do with the rest, stock, expiry) and a sticky bar "ยืนยันรับของ".
// View only: the rules are in src/domain/v3/orderReceive.ts. The screen runs `receiveOrder` as a dry run on the current numbers to show its notes, and hands
// ONE new root to the page, which writes it with one saveRoot (OrderBook pattern).
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircleIcon, InfoIcon, MinusIcon, PlusIcon, WarningIcon } from '../../components/icons';
import { Sheet } from '../../components/v3/Sheet';
import { sheetStyles } from '../../components/v3/sheetParts';
import type { IsoDate } from '../../domain/calc';
import { SMALL_UNIT } from '../../domain/v3/addMedicine';
import { orderDateText, orderLineName, orderTotal } from '../../domain/v3/orderHistory';
import { receiveOrder, stockGainOf, type ReceiveInput } from '../../domain/v3/orderReceive';
import { baht, parsePriceText } from '../../domain/v3/orderShops';
import { latestPrice, type PriceItem } from '../../domain/v3/prices';
import type { MedKind, Order, OrderLine, Root } from '../../domain/v3/schema';
import { iconUrl } from '../../visual';
import { COMING_SOON_TEXT } from '../../components/v3/ComingSoon';
import styles from './OrderReceive.module.css';

export type ReceiveOutcome = { ok: true } | { ok: false; text: string };
export const SAVE_FAILED_TEXT = 'บันทึกไม่สำเร็จ ลองอีกครั้ง';
export const RECEIVED_TOAST = 'บันทึกรับของแล้ว สต็อกอัปเดตแล้ว';

/** A typed medicine that arrived and was ticked "เพิ่มเข้ารายการยา": its name and the link to the add-medicine page with what is known filled in. */
export interface AddItem {
  name: string;
  href: string;
}

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const money = (n: number): number => Math.round(n * 100) / 100;
const remainingOf = (l: OrderLine): number => Math.max(round4(l.qtyOrdered - l.qtyReceived), 0);
const joined = (names: readonly string[]): string => names.join(', ');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Lines that have a card: not finished and not dropped. */
export const waitingIndexes = (o: Order): number[] => o.lines.flatMap((l, i) => (l.leftover !== 'dropped' && remainingOf(l) > 0 ? [i] : []));

/** The medicine kind a line is for (null = not known: a house item, or a typed one with no kind). */
function kindOf(root: Root, l: OrderLine): MedKind | null {
  if (l.source.kind === 'med') {
    const id = l.source.medicationId;
    return root.medications.find((m) => m.id === id)?.kind ?? null;
  }
  return l.source.kind === 'free' ? (l.source.medKind ?? null) : null;
}

/** "2 กล่อง" and, when the box size is known and the unit is not the pill itself, " (60 เม็ด)". */
function amountText(root: Root, l: OrderLine, n: number): string {
  const kind = kindOf(root, l);
  const small = kind === null ? null : SMALL_UNIT[kind];
  const bracket = small !== null && l.perSellUnit !== undefined && l.sellUnit !== small ? ` (${round4(n * l.perSellUnit)} ${small})` : '';
  return `${n} ${l.sellUnit}${bracket}`;
}

/** The remembered price to start the box with: the newest of THIS shop for the item in the line's own sell unit. A typed line has none. */
function prefillPrice(root: Root, order: Order, l: OrderLine): string {
  if (l.source.kind === 'free') return '';
  const item: PriceItem = l.source.kind === 'med' ? { kind: 'med', medicationId: l.source.medicationId } : { kind: 'house', houseItemId: l.source.houseItemId };
  const p = latestPrice(root.prices, order.shopId, item, l.sellUnit);
  return p ? String(p.price) : '';
}

/** Link to the add-medicine page for a typed line, with the name, kind and strength it was typed with (and the demo name in a demo). */
function addHref(l: OrderLine & { source: { kind: 'free' } }, demo: string | null): string {
  const q = new URLSearchParams();
  if (demo) q.set('demo', demo);
  q.set('name', l.source.name);
  if (l.source.medKind) q.set('kind', l.source.medKind);
  if (l.source.strength) {
    q.set('strength', String(l.source.strength.value));
    q.set('unit', l.source.strength.unit);
  }
  return `#/n/meds/new?${q.toString()}`;
}

const PhoneGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </svg>
);
const ReceiptGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);

export interface ReceiveScreenProps {
  root: Root;
  order: Order;
  today: IsoDate;
  nowIso: () => string;
  newId: () => string;
  /** The `demo` value of the page (a test link) so the "add medicine" link stays in the demo; null on the real page. */
  demo: string | null;
  /** The box in the page's bottom dock where the sticky bar goes (null until the page has drawn it). */
  barHost: HTMLElement | null;
  /** Writes the new root (ONE write). The page answers ok only when it is really saved. */
  onSave: (next: Root, toast: string) => ReceiveOutcome;
  /** Called after a good save with the typed medicines the owner wants to add. */
  onDone: (adds: AddItem[]) => void;
}

export function ReceiveScreen({ root, order, today, nowIso, newId, demo, barHost, onSave, onDone }: ReceiveScreenProps) {
  const rows = useMemo(() => waitingIndexes(order), [order]);
  const rest = order.status === 'partial';
  const [got, setGot] = useState<Record<number, number>>(() => Object.fromEntries(rows.map((i) => [i, remainingOf(order.lines[i]!)])));
  const [priceText, setPriceText] = useState<Record<number, string>>(() => Object.fromEntries(rows.map((i) => [i, prefillPrice(root, order, order.lines[i]!)])));
  const [dropped, setDropped] = useState<Record<number, boolean>>({});
  const [expiry, setExpiry] = useState<Record<number, string>>({});
  const [add, setAdd] = useState<Record<number, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);

  const shop = root.shops.find((s) => s.id === order.shopId);
  const delivers = shop ? shop.delivery.kind === 'deliver' : order.shippingFee !== undefined;

  // what the numbers on the screen mean
  const lineState = rows.map((i) => {
    const l = order.lines[i]!;
    const now = got[i] ?? 0;
    const rem = remainingOf(l);
    const parsed = parsePriceText(priceText[i] ?? '');
    const bad = parsed !== null && !Number.isFinite(parsed);
    const price = parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const short = now + 1e-9 < rem;
    return { i, l, now, rem, bad, price, short, drop: short && dropped[i] === true };
  });
  const inputs: ReceiveInput[] = lineState.map(({ i, l, now, bad, price, short, drop }) => {
    const x = expiry[i] ?? '';
    return {
      lineIndex: i,
      qtyReceivedNow: now,
      leftover: short ? (drop ? 'dropped' : 'waiting') : null,
      ...(!bad && price > 0 ? { unitPrice: price } : {}),
      ...(l.source.kind !== 'free' && DATE.test(x) ? { expiry: x as IsoDate } : {}),
      ...(l.source.kind === 'free' ? { addToList: add[i] ?? true } : {}),
    };
  });
  const anyBad = lineState.some((s) => s.bad);
  const sum = money(lineState.reduce((a, s) => a + s.now * s.price, 0));
  const oldTotal = orderTotal(order);
  const shownSum = rest ? money(sum + (oldTotal.kind === 'amount' ? oldTotal.amount : 0)) : sum;
  const nothing = lineState.every((s) => s.now <= 0) && !lineState.some((s) => s.drop);

  let dryCount = 0;
  const dry = receiveOrder(root, order.id, inputs, today, nowIso(), () => `dry${(dryCount += 1)}`);

  const step = (i: number, delta: 1 | -1): void => {
    setGot((cur) => ({ ...cur, [i]: round4(Math.max((cur[i] ?? 0) + delta, 0)) }));
    setMessage(null);
  };

  const save = (): void => {
    if (anyBad) {
      setMessage('ราคาต้องเป็นตัวเลข ตรวจช่องราคาที่ขึ้นสีแดงอีกครั้ง');
      return;
    }
    const made = receiveOrder(root, order.id, inputs, today, nowIso(), newId);
    if (!made.ok) {
      setMessage(made.error);
      return;
    }
    const res = onSave(made.root, RECEIVED_TOAST);
    if (!res.ok) {
      setMessage(SAVE_FAILED_TEXT);
      return;
    }
    const adds: AddItem[] = [];
    for (const a of made.askAdd) {
      const l = order.lines[a.lineIndex]!;
      if ((add[a.lineIndex] ?? true) && l.source.kind === 'free') adds.push({ name: a.name, href: addHref({ ...l, source: l.source }, demo) });
    }
    onDone(adds);
  };

  const date = orderDateText(order);
  const phone = shop?.phone;
  const bar = (
    <div className={styles.bar}>
      {message !== null && (
        <p className={styles.error} role="alert">
          <WarningIcon />
          {message}
        </p>
      )}
      <button type="button" className={styles.confirm} disabled={nothing} onClick={save}>
        ยืนยันรับของ
      </button>
    </div>
  );

  return (
    <main className={styles.screen}>
      <section className={styles.summary} aria-label="ใบสั่งที่รับของ">
        <img className={styles.summaryIcon} src={iconUrl('order')} alt="" />
        <div className={styles.summaryText}>
          <p className={styles.summaryName}>{rest ? 'รับของที่ยังค้างจากใบสั่งนี้' : `สั่งจาก${order.shopName}`}</p>
          {rest && <p className={styles.note}>{order.shopName}</p>}
          {date && <p className={styles.note}>{date}</p>}
          {phone && (
            <p className={styles.note}>
              <PhoneGlyph />
              {phone}
            </p>
          )}
        </div>
        <div className={styles.summarySide}>
          <p className={styles.note}>ยอดรวมที่จ่าย</p>
          <p className={styles.sum} data-testid="recv-sum">
            {baht(shownSum)}
          </p>
        </div>
        <p className={styles.delivery}>{delivers ? 'ส่งถึงบ้าน' : 'รับเองที่ร้าน'}</p>
      </section>

      <h2 className={styles.h2}>รายการยา ({rows.length} รายการ)</h2>

      <ul className={styles.cards}>
        {lineState.map(({ i, l, now, rem, bad, price, short, drop }) => {
          const name = orderLineName(root, l);
          const isFree = l.source.kind === 'free';
          const gain = isFree ? null : stockGainOf(root, l, now);
          return (
            <li key={i} className={styles.card}>
              <div className={styles.top}>
                <div className={styles.topText}>
                  <h3 className={styles.name}>{name}</h3>
                  <p className={styles.note}>{rest ? 'ยังค้างอยู่' : 'สั่งไว้'} {amountText(root, l, rest ? rem : l.qtyOrdered)}</p>
                </div>
                <span className={`${styles.chip} ${isFree ? styles.chipNew : styles.chipApp}`}>{isFree ? 'ยาใหม่' : 'อยู่ในรายการยา'}</span>
              </div>

              <div className={styles.entry}>
                <div className={styles.gotBox}>
                  <p className={styles.label}>ได้จริง</p>
                  <div className={styles.stepper} role="group" aria-label={`จำนวนที่ได้ ${name}`}>
                    <button type="button" className={styles.step} aria-label={`ลดจำนวนที่ได้ ${name}`} disabled={now <= 0} onClick={() => step(i, -1)}>
                      <MinusIcon />
                    </button>
                    <p className={styles.qty} aria-live="polite">
                      {now}
                    </p>
                    <button type="button" className={styles.step} aria-label={`เพิ่มจำนวนที่ได้ ${name}`} onClick={() => step(i, 1)}>
                      <PlusIcon />
                    </button>
                    <span className={styles.unit}>{l.sellUnit}</span>
                  </div>
                </div>
                <div className={styles.priceBox}>
                  <label className={styles.label} htmlFor={`recv-price-${i}`}>
                    ราคาต่อ{l.sellUnit} (บาท)
                  </label>
                  <input
                    id={`recv-price-${i}`}
                    className={`${styles.field} ${bad ? styles.fieldBad : ''}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="ใส่ราคา"
                    value={priceText[i] ?? ''}
                    aria-invalid={bad}
                    onChange={(e) => {
                      setPriceText((cur) => ({ ...cur, [i]: e.target.value }));
                      setMessage(null);
                    }}
                  />
                </div>
              </div>
              {bad && (
                <p className={styles.fieldError}>
                  <WarningIcon />
                  ใส่ราคาเป็นตัวเลข เช่น 25 หรือ 12.5
                </p>
              )}
              {price > 0 && <p className={styles.lineTotal}>รวมบรรทัดนี้ {baht(money(now * price))}</p>}

              {short && (
                <div className={styles.shortBox}>
                  <p className={styles.shortText}>
                    ได้น้อยกว่าที่สั่ง ที่เหลืออีก {round4(rem - now)} {l.sellUnit}
                  </p>
                  <div className={styles.pills} role="group" aria-label="ที่เหลือจะทำอย่างไร">
                    <button type="button" className={styles.pill} aria-pressed={!drop} onClick={() => setDropped((d) => ({ ...d, [i]: false }))}>
                      ยังรอ
                    </button>
                    <button type="button" className={styles.pill} aria-pressed={drop} onClick={() => setDropped((d) => ({ ...d, [i]: true }))}>
                      ไม่รับแล้ว
                    </button>
                  </div>
                </div>
              )}

              {gain?.counted === true && (
                <p className={styles.stock}>
                  <CheckCircleIcon />
                  สต็อกจะเพิ่ม +{gain.amount} {gain.unit}
                </p>
              )}
              {gain?.counted === false && (
                <p className={styles.noStock}>
                  <InfoIcon />
                  ไม่นับสต็อก ยานี้ไม่อัปเดตสต็อก
                </p>
              )}

              {isFree && (
                <div className={styles.newMed}>
                  <label className={styles.tickRow}>
                    <input className={styles.tick} type="checkbox" checked={add[i] ?? true} onChange={(e) => setAdd((cur) => ({ ...cur, [i]: e.target.checked }))} />
                    <span className={styles.tickText}>เพิ่มเข้ารายการยา</span>
                  </label>
                  <p className={styles.note}>แอพกรอกชื่อ ความแรง ชนิด ขนาดบรรจุ และจำนวนให้แล้ว เหลือแค่วิธีกิน</p>
                </div>
              )}

              {!isFree && (
                <div className={styles.expiry}>
                  <label className={styles.label} htmlFor={`recv-exp-${i}`}>
                    วันหมดอายุของกล่องใหม่ (ไม่บังคับ)
                  </label>
                  <input id={`recv-exp-${i}`} className={styles.field} type="date" value={expiry[i] ?? ''} onChange={(e) => setExpiry((cur) => ({ ...cur, [i]: e.target.value }))} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button type="button" aria-disabled="true" className={styles.later}>
        <ReceiptGlyph />
        อัปเดตราคาจากใบเสร็จ
        <span className={styles.soonChip}>{COMING_SOON_TEXT}</span>
      </button>

      {dry.ok && dry.startedCount.length > 0 && (
        <p className={styles.warn}>
          <WarningIcon />
          ยาที่ยังไม่เคยนับ จะเริ่มนับจากของที่รับนี้ ไม่รวมที่มีอยู่เดิม: {joined(dry.startedCount)}
        </p>
      )}
      {dry.ok && dry.skipped.length > 0 && (
        <p className={styles.warn}>
          <WarningIcon />
          ข้ามสต็อกของ {joined(dry.skipped)} เพราะหยุดยาหรือนำออกแล้ว
        </p>
      )}
      {dry.ok && dry.noTube.length > 0 && (
        <p className={styles.warn}>
          <WarningIcon />
          หลอดไม่พอทุกคน {joined(dry.noTube)} ยังไม่ได้
        </p>
      )}

      {barHost && createPortal(bar, barHost)}
    </main>
  );
}

/** After a good save, when more than one typed medicine arrived and was ticked: one "เพิ่ม" link per name goes to the add-medicine page. */
export function AddAskSheet({ items, onClose }: { items: readonly AddItem[]; onClose: () => void }) {
  return (
    <Sheet title="เพิ่มยาเข้ารายการไหม" onClose={onClose} closeButton>
      <p className={styles.askText}>ยาที่พิมพ์เอง ยังไม่อยู่ในรายการยา เพิ่มเพื่อให้แอพนับสต็อกและเตือนได้</p>
      <ul className={styles.askRows}>
        {items.map((it) => (
          <li key={it.name} className={styles.askRow}>
            <p className={styles.askName}>{it.name}</p>
            <a className={styles.addLink} aria-label={`เพิ่ม ${it.name}`} href={it.href}>
              เพิ่ม
            </a>
          </li>
        ))}
      </ul>
      <div className={sheetStyles.actions}>
        <button type="button" className={sheetStyles.cancel} onClick={onClose}>
          ไว้ทีหลัง
        </button>
      </div>
    </Sheet>
  );
}
