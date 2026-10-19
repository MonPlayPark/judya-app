import { useState } from 'react';
import { errorText } from '../domain/errorText';
import { describeSchedule } from '../domain/scheduleForm';
import { houseRows, removedHouseItems } from '../domain/houseView';
import { listBadges, medsByMember } from '../domain/medView';
import type { Assignment, Root } from '../domain/schema';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { CheckIcon, ChevronRightIcon, InfoIcon, PillIcon, PlusIcon } from '../components/icons';
import { InfoBox } from '../components/form';
import { StatusBadge } from '../components/StatusBadge';
import { href, useRoute } from '../router';
import { useData, useRoot } from '../state/DataContext';
import { useDraft } from '../state/DraftContext';
import { useToday } from '../state/useToday';
import styles from './MedsPage.module.css';

const TABS = [
  { id: 'mine', label: 'ยาประจำตัว' },
  { id: 'house', label: 'ยาสามัญประจำบ้าน' },
] as const;

/** "ยาทั้งหมด" (board Medicines) with the two tabs `#/meds` (ยาประจำตัว) and `#/meds?tab=house` (ยาสามัญประจำบ้าน).
 * The "สั่งยา" link under both tabs opens #/order (step 3.3b-3; the Medicines board has no order link, it sits above "ไปที่ยาวันนี้"). */
export function MedsPage() {
  const root = useRoot();
  const { today } = useToday();
  const { reset } = useDraft();
  const { query } = useRoute();
  const tab = query.get('tab') === 'house' ? 'house' : 'mine';
  const members = medsByMember(root);
  const startAdding = () => reset(); // a new "add medicine" starts from an empty form

  return (
    <>
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <span className={styles.iconBadge} aria-hidden="true">
            <PillIcon />
          </span>
          <h1 className={styles.title}>ยาทั้งหมด</h1>
        </div>
        <a className={styles.addBtn} href={href('/meds/new')} onClick={startAdding}>
          <PlusIcon />
          เพิ่มยา
        </a>
      </header>

      <div className={styles.body}>
        <div role="group" aria-label="เลือกประเภทยา" className={styles.segments}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              className={`${styles.segment} ${tab === t.id ? styles.segmentOn : ''}`}
              onClick={() => {
                window.location.hash = href(t.id === 'house' ? '/meds?tab=house' : '/meds');
              }}
            >
              {tab === t.id && <CheckIcon />}
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'house' ? (
          <HouseTab />
        ) : members.length === 0 ? (
          <Card className={styles.emptyCard}>
            <p className={styles.emptyLine}>
              <InfoIcon />
              ยังไม่มียาในบ้าน
            </p>
            <p className={styles.emptyText}>เริ่มจากเพิ่มยาตัวแรก แล้วระบบจะช่วยนับสต๊อกและเตือนเมื่อยาใกล้หมด</p>
            <a className={styles.addBtn} href={href('/meds/new')} onClick={startAdding}>
              <PlusIcon />
              เพิ่มยา
            </a>
          </Card>
        ) : (
          members.map(({ person, active, stopped }) => (
            <Card key={person.id}>
              <div className={styles.memberTop}>
                <Avatar name={person.name} color={person.color} />
                <div>
                  <h2 className={styles.memberName}>{person.name}</h2>
                  <div className={styles.sub}>
                    ยา {active.length} รายการ{person.selfManaged ? ' · จัดยาเอง' : ''}
                  </div>
                </div>
              </div>
              {active.length === 0 && stopped.length === 0 && <p className={styles.empty}>ยังไม่มียา</p>}
              {active.map((a) => (
                <MedRow key={a.id} root={root} a={a} today={today} />
              ))}
              {stopped.length > 0 && (
                <>
                  <h3 className={styles.stoppedTitle}>ยาที่หยุดแล้ว</h3>
                  {stopped.map((a) => (
                    <MedRow key={a.id} root={root} a={a} today={today} />
                  ))}
                </>
              )}
            </Card>
          ))
        )}

        <a className={styles.link} href={href('/order')}>
          <span>สั่งยา</span>
          <ChevronRightIcon />
        </a>
        <a className={styles.link} href={href('/today')}>
          <span>ไปที่ยาวันนี้</span>
          <ChevronRightIcon />
        </a>
      </div>
    </>
  );
}

