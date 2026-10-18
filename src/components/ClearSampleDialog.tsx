import { useData } from '../state/DataContext';
import { ConfirmDialog } from './ConfirmDialog';

/** O5: real data cannot be added to or changed on top of the sample. Ask first, never clear silently.
 * After "ลบตัวอย่าง" the house is blank and the screen behind the box carries on. */
export function ClearSampleDialog({ onCancel }: { onCancel: () => void }) {
  const { clearSample } = useData();
  return (
    <ConfirmDialog title="ต้องลบข้อมูลตัวอย่างก่อน" confirmLabel="ลบตัวอย่างแล้วเริ่ม" onConfirm={clearSample} onCancel={onCancel}>
      ตอนนี้เป็นข้อมูลตัวอย่าง ต้องลบตัวอย่างก่อนจึงจะเพิ่มข้อมูลจริงได้
    </ConfirmDialog>
  );
}
