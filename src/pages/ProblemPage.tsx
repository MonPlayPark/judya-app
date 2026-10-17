import { useState } from 'react';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { WarningIcon } from '../components/icons';
import { useData, type ProblemKind } from '../state/DataContext';
import styles from './ProblemPage.module.css';

const TEXT: Record<ProblemKind, { title: string; body: string }> = {
  corrupt: {
    title: 'อ่านข้อมูลที่เก็บไว้ไม่ได้',
    body: 'ข้อมูลในเครื่องเสียหรืออ่านไม่ออก แอพยังไม่ได้ลบหรือแก้อะไรเลย ลองอีกครั้งก่อน ถ้ายังไม่ได้ค่อยเลือกเริ่มใหม่',
  },
  'wrong-version': {
    title: 'ข้อมูลเป็นรุ่นอื่นของแอพ',
    body: 'ข้อมูลในเครื่องถูกบันทึกโดยแอพคนละรุ่น (อาจเป็นรุ่นที่ใหม่กว่า) แอพยังไม่ได้ลบหรือแก้อะไรเลย ลองโหลดแอพใหม่ก่อน ถ้ายังไม่ได้ค่อยเลือกเริ่มใหม่',
  },
  unavailable: {
    title: 'เบราว์เซอร์ไม่ให้เก็บข้อมูล',
    body: 'แอพเก็บข้อมูลในเครื่องไม่ได้ ลองปิดโหมดส่วนตัวหรืออนุญาตให้เว็บไซต์เก็บข้อมูล แล้วกดลองอีกครั้ง',
  },
};

/** Shown instead of the app when the saved data cannot be loaded. Nothing is overwritten without a confirmed tap. */
export function ProblemPage({ problem }: { problem: ProblemKind }) {
  const { reload, startOver } = useData();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const { title, body } = TEXT[problem];

  const confirmStartOver = () => {
    const result = startOver();
    setConfirming(false);
    setFailed(!result.ok);
  };

  return (
    <main className={styles.page}>
      <div className={styles.card} role="alert">
        <div className={styles.head}>
          <WarningIcon />
          <h1 className={styles.title}>{title}</h1>
        </div>
        <p className={styles.body}>{body}</p>
        {failed && <p className={styles.fail}>เริ่มใหม่ไม่ได้ ข้อมูลเดิมยังอยู่</p>}
        <div className={styles.actions}>
          <Button onClick={reload}>ลองอีกครั้ง</Button>
          {problem !== 'unavailable' && (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              เริ่มใหม่
            </Button>
          )}
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title="เริ่มใหม่ด้วยบ้านว่าง?"
          confirmLabel="ยืนยัน เริ่มใหม่"
          onConfirm={confirmStartOver}
          onCancel={() => setConfirming(false)}
        >
          แอพจะเก็บสำเนาข้อมูลเดิมไว้ในเครื่องก่อน แล้วเริ่มใหม่ด้วยบ้านที่ยังไม่มีสมาชิกและยา
        </ConfirmDialog>
      )}
    </main>
  );
}
