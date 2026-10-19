import { useEffect, useState, type ReactNode } from 'react';
import { EXPIRY_DAYS_RANGE, LOW_STOCK_DAYS_RANGE, ORDER_DAYS_RANGE } from '../domain/actions';
import { backupAge, makeBackup, needsBackupWarning } from '../domain/backup';
import { settingsErrorText, type SettingsErrorCode } from '../domain/errorText';
import { thaiDateShort } from '../domain/format';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Chip, ChipGroup, InfoBox } from '../components/form';
import {
  BagIcon,
  BellIcon,
  CheckCircleIcon,
  InfoIcon,
  MinusIcon,
  PillIcon,
  PlusIcon,
  SaveFileIcon,
  StorageIcon,
  WarningIcon,
} from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { RestorePanel } from '../components/RestorePanel';
import { OrderMessageCard } from './OrderMessageCard';
import { ShopsCard } from './ShopsCard';
import { useData, useRoot } from '../state/DataContext';
import { handOffBackup } from '../state/backupFile';
import { refreshPersistStatus, usePersistStatus, type PersistStatus } from '../state/persist';
import { useToday } from '../state/useToday';
import styles from './SettingsPage.module.css';

/** Settings (board Settings). Warning thresholds and the order days apply at once (no save button), then the shops, the
 * order-message text (it has its own save button), backup / restore and where the data lives. */
export function SettingsPage() {
  const root = useRoot();
  const { setSettings } = useData();
  const { expiryWarnDays, lowStockDays, orderDays } = root.settings;

  return (
    <>
      <PageHeader title="ตั้งค่า" />
      <div className={styles.body}>
        <DaysSetting
          icon={<BellIcon />}
          title="เตือนยาใกล้หมดอายุ"
          question="เตือนล่วงหน้ากี่วันก่อนหมดอายุ"
          hint={`ยาที่ใส่วันหมดอายุไว้และหมดอายุภายใน ${expiryWarnDays} วัน จะขึ้นในหน้าแรก ปรับแล้วใช้ทันที ไม่ต้องกดบันทึก`}
          value={expiryWarnDays}
          range={EXPIRY_DAYS_RANGE}
          chips={[7, 15, 30, 60]}
          onChange={(n) => setSettings({ expiryWarnDays: n })}
        />
        <DaysSetting
          icon={<PillIcon />}
          title="เตือนยาใกล้หมด"
          question="เตือนเมื่อยาเหลือพอกินอีกกี่วัน"
          hint={`ยาประจำตัวที่เหลือพอกินไม่เกิน ${lowStockDays} วัน จะขึ้นในหน้าแรกว่าถึงรอบซื้อเติมสต๊อก ปรับแล้วใช้ทันที ไม่ต้องกดบันทึก`}
          value={lowStockDays}
          range={LOW_STOCK_DAYS_RANGE}
          chips={[3, 7, 14, 30]}
          onChange={(n) => setSettings({ lowStockDays: n })}
        />
        <DaysSetting
          icon={<BagIcon />}
          title="จำนวนวันที่สั่งยา"
          question="สั่งยาให้พอใช้กี่วัน"
          hint="ใช้คำนวณจำนวนยาที่ต้องสั่งในหน้าสั่งยา ปรับแล้วใช้ทันที ไม่ต้องกดบันทึก"
          value={orderDays}
          range={ORDER_DAYS_RANGE}
          chips={[7, 14, 30, 60, 90]}
          onChange={(n) => setSettings({ orderDays: n })}
        />
        <ShopsCard />
        <OrderMessageCard />
        <BackupCard />
        <StorageCard />
        <footer className={styles.footer}>
          <p>JudYa เวอร์ชัน {__APP_VERSION__}</p>
          <p>แอพนี้ไม่ส่งข้อมูลออกนอกเครื่องยกเว้นคุณกดแชร์เอง</p>
        </footer>
      </div>
    </>
  );
}

/** One threshold: − / + around the number, quick-pick chips, and the sentence of what it does. Shows the saved value
 * only: when a change is refused or cannot be saved the number stays and the reason is written under the chips. */
function DaysSetting({
  icon,
  title,
  question,
  hint,
  value,
  range,
  chips,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  question: string;
  hint: string;
  value: number;
  range: { min: number; max: number };
  chips: number[];
  onChange: (n: number) => { ok: true } | { ok: false; error: SettingsErrorCode };
}) {
  const [error, setError] = useState<SettingsErrorCode | null>(null);
  const set = (n: number) => {
    const res = onChange(n);
    setError(res.ok ? null : res.error);
  };
  return (
    <Card>
      <CardTitle icon={icon}>{title}</CardTitle>
      <p className={styles.question}>{question}</p>
      <div className={styles.stepRow}>
        <button type="button" className={styles.stepBtn} aria-label={`ลด 1 วัน · ${title}`} disabled={value <= range.min} onClick={() => set(value - 1)}>
          <MinusIcon />
        </button>
        <div className={styles.value} aria-live="polite">
          <span className={styles.number}>{value}</span> <span className={styles.unit}>วัน</span>
        </div>
        <button type="button" className={styles.stepBtn} aria-label={`เพิ่ม 1 วัน · ${title}`} disabled={value >= range.max} onClick={() => set(value + 1)}>
          <PlusIcon />
        </button>
      </div>
      <div className={styles.stack}>
        <ChipGroup label={`เลือกจำนวนวัน · ${title}`}>
          {chips.map((n) => (
            <Chip key={n} on={value === n} onClick={() => set(n)}>
              {n} วัน
            </Chip>
          ))}
        </ChipGroup>
        {error && <InfoBox tone="error">{settingsErrorText(error)}</InfoBox>}
        <p className={styles.hint}>{hint}</p>
      </div>
    </Card>
  );
}

