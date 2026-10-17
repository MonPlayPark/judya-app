import { useData, type SaveFailure } from '../state/DataContext';
import { Button } from './Button';
import { WarningIcon } from './icons';
import styles from './SaveErrorBar.module.css';

const DETAIL: Record<SaveFailure, string> = {
  quota: 'พื้นที่เก็บข้อมูลในเครื่องเต็ม',
  unavailable: 'เบราว์เซอร์ไม่ให้เก็บข้อมูลตอนนี้',
  'verify-failed': 'เขียนแล้วอ่านกลับมาไม่ตรง',
  invalid: 'ข้อมูลที่จะบันทึกไม่ถูกต้อง',
};

/** Shown while the last change could not be saved. The screen still shows the old data. */
export function SaveErrorBar() {
  const { saveFailure, retrySave } = useData();
  if (!saveFailure) return null;
  return (
    <div className={styles.bar} role="alert">
      <WarningIcon />
      <div className={styles.text}>
        <strong>บันทึกไม่ได้ ข้อมูลเดิมยังอยู่</strong>
        <span>{DETAIL[saveFailure]}</span>
      </div>
      <Button variant="secondary" onClick={retrySave}>
        ลองใหม่
      </Button>
    </div>
  );
}
