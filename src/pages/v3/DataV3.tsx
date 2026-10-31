// The v3 page "ข้อมูลและสำรองข้อมูล" (M4 PR 6c): view only. Texts and rules come from src/domain/v3/dataPage.ts; the page that
// owns the data and the clock is DataPage. In a demo `onBackup` / `onRestore` are missing: the buttons are there but only
// say that a demo cannot back up or restore.
import { useState } from 'react';
import { BackIcon, CheckCircleIcon, InfoIcon, OpenFileIcon, SaveFileIcon, ShieldIcon, StorageIcon, WarningIcon } from '../../components/icons';
import { Toast, useToast } from '../../components/v3/Toast';
import { V3Nav } from '../../components/v3/V3Nav';
import type { IsoDate } from '../../domain/calc';

import {
  BACKUP_CANCELLED_TEXT,
  BACKUP_DATE_NOT_SAVED,
  DEMO_BLOCKED_TEXT,
  HANDOFF_TEXT,
  NO_UPLOAD_TEXT,
  PRIVACY_TEXT,
  RESTORED_TEXT,
  RESTORE_ERRORS,
  backupStatus,
  currentSummary,
  persistText,
  type PersistShown,
  type RestoreFailure,
  type RestoreOutcome,
} from '../../domain/v3/dataPage';
import type { Root } from '../../domain/v3/schema';
import '../../styles/v3theme.css';
import { RestoreSheet, useRestoreFlow, type PendingRestore } from './restoreFlow';
import styles from './DataV3.module.css';

/** What happened when the person pressed "สำรองข้อมูล". Only 'shared' and 'downloaded' count as a backup. */
export type BackupResult = 'shared' | 'downloaded' | 'cancelled' | 'date_not_saved';

export interface DataViewProps {
  root: Root;
  today: IsoDate;
  demo: boolean;
  persist: PersistShown;
  /** Missing in a demo. Hands the file over and (only if that worked) saves the date. */
  onBackup?: () => Promise<BackupResult>;
  /** Missing in a demo. Called only after the confirm button. */
  onRestore?: (fileRoot: Root) => RestoreOutcome;
  onBack: () => void;
  /** Test links (?error=... / ?sheet=confirm in a demo): open on an error or on the confirm sheet. */
  initial?: { error?: RestoreFailure; pending?: PendingRestore };
}

