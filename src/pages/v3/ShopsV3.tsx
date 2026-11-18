// The v3 shops page (route #/n/shops, M4 PR 11.3a): the list of shops, with add / edit / delete in the shared ShopForm sheet.
// View only: `persist` (given by ShopsPage) writes a changed root; a demo is given none, so it changes the page and nothing else.
// The page keeps its own copy of the root: when a save fails, the root and the form stay as they were.
import { useState } from 'react';
import { BackIcon, ChevronRightIcon, InfoIcon, PlusIcon } from '../../components/icons';
import { ShopForm, type ShopOutcome } from '../../components/v3/ShopForm';
import { Toast, useToast } from '../../components/v3/Toast';
import type { ShopInput } from '../../domain/shop';
import { defaultNewId } from '../../domain/v3/medActions';
import type { Root } from '../../domain/v3/schema';
import { addShop, deleteShop, shopLine, updateShop } from '../../domain/v3/shops';
import styles from './ShopsV3.module.css';

type OpenSheet = { kind: 'add' } | { kind: 'edit'; id: string } | null;

export interface ShopsViewProps {
  root: Root;
  demo: boolean;
  /** Saves a changed root. Demo: not given, so nothing is saved. */
  persist?: (root: Root) => { ok: true } | { ok: false; text: string };
  /** Where "back" goes. */
  onBack: () => void;
  /** Test links: open the add sheet, or the edit sheet of a shop. */
  initial?: { sheet?: 'add' | 'edit'; item?: string };
  newId?: () => string;
}

export function ShopsView({ root: first, demo, persist, onBack, initial, newId = defaultNewId }: ShopsViewProps) {
  const [root, setRoot] = useState(first);
  const [sheet, setSheet] = useState<OpenSheet>(() => {
    if (initial?.sheet === 'add') return { kind: 'add' };
    if (initial?.sheet === 'edit' && first.shops.some((s) => s.id === initial.item)) return { kind: 'edit', id: initial.item ?? '' };
    return null;
  });
  const [toast, showToast] = useToast();

  /** Writes a new root; the page takes it only if the write worked. */
  const commit = (next: Root, done: string): ShopOutcome => {
    const res = persist ? persist(next) : ({ ok: true } as const);
    if (!res.ok) return { ok: false, message: res.text };
    setRoot(next);
    setSheet(null);
    showToast(done);
    return { ok: true };
  };

  const save = (input: ShopInput): ShopOutcome => {
    const made = sheet?.kind === 'edit' ? updateShop(root, sheet.id, input) : addShop(root, input, newId);
    if (!made.ok) return made.error === 'invalid' ? { ok: false, errors: made.fields } : { ok: false, message: 'บันทึกไม่ได้ ข้อมูลเดิมยังอยู่ ลองใหม่อีกครั้ง' };
    return commit(made.root, 'บันทึกแล้ว');
  };
  const remove = (id: string): ShopOutcome => {
    const made = deleteShop(root, id);
    if (!made.ok) return { ok: false, message: 'ลบไม่ได้ ข้อมูลเดิมยังอยู่' };
    return commit(made.root, 'ลบแล้ว');
  };

  const editing = sheet?.kind === 'edit' ? root.shops.find((s) => s.id === sheet.id) : undefined;

  return (
    <div className={styles.page}>
      {demo && (
        <p className={styles.demo} role="status">
          <InfoIcon />
          โหมดตัวอย่าง ไม่บันทึกข้อมูล
        </p>
      )}
      <header className={styles.head}>
        <button type="button" className={styles.round} aria-label="กลับ" onClick={onBack}>
          <BackIcon />
        </button>
        <h1 className={styles.title}>ร้านค้า</h1>
      </header>

      <main className={styles.body}>
        {root.shops.length === 0 ? (
          <section className={styles.card} aria-label="ยังไม่มีร้านค้า">
            <p className={styles.emptyTitle}>ยังไม่มีร้านค้า</p>
            <p className={styles.emptyText}>เพิ่มร้านที่ซื้อยาประจำ เพื่อใช้เทียบราคาตอนสั่งยา</p>
            <button type="button" className={styles.addButton} onClick={() => setSheet({ kind: 'add' })}>
              <PlusIcon />
              เพิ่มร้านแรก
            </button>
          </section>
        ) : (
          <section className={styles.card} aria-label="รายการร้านค้า">
            <ul className={styles.rows}>
              {root.shops.map((s) => (
                <li key={s.id}>
                  <button type="button" className={styles.row} onClick={() => setSheet({ kind: 'edit', id: s.id })}>
                    <span className={styles.main}>
                      <span className={styles.name}>{s.name}</span>
                      <span className={styles.sub}>{shopLine(s)}</span>
                    </span>
                    <span className={styles.chevron}>
                      <ChevronRightIcon />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={styles.addButton} onClick={() => setSheet({ kind: 'add' })}>
              <PlusIcon />
              เพิ่มร้าน
            </button>
          </section>
        )}
      </main>

      {sheet?.kind === 'add' && <ShopForm onSave={save} onCancel={() => setSheet(null)} />}
      {editing && <ShopForm key={editing.id} shop={editing} onSave={save} onCancel={() => setSheet(null)} onDelete={() => remove(editing.id)} />}
      <Toast text={toast} />
    </div>
  );
}
