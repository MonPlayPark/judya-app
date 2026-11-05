// The v3 order draft screen (M4 PR 11.2): the list of medicines to order, with the "add an item" bottom sheet.
// View only: the rules are in src/domain/v3/orderDraft.ts and orderLines.ts, OrderPage owns the data and the clock. The draft lives in this
// component's state; nothing is saved (step 11.3 saves an order). Places that wait for later steps are <ComingSoon>.
import { useMemo, useRef, useState } from 'react';
import { BackIcon, CheckCircleIcon, ClockIcon, ChevronRightIcon, InfoIcon, MinusIcon, PlusIcon, WarningIcon } from '../../components/icons';
import { Toast, useToast, useToastAbove } from '../../components/v3/Toast';
import { V3Nav } from '../../components/v3/V3Nav';
import type { IsoDate } from '../../domain/calc';
import { label } from '../../domain/v3/medsList';
import { REASON_LABEL, qtyText, stepLine } from '../../domain/v3/orderDraft';
import { buildOrderLines, clearOnOrder, markOnOrder, type DraftLine, type DraftReason } from '../../domain/v3/orderLines';
import { compareShops } from '../../domain/v3/orderCompare';
import { messageItems, type Recipient } from '../../domain/v3/orderMessage';
import { baht, compareLinesOf, feeLine, modeOfShop, saveShopPrices } from '../../domain/v3/orderShops';
import { defaultNewId } from '../../domain/v3/medActions';
import { addShop } from '../../domain/v3/shops';
import { ShopForm, type ShopOutcome } from '../../components/v3/ShopForm';
import type { ShopInput } from '../../domain/shop';
import { recipientOf, withRecipient } from '../../domain/v3/recipient';
import type { MedKind, Root } from '../../domain/v3/schema';
import { useRoute } from '../../router';
import { cancelOrder, reorderLines, reorderMessage } from '../../domain/v3/orderHistory';
import { OrderBook } from './OrderBook';
import { OrderHistory, type CancelOutcome } from './OrderHistory';
import { OrderCompare, type PriceOutcome } from './OrderCompare';
import { OrderMessage, type PickedShop, type SaveOutcome } from './OrderMessage';
import { AddItemSheet, UnitSheet, type AddTab } from './OrderSheets';
import styles from './OrderV3.module.css';

export interface OrderViewProps {
  root: Root;
  today: IsoDate;
  demo: boolean;
  /** Test links only: which sheet starts open. `item` = the key of the line for the unit sheet. */
  initial?: {
    sheet?: 'add' | 'unit' | 'recipient' | 'incomplete' | 'shop' | 'prices';
    tab?: AddTab;
    name?: string;
    item?: string;
    /** Id of the shop that starts chosen (a test link). `sheet: 'prices'` opens the price sheet of this shop. */
    shop?: string;
    /** Starts with the "รวมค่าส่ง" switch off. */
    noShipping?: boolean;
    /** Demo only: starts with this made-up recipient (kept in memory). */
    recipient?: Recipient;
  };
  /** Writes a changed root (the recipient is a setting). Not given in a demo: the recipient then lives in memory only. */
  persist?: (root: Root) => { ok: true } | { ok: false; text: string };
  newId?: () => string;
  /** The clock for `createdAt` of a saved order (the page gives the real one; a demo a fixed time). */
  nowIso?: () => string;
  /** Tests: told every time a new root is taken (after a write worked, or at once in a demo). */
  onRoot?: (root: Root) => void;
}

type OpenSheet = { kind: 'add' } | { kind: 'unit'; key: string } | { kind: 'shop' } | { kind: 'book' } | null;

const CartGlyph = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h2.5l2 10h10l2-7.5H7" />
    <circle cx="9" cy="19" r="1.4" />
    <circle cx="17" cy="19" r="1.4" />
  </svg>
);
const REASON_ICON: Record<DraftReason, () => JSX.Element> = { low: WarningIcon, unknown: InfoIcon, typed: PlusIcon, manual: CheckCircleIcon, repeat: ClockIcon };

