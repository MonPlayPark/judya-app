import type { ReactNode } from 'react';
import { thaiDate } from '../domain/format';
import { intervalDay, todayDoses, todayProgress, type DoseSlot, type MealTiming, type TodayDose } from '../domain/today';
import type { Root } from '../domain/schema';
import { Card, CardTitle, Pill } from '../components/Card';
import {
  BackIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  InfoIcon,
  MoonIcon,
  SunIcon,
  SunriseIcon,
  SunsetIcon,
} from '../components/icons';
import { href, useRoute } from '../router';
import { useData, useRoot } from '../state/DataContext';
import { useToday } from '../state/useToday';
import { doseView, MEAL_LABEL, SLOT_LABEL } from './doseView';
import styles from './TodayPage.module.css';

const SLOTS: DoseSlot[] = ['morning', 'noon', 'evening', 'bedtime'];
const MEALS: (MealTiming | 'none')[] = ['before', 'with', 'after', 'none'];
const SLOT_ICON: Record<DoseSlot, ReactNode> = {
  morning: <SunriseIcon />,
  noon: <SunIcon />,
  evening: <SunsetIcon />,
  bedtime: <MoonIcon />,
};

const whoHref = (who: string | null): string => (who ? `/today?who=${encodeURIComponent(who)}` : '/today');

