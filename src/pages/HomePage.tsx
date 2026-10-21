import type { CSSProperties } from 'react';
import { isBlank } from '../domain/actions';
import { backupAge, needsBackupWarning } from '../domain/backup';
import { careItems, memberCards, type CareItem, type MemberCard } from '../domain/care';
import { thaiDate } from '../domain/format';
import { todayDoses, todayProgress } from '../domain/today';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CheckCircleIcon, ChevronRightIcon, InfoIcon, WarningIcon } from '../components/icons';
import subLine from '../components/SubLine.module.css';
import { href } from '../router';
import { useData, useRoot } from '../state/DataContext';
import { useDraft } from '../state/DraftContext';
import { useToday } from '../state/useToday';
import { avatarForIndex, avatarUrl, iconUrl, mascotUrl, type IconName, type MascotPose } from '../visual';
import { doseView, SLOT_LABEL } from './doseView';
import styles from './HomePage.module.css';

const PREVIEW_ROWS = 3;

/** Home screen, mockup round 9 screens 1-3 (docs/design/mockup-r9-reference.html): a flat coloured band with the mascot
 * standing on its bottom edge, then the cards. Three states: first run (nothing yet), during the day, all done.
 * Look only: every number comes from the same domain functions as before (todayDoses, careItems, memberCards, orderLines). */
export function HomePage() {
  const root = useRoot();
  const { today } = useToday();
  const { loadSample, clearSample } = useData();
  const { reset } = useDraft();

  const blank = isBlank(root);
  const doses = todayDoses(root, today);
  const { total } = todayProgress(doses);
  const undone = doses.filter((d) => !d.done);
  const allDone = !blank && total > 0 && undone.length === 0;

  return (
    <>
      {blank ? (
        <Hero title="ยินดีต้อนรับค่ะ" sub="มาเริ่มจัดยาให้คนที่คุณดูแลกัน" />
      ) : allDone ? (
        <Hero done title="เก่งมากค่ะ" sub={`${thaiDate(today)} · จัดยาครบทุกรายการแล้ว`} />
      ) : (
        <Hero
          title="สวัสดีค่ะ"
          sub={total > 0 ? `วันนี้ยังเหลือยา ${undone.length} รายการ` : undefined}
          date={thaiDate(today)}
        />
      )}
      <div className={styles.body}>
        {blank ? (
          <>
            <section className={`${styles.card} ${styles.empty}`}>
              <img className={styles.mascotPill} src={mascotUrl('pill')} alt="น้องเภสัชถือแคปซูลยา" />
              <h2 className={styles.heading}>เริ่มที่ยาตัวแรก</h2>
              <ol className={styles.steps}>
                <li>
                  <span className={styles.stepNo}>1</span>พิมพ์ชื่อยา
                </li>
                <li>
                  <span className={styles.stepNo}>2</span>เลือกว่ายาของใคร
                </li>
                <li>
                  <span className={styles.stepNo}>3</span>ตั้งวิธีกินและบันทึก
                </li>
              </ol>
              <a className={styles.btn} href={href('/meds/new')} onClick={() => reset()}>
                <Pic icon="add-medicine" />
                เพิ่มยาตัวแรก
              </a>
              <p className={styles.note}>ยังไม่ต้องเพิ่มสมาชิกก่อน แอปจะถามตอนเลือกว่ายาของใคร</p>
            </section>
            <section className={styles.card}>
              <h2 className={styles.heading}>
                <Pic icon="household-medicine" size="40" />
                ยาสามัญประจำบ้าน
              </h2>
              <p className={`${styles.note} ${styles.noteTop}`}>
                บันทึกยาที่ใช้ร่วมกันทุกคน เช่น พาราเซตามอล แอปจะเตือนวันหมดอายุให้
              </p>
            </section>
            <Button variant="secondary" onClick={loadSample}>
              ลองดูด้วยข้อมูลตัวอย่าง
            </Button>
          </>
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
            <CareCard allDone={allDone} />
            <MembersCard allDone={allDone} />
            <a className={styles.btn} href={href('/meds/new')} onClick={() => reset()}>
              <Pic icon="add-medicine" />
              เพิ่มยา
            </a>
          </>
        )}
      </div>
    </>
  );
}

/** One image from visual.ts as a round icon. Decorative: the words next to it carry the meaning. */
function Pic({ icon, size = '32' }: { icon: IconName; size?: '32' | '40' }) {
  return <img className={size === '40' ? styles.icon40 : styles.icon32} src={iconUrl(icon)} alt="" />;
}

