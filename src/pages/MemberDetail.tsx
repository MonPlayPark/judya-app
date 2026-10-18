import { findMember, memberMeds, memberSummary } from '../domain/memberView';
import type { Person } from '../domain/schema';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { InfoBox, StepHeader } from '../components/form';
import { BackIcon, CalendarCheckIcon, ChevronRightIcon, EditIcon, InfoIcon, PillIcon, ShieldIcon } from '../components/icons';
import { href } from '../router';
import { useRoot } from '../state/DataContext';
import { useToday } from '../state/useToday';
import { MedRow } from './MedsPage';
import { MemberChips } from './MembersPage';
import styles from './MemberDetail.module.css';

/** The "ไม่พบสมาชิก" page: an id that does not exist, or a member who was taken out of the house. */
export function MemberNotFound() {
  return (
    <>
      <StepHeader title="สมาชิก" backTo="/members" backLabel="กลับสมาชิกในบ้าน" />
      <div className={styles.body}>
        <Card>
          <div className={styles.cardBody}>
            <InfoBox>ไม่พบสมาชิก สมาชิกคนนี้อาจถูกนำออกจากบ้านแล้ว หรือลิงก์ไม่ถูกต้อง</InfoBox>
            <Button onClick={() => (window.location.hash = href('/members'))}>กลับสมาชิกในบ้าน</Button>
          </div>
        </Card>
      </div>
    </>
  );
}

/** One member (boards MemberDad etc.). Hidden for now (Q12): the "add allergy" button, "สั่งยา" (3.3), "แชร์ให้แพทย์" and
 * "สรุปพบแพทย์" (3.4). The only quick button is "จัดยาวันนี้". */
export function MemberDetailPage({ id }: { id: string }) {
  const root = useRoot();
  const person = findMember(root, id);
  if (!person) return <MemberNotFound />;
  return <Detail key={person.id} person={person} />;
}

function Detail({ person }: { person: Person }) {
  const root = useRoot();
  const { today } = useToday();
  const summary = memberSummary(root, person, today);
  const meds = memberMeds(root, person.id);
  const active = meds?.active ?? [];
  const stopped = meds?.stopped ?? [];
  const editHref = href(`/members/${encodeURIComponent(person.id)}/edit`);

  return (
    <>
      <header className={styles.header}>
        <a className={styles.back} href={href('/members')} aria-label="กลับสมาชิกในบ้าน">
          <BackIcon />
        </a>
        <span className={styles.spacer} />
        <a className={styles.editBtn} href={editHref}>
          <EditIcon />
          แก้ไข
        </a>
      </header>

      <div className={styles.body}>
        <Card>
          <div className={styles.head}>
            <Avatar name={person.name} color={person.color} size="xl" />
            <div className={styles.headText}>
              <h1 className={styles.name}>{person.name}</h1>
              <div className={styles.sub}>{person.relation}</div>
            </div>
          </div>
          <MemberChips m={summary} />
        </Card>

        <Card>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon} aria-hidden="true">
              <ShieldIcon />
            </span>
            <h2 className={styles.cardTitle}>การแพ้ยา</h2>
          </div>
          <p className={styles.allergyLine}>
            <InfoIcon />
            ยังไม่พบการแพ้ยา
          </p>
          <p className={styles.allergyText}>ยังไม่ได้บันทึก — ถามแพทย์/เภสัชกรก่อนใช้ยาใหม่</p>
        </Card>

        {/* One quick button for now; the board has four in two columns. */}
        <div className={styles.quick}>
          <a className={styles.quickBtn} href={href(`/today?who=${encodeURIComponent(person.id)}`)}>
            <CalendarCheckIcon />
            จัดยาวันนี้
          </a>
        </div>

        <Card className={styles.listCard}>
          <div className={styles.cardHead}>
            <span className={styles.cardIcon} aria-hidden="true">
              <PillIcon />
            </span>
            <div>
              <h2 className={styles.cardTitle}>ยาของ{person.name}</h2>
              <div className={styles.sub}>ยา {active.length} รายการ</div>
            </div>
          </div>
          {active.length === 0 && <p className={styles.none}>ยังไม่มียา</p>}
          {active.map((a) => (
            <MedRow key={a.id} root={root} a={a} today={today} />
          ))}
        </Card>

        <Card>
          <h2 className={styles.cardTitle}>ยาที่หยุดแล้ว</h2>
          {stopped.length === 0 && <p className={styles.none}>ยังไม่มี</p>}
          {stopped.map((a) => (
            <MedRow key={a.id} root={root} a={a} today={today} />
          ))}
        </Card>

        <Card href={editHref}>
          <div className={styles.infoTop}>
            <h2 className={styles.cardTitle}>ข้อมูลสมาชิก</h2>
            <span className={styles.infoEdit}>
              แก้ไข
              <ChevronRightIcon />
            </span>
          </div>
          <dl className={styles.info}>
            <Row label="ความสัมพันธ์" value={person.relation} />
            <Row label="ปีเกิด" value={person.birthYearBE === undefined ? 'ยังไม่ระบุ' : `พ.ศ. ${person.birthYearBE}`} />
            <Row label="ประกันสุขภาพ" value={person.insurance.health ?? 'ยังไม่ระบุ'} />
            <Row label="ประกันอุบัติเหตุ" value={person.insurance.accident ?? 'ยังไม่ระบุ'} />
            <Row label="จัดยาทานเอง" value={person.selfManaged ? 'เปิด' : 'ปิด'} />
          </dl>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoRow}>
      <dt className={styles.infoLabel}>{label}</dt>
      <dd className={styles.infoValue}>{value}</dd>
    </div>
  );
}