/** "ยาวันนี้" (board Today). The member filter lives in the URL: #/today?who=<id>. */
export function TodayPage() {
  const root = useRoot();
  const { tickDose, untickDose } = useData();
  const { today, syncToday } = useToday();
  const { query } = useRoute();

  const all = todayDoses(root, today);
  const { done, total, percent } = todayProgress(all);
  const people = root.persons.filter((p) => all.some((d) => d.personId === p.id));
  const requested = query.get('who');
  const who = people.some((p) => p.id === requested) ? requested : null; // unknown or finished-with filter = everyone
  const doses = who ? all.filter((d) => d.personId === who) : all;
  const selfManaged = root.persons.filter(
    (p) => p.selfManaged && p.removedAt === undefined && root.assignments.some((a) => a.personId === p.id && a.status === 'active'),
  );

  // A tap goes to the day the screen shows. If midnight has passed meanwhile, the screen only refreshes.
  const toggle = (d: TodayDose) => {
    if (!syncToday()) return;
    if (d.done) untickDose(d.key);
    else tickDose(d.key);
  };

  return (
    <>
      <header className={styles.header}>
        <a className={styles.back} href={href('/')} aria-label="กลับหน้าแรก">
          <BackIcon />
        </a>
        <div>
          <h1 className={styles.title}>ยาวันนี้</h1>
          <div className={styles.date}>{thaiDate(today)}</div>
        </div>
      </header>

      <div className={styles.body}>
        {total === 0 ? (
          <Card>
            <p className={styles.state}>
              <InfoIcon />
              วันนี้ไม่มียาที่ต้องจัด
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <div className={styles.progressTop}>
                <span className={styles.progressText}>
                  จัดแล้ว {done} จาก {total}
                </span>
                {done === total ? (
                  <Pill tone="success" icon={<CheckCircleIcon />}>
                    ครบแล้ว
                  </Pill>
                ) : (
                  <Pill tone="info" icon={<ClockIcon />}>
                    เหลืออีก {total - done}
                  </Pill>
                )}
              </div>
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
            </Card>

            <div role="group" aria-label="กรองตามสมาชิก" className={styles.chips}>
              <Chip on={who === null} to={whoHref(null)}>
                ทั้งหมด
              </Chip>
              {people.map((p) => (
                <Chip key={p.id} on={who === p.id} to={whoHref(p.id)}>
                  {p.name}
                </Chip>
              ))}
            </div>

            <IntervalSection root={root} doses={doses} today={today} onToggle={toggle} />
            <MealSections root={root} doses={doses} onToggle={toggle} />

            {selfManaged.length > 0 && (
              <p className={styles.note}>ไม่รวม {selfManaged.map((p) => p.name).join(', ')} เพราะจัดยาเอง</p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Chip({ on, to, children }: { on: boolean; to: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${on ? styles.chipOn : ''}`}
      aria-pressed={on}
      onClick={() => {
        window.location.hash = to;
      }}
    >
      {on && <CheckIcon />}
      {children}
    </button>
  );
}

/** One tick row: a 64px-high checkbox. Done = filled circle with a tick AND the word "จัดแล้ว". */
function DoseRow({ title, sub, done, onToggle }: { title: string; sub: string; done: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={done} className={styles.row} onClick={onToggle}>
      <span className={`${styles.ring} ${done ? styles.ringOn : ''}`}>{done && <CheckIcon />}</span>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{title}</span>
        <span className={styles.rowSub}>{sub}</span>
      </span>
    </button>
  );
}

const statusText = (done: boolean): string => (done ? 'จัดแล้ว' : 'ยังไม่จัด');

function IntervalSection({
  root,
  doses,
  today,
  onToggle,
}: {
  root: Root;
  doses: TodayDose[];
  today: string;
  onToggle: (d: TodayDose) => void;
}) {
  const timed = doses.filter((d) => d.when.kind === 'time');
  const ids = [...new Set(timed.map((d) => d.assignmentId))];
  if (ids.length === 0) return null;

  return (
    <Card>
      <CardTitle icon={<ClockIcon />}>ยาที่กินทุก ๆ ชั่วโมง</CardTitle>
      {ids.map((id) => {
        const mine = timed.filter((d) => d.assignmentId === id); // already sorted by clock time
        const first = mine[0];
        const a = root.assignments.find((x) => x.id === id);
        if (!first || !a) return null;
        const v = doseView(root, first);
        const next = mine.find((d) => !d.done);
        const day = a.schedule.kind === 'interval' ? intervalDay(a.schedule, today) : null;
        return (
          <div key={id} className={styles.interval}>
            <div className={styles.intervalTop}>
              <div>
                <div className={styles.medName}>{v.name}</div>
                <div className={styles.rowSub}>
                  {v.who} · {v.amount} · ทุก {v.everyHours} ชม.
                </div>
              </div>
              {next && next.when.kind === 'time' ? (
                <Pill tone="info" icon={<ClockIcon />} className={styles.nextPill}>
                  ครั้งต่อไป {next.when.time}
                </Pill>
              ) : (
                <Pill tone="success" icon={<CheckCircleIcon />} className={styles.nextPill}>
                  ครบวันนี้
                </Pill>
              )}
            </div>
            {day && <div className={styles.rowSub}>{day}</div>}
            {mine.map((d) => (
              <DoseRow
                key={d.key}
                title={d.when.kind === 'time' ? d.when.time : ''}
                sub={statusText(d.done)}
                done={d.done}
                onToggle={() => onToggle(d)}
              />
            ))}
          </div>
        );
      })}
    </Card>
  );
}

function MealSections({ root, doses, onToggle }: { root: Root; doses: TodayDose[]; onToggle: (d: TodayDose) => void }) {
  return (
    <>
      {SLOTS.map((slot) => {
        const inSlot = doses.filter((d) => d.when.kind === 'slot' && d.when.slot === slot);
        if (inSlot.length === 0) return null;
        return (
          <Card key={slot}>
            <CardTitle icon={SLOT_ICON[slot]}>{SLOT_LABEL[slot]}</CardTitle>
            {MEALS.map((meal) => {
              const rows = inSlot.filter((d) => (d.when.kind === 'slot' ? (d.when.meal ?? 'none') : 'none') === meal);
              if (rows.length === 0) return null;
              return (
                <div key={meal}>
                  {meal !== 'none' && (
                    <div className={styles.mealLabelWrap}>
                      <span className={styles.mealLabel}>{MEAL_LABEL[meal]}</span>
                    </div>
                  )}
                  {rows.map((d) => {
                    const v = doseView(root, d);
                    return (
                      <DoseRow
                        key={d.key}
                        title={v.name}
                        sub={`${v.who} · ${v.amount} · ${statusText(d.done)}`}
                        done={d.done}
                        onToggle={() => onToggle(d)}
                      />
                    );
                  })}
                </div>
              );
            })}
          </Card>
        );
      })}
    </>
  );
}
