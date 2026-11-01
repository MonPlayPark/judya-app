// The v3 order draft screen (M4 PR 11.2): the list of medicines to order, with the "add an item" bottom sheet.
// View only: the rules are in src/domain/v3/orderDraft.ts and orderLines.ts, OrderPage owns the data and the clock. The draft lives in this
// component's state; nothing is saved (step 11.3 saves an order). Places that wait for later steps are <ComingSoon>.
import { useMemo, useState } from 'react';
import { BackIcon, CheckCircleIcon, ChevronRightIcon, InfoIcon, MinusIcon, PlusIcon, WarningIcon } from '../../components/icons';
import { ComingSoon } from '../../components/v3/ComingSoon';
import { Toast, useToast } from '../../components/v3/Toast';
import { V3Nav } from '../../components/v3/V3Nav';
import type { IsoDate } from '../../domain/calc';
import { label } from '../../domain/v3/medsList';
import { REASON_LABEL, qtyText, stepLine } from '../../domain/v3/orderDraft';
import { buildOrderLines, type DraftLine, type DraftReason } from '../../domain/v3/orderLines';
import type { MedKind, Root } from '../../domain/v3/schema';
import { AddItemSheet, UnitSheet, type AddTab } from './OrderSheets';
import styles from './OrderV3.module.css';

export interface OrderViewProps {
  root: Root;
  today: IsoDate;
  demo: boolean;
  /** Test links only: which sheet starts open. `item` = the key of the line for the unit sheet. */
  initial?: { sheet?: 'add' | 'unit'; tab?: AddTab; name?: string; item?: string };
}

type OpenSheet = { kind: 'add' } | { kind: 'unit'; key: string } | null;

const CartGlyph = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h2.5l2 10h10l2-7.5H7" />
    <circle cx="9" cy="19" r="1.4" />
    <circle cx="17" cy="19" r="1.4" />
  </svg>
);
const ClockGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

const REASON_ICON: Record<DraftReason, () => JSX.Element> = { low: WarningIcon, unknown: InfoIcon, typed: PlusIcon, manual: CheckCircleIcon };

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

export function OrderView({ root, today, demo, initial }: OrderViewProps) {
  const [lines, setLines] = useState<DraftLine[]>(() => buildOrderLines(root, today));
  const [sheet, setSheet] = useState<OpenSheet>(() => {
    if (initial?.sheet === 'add') return { kind: 'add' };
    if (initial?.sheet === 'unit') {
      const first = buildOrderLines(root, today).find((l) => l.source.kind === 'med');
      return first || initial.item ? { kind: 'unit', key: initial.item ?? first?.key ?? '' } : null;
    }
    return null;
  });
  const [toast, showToast] = useToast();
  const ticked = useMemo(() => lines.filter((l) => l.ticked).length, [lines]);

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
        <a className={styles.round} href="#/n" aria-label="กลับหน้าหลัก">
          <BackIcon />
        </a>
        <span className={styles.cart}>
          <CartGlyph />
        </span>
        <h1 className={styles.title}>สั่งซื้อยา</h1>
        <ComingSoon className={`${styles.round} ${styles.historyButton}`} aria-label="ประวัติการสั่งซื้อ">
          <ClockGlyph />
        </ComingSoon>
      </header>

      <main className={styles.body}>
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

        {lines.length > 0 && ticked === 0 && (
          <p className={styles.hintCard} role="note">
            <InfoIcon />
            ติ๊กยาที่ต้องการสั่งก่อน แล้วแอพจะเทียบราคาร้านให้
          </p>
        )}
      </main>

      <div className={styles.bar}>
        <p className={styles.barCount}>
          <span className={styles.barNumber}>{ticked} รายการ</span>
          <span className={styles.barTotal}>ยอดรวม –</span>
        </p>
        <ComingSoon className={styles.barButton}>ดูข้อความสั่งยา</ComingSoon>
      </div>
      <V3Nav current="home" />

      {sheet?.kind === 'add' && (
        <AddItemSheet
          root={root}
          today={today}
          lines={lines}
          initialTab={initial?.tab ?? 'meds'}
          {...(initial?.name ? { initialName: initial.name } : {})}
          onAdd={(line) => {
            setLines((all) => (all.some((l) => l.key === line.key) ? all : [...all, line]));
            showToast(`${titleOfLine(root, line)} เข้ารายการสั่งแล้ว`);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'unit' && unitLine && (
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