/** The hash of the order page with the same test-link options (?demo=…) and `screen` set (history) or removed (the order list). The history is the
 * same route with `?screen=history`, so the page stays mounted: the ticked lines are kept, and the phone's back button comes back from it. */
function orderHash(query: URLSearchParams, view: 'order' | 'history'): string {
  const q = new URLSearchParams(query);
  if (view === 'history') q.set('screen', 'history');
  else q.delete('screen');
  const text = q.toString();
  return `#/n/order${text ? `?${text}` : ''}`;
}

/** Kind of the medicine a line is for (decides how the quantity reads). null = not known. */
export function kindOfLine(root: Root, line: DraftLine): MedKind | null {
  switch (line.source.kind) {
    case 'med': {
      const id = line.source.medicationId;
      return root.medications.find((m) => m.id === id)?.kind ?? null;
    }
    case 'house': {
      const id = line.source.houseItemId;
      return root.houseItems.find((h) => h.id === id)?.kind ?? 'other';
    }
    case 'free':
      return line.source.medKind ?? 'other';
  }
}

/** The name on the screen: with the strength where the medicine has one. */
export function titleOfLine(root: Root, line: DraftLine): string {
  switch (line.source.kind) {
    case 'med': {
      const id = line.source.medicationId;
      const m = root.medications.find((x) => x.id === id);
      return m ? label(m) : line.name;
    }
    case 'house':
      return line.name;
    case 'free':
      return label({ name: line.name, strength: line.source.strength });
  }
}

