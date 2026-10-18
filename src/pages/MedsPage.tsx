import { describeSchedule } from '../domain/scheduleForm';
import { listBadges, medsByMember } from '../domain/medView';
import type { Assignment, Root } from '../domain/schema';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { ChevronRightIcon, InfoIcon, PillIcon, PlusIcon } from '../components/icons';
import { StatusBadge } from '../components/StatusBadge';
import { href } from '../router';
import { useRoot } from '../state/DataContext';
import { useDraft } from '../state/DraftContext';
import { useToday } from '../state/useToday';
import styles from './MedsPage.module.css';

/** "ยาทั้งหมด" (board Medicines). One card per member who is still in the house. The tab "ยาสามัญประจำบ้าน", the add-house-medicine
 * button and the price sections are hidden until step 3.3 (Q12). */
export function MedsPage() {
  const root = useRoot();
  const { today } = useToday();
  const { reset } = useDraft();
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
        {members.length === 0 ? (
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

        <a className={styles.link} href={href('/today')}>
          <span>ไปที่ยาวันนี้</span>
          <ChevronRightIcon />
        </a>
      </div>
    </>
  );
}

function MedRow({ root, a, today }: { root: Root; a: Assignment; today: string }) {
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
