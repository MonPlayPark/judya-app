import { isBlank } from '../domain/actions';
import { backupAge, needsBackupWarning } from '../domain/backup';
import { orderLines } from '../domain/order';
import { careItems, memberCards, type CareItem, type MemberCard, type MemberStatus } from '../domain/care';
import { thaiDate } from '../domain/format';
import { todayDoses, todayProgress } from '../domain/today';
import { Button } from '../components/Button';
import { Card, CardTitle, Pill } from '../components/Card';
import { SubLine } from '../components/SubLine';
import {
  BagIcon,
  CalendarCheckIcon,
  CalendarWarnIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  InfoIcon,
  PeopleIcon,
  WarningIcon,
  XCircleIcon,
} from '../components/icons';
import { href } from '../router';
import { useData, useRoot } from '../state/DataContext';
import { useToday } from '../state/useToday';
import { doseView, SLOT_LABEL } from './doseView';
import styles from './HomePage.module.css';

const PREVIEW_ROWS = 3;

/** Home screen (board Main). Greeting, today's medicines, what needs care, the members.
 * Hidden for now (Q12, pages not built yet): the bell, add medicine, change threshold, member pages.
 * The "สั่งยา" button (inside the care card, as on the board) is always shown and opens #/order (step 3.3b-3); the order page has
 * its own empty state.
 * Rows of house medicines in "ยาที่ต้องดูแล" open their edit page (step 3.3a). */
export function HomePage() {
  const root = useRoot();
  const { today } = useToday();
  const { loadSample, clearSample } = useData();

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.greeting}>สวัสดีค่ะ</h1>
        <p className={styles.date}>{thaiDate(today)}</p>
      </header>
      <div className={styles.body}>
        {isBlank(root) ? (
          <Card>
            <p className={styles.line}>
              <InfoIcon />
              <strong>ยังไม่มีสมาชิกหรือยา</strong>
            </p>
            <Button onClick={loadSample}>ลองดูด้วยข้อมูลตัวอย่าง</Button>
          </Card>
        ) : (
          <>
            {root.meta.isSample && (
              <Card>
                <p className={styles.line}>
                  <InfoIcon />
                  <strong>นี่คือข้อมูลตัวอย่าง</strong>
                </p>
                <Button variant="secondary" onClick={clearSample}>
                  ลบข้อมูลตัวอย่าง
                </Button>
              </Card>
            )}
            <BackupReminder />
            <TodayCard />
            <CareCard />
            <MembersCard />
          </>
        )}
      </div>
    </>
  );
}

/** Quiet one-line reminder (no pop-up): never backed up, or the last backup is more than 14 days old.
 * Not shown for a blank house or the sample (needsBackupWarning). Links to Settings, where the backup button is. */
function BackupReminder() {
  const root = useRoot();
  const { today } = useToday();
  if (!needsBackupWarning(root, today)) return null;
  const age = backupAge(root, today);
  return (
    <p className={styles.backupNote}>
      <WarningIcon />
      <span>
        {age === null ? 'ยังไม่เคยสำรองข้อมูล' : `ไม่ได้สำรองข้อมูลมา ${age.daysAgo} วันแล้ว`} ·{' '}
        <a className={styles.backupLink} href={href('/settings')}>
          สำรองข้อมูล
        </a>
      </span>
    </p>
  );
}

function TodayCard() {
  const root = useRoot();
  const { today } = useToday();
  const doses = todayDoses(root, today);
  const { done, total, percent } = todayProgress(doses);
  const undone = doses.filter((d) => !d.done);
  const shown = undone.slice(0, PREVIEW_ROWS);
  const more = undone.length - shown.length; // only what is still to do, so it never contradicts "จัดครบแล้ว"

  return (
    <Card href={href('/today')}>
      <div className={styles.cardTop}>
        <CardTitle icon={<CalendarCheckIcon />}>ยาวันนี้</CardTitle>
        {total > 0 && (
          <Pill tone="info">
            จัดแล้ว {done} จาก {total}
          </Pill>
        )}
      </div>
      {total === 0 ? (
        <p className={styles.state}>
          <InfoIcon />
          วันนี้ไม่มียาที่ต้องจัด
        </p>
      ) : (
        <>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label="จัดยาวันนี้แล้ว"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className={styles.barFill} style={{ width: `${percent}%` }} />
          </div>
          {undone.length === 0 && (
            <p className={styles.state}>
              <CheckCircleIcon />
              จัดครบแล้ว
            </p>
          )}
          {shown.map((d) => {
            const v = doseView(root, d);
            return (
              <div key={d.key} className={styles.doseRow}>
                <span className={styles.slot}>{d.when.kind === 'slot' ? SLOT_LABEL[d.when.slot] : d.when.time}</span>
                <span className={styles.ring} aria-hidden="true" />
                <div>
                  <div className={styles.medName}>
                    {v.name}
                    {v.everyHours !== undefined && ` ทุก ${v.everyHours} ชม.`}
                  </div>
                  <div className={styles.sub}>
                    <SubLine text={`${v.who} · ${v.amount}`} status="ยังไม่จัด" />
                  </div>
                </div>
              </div>
            );
          })}
          <div className={styles.seeAll}>
            <span>{more > 0 ? `ดูทั้งหมด (อีก ${more} รายการ)` : 'ดูทั้งหมด'}</span>
            <ChevronRightIcon />
          </div>
        </>
      )}
    </Card>
  );
}

