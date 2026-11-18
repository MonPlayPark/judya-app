// The allergy page of one member (M4 PR 10, route #/n/members/:id/allergy). No board in the M4 canvas: built from the cards, sheets
// and buttons of the members pages. What is allowed comes from src/domain/v3/allergy.ts (safety rules S1-S3). One action = one `persist`.
// Demo: `persist` is not given, so nothing is saved and nothing is read from storage.
import { useState } from 'react';
import { BackIcon, PlusIcon, WarningIcon } from '../../components/icons';
import { Sheet } from '../../components/v3/Sheet';
import { Toast, useToast } from '../../components/v3/Toast';
import { V3Nav } from '../../components/v3/V3Nav';
import { sheetStyles } from '../../components/v3/sheetParts';
import { addAllergyItem, allergyStateText, clearNoneConfirmed, confirmNoAllergy, deleteAllergyItem, updateAllergyItem, type AllergyItem, type PersonResult } from '../../domain/v3/allergy';
import { bangkokDate } from '../../domain/v3/backup';
import type { Person } from '../../domain/v3/schema';
import { AllergyBlock } from './AllergyBlock';
import styles from './AllergyV3.module.css';
import { DemoBanner, MemberNotFound, type MembersViewProps } from './MembersV3';
import page from './MembersV3.module.css';

export const DRUG_MAX = 60;
export const REACTION_MAX = 200;

export interface AllergyViewProps extends MembersViewProps {
  id: string;
  /** Test links and the stop sheet: `?sheet=add|confirm`, `&drug=`, `&symptom=`. */
  initialSheet?: 'add' | 'confirm';
  prefill?: { drug?: string; symptom?: string };
}

type Sheet_ = { kind: 'form'; index: number | null; drug: string; reaction: string } | { kind: 'confirm' } | { kind: 'delete'; index: number } | null;