/** Flat colour band (blue; green when all done). The mascot stands on the bottom edge, outside any member card. */
function Hero({ title, sub, date, done }: { title: string; sub?: string | undefined; date?: string; done?: boolean }) {
  const pose: MascotPose = 'wave';
  return (
    <header className={`${styles.hero} ${done ? styles.heroDone : ''}`}>
      <div className={styles.heroText}>
        <h1 className={styles.heroTitle}>{title}</h1>
        {sub && <p className={styles.heroSub}>{sub}</p>}
        {date && <span className={styles.datePill}>{date}</span>}
      </div>
      <img className={styles.mascotHero} src={mascotUrl(pose)} alt="น้องเภสัชโบกมือ" />
    </header>
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

// Ring geometry = tokens --ring-radius / --ring-dasharray (an SVG attribute cannot read a CSS variable).
const RING_R = 52;
const RING_LEN = 326.73;

function ProgressRing({ done, total, percent }: { done: number; total: number; percent: number }) {
  const frac = total === 0 ? 0 : done / total;
  return (
    <div className={styles.ring} role="progressbar" aria-label="จัดยาวันนี้แล้ว" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={RING_R} fill="none" stroke="var(--color-primary-tint)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={RING_R}
          fill="none"
          stroke="var(--color-success)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={RING_LEN}
          strokeDashoffset={RING_LEN * (1 - frac)}
        />
      </svg>
      <div className={styles.ringNum}>
        <b>{done}</b>
        <span>จาก {total}</span>
      </div>
    </div>
  );
}

function TodayCard() {
  const root = useRoot();
  const { today } = useToday();
  const doses = todayDoses(root, today);
  const { done, total, percent } = todayProgress(doses);
  const undone = doses.filter((d) => !d.done);
  const shown = undone.slice(0, PREVIEW_ROWS);
  const more = undone.length - shown.length; // only what is still to do, so it never contradicts "ยาวันนี้ครบแล้ว"

  if (total > 0 && undone.length === 0) {
    return (
      <a className={`${styles.card} ${styles.empty}`} href={href('/today')}>
        <img className={styles.mascotOk} src={mascotUrl('ok')} alt="น้องเภสัชทำสัญลักษณ์โอเค" />
        <h2 className={`${styles.heading} ${styles.headingOk}`}>ยาวันนี้ครบแล้ว</h2>
        <span className={`${styles.chip} ${styles.chipOk}`}>
          <CheckCircleIcon />
          จัดครบ {total} จาก {total}
        </span>
      </a>
    );
  }

  return (
    <a className={styles.card} href={href('/today')}>
      {total === 0 ? (
        <>
          <h2 className={styles.heading}>
            <Pic icon="today-meds" size="40" />
            ยาวันนี้
          </h2>
          <p className={styles.state}>
            <InfoIcon />
            วันนี้ไม่มียาที่ต้องจัด
          </p>
        </>
      ) : (
        <>
          <div className={styles.todayTop}>
            <ProgressRing done={done} total={total} percent={percent} />
            <div className={styles.todayText}>
              <h2 className={styles.heading}>
                <Pic icon="today-meds" size="40" />
                ยาวันนี้
              </h2>
              <span className={styles.sub}>จัดแล้ว {done} จาก {total}</span>
            </div>
          </div>
          <div className={styles.doses}>
            {shown.map((d) => {
              const v = doseView(root, d);
              return (
                <div key={d.key} className={styles.doseRow}>
                  <span className={styles.dot} aria-hidden="true" />
                  <div>
                    <div className={styles.medName}>
                      {v.name}
                      {v.everyHours !== undefined && ` ทุก ${v.everyHours} ชม.`}
                    </div>
                    <div className={styles.sub}>
                      {v.who} · {v.amount} · <span>{d.when.kind === 'slot' ? SLOT_LABEL[d.when.slot] : d.when.time}</span>{' '}
                      <span className={subLine.status}>· ยังไม่จัด</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.seeAll}>
            <span>{more > 0 ? `ดูทั้งหมด (อีก ${more} รายการ)` : 'ดูทั้งหมด'}</span>
            <ChevronRightIcon />
          </div>
        </>
      )}
    </a>
  );
}

/** How one care row reads in round 9: a line "owner · ยาจะหมดใน" and a day number in coloured text (no chip, no red for
 * "running low"). The number is read back from the text the domain already built (`CareItem.right`), never recomputed. */
interface CareView {
  sub: string;
  value?: string;
  unit?: string;
  text?: string;
  danger: boolean;
  rank: number; // expired first, then fewest days
}

const owner = (i: CareItem): string => (i.sub.indexOf(' · ') < 0 ? i.sub : i.sub.slice(0, i.sub.indexOf(' · ')));

function careView(i: CareItem): CareView {
  const who = owner(i);
  if (i.group === 'expired') return { sub: `${who} · หมดอายุแล้ว`, text: 'เลิกใช้', danger: true, rank: -1 };
  const m = /^(เหลือ|อีก) (\d+) (\S+)$/.exec(i.right);
  if (!m) {
    const rest = i.group === 'expirySoon' ? 'หมดอายุ' : 'ยา';
    return { sub: `${who} · ${rest}`, text: i.right, danger: false, rank: 0 };
  }
  const [, , n, unit] = m as unknown as [string, string, string, string];
  const lead = i.group === 'expirySoon' ? 'หมดอายุใน' : unit === 'วัน' ? 'ยาจะหมดใน' : 'เหลือ';
  return { sub: `${who} · ${lead}`, value: n, unit, danger: false, rank: unit === 'วัน' ? Number(n) : 0 };
}

function CareCard({ allDone }: { allDone: boolean }) {
  const root = useRoot();
  const { today } = useToday();
  const care = careItems(root, today);
  const rows = [...care.expired, ...care.lowStock, ...care.expirySoon]
    .map((item) => ({ item, view: careView(item) }))
    .sort((a, b) => a.view.rank - b.view.rank); // stable: same rank keeps the domain order

  return (
    <section className={styles.card}>
      <div className={styles.cardTop}>
        <h2 className={styles.heading}>
          {!allDone && <Pic icon="expiry-alert" />}
          {allDone && care.count > 0 ? 'ยังต้องดูแล' : 'ยาที่ต้องดูแล'}
        </h2>
        {care.count > 0 && (
          <a className={styles.link} href={href('/meds')}>
            ดูทั้งหมด {care.count}
          </a>
        )}
      </div>

      {care.count === 0 && (
        <p className={styles.state}>
          <CheckCircleIcon />
          ตอนนี้ไม่มียาที่ต้องดูแล
        </p>
      )}

      <ul className={styles.list}>
        {rows.map(({ item, view }) => (
          <li key={`${item.group}-${item.id}`}>
            <a className={styles.row} href={href(item.kind === 'house' ? `/house/${encodeURIComponent(item.id)}` : `/meds/${encodeURIComponent(item.id)}`)}>
              <div className={styles.rowText}>
                <div className={styles.medName}>{item.name}</div>
                <div className={styles.sub}>{view.sub}</div>
              </div>
              <div className={`${styles.days} ${view.danger ? styles.daysErr : styles.daysWarn}`}>
                {view.text !== undefined ? (
                  <span className={styles.daysText}>{view.text}</span>
                ) : (
                  <>
                    <b>{view.value}</b>
                    <span>{view.unit}</span>
                  </>
                )}
              </div>
              <span className={styles.chev}>
                <ChevronRightIcon />
              </span>
            </a>
          </li>
        ))}
      </ul>
      <a className={styles.btnTonal} href={href('/order')}>
        <Pic icon="order" />
        {allDone ? 'ไปสั่งยา' : 'สั่งยา'}
      </a>
    </section>
  );
}

const RING: Record<MemberCard['color'], string> = {
  blue: 'var(--color-member-blue)',
  green: 'var(--color-member-green)',
  yellow: 'var(--color-member-yellow)',
  gray: 'var(--color-border-strong)', // O6 answered by the owner: no new token, reuse the existing grey
};

function MembersCard({ allDone }: { allDone: boolean }) {
  const root = useRoot();
  const { today } = useToday();
  const cards = memberCards(root, today);
  if (cards.length === 0) return null;
  const withDoses = new Set(todayDoses(root, today).map((d) => d.personId));

  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>สมาชิกในบ้าน</h2>
      <ul className={styles.members}>
        {cards.map((m, index) => {
          const self = root.persons.find((p) => p.id === m.personId)?.selfManaged === true;
          const finished = allDone && withDoses.has(m.personId);
          return (
            <li key={m.personId}>
              <a className={styles.memberRow} href={href(`/members/${encodeURIComponent(m.personId)}`)}>
                <img
                  className={styles.avatar}
                  src={avatarUrl(avatarForIndex(index))}
                  alt=""
                  style={{ '--ring-color': RING[m.color] } as CSSProperties}
                />
                <div className={styles.rowText}>
                  <div className={styles.medName}>{m.name}</div>
                  <div className={styles.sub}>
                    ยา {m.medCount} รายการ{self && ' · จัดยาเอง'}
                    {finished && ' · จัดครบวันนี้'}
                  </div>
                </div>
                {finished ? (
                  <span className={`${styles.chip} ${styles.chipOk}`}>
                    <CheckCircleIcon />
                    ครบ
                  </span>
                ) : (
                  <span className={styles.chev}>
                    <ChevronRightIcon />
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