/** The tab "ยาสามัญประจำบ้าน": shared by everyone in the house, no times, no ticks. Tap an item to edit, cut, delete. */
function HouseTab() {
  const root = useRoot();
  const { today } = useToday();
  const rows = houseRows(root, today);
  return (
    <Card>
      <div className={styles.memberTop}>
        <span className={styles.iconBadge} aria-hidden="true">
          <PillIcon />
        </span>
        <div>
          <h2 className={styles.memberName}>ยาสามัญประจำบ้าน</h2>
          <div className={styles.sub}>ใช้ร่วมกันทุกคน · {rows.length} รายการ</div>
        </div>
      </div>
      <p className={styles.houseNote}>ไม่มีเวลากินและไม่ต้องติ๊ก แตะที่ยาเพื่อแก้ไขหรือลบ</p>
      <div className={styles.houseInfo}>
        <InfoBox>ยาที่ไม่ใส่จำนวนคงเหลือ แอปจะไม่นับสต๊อกและไม่เตือนให้ซื้อเติม แต่ยังเตือนวันหมดอายุถ้าใส่วันไว้</InfoBox>
      </div>
      {rows.length === 0 && <p className={styles.empty}>ยังไม่มียาสามัญในบ้าน</p>}
      {rows.map((r) => (
        <a key={r.id} className={styles.row} href={href(`/house/${encodeURIComponent(r.id)}`)}>
          <div className={styles.rowText}>
            <div className={styles.medName}>{r.name}</div>
            <div className={styles.sub}>{r.sub}</div>
            <div className={styles.badges}>
              {r.badges.map((kind) => (
                <StatusBadge key={kind} kind={kind} />
              ))}
            </div>
          </div>
          <span className={styles.chevron} aria-hidden="true">
            <ChevronRightIcon />
          </span>
        </a>
      ))}
      <a className={styles.addRow} href={href('/house/new')}>
        <PlusIcon />
        เพิ่มยาสามัญประจำบ้าน
      </a>
      <RemovedHouse />
    </Card>
  );
}

/** "ยาสามัญที่ลบแล้ว (N)": a fold-away bar at the end of the house tab, hidden when N = 0. Open it to see the names and "นำกลับ".
 * Bringing back puts the item in the main list at once (its numbers and prices were never erased). */
function RemovedHouse() {
  const root = useRoot();
  const { restoreHouseItem } = useData();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removed = removedHouseItems(root);
  if (removed.length === 0) return null;
  const restore = (id: string) => {
    const res = restoreHouseItem(id);
    setError(res.ok ? null : errorText(res.error));
  };
  return (
    <div className={styles.removed}>
      <button type="button" className={styles.removedBar} aria-expanded={open} aria-controls="removed-house-list" onClick={() => setOpen((o) => !o)}>
        <span>ยาสามัญที่ลบแล้ว ({removed.length})</span>
        <span className={`${styles.removedChevron} ${open ? styles.removedChevronOpen : ''}`} aria-hidden="true">
          <ChevronRightIcon />
        </span>
      </button>
      {open && (
        <div id="removed-house-list">
          {error && <InfoBox tone="error">{error}</InfoBox>}
          {removed.map((h) => (
            <div key={h.id} className={styles.removedRow}>
              <div className={styles.medName}>{h.name}</div>
              <button type="button" className={styles.restoreBtn} aria-label={`นำกลับ ${h.name}`} onClick={() => restore(h.id)}>
                นำกลับ
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One medicine row (name, how it is taken, badges) linking to its detail. Also used on the member page. */
export function MedRow({ root, a, today }: { root: Root; a: Assignment; today: string }) {
  const med = root.medications.find((m) => m.id === a.medicationId);
  if (!med) return null;
  return (
    <a className={`${styles.row} ${a.status === 'stopped' ? styles.rowStopped : ''}`} href={href(`/meds/${encodeURIComponent(a.id)}`)}>
      <div className={styles.rowText}>
        <div className={styles.medName}>{med.name}</div>
        <div className={styles.sub}>{describeSchedule(a.schedule, med.unit)}</div>
        <div className={styles.badges}>
          {listBadges(root, a, today).map((kind) => (
            <StatusBadge key={kind} kind={kind} />
          ))}
        </div>
      </div>
      <span className={styles.chevron} aria-hidden="true">
        <ChevronRightIcon />
      </span>
    </a>
  );
}