function ItemForm({ editing, drug: d0, reaction: r0, error, onSave, onClose }: { editing: boolean; drug: string; reaction: string; error: string | null; onSave: (i: AllergyItem) => void; onClose: () => void }) {
  const [drug, setDrug] = useState(d0);
  const [reaction, setReaction] = useState(r0);
  const ready = drug.trim() !== '' && reaction.trim() !== '';
  return (
    <Sheet title={editing ? 'แก้ยาที่แพ้' : 'เพิ่มยาที่แพ้'} onClose={onClose}>
      <div className={sheetStyles.body}>
        <label className={styles.field}>
          <span className={sheetStyles.label}>ชื่อยาที่แพ้ *</span>
          <input className={sheetStyles.textInput} type="text" maxLength={DRUG_MAX} autoComplete="off" value={drug} onChange={(e) => setDrug(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={sheetStyles.label}>อาการที่เกิด *</span>
          <input className={sheetStyles.textInput} type="text" maxLength={REACTION_MAX} autoComplete="off" placeholder="เช่น ผื่นคัน หายใจไม่สะดวก" value={reaction} onChange={(e) => setReaction(e.target.value)} />
        </label>
        {error !== null && (
          <p className={sheetStyles.error} role="alert">
            {error}
          </p>
        )}
        <div className={sheetStyles.actions}>
          <button type="button" className={sheetStyles.primary} disabled={!ready} onClick={() => onSave({ drug, reaction })}>
            บันทึก
          </button>
          <button type="button" className={sheetStyles.cancel} onClick={onClose}>
            ยกเลิก
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function AllergyView({ root: initialRoot, id, demo, persist, linkSuffix = '', nowIso, initialSheet, prefill }: AllergyViewProps) {
  const [root, setRoot] = useState(initialRoot);
  const [sheet, setSheet] = useState<Sheet_>(() =>
    initialSheet === 'add' ? { kind: 'form', index: null, drug: prefill?.drug ?? '', reaction: prefill?.symptom ?? '' } : initialSheet === 'confirm' ? { kind: 'confirm' } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const person: Person | undefined = root.persons.find((p) => p.id === id && p.removedAt === undefined);
  if (!person) return <MemberNotFound linkSuffix={linkSuffix} />;
  const a = person.allergies;
  const items = a.status === 'listed' ? a.items : [];
  const back = `#/n/members/${encodeURIComponent(person.id)}${linkSuffix}`;

  /** One save. On failure nothing changes on the page and the sheet (if open) shows the reason. */
  const commit = (r: PersonResult, message: string): void => {
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const res = persist ? persist(r.root) : ({ ok: true } as const);
    if (!res.ok) {
      setError(res.text);
      return;
    }
    setRoot(r.root);
    setError(null);
    setSheet(null);
    showToast(message);
  };
  const close = (): void => {
    setSheet(null);
    setError(null);
  };

  return (
    <div className={page.page}>
      {demo && <DemoBanner />}
      <header className={page.topStrip}>
        <a className={page.back} href={back} aria-label="กลับ">
          <BackIcon />
        </a>
        <h1 className={page.title}>การแพ้ยา</h1>
      </header>

      <main className={page.main}>
        <p className={styles.owner}>{`ของ ${person.name}`}</p>

        <section className={`${page.card} ${styles.stateCard}`} aria-label="สถานะการแพ้ยา">
          <AllergyBlock status={a.status} text={allergyStateText(a)} items={items} />
        </section>

        {items.length > 0 && (
          <ul className={styles.rows} aria-label="ยาที่แพ้">
            {items.map((it, i) => (
              <li key={`${i}-${it.drug}`} className={`${page.card} ${styles.row}`}>
                <span className={styles.rowText}>
                  <span className={styles.drug}>{it.drug}</span>
                  <span className={styles.reaction}>{`อาการ: ${it.reaction}`}</span>
                </span>
                <span className={styles.rowButtons}>
                  <button type="button" className={styles.small} aria-label={`แก้ ${it.drug}`} onClick={() => setSheet({ kind: 'form', index: i, drug: it.drug, reaction: it.reaction })}>
                    แก้
                  </button>
                  <button type="button" className={`${styles.small} ${styles.smallDanger}`} aria-label={`ลบ ${it.drug}`} onClick={() => setSheet({ kind: 'delete', index: i })}>
                    ลบ
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => setSheet({ kind: 'form', index: null, drug: '', reaction: '' })}>
            <PlusIcon />
            เพิ่มยาที่แพ้
          </button>
          {a.status === 'unknown' && (
            <button type="button" className={styles.outline} onClick={() => setSheet({ kind: 'confirm' })}>
              ยืนยันว่าไม่มีประวัติแพ้ยา
            </button>
          )}
          {a.status === 'none_confirmed' && (
            <button type="button" className={styles.linkLike} onClick={() => commit(clearNoneConfirmed(root, person.id), 'ยกเลิกการยืนยันแล้ว')}>
              ยกเลิกการยืนยัน
            </button>
          )}
        </div>
        {error !== null && sheet === null && (
          <p className={page.problem} role="alert">
            <WarningIcon />
            {error}
          </p>
        )}
      </main>

      <V3Nav current="members" />

      {sheet?.kind === 'form' && (
        <ItemForm
          editing={sheet.index !== null}
          drug={sheet.drug}
          reaction={sheet.reaction}
          error={error}
          onClose={close}
          onSave={(item) => {
            const idx = sheet.index;
            commit(idx === null ? addAllergyItem(root, person.id, item) : updateAllergyItem(root, person.id, idx, item), 'บันทึกแล้ว');
          }}
        />
      )}
      {sheet?.kind === 'confirm' && (
        <Sheet title="ยืนยันว่าไม่มีประวัติแพ้ยา" onClose={close}>
          <div className={sheetStyles.body}>
            <p className={sheetStyles.hint}>{`ยืนยันว่า${person.name}ไม่มีประวัติแพ้ยาที่ทราบ ข้อมูลนี้จะอยู่ในสรุปให้แพทย์`}</p>
            {error !== null && (
              <p className={sheetStyles.error} role="alert">
                {error}
              </p>
            )}
            <div className={sheetStyles.actions}>
              <button type="button" className={sheetStyles.primary} onClick={() => commit(confirmNoAllergy(root, person.id, bangkokDate(nowIso())), 'บันทึกแล้ว')}>
                ยืนยัน
              </button>
              <button type="button" className={sheetStyles.cancel} onClick={close}>
                ยกเลิก
              </button>
            </div>
          </div>
        </Sheet>
      )}
      {sheet?.kind === 'delete' && (
        <Sheet title="ลบยาที่แพ้ไหม" onClose={close}>
          <div className={sheetStyles.body}>
            <p className={sheetStyles.hint}>
              {items.length === 1 ? 'ถ้าลบรายการสุดท้าย สถานะจะกลับเป็น "ยังไม่ได้บันทึกข้อมูลการแพ้ยา" ไม่ใช่ "ไม่มีประวัติแพ้ยา"' : `ลบ ${items[sheet.index]?.drug ?? ''} ออกจากรายการ`}
            </p>
            {error !== null && (
              <p className={sheetStyles.error} role="alert">
                {error}
              </p>
            )}
            <div className={sheetStyles.actions}>
              <button type="button" className={sheetStyles.danger} onClick={() => commit(deleteAllergyItem(root, person.id, sheet.index), 'ลบแล้ว')}>
                ลบ
              </button>
              <button type="button" className={sheetStyles.cancel} onClick={close}>
                ไม่ลบ
              </button>
            </div>
          </div>
        </Sheet>
      )}
      <Toast text={toast} />
    </div>
  );
}

