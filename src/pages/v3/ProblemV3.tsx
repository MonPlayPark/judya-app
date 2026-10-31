// M4 PR 7: the screen every v3 page shows when `judya.v3` cannot be read. Nothing has been changed or deleted at this point.
//  - "เริ่มใหม่": two confirm steps, then `startOver` (the unreadable text is first copied to `judya.v3.prev`).
//  - "กู้คืนจากไฟล์สำรอง": the restore flow of the data page (PR 6c) — same file check, same confirm sheet, same storage function.
// When the browser blocks storage (`recoverable` false) neither button is offered: there is nothing to start over from.
import { useState } from 'react';
import { OpenFileIcon, WarningIcon } from '../../components/icons';
import { useRecovered } from '../../components/v3/recovery';
import { Sheet } from '../../components/v3/Sheet';
import { sheetStyles } from '../../components/v3/sheetParts';
import { RESTORE_ERRORS, restoreUnreadable, startOver } from '../../domain/v3/dataPage';
import type { KeyValueStore } from '../../domain/v3/storage';
import type { Loaded } from './HomeV3Page';
import { RestoreSheet, useRestoreFlow } from './restoreFlow';
import '../../styles/v3theme.css';
import styles from './DataV3.module.css';

type Problem = Extract<Loaded, { kind: 'problem' }>;

export function ProblemV3({ loaded, store }: { loaded: Problem; store?: KeyValueStore | null }) {
  const recovered = useRecovered();
  const [step, setStep] = useState<0 | 1 | 2>(0); // 0 = closed, 1 = "start over?", 2 = "are you sure?"
  const [startError, setStartError] = useState<string | null>(null);
  const flow = useRestoreFlow({
    onRestore: (fileRoot) => restoreUnreadable(fileRoot, store),
    onBlocked: () => {},
    onRestored: recovered,
  });

  const confirmStartOver = (): void => {
    const outcome = startOver(new Date().toISOString(), store);
    setStep(0);
    if (outcome.ok) recovered();
    else setStartError(outcome.text);
  };

  return (
    <div className={`v3theme ${styles.page}`}>
      <main className={styles.body}>
        <section className={styles.card} aria-labelledby="pv-title">
          <h1 id="pv-title" className={styles.cardTitle}>
            เปิดข้อมูลไม่ได้
          </h1>
          <p className={styles.error} role="alert">
            <WarningIcon />
            <span>{loaded.text}</span>
          </p>
          {loaded.recoverable && (
            <>
              <p className={styles.text}>ถ้ามีไฟล์สำรองข้อมูล (.json) ให้กู้คืนจากไฟล์ก่อน ถ้าไม่มีค่อยเลือกเริ่มใหม่ แอปจะเก็บสำเนาข้อมูลเดิมไว้ในเครื่อง 1 ชุด</p>
              <button type="button" className={styles.big} onClick={flow.pressChoose}>
                <OpenFileIcon />
                กู้คืนจากไฟล์สำรอง
              </button>
              <input ref={flow.fileInput} className={styles.file} type="file" accept=".json,application/json" aria-label="เลือกไฟล์สำรอง" tabIndex={-1} onChange={(e) => void flow.onFile(e)} />
              <button type="button" className={styles.second} onClick={() => setStep(1)}>
                เริ่มใหม่
              </button>
              {flow.error !== null && (
                <p className={styles.error} role="alert">
                  <WarningIcon />
                  <span>{RESTORE_ERRORS[flow.error]}</span>
                </p>
              )}
              {flow.saveError !== null && (
                <p className={styles.error} role="alert">
                  <WarningIcon />
                  <span>{flow.saveError}</span>
                </p>
              )}
              {startError !== null && (
                <p className={styles.error} role="alert">
                  <WarningIcon />
                  <span>{startError}</span>
                </p>
              )}
            </>
          )}
        </section>
      </main>

      {flow.pending && <RestoreSheet pending={flow.pending} currentText={null} onConfirm={flow.confirm} onCancel={flow.cancel} />}
      {step === 1 && (
        <Sheet title="เริ่มใหม่?" subtitle="แอปจะเริ่มต้นใหม่แบบไม่มีสมาชิกและไม่มียา" onClose={() => setStep(0)}>
          <div className={sheetStyles.body}>
            <p className={sheetStyles.hint}>ข้อมูลเดิมที่อ่านไม่ได้จะถูกเก็บสำเนาไว้ในเครื่อง 1 ชุด ถ้ามีไฟล์สำรอง ควรกู้คืนจากไฟล์ก่อน</p>
            <div className={sheetStyles.actions}>
              <button type="button" className={sheetStyles.danger} onClick={() => setStep(2)}>
                ต่อไป
              </button>
              <button type="button" className={sheetStyles.cancel} onClick={() => setStep(0)}>
                ยกเลิก ไม่เปลี่ยนอะไร
              </button>
            </div>
          </div>
        </Sheet>
      )}
      {step === 2 && (
        <Sheet title="ยืนยันอีกครั้ง" subtitle="เริ่มใหม่แบบว่างเปล่า ใช่ไหม" onClose={() => setStep(0)}>
          <div className={sheetStyles.body}>
            <p className={sheetStyles.hint}>จะเก็บสำเนาข้อมูลเดิมไว้ในเครื่องก่อน แล้วค่อยล้างของเดิมออก (เก็บสำเนาได้ชุดล่าสุดชุดเดียว)</p>
            <div className={sheetStyles.actions}>
              <button type="button" className={sheetStyles.danger} onClick={confirmStartOver}>
                เริ่มใหม่ ล้างข้อมูลเดิม
              </button>
              <button type="button" className={sheetStyles.cancel} onClick={() => setStep(0)}>
                ยกเลิก ไม่เปลี่ยนอะไร
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
