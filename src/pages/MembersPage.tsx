import { useState } from 'react';
import { errorText } from '../domain/errorText';
import { membersInHouse, removedMembers, type MemberSummary } from '../domain/memberView';
import { Avatar } from '../components/Avatar';
import { Card, Pill } from '../components/Card';
import { ClearSampleDialog } from '../components/ClearSampleDialog';
import { InfoBox } from '../components/form';
import { BackIcon, CheckCircleIcon, ChevronRightIcon, InfoIcon, PlusIcon, WarningIcon } from '../components/icons';
import { href } from '../router';
import { useData, useRoot } from '../state/DataContext';
import { useToday } from '../state/useToday';
import styles from './MembersPage.module.css';

/** "สมาชิกในบ้าน" (board Members). One card per member who is still in the house; members taken out are listed at the end
 * with a "นำกลับ" button (that section is not shown when nobody was taken out). The allergy chip is the fixed text
 * "ยังไม่พบการแพ้ยา": there is no allergy record yet (Q12), and the app never writes "ไม่แพ้ยา". */
export function MembersPage() {
  const root = useRoot();
  const { today } = useToday();
  const members = membersInHouse(root, today);
  const removed = removedMembers(root);

  return (
    <>
      <header className={styles.header}>
        <a className={styles.back} href={href('/')} aria-label="กลับหน้าแรก">
          <BackIcon />
        </a>
        <h1 className={styles.title}>สมาชิกในบ้าน</h1>
        <a className={styles.addBtn} href={href('/members/new')}>
          <PlusIcon />
          เพิ่มสมาชิก
        </a>
      </header>

      <div className={styles.body}>
        {members.length === 0 && (
          <Card className={styles.emptyCard}>
            <p className={styles.emptyLine}>
              <InfoIcon />
              ยังไม่มีสมาชิกในบ้าน
            </p>
            <p className={styles.emptyText}>เริ่มจากเพิ่มสมาชิกคนแรก แล้วค่อยเพิ่มยาของสมาชิกคนนั้น</p>
            <a className={styles.addBtn} href={href('/members/new')}>
              <PlusIcon />
              เพิ่มสมาชิกคนแรก
            </a>
          </Card>
        )}
        {members.map((m) => (
          <MemberCard key={m.person.id} m={m} />
        ))}
        {removed.length > 0 && <RemovedSection />}
      </div>
    </>
  );
}

/** The chips under a member's name: today's doses (or "จัดยาเอง"), the stock, the allergy status. Shared with the member page. */
export function MemberChips({ m }: { m: MemberSummary }) {
  return (
    <div className={styles.chips}>
      {m.person.selfManaged ? (
        <Pill tone="neutral">จัดยาเอง · เราดูแลสต๊อก</Pill>
      ) : (
        <Pill tone="info">ทานวันนี้ {m.doseCount} ครั้ง</Pill>
      )}
      <StockChip stock={m.stock} />
      <Pill tone="neutral" icon={<InfoIcon />}>
        ยังไม่พบการแพ้ยา
      </Pill>
    </div>
  );
}

function StockChip({ stock }: { stock: MemberSummary['stock'] }) {
  switch (stock.status) {
    case 'low':
      return (
        <Pill tone="warning" icon={<WarningIcon />}>
          ใกล้หมด {stock.lowCount} รายการ
        </Pill>
      );
    case 'ok':
      return (
        <Pill tone="success" icon={<CheckCircleIcon />}>
          สต๊อกพอ
        </Pill>
      );
    case 'noMeds':
      return (
        <Pill tone="neutral" icon={<InfoIcon />}>
          ยังไม่ใส่ยา
        </Pill>
      );
    case 'noStock':
      return (
        <Pill tone="neutral" icon={<InfoIcon />}>
          ยังไม่ใส่จำนวนยา
        </Pill>
      );
  }
}

function MemberCard({ m }: { m: MemberSummary }) {
  return (
    <Card href={href(`/members/${encodeURIComponent(m.person.id)}`)}>
      <div className={styles.top}>
        <Avatar name={m.person.name} color={m.person.color} size="lg" />
        <div className={styles.topText}>
          <div className={styles.name}>{m.person.name}</div>
          <div className={styles.sub}>ยา {m.medCount} รายการ</div>
        </div>
        <span className={styles.chevron} aria-hidden="true">
          <ChevronRightIcon />
        </span>
      </div>
      <MemberChips m={m} />
    </Card>
  );
}

function RemovedSection() {
  const root = useRoot();
  const { restorePerson } = useData();
  const removed = removedMembers(root);
  const [error, setError] = useState<string | null>(null);
  const [askClear, setAskClear] = useState(false);

  const restore = (id: string) => {
    const res = restorePerson(id);
    if (res.ok) setError(null);
    else if (res.error === 'sample_present') setAskClear(true);
    else setError(errorText(res.error));
  };

  return (
    <Card>
      <h2 className={styles.removedTitle}>สมาชิกที่นำออก</h2>
      <p className={styles.sub}>ยาและประวัติถูกซ่อนไว้ ไม่ถูกลบ นำกลับได้</p>
      {error && <InfoBox tone="error">{error}</InfoBox>}
      <ul className={styles.removedList}>
        {removed.map((p) => (
          <li key={p.id} className={styles.removedRow}>
            <Avatar name={p.name} color={p.color} />
            <span className={styles.removedName}>{p.name}</span>
            <button type="button" className={styles.restoreBtn} onClick={() => restore(p.id)}>
              นำกลับ<span className={styles.srOnly}> {p.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {askClear && <ClearSampleDialog onCancel={() => setAskClear(false)} />}
    </Card>
  );
}
