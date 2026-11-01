// The "restore from a backup file" flow, shared by the data page (PR 6c) and the "can't read the data" screen (PR 7):
// choose a file -> check it -> show the confirm sheet -> only after the confirm button call `onRestore`.
// Texts and checks come from domain/v3/dataPage.ts and domain/v3/backup.ts; this file holds only the screen state.
import { useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { Sheet } from '../../components/v3/Sheet';
import { sheetStyles } from '../../components/v3/sheetParts';
import { backupDate, isTooBig, summarizeBackup, type BackupSummary } from '../../domain/v3/backup';
import { REPLACE_ALL_TEXT, type RestoreFailure, type RestoreOutcome } from '../../domain/v3/dataPage';
import { fullThaiDate } from '../../domain/v3/medDetail';
import type { Root } from '../../domain/v3/schema';
import styles from './DataV3.module.css';

export type PendingRestore = { root: Root; summary: BackupSummary };

/** Reads a chosen file as text (FileReader works in every browser we support and in the tests). */
const readText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

export interface RestoreFlowOptions {
  /** Missing in a demo: pressing choose / confirm then only calls `onBlocked`. */
  onRestore?: (fileRoot: Root) => RestoreOutcome;
  onBlocked: () => void;
  onRestored: () => void;
  initial?: { error?: RestoreFailure; pending?: PendingRestore };
}

export interface RestoreFlow {
  fileInput: RefObject<HTMLInputElement>;
  error: RestoreFailure | null;
  saveError: string | null;
  pending: PendingRestore | null;
  pressChoose: () => void;
  onFile: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  confirm: () => void;
  cancel: () => void;
}

export function useRestoreFlow({ onRestore, onBlocked, onRestored, initial }: RestoreFlowOptions): RestoreFlow {
  const [error, setError] = useState<RestoreFailure | null>(initial?.error ?? null);
  const [pending, setPending] = useState<PendingRestore | null>(initial?.pending ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const pressChoose = (): void => {
    if (!onRestore) return onBlocked();
    fileInput.current?.click();
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ''; // so the same file can be chosen again
    if (!file) return;
    setError(null);
    setSaveError(null);
    if (isTooBig(file.size)) return setError('too_big'); // refused before it is read
    let text: string;
    try {
      text = await readText(file);
    } catch {
      return setError('not_json');
    }
    const check = summarizeBackup(text);
    if (!check.ok) return setError(check.error);
    setPending({ root: check.root, summary: check.summary });
  };

  const confirm = (): void => {
    if (!pending) return;
    if (!onRestore) {
      setPending(null);
      return onBlocked();
    }
    const outcome = onRestore(pending.root);
    setPending(null);
    if (outcome.ok) {
      setError(null);
      onRestored();
    } else {
      setSaveError(outcome.text);
    }
  };

  return { fileInput, error, saveError, pending, pressChoose, onFile, confirm, cancel: () => setPending(null) };
}

/** The confirm sheet. `currentText` is the summary of the data that will be replaced; null = there is nothing readable to show. */
export function RestoreSheet({ pending, currentText, onConfirm, onCancel }: { pending: PendingRestore; currentText: string | null; onConfirm: () => void; onCancel: () => void }) {
  const fileDate = backupDate(pending.root);
  return (
    <Sheet title="นำข้อมูลกลับจากไฟล์นี้?" subtitle={REPLACE_ALL_TEXT} onClose={onCancel}>
      <div className={sheetStyles.body}>
        <div className={sheetStyles.summary}>
          <p className={styles.sheetHead}>ในไฟล์สำรอง{fileDate ? ` (สำรองเมื่อ ${fullThaiDate(fileDate)})` : ''}</p>
          <p className={styles.sheetText}>{pending.summary.text}</p>
        </div>
        {currentText !== null && (
          <div className={sheetStyles.summary}>
            <p className={styles.sheetHead}>ข้อมูลปัจจุบัน (จะถูกแทนที่)</p>
            <p className={styles.sheetText}>{currentText}</p>
          </div>
        )}
        <p className={sheetStyles.hint}>แอปจะเก็บสำเนาข้อมูลเดิมไว้ในเครื่อง 1 ชุด ส่วนค่าตั้งค่า เช่น ขนาดตัวอักษร ไม่เปลี่ยน</p>
        <div className={sheetStyles.actions}>
          <button type="button" className={sheetStyles.danger} onClick={onConfirm}>
            นำกลับ แทนที่ข้อมูลทั้งหมด
          </button>
          <button type="button" className={sheetStyles.cancel} onClick={onCancel}>
            ยกเลิก ไม่เปลี่ยนอะไร
          </button>
        </div>
      </div>
    </Sheet>
  );
}