export function DataView({ root, today, demo, persist, onBackup, onRestore, onBack, initial }: DataViewProps) {
  const [toast, showToast] = useToast();
  const [busy, setBusy] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const { fileInput, error, saveError, pending, pressChoose, onFile, confirm, cancel } = useRestoreFlow({
    ...(onRestore ? { onRestore } : {}),
    onBlocked: () => showToast(DEMO_BLOCKED_TEXT),
    onRestored: () => showToast(RESTORED_TEXT),
    ...(initial ? { initial } : {}),
  });

  const status = backupStatus(root, today);
  const summary = currentSummary(root);
  const storage = persistText(persist);

  const pressBackup = async (): Promise<void> => {
    if (busy) return;
    if (!onBackup) return showToast(DEMO_BLOCKED_TEXT);
    setBusy(true);
    setBackupError(null);
    try {
      const result = await onBackup();
      if (result === 'cancelled') showToast(BACKUP_CANCELLED_TEXT); // not a success: nothing was handed over
      else if (result === 'date_not_saved') setBackupError(BACKUP_DATE_NOT_SAVED);
      else showToast(HANDOFF_TEXT[result]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`v3theme ${styles.page}`}>
      {demo && (
        <p className={styles.demo} role="status">
          <InfoIcon />
          โหมดตัวอย่าง ไม่บันทึกข้อมูล สำรองและนำกลับไม่ได้
        </p>
      )}
      <header className={styles.head}>
        <button type="button" className={styles.back} aria-label="กลับ" onClick={onBack}>
          <BackIcon />
        </button>
        <h1 className={styles.title}>ข้อมูลและสำรองข้อมูล</h1>
      </header>

      <main className={styles.body}>
        {/* ----- status ----- */}
        <section className={styles.card} aria-labelledby="dp-status">
          <h2 id="dp-status" className={styles.cardTitle}>
            สถานะการสำรอง
          </h2>
          <p className={styles.statusLine}>
            {status.kind === 'never' ? <InfoIcon /> : <CheckCircleIcon />}
            <span>{status.text}</span>
          </p>
          {status.kind === 'old' && (
            <p className={styles.warn}>
              <WarningIcon />
              <span>{status.warning}</span>
            </p>
          )}
          <p className={styles.text}>ข้อมูลตอนนี้: {summary.text}</p>
        </section>

        {/* ----- back up ----- */}
        <section className={styles.card} aria-labelledby="dp-backup">
          <h2 id="dp-backup" className={styles.cardTitle}>
            สำรองข้อมูล
          </h2>
          <p className={styles.text}>เก็บข้อมูลทั้งหมดเป็นไฟล์ไว้ในที่ที่ปลอดภัย เช่น ส่งเข้าไลน์ของตัวเองหรือ Google Drive</p>
          <button type="button" className={onBackup ? styles.big : `${styles.big} ${styles.bigOff}`} aria-disabled={onBackup ? undefined : true} onClick={() => void pressBackup()}>
            <SaveFileIcon />
            สำรองข้อมูล
          </button>
          <p className={styles.privacy}>
            <ShieldIcon />
            <span>{PRIVACY_TEXT}</span>
          </p>
          {backupError !== null && (
            <p className={styles.error} role="alert">
              <WarningIcon />
              <span>{backupError}</span>
            </p>
          )}
        </section>

        {/* ----- restore ----- */}
        <section className={styles.card} aria-labelledby="dp-restore">
          <h2 id="dp-restore" className={styles.cardTitle}>
            นำกลับจากไฟล์สำรอง
          </h2>
          <p className={styles.text}>เลือกไฟล์ .json ที่เคยสำรองไว้ ก่อนนำกลับ แอปจะแสดงสรุปให้ดูและรอให้คุณกดยืนยัน</p>
          <button type="button" className={onRestore ? styles.second : `${styles.second} ${styles.bigOff}`} aria-disabled={onRestore ? undefined : true} onClick={pressChoose}>
            <OpenFileIcon />
            นำกลับจากไฟล์สำรอง
          </button>
          <input ref={fileInput} className={styles.file} type="file" accept=".json,application/json" aria-label="เลือกไฟล์สำรอง" tabIndex={-1} onChange={(e) => void onFile(e)} />
          {error !== null && (
            <p className={styles.error} role="alert">
              <WarningIcon />
              <span>{RESTORE_ERRORS[error]}</span>
            </p>
          )}
          {saveError !== null && (
            <p className={styles.error} role="alert">
              <WarningIcon />
              <span>{saveError}</span>
            </p>
          )}
        </section>

        {/* ----- where the data lives ----- */}
        <section className={styles.card} aria-labelledby="dp-storage">
          <h2 id="dp-storage" className={styles.cardTitle}>
            ที่เก็บข้อมูลในเครื่อง
          </h2>
          <p className={styles.text}>ข้อมูลเก็บอยู่ในเครื่องนี้ (ในเบราว์เซอร์) เท่านั้น</p>
          <p className={styles.storageLine}>
            <StorageIcon />
            <span>
              เบราว์เซอร์รับปากจะไม่ลบข้อมูล: <strong>{storage.answer}</strong>
            </span>
          </p>
          <p className={styles.text}>{storage.advice}</p>
        </section>

        <p className={styles.foot}>{NO_UPLOAD_TEXT}</p>
      </main>

      <V3Nav current="settings" />

      {pending && <RestoreSheet pending={pending} currentText={summary.text} onConfirm={confirm} onCancel={cancel} />}
      <Toast text={toast} />
    </div>
  );
}
