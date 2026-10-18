import { useRef, useState, type ChangeEvent } from 'react';
import { backupDate, isTooBig, summarizeBackup, summaryText, summarizeRoot } from '../domain/backup';
import { restoreErrorText, type RestoreErrorCode } from '../domain/errorText';
import { thaiDateShort } from '../domain/format';
import type { Root } from '../domain/schema';
import { useData } from '../state/DataContext';
import { Button } from './Button';
import { InfoBox } from './form';
import { OpenFileIcon } from './icons';
import styles from './RestorePanel.module.css';

type Phase =
  | { name: 'idle' }
  | { name: 'reading' }
  | { name: 'confirm'; fileName: string; root: Root }
  | { name: 'done'; text: string }
  | { name: 'error'; code: RestoreErrorCode };

/** Restore from a backup file: pick the file -> summary next to the current data -> confirm -> replaced.
 * Every refusal says the current data was not touched. `current` is null when the saved data cannot be read
 * (the problem screen). The only way data is replaced is `replaceAll` of the data layer. */
export function RestorePanel({ current }: { current: Root | null }) {
  const { replaceAll } = useData();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // choosing the same file again must work
    if (!file) return;
    if (isTooBig(file.size)) {
      setPhase({ name: 'error', code: 'too_big' });
      return;
    }
    setPhase({ name: 'reading' });
    let text: string;
    try {
      text = await file.text();
    } catch {
      setPhase({ name: 'error', code: 'not_json' });
      return;
    }
    const check = summarizeBackup(text);
    setPhase(check.ok ? { name: 'confirm', fileName: file.name, root: check.root } : { name: 'error', code: check.error });
  };

  const confirm = (root: Root) => {
    const res = replaceAll(root);
    setPhase(res.ok ? { name: 'done', text: summaryText(summarizeRoot(root)) } : { name: 'error', code: 'save_failed' });
  };

  const choose = () => input.current?.click();

  return (
    <div className={styles.panel}>
      <input
        ref={input}
        className={styles.file}
        type="file"
        accept=".json,application/json"
        onChange={(e) => void onPick(e)}
        data-testid="restore-file"
        tabIndex={-1}
      />
      {phase.name === 'confirm' ? (
        <Confirm
          fileName={phase.fileName}
          root={phase.root}
          current={current}
          onConfirm={() => confirm(phase.root)}
          onCancel={() => setPhase({ name: 'idle' })}
        />
      ) : (
        <>
          {phase.name === 'reading' && <InfoBox tone="info">กำลังอ่านไฟล์…</InfoBox>}
          {phase.name === 'done' && <InfoBox tone="ok">นำกลับข้อมูลแล้ว {phase.text}</InfoBox>}
          {phase.name === 'error' && <InfoBox tone="error">{restoreErrorText(phase.code)}</InfoBox>}
          <Button variant="secondary" onClick={choose} disabled={phase.name === 'reading'}>
            <OpenFileIcon />
            นำกลับจากไฟล์สำรอง
          </Button>
        </>
      )}
    </div>
  );
}

function Confirm({
  fileName,
  root,
  current,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  root: Root;
  current: Root | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const made = backupDate(root);
  return (
    <>
      <InfoBox tone="warn">จะแทนที่ข้อมูลปัจจุบันทั้งหมดด้วยข้อมูลในไฟล์นี้</InfoBox>
      <dl className={styles.compare}>
        <dt>ในไฟล์สำรอง ({fileName})</dt>
        <dd>
          {summaryText(summarizeRoot(root))}
          {made && ` · สำรองเมื่อ ${thaiDateShort(made)}`}
        </dd>
        <dt>ข้อมูลปัจจุบันในเครื่อง</dt>
        <dd>{current ? summaryText(summarizeRoot(current)) : 'อ่านไม่ได้'}</dd>
      </dl>
      <div className={styles.buttons}>
        <Button variant="danger" onClick={onConfirm}>
          ยืนยัน นำกลับ
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          ยกเลิก
        </Button>
      </div>
    </>
  );
}