type BackupResult =
  | { kind: 'shared' | 'downloaded'; fileName: string }
  | { kind: 'cancelled' }
  | { kind: 'date_not_saved' };

function BackupCard() {
  const root = useRoot();
  const { markBackedUp } = useData();
  const { today } = useToday();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BackupResult | null>(null);

  const age = backupAge(root, today);
  const warn = needsBackupWarning(root, today);

  const backUp = async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    const nowIso = new Date().toISOString();
    const file = makeBackup(root, nowIso);
    const how = await handOffBackup(file.fileName, file.text);
    if (how === 'cancelled') {
      setResult({ kind: 'cancelled' }); // closing the share sheet is not a backup: the date is not updated
    } else {
      const saved = markBackedUp(nowIso);
      setResult(saved.ok ? { kind: how, fileName: file.fileName } : { kind: 'date_not_saved' });
    }
    setBusy(false);
  };

  return (
    <Card>
      <CardTitle icon={<SaveFileIcon />}>สำรองข้อมูล</CardTitle>
      <p className={styles.last}>
        <InfoIcon />
        {age === null
          ? 'ยังไม่เคยสำรอง'
          : `สำรองล่าสุด ${thaiDateShort(age.date)}${age.daysAgo > 0 ? ` (${age.daysAgo} วันที่แล้ว)` : age.daysAgo === 0 ? ' (วันนี้)' : ''}`}
      </p>
      <div className={styles.stack}>
        {warn && (
          <InfoBox tone="warn">
            {age === null ? 'ยังไม่เคยสำรอง แต่มีข้อมูลในแอพแล้ว สำรองไว้กันข้อมูลหาย' : 'ไม่ได้สำรองเกิน 14 วันแล้ว สำรองไว้กันข้อมูลหาย'}
          </InfoBox>
        )}
        <p className={styles.hint}>ไฟล์นี้มีข้อมูลสุขภาพของครอบครัว ส่งเฉพาะที่ที่ไว้ใจ</p>
        <Button onClick={() => void backUp()} disabled={busy}>
          <SaveFileIcon />
          สำรองข้อมูล
        </Button>
        {result?.kind === 'shared' && <InfoBox tone="ok">แชร์ไฟล์ {result.fileName} แล้ว</InfoBox>}
        {result?.kind === 'downloaded' && (
          <InfoBox tone="ok">ดาวน์โหลดไฟล์ {result.fileName} แล้ว เก็บไว้ในที่ที่ปลอดภัย</InfoBox>
        )}
        {result?.kind === 'cancelled' && <InfoBox tone="info">ยกเลิกแล้ว ยังไม่ได้สำรอง</InfoBox>}
        {result?.kind === 'date_not_saved' && (
          <InfoBox tone="error">ส่งไฟล์ออกไปแล้ว แต่บันทึกวันที่สำรองในแอพไม่ได้ วันที่สำรองจึงยังเป็นของเดิม ลองสำรองอีกครั้ง</InfoBox>
        )}
        <div className={styles.divider} />
        <p className={styles.hint}>นำกลับ: เลือกไฟล์สำรองที่เคยบันทึกไว้ ข้อมูลในเครื่องตอนนี้จะถูกแทนที่ทั้งหมด</p>
        <RestorePanel current={root} />
      </div>
    </Card>
  );
}

const PERSIST: Record<PersistStatus, { word: string; icon: ReactNode; note: string }> = {
  unknown: { word: 'กำลังตรวจ…', icon: <InfoIcon />, note: 'กำลังตรวจสถานะกับเบราว์เซอร์' },
  granted: {
    word: 'ใช่',
    icon: <CheckCircleIcon />,
    note: 'เบราว์เซอร์รับปากว่าจะเก็บข้อมูลของแอพนี้ไว้ แต่ถ้าล้างข้อมูลเว็บหรือถอนการติดตั้ง ข้อมูลก็ยังหายได้ ควรสำรองไฟล์เป็นประจำ',
  },
  denied: {
    word: 'ไม่',
    icon: <WarningIcon />,
    note: 'เบราว์เซอร์ยังไม่รับปาก อาจลบข้อมูลของแอพนี้เองเมื่อเครื่องเหลือที่เก็บน้อย ให้สำรองไฟล์เป็นประจำ',
  },
  unsupported: {
    word: 'ไม่รองรับ',
    icon: <InfoIcon />,
    note: 'เบราว์เซอร์นี้ไม่บอกสถานะนี้ ไม่มีอะไรรับปากว่าข้อมูลจะอยู่ ให้สำรองไฟล์เป็นประจำ',
  },
};

function StorageCard() {
  const status = usePersistStatus();
  useEffect(() => {
    void refreshPersistStatus();
  }, []);
  const p = PERSIST[status];
  return (
    <Card>
      <CardTitle icon={<StorageIcon />}>ที่เก็บข้อมูลในเครื่อง</CardTitle>
      <p className={styles.statusLine}>
        {p.icon}
        <span>
          เบราว์เซอร์รับปากจะไม่ลบข้อมูล: <span className={styles.statusWord}>{p.word}</span>
        </span>
      </p>
      <div className={styles.stack}>
        <p className={styles.hint}>{p.note}</p>
      </div>
    </Card>
  );
}