export function OrderView({ root: first, today, demo, initial, persist, newId = defaultNewId, nowIso = () => new Date().toISOString(), onRoot }: OrderViewProps) {
  const [root, setRoot] = useState(first);
  const [lines, setLines] = useState<DraftLine[]>(() => markOnOrder(buildOrderLines(root, today), root, true));
  const [sheet, setSheet] = useState<OpenSheet>(() => {
    if (initial?.sheet === 'add') return { kind: 'add' };
    if (initial?.sheet === 'shop') return { kind: 'shop' };
    if (initial?.sheet === 'unit') {
      const first = buildOrderLines(root, today).find((l) => l.source.kind === 'med');
      return first || initial.item ? { kind: 'unit', key: initial.item ?? first?.key ?? '' } : null;
    }
    return null;
  });
  const [toast, showToast] = useToast();
  const { query } = useRoute();
  const view = query.get('screen') === 'history' ? 'history' : 'order';
  const dockRef = useRef<HTMLDivElement>(null);
  useToastAbove(dockRef); // every floating message floats above the dock: the bar and the menu on the list, the menu alone on the history
  const [includeShipping, setIncludeShipping] = useState(!initial?.noShipping);
  const [selectedId, setSelectedId] = useState<string | null>(initial?.shop ?? null);
  const [demoRecipient, setDemoRecipient] = useState<Recipient>(() => (demo ? (initial?.recipient ?? {}) : {}));
  const recipient = demo ? demoRecipient : recipientOf(root);
  const ticked = useMemo(() => lines.filter((l) => l.ticked).length, [lines]);

  /** Saves the recipient: the page takes the new root only when the write worked (a demo keeps it in memory, no storage). */
  const saveRecipient = (r: Recipient): SaveOutcome => {
    if (demo) {
      setDemoRecipient(r);
      return { ok: true };
    }
    const next = withRecipient(root, r);
    const res = persist ? persist(next) : ({ ok: false, text: 'บันทึกไม่ได้ ข้อมูลเดิมยังอยู่' } as const);
    if (!res.ok) return res;
    setRoot(next);
    return { ok: true };
  };
  const items = useMemo(() => messageItems(root, lines), [root, lines]);
  const comparison = useMemo(() => compareShops(compareLinesOf(lines), root.shops, root.prices, includeShipping), [lines, root.shops, root.prices, includeShipping]);
  const pickedRow = comparison.rows.find((r) => r.shopId === selectedId);
  const pickedShop = pickedRow ? root.shops.find((s) => s.id === pickedRow.shopId) : undefined;
  const picked: PickedShop | null =
    pickedRow && pickedShop
      ? {
          name: pickedShop.name,
          phone: pickedShop.phone,
          totalText: pickedRow.lines.length === 0 ? null : `ยอดรวม ${baht(pickedRow.total)}`,
          feeText: feeLine(pickedShop, includeShipping),
          unpricedText: pickedRow.unpricedText,
        }
      : null;

  /** Takes a new root only when the write worked (a demo keeps it in memory, no storage). */
  const commit = (next: Root): { ok: true } | { ok: false; text: string } => {
    if (!demo) {
      const res = persist ? persist(next) : ({ ok: false, text: 'บันทึกไม่ได้ ข้อมูลเดิมยังอยู่' } as const);
      if (!res.ok) return res;
    }
    setRoot(next);
    onRoot?.(next);
    return { ok: true };
  };
  const saveShop = (input: ShopInput): ShopOutcome => {
    const made = addShop(root, input, newId);
    if (!made.ok) return made.error === 'invalid' ? { ok: false, errors: made.fields } : { ok: false, message: 'บันทึกไม่ได้ ข้อมูลเดิมยังอยู่ ลองใหม่อีกครั้ง' };
    const res = commit(made.root);
    if (!res.ok) return { ok: false, message: res.text };
    setSheet(null);
    showToast('เพิ่มร้านแล้ว');
    return { ok: true };
  };
  const savePrices = (shopId: string, priceLines: Parameters<typeof saveShopPrices>[2], typed: Record<string, string>): PriceOutcome => {
    const made = saveShopPrices(root, shopId, priceLines, typed, today, newId);
    if (!made.ok) {
      if (made.error === 'nothing_typed') return { ok: false, message: 'ยังไม่ได้ใส่ราคา ใส่อย่างน้อย 1 ช่อง หรือกดยกเลิก' };
      if (made.error === 'invalid') return { ok: false, errors: made.errors };
      return { ok: false, message: 'บันทึกไม่ได้ ข้อมูลเดิมยังอยู่ ลองใหม่อีกครั้ง' };
    }
    const res = commit(made.root);
    if (!res.ok) return { ok: false, message: res.text };
    showToast('บันทึกราคาแล้ว');
    return { ok: true };
  };
  /** "สั่งแล้ว": the sheet hands over the new root (order + prices typed there); ONE write. The booked lines leave the list. */
  const confirmOrder = (next: Root): { ok: true } | { ok: false; text: string } => {
    const res = commit(next);
    if (!res.ok) return res;
    setLines((all) => all.filter((l) => !(l.ticked && l.qtyOrdered > 0))); // the lines that were booked leave the list; unticked ones stay
    setSheet(null);
    showToast('บันทึกใบสั่งแล้ว');
    return { ok: true };
  };
  const bookProps = pickedShop ? { onSent: () => setSheet({ kind: 'book' }), onBook: () => setSheet({ kind: 'book' }) } : {};
  const showMessage = (): void => document.getElementById('order-message')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });

  /** "สั่งซ้ำ": adds the lines of an old order to the list that is there (nothing is removed, a medicine already in the list stays as it is),
   * clears the chosen shop (the price is the remembered one of the shop chosen next), saves nothing, and goes back to the list. */
  const again = (orderId: string): void => {
    const o = root.orders.find((x) => x.id === orderId);
    if (!o) return;
    const made = reorderLines(root, o, today, lines.map((l) => l.key));
    setLines((all) => [...all, ...markOnOrder(made.lines, root, false)]);
    setSelectedId(null);
    showToast(reorderMessage(made));
    window.location.hash = orderHash(query, 'order');
  };
  /** "ยกเลิกใบสั่ง" (waiting only): ONE write; the medicines of the order come back as normal suggestions. */
  const cancel = (orderId: string): CancelOutcome => {
    const made = cancelOrder(root, orderId, nowIso());
    if (!made.ok) return { ok: false, text: made.error === 'invalid_root' ? 'บันทึกไม่ได้ ข้อมูลเดิมยังอยู่ ลองใหม่อีกครั้ง' : 'ยกเลิกได้เฉพาะใบที่ยังรอรับของ' };
    const res = commit(made.root);
    if (!res.ok) return res;
    setLines((all) => clearOnOrder(all, made.root, today));
    showToast('ยกเลิกใบสั่งแล้ว');
    return { ok: true };
  };

  const update = (key: string, fn: (l: DraftLine) => DraftLine): void => setLines((all) => all.map((l) => (l.key === key ? fn(l) : l)));
  const unitLine = sheet?.kind === 'unit' ? lines.find((l) => l.key === sheet.key) : undefined;

  return (
    <div className={styles.page}>
      {demo && (
        <p className={styles.demo} role="status">
          <InfoIcon />
          โหมดตัวอย่าง ไม่บันทึกข้อมูล
        </p>
      )}

      <header className={styles.head}>
        <a className={styles.round} href={view === 'history' ? orderHash(query, 'order') : '#/n'} aria-label={view === 'history' ? 'กลับหน้าสั่งซื้อยา' : 'กลับหน้าหลัก'}>
          <BackIcon />
        </a>
        <span className={styles.cart}>{view === 'history' ? <ClockIcon /> : <CartGlyph />}</span>
        <h1 className={styles.title}>{view === 'history' ? 'ประวัติการสั่งยา' : 'สั่งซื้อยา'}</h1>
        {view === 'order' && (
          <a className={`${styles.round} ${styles.historyButton}`} href={orderHash(query, 'history')} aria-label="ประวัติการสั่งซื้อ">
            <ClockIcon />
          </a>
        )}
      </header>

      {view === 'history' && (
        <main className={styles.body}>
          <OrderHistory root={root} onAgain={again} onCancel={cancel} />
        </main>
      )}

      {view === 'order' && <main className={styles.body}>
        <section className={styles.card} aria-labelledby="order-list-title">
          <h2 id="order-list-title" className={styles.cardTitle}>
            รายการที่จะสั่ง
          </h2>
          {lines.length === 0 ? (
            <div className={styles.emptyBox}>
              <p className={styles.emptyTitle}>ยังไม่มียาที่ใกล้หมด</p>
              <p className={styles.emptyText}>ถ้าต้องการสั่งยาตัวไหนเพิ่ม กด "เพิ่มรายการ" ได้เลย</p>
            </div>
          ) : (
            <ul className={styles.rows}>
              {lines.map((l) => (
                <LineRow
                  key={l.key}
                  line={l}
                  title={titleOfLine(root, l)}
                  kind={kindOfLine(root, l)}
                  onTick={(on) => update(l.key, (x) => ({ ...x, ticked: on }))}
                  onStep={(d) => update(l.key, (x) => stepLine(x, d))}
                  onUnit={() => setSheet({ kind: 'unit', key: l.key })}
                />
              ))}
            </ul>
          )}
          <button type="button" className={styles.addButton} onClick={() => setSheet({ kind: 'add' })}>
            <PlusIcon />
            เพิ่มรายการ
          </button>
        </section>

        {ticked > 0 && (
          <OrderCompare
            shops={root.shops}
            comparison={comparison}
            lines={lines}
            titleOf={(l) => titleOfLine(root, l)}
            includeShipping={includeShipping}
            onIncludeShipping={setIncludeShipping}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAddShop={() => setSheet({ kind: 'shop' })}
            onSavePrices={savePrices}
            {...(initial?.sheet === 'prices' && initial.shop ? { initialPriceShop: initial.shop } : {})}
          />
        )}

        <OrderMessage
          items={items}
          recipient={recipient}
          mode={modeOfShop(pickedShop)}
          shop={picked}
          onSaveRecipient={saveRecipient}
          showToast={showToast}
          {...bookProps}
          {...(initial?.sheet === 'recipient' || initial?.sheet === 'incomplete' ? { initial: { sheet: initial.sheet } } : {})}
        />

        {lines.length > 0 && ticked === 0 && (
          <p className={styles.hintCard} role="note">
            <InfoIcon />
            ติ๊กยาที่ต้องการสั่งก่อน แล้วแอพจะเทียบราคาร้านให้
          </p>
        )}
      </main>}

      <div className={styles.dock} ref={dockRef}>
      {view === 'order' && (
      <div className={styles.bar}>
        <p className={styles.barCount}>
          <span className={styles.barNumber}>{ticked} รายการ</span>
          <span className={styles.barTotal}>ยอดรวม –</span>
        </p>
        <button type="button" className={styles.barButton} disabled={ticked === 0} onClick={showMessage}>
          ดูข้อความสั่งยา
        </button>
      </div>
      )}
      <V3Nav current="home" />
      </div>

      {view === 'order' && sheet?.kind === 'add' && (
        <AddItemSheet
          root={root}
          today={today}
          lines={lines}
          initialTab={initial?.tab ?? 'meds'}
          {...(initial?.name ? { initialName: initial.name } : {})}
          onAdd={(line) => {
            setLines((all) => (all.some((l) => l.key === line.key) ? all : [...all, ...markOnOrder([line], root, false)]));
            showToast(`${titleOfLine(root, line)} เข้ารายการสั่งแล้ว`);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {view === 'order' && sheet?.kind === 'unit' && unitLine && (
        <UnitSheet
          root={root}
          line={unitLine}
          onSave={(next) => {
            update(next.key, () => next);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {view === 'order' && sheet?.kind === 'book' && pickedShop && (
        <OrderBook
          root={root}
          lines={lines}
          shop={pickedShop}
          includeShipping={includeShipping}
          today={today}
          nowIso={nowIso}
          newId={newId}
          titleOf={(l) => titleOfLine(root, l)}
          onConfirm={confirmOrder}
          onClose={() => setSheet(null)}
        />
      )}
      {view === 'order' && sheet?.kind === 'shop' && <ShopForm onSave={saveShop} onCancel={() => setSheet(null)} />}
      <Toast text={toast} />
    </div>
  );
}

function LineRow({
  line,
  title,
  kind,
  onTick,
  onStep,
  onUnit,
}: {
  line: DraftLine;
  title: string;
  kind: MedKind | null;
  onTick: (on: boolean) => void;
  onStep: (delta: 1 | -1) => void;
  onUnit: () => void;
}) {
  const q = qtyText(line, kind);
  const Icon = REASON_ICON[line.reason];
  // a medicine of the app can have its sell unit changed (this order only); house and typed medicines cannot
  const editable = line.source.kind === 'med';
  const text = (
    <>
      <span className={styles.name}>
        {title}
        {editable && (
          <span className={styles.edit}>
            <ChevronRightIcon />
          </span>
        )}
      </span>
      <span className={`${styles.reason} ${styles[`reason_${line.reason}`]}`}>
        <Icon />
        {REASON_LABEL[line.reason]}
      </span>
      {line.onOrder && (
        <span className={`${styles.reason} ${styles.reason_typed}`}>
          <ClockIcon />
          สั่งแล้ว รอรับ
        </span>
      )}
      {q.note && <span className={styles.note}>{q.note}</span>}
    </>
  );
  return (
    <li className={styles.row}>
      <label className={styles.tickBox}>
        <input className={styles.tick} type="checkbox" checked={line.ticked} aria-label={`เลือกสั่ง ${title}`} onChange={(e) => onTick(e.target.checked)} />
      </label>
      {editable ? (
        <button type="button" className={`${styles.main} ${styles.mainButton}`} aria-label={`แก้หน่วยสั่ง ${title}`} onClick={onUnit}>
          {text}
        </button>
      ) : (
        <div className={styles.main}>{text}</div>
      )}
      <div className={styles.stepper}>
        <button type="button" className={styles.step} aria-label={`ลดจำนวน ${title}`} disabled={line.qtyOrdered <= 1} onClick={() => onStep(-1)}>
          <MinusIcon />
        </button>
        <p className={styles.qty} aria-live="polite">
          <span className={styles.qtyNumber}>{q.big}</span>
          <span className={styles.qtyUnit}>{q.bigUnit}</span>
        </p>
        <button type="button" className={styles.step} aria-label={`เพิ่มจำนวน ${title}`} onClick={() => onStep(1)}>
          <PlusIcon />
        </button>
      </div>
    </li>
  );
}