function CareRows({ items }: { items: CareItem[] }) {
  return (
    <ul className={styles.careList}>
      {items.map((i) => {
        const inner = (
          <>
            <div>
              <div className={styles.medName}>{i.name}</div>
              <div className={styles.sub}>{i.sub}</div>
            </div>
            <span className={`${styles.right} ${i.group === 'expired' ? styles.rightRed : styles.rightAmber}`}>{i.right}</span>
          </>
        );
        return (
          <li key={`${i.group}-${i.id}`} className={styles.careRow}>
            {/* A house medicine opens its edit page (step 3.3a); the rows of members' medicines are not links yet. */}
            {i.kind === 'house' ? (
              <a className={styles.careLink} href={href(`/house/${encodeURIComponent(i.id)}`)}>
                {inner}
              </a>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CareCard() {
  const root = useRoot();
  const { today } = useToday();
  const care = careItems(root, today);
  const warnDays = root.settings.expiryWarnDays;
  const orderCount = orderLines(root, today).length; // the lines the order page lists

  return (
    <Card>
      <div className={styles.cardTop}>
        <CardTitle icon={<BagIcon />}>ยาที่ต้องดูแล</CardTitle>
        {care.count > 0 && (
          <Pill tone="warning" icon={<WarningIcon />}>
            {care.count}
          </Pill>
        )}
      </div>

      {care.count === 0 && (
        <p className={styles.state}>
          <CheckCircleIcon />
          ตอนนี้ไม่มียาที่ต้องดูแล
        </p>
      )}

      {care.expired.length > 0 && (
        <>
          <div className={`${styles.banner} ${styles.bannerRed}`}>
            <XCircleIcon />
            <div>
              <div className={styles.bannerTitle}>หมดอายุแล้ว</div>
              <div>ไม่ควรใช้ · {care.expired.length} รายการ</div>
            </div>
          </div>
          <CareRows items={care.expired} />
        </>
      )}
      {care.lowStock.length > 0 && (
        <>
          {/* A plain heading: the way to the order page is the button below the list. */}
          <h3 className={styles.groupTitle}>
            ถึงรอบซื้อเติมสต๊อก · {care.lowStock.length} รายการ
          </h3>
          <CareRows items={care.lowStock} />
        </>
      )}
      <a className={styles.orderBtn} href={href('/order')}>
        {orderCount > 0 ? `สั่งยา ${orderCount} รายการ` : 'สั่งยา'}
      </a>
      {care.expirySoon.length > 0 && (
        <>
          <div className={`${styles.banner} ${styles.bannerAmber}`}>
            <CalendarWarnIcon />
            <div>
              <div className={styles.bannerTitle}>ใกล้หมดอายุ</div>
              <div>
                หมดอายุภายใน {warnDays} วัน · {care.expirySoon.length} รายการ
              </div>
            </div>
          </div>
          <CareRows items={care.expirySoon} />
        </>
      )}
      <p className={styles.note}>เตือนก่อนหมดอายุ {warnDays} วัน</p>
    </Card>
  );
}

const STATUS: Record<MemberStatus, { tone: 'warning' | 'success' | 'neutral'; text: string; icon: 'warn' | 'ok' | 'info' }> = {
  low: { tone: 'warning', text: 'ใกล้หมด', icon: 'warn' },
  ok: { tone: 'success', text: 'สต๊อกพอ', icon: 'ok' },
  selfManaged: { tone: 'neutral', text: 'จัดยาเอง · เราดูแลสต๊อก', icon: 'info' },
  noMeds: { tone: 'neutral', text: 'ยังไม่ใส่ยา', icon: 'info' },
  noStock: { tone: 'neutral', text: 'ยังไม่ใส่จำนวนยา', icon: 'info' },
};

const AVATAR: Record<MemberCard['color'], string> = {
  blue: styles.avBlue ?? '',
  green: styles.avGreen ?? '',
  yellow: styles.avYellow ?? '',
  gray: styles.avGray ?? '',
};

/** First letter of the name, skipping Thai leading vowels (เ แ โ ใ ไ) that cannot stand alone. */
const initial = (name: string): string => Array.from(name.trim()).find((c) => !'เแโใไ'.includes(c)) ?? '?';

function MembersCard() {
  const root = useRoot();
  const { today } = useToday();
  const cards = memberCards(root, today);
  if (cards.length === 0) return null;

  return (
    <Card>
      <CardTitle icon={<PeopleIcon />}>สมาชิกในบ้าน</CardTitle>
      <ul className={styles.members}>
        {cards.map((m) => {
          const s = STATUS[m.status];
          return (
            <li key={m.personId} className={styles.member}>
              <span className={`${styles.avatar} ${AVATAR[m.color]}`} aria-hidden="true">
                {initial(m.name)}
              </span>
              <div className={styles.memberText}>
                <div className={styles.medName}>{m.name}</div>
                <div className={styles.sub}>ยา {m.medCount} รายการ</div>
              </div>
              <Pill tone={s.tone} icon={s.icon === 'warn' ? <WarningIcon /> : s.icon === 'ok' ? <CheckCircleIcon /> : <InfoIcon />} className={styles.status}>
                {s.text}
              </Pill>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
