// The v3 change-how-to-take screen "เปลี่ยนวิธีกิน" (M4 PR 8b, boards #41 - #49 and #52, layout A: one row per meal + a bottom sheet).
// View only: every rule (what can be turned off, the steps, the days, what changed, the summary texts, how it is written) is in
// src/domain/v3/doseChange.ts. DoseChangePage owns the data, the clock and the way back.
import { useMemo, useState } from 'react';
import { BackIcon, ChevronRightIcon, InfoIcon, MinusIcon, PlusIcon, WarningIcon } from '../../components/icons';
import { KindIcon } from '../../components/v3/KindIcon';
import { EveningIcon, MorningIcon, NightIcon, NoonIcon } from '../../components/v3/PeriodIcons';
import { Sheet } from '../../components/v3/Sheet';
import { sheetStyles as sheet } from '../../components/v3/sheetParts';
import type { IsoDate } from '../../domain/calc';
import { KIND_LABEL, WEEKDAY_CHIPS, isTubeKind } from '../../domain/v3/addMedicine';
import {
  NOTE_MAX,
  SPOONS,
  applyDoseChange,
  buildDoseSchedule,
  canStep,
  canTurnOff,
  doseAvailability,
  doseText,
  draftFromSchedule,
  isChanged,
  mealStatus,
  mealSub,
  selectedDays,
  setSpoon,
  setTiming,
  stepMeal,
  summarize,
  toggleDay,
  toggleMeal,
  setAltDays,
  type AdjustReason,
  type DoseDraft,
} from '../../domain/v3/doseChange';
import { MEAL_LABEL, PERIODS, PERIOD_LABEL, formatDose, unitWord, type Meal, type Period } from '../../domain/v3/home';
import { buildMedDetail } from '../../domain/v3/medDetail';
import type { Root } from '../../domain/v3/schema';
import { avatarUrl, iconUrl } from '../../visual';
import { EditMedNotFound } from './EditMedV3';
import detail from './MedDetailV3.module.css';
import styles from './DoseChangeV3.module.css';

export interface DoseChangeViewProps {
  root: Root;
  id: string;
  today: IsoDate;
  demo: boolean;
  /** Saves a changed root. Demo: not given, so nothing is saved. */
  persist?: (root: Root) => { ok: true } | { ok: false; text: string };
  /** The medicine's page: the back arrow, "ยกเลิก", and where the page goes after a save. */
  backHref: string;
  /** Called after a (pretend, in a demo) successful save. */
  onSaved: () => void;
  nowIso: () => string;
}

const PERIOD_ICON: Record<Period, (p: { size?: number }) => JSX.Element> = { morning: MorningIcon, noon: NoonIcon, evening: EveningIcon, bedtime: NightIcon };
const TIMINGS: readonly Meal[] = ['before', 'with', 'after'];
export const SAVED_TEXT = 'บันทึกวิธีกินใหม่แล้ว';

export function DoseChangeView({ root, id, today, demo, persist, backHref, onSaved, nowIso }: DoseChangeViewProps) {
  const info = useMemo(() => buildMedDetail(root, id, today), [root, id, today]);
  const asg = root.assignments.find((x) => x.id === id);
  const med = asg ? root.medications.find((x) => x.id === asg.medicationId) : undefined;
  const original = useMemo(() => (asg && med ? draftFromSchedule(med.kind, asg.schedule) : null), [asg, med]);
  const [draft, setDraft] = useState<DoseDraft | null>(original);
  const [openMeal, setOpenMeal] = useState<Period | null>(null);
  const [discard, setDiscard] = useState(false);
  const [reason, setReason] = useState<AdjustReason>('doctor');
  const [note, setNote] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const availability = doseAvailability(root, id);
  if (!info || !asg || !med || availability === 'missing') return <EditMedNotFound listHref="#/n/meds" />;

  const head = (changed: boolean) => (
    <header className={detail.head}>
      {changed ? (
        <button type="button" className={detail.round} aria-label="กลับ (มีการแก้ค้างอยู่)" onClick={() => setDiscard(true)}>
          <BackIcon />
        </button>
      ) : (
        <a className={detail.round} href={backHref} aria-label="กลับไปรายละเอียดยา">
          <BackIcon />
        </a>
      )}
      <img className={detail.headIcon} src={iconUrl('adjust-dose')} alt="" />
      <h1 className={detail.title}>เปลี่ยนวิธีกิน</h1>
    </header>
  );
  const demoBar = demo && (
    <p className={detail.demo} role="status">
      <InfoIcon />
      โหมดตัวอย่าง ไม่บันทึกข้อมูล
    </p>
  );
  const medCard = (
    <section className={detail.card} aria-labelledby="dc-med">
      <div className={detail.cardHead}>
        <img className={detail.cardIcon} src={iconUrl('adjust-dose')} alt="" />
        <h2 id="dc-med" className={detail.cardTitle}>
          ยาที่กำลังปรับ
        </h2>
      </div>
      <div className={detail.infoBody}>
        <img className={detail.avatar} src={avatarUrl(info.avatar)} alt="" />
        <div className={detail.infoText}>
          <p className={detail.sub}>ยาของ {info.personName}</p>
          <p className={detail.medName}>{info.name}</p>
          {info.strength && <p className={styles.strength}>{info.strength}</p>}
        </div>
        <div className={styles.kindCol}>
          <KindIcon kind={info.kind} size={32} />
          <span className={styles.kindWord}>{KIND_LABEL[info.kind]}</span>
        </div>
      </div>
    </section>
  );

  // an interval schedule (every N hours) or a stopped medicine: this page cannot change it
  if (availability !== 'ok' || !original || !draft) {
    const text =
      availability === 'stopped'
        ? 'ยานี้หยุดแล้ว กลับมากินยาก่อน ถึงจะเปลี่ยนวิธีกินได้'
        : `ยานี้กินทุก ${asg.schedule.kind === 'interval' ? asg.schedule.everyHours : ''} ชั่วโมง ยังเปลี่ยนวิธีกินในหน้านี้ไม่ได้`;
    return (
      <div className={detail.page}>
        {demoBar}
        {head(false)}
        <main className={styles.body}>
          {medCard}
          <section className={detail.card} aria-label="เปลี่ยนวิธีกินไม่ได้">
            <p className={styles.cannot}>
              <InfoIcon />
              <span>{text}</span>
            </p>
          </section>
          <a className={styles.backLink} href={backHref}>
            กลับไปรายละเอียดยา
          </a>
        </main>
      </div>
    );
  }

  const kind = med.kind;
  const tube = isTubeKind(kind);
  const changed = isChanged(original, draft);
  const summary = changed ? summarize(root, id, original, draft, today) : null;
  const active = PERIODS.filter((p) => draft.meals[p].on);
  const origAlt = original.days.kind === 'alt' ? original.days : null;

  const save = (): void => {
    const made = applyDoseChange(root, id, buildDoseSchedule(draft), reason, note, today, nowIso());
    if (!made.ok) {
      setSaveError(made.error);
      return;
    }
    const res = persist ? persist(made.root) : ({ ok: true } as const);
    if (!res.ok) {
      setSaveError(res.text); // the draft stays as it was
      return;
    }
    onSaved();
  };

  return (
    <div className={detail.page}>
      {demoBar}
      {head(changed)}

      <main className={styles.body}>
        {medCard}

        {/* ----- which meals ----- */}
        <section className={detail.card} aria-labelledby="dc-meals">
          <div className={detail.cardHead}>
            <img className={detail.cardIcon} src={iconUrl('prepare-meds')} alt="" />
            <h2 id="dc-meals" className={detail.cardTitle}>
              วิธีกินใหม่
            </h2>
          </div>
          <div className={styles.cardBody}>
            <p className={detail.sub}>{tube ? 'เปิด/ปิดช่วงเวลา · ทาหรือหยอดตามฉลาก ไม่ตัดสต็อกให้เอง' : 'เปิด/ปิดช่วงเวลาที่ต้องกิน (เหลืออย่างน้อย 1 ช่วง)'}</p>
            <div className={styles.tiles} role="group" aria-label="ช่วงเวลาที่กิน">
              {PERIODS.map((p) => {
                const Icon = PERIOD_ICON[p];
                const on = draft.meals[p].on;
                const locked = on && !canTurnOff(draft, p);
                return (
                  <button
                    key={p}
                    type="button"
                    className={on ? `${styles.tile} ${styles.tileOn}` : styles.tile}
                    aria-pressed={on}
                    aria-disabled={locked || undefined}
                    onClick={() => setDraft(toggleMeal(draft, p))}
                  >
                    <Icon size={28} />
                    <span>{PERIOD_LABEL[p]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ----- one row per meal (layout A) ----- */}
        <section className={`${detail.card} ${styles.rowsCard}`} aria-label="ขนาดที่กินแต่ละช่วง">
          <ul className={styles.rows}>
            {active.map((p) => {
              const Icon = PERIOD_ICON[p];
              const status = mealStatus(original, draft, p);
              return (
                <li key={p} className={styles.row}>
                  <button type="button" className={styles.rowMain} aria-label={`ตั้ง${PERIOD_LABEL[p]}เพิ่มเติม`} onClick={() => setOpenMeal(p)}>
                    <Icon size={32} />
                    <span className={styles.rowText}>
                      <span className={styles.rowName}>
                        {PERIOD_LABEL[p]}
                        {status === 'new' && <span className={styles.chg}>เพิ่มใหม่</span>}
                        {status === 'changed' && <span className={styles.chg}>แก้แล้ว</span>}
                      </span>
                      <span className={detail.sub}>{mealSub(kind, draft, p)}</span>
                    </span>
                    <ChevronRightIcon />
                  </button>
                  {!tube && (
                    <div className={styles.stepper} role="group" aria-label={`ขนาดที่กิน${PERIOD_LABEL[p]}`}>
                      <button type="button" className={styles.stepBtn} aria-label={`ลดจำนวน ${PERIOD_LABEL[p]}`} disabled={!canStep(draft, p, -1)} onClick={() => setDraft(stepMeal(draft, p, -1))}>
                        <MinusIcon />
                      </button>
                      <output className={styles.stepValue} aria-label={`${PERIOD_LABEL[p]} ${doseText(med, draft.meals[p].amount)}`}>
                        <span className={styles.stepNum}>{formatDose(med, draft.meals[p].amount)}</span>
                        <span className={styles.stepUnit}>{unitWord(med)}</span>
                      </output>
                      <button type="button" className={styles.stepBtn} aria-label={`เพิ่มจำนวน ${PERIOD_LABEL[p]}`} disabled={!canStep(draft, p, 1)} onClick={() => setDraft(stepMeal(draft, p, 1))}>
                        <PlusIcon />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ----- why ----- */}
        <section className={detail.card} aria-labelledby="dc-why">
          <div className={detail.cardHead}>
            <img className={detail.cardIcon} src={iconUrl('history')} alt="" />
            <h2 id="dc-why" className={detail.cardTitle}>
              เหตุผลที่ปรับ
            </h2>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.reasons} role="radiogroup" aria-label="เหตุผลที่ปรับ">
              {(
                [
                  ['doctor', 'หมอสั่งปรับ'],
                  ['self_or_other', 'ปรับเอง หรืออื่นๆ'],
                ] as const
              ).map(([value, text]) => (
                <button key={value} type="button" role="radio" aria-checked={reason === value} className={reason === value ? `${styles.reason} ${styles.reasonOn}` : styles.reason} onClick={() => setReason(value)}>
                  <span className={styles.radioDot} aria-hidden="true" />
                  {text}
                </button>
              ))}
            </div>
            <label className={styles.noteLabel} htmlFor="dc-note">
              หมายเหตุ (ไม่บังคับ)
            </label>
            <textarea id="dc-note" className={styles.note} rows={3} maxLength={NOTE_MAX} placeholder="เช่น หมอเพิ่มโดสเช้า ตามผลเลือด" value={note} onChange={(e) => setNote(e.target.value)} />
            <p className={styles.counter}>
              {note.length}/{NOTE_MAX}
            </p>
          </div>
        </section>

        {/* ----- summary (only when something changed) ----- */}
        {summary && (
          <section className={detail.card} aria-labelledby="dc-sum">
            <div className={detail.cardHead}>
              <img className={detail.cardIcon} src={iconUrl('restock')} alt="" />
              <h2 id="dc-sum" className={detail.cardTitle}>
                สรุปก่อนบันทึก
              </h2>
            </div>
            <ul className={styles.sumRows}>
              <li className={styles.sumRow}>
                <span className={styles.sumLabel}>วิธีกินเดิม</span>
                <span className={styles.sumText}>{summary.oldLine}</span>
              </li>
              <li className={styles.sumRow}>
                <span className={styles.sumLabel}>วิธีกินใหม่</span>
                <span className={`${styles.sumText} ${styles.sumNew}`}>{summary.newLine}</span>
              </li>
              <li className={`${styles.sumRow} ${styles.sumStock}`}>
                <span className={styles.sumStockText}>
                  <strong className={styles.sumBold}>{summary.stockLine}</strong>
                  {summary.leftLine && <span className={detail.sub}>{summary.leftLine}</span>}
                  {summary.note && <span className={detail.sub}>{summary.note}</span>}
                </span>
                {summary.chip && (
                  <span className={`${detail.chip} ${detail[`tone_${summary.chip.tone}`]}`}>
                    <span className={detail.dot} aria-hidden="true" />
                    {summary.chip.label}
                  </span>
                )}
              </li>
              <li className={styles.sumRow}>
                <span className={detail.sub}>{summary.effectiveLine}</span>
              </li>
            </ul>
          </section>
        )}
      </main>

      {/* ----- the bar ----- */}
      <Bar
        changed={changed}
        backHref={backHref}
        saveError={saveError}
        onCancel={() => setDiscard(true)}
        onSave={save}
      />

      {openMeal && (
        <Sheet title={`${PERIOD_LABEL[openMeal]} · ตั้งค่าเพิ่มเติม`} onClose={() => setOpenMeal(null)}>
          <div className={sheet.body}>
            {openMeal !== 'bedtime' && !tube && (
              <div className={styles.group}>
                <p className={sheet.label}>ก่อน/หลังอาหาร</p>
                <div className={styles.segment} role="group" aria-label="ก่อนหรือหลังอาหาร">
                  {TIMINGS.map((t) => (
                    <button key={t} type="button" className={draft.meals[openMeal].timing === t ? `${styles.seg} ${styles.segOn}` : styles.seg} aria-pressed={draft.meals[openMeal].timing === t} onClick={() => setDraft(setTiming(draft, openMeal, t))}>
                      {MEAL_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {kind === 'liquid' && (
              <div className={styles.group}>
                <p className={sheet.label}>ปริมาณตามช้อน</p>
                <div className={styles.spoons}>
                  {SPOONS.map((s) => (
                    <button key={s.ml} type="button" className={draft.meals[openMeal].amount === s.ml ? `${styles.seg} ${styles.segOn}` : styles.seg} aria-pressed={draft.meals[openMeal].amount === s.ml} onClick={() => setDraft(setSpoon(draft, openMeal, s.ml))}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.group}>
              <p className={sheet.label}>วันที่กิน (เลือกครบ 7 วัน = ทุกวัน)</p>
              {origAlt && (
                <button type="button" className={draft.days.kind === 'alt' ? `${styles.seg} ${styles.segOn}` : styles.seg} aria-pressed={draft.days.kind === 'alt'} onClick={() => setDraft(setAltDays(draft, origAlt.anchor))}>
                  วันเว้นวัน
                </button>
              )}
              <div className={styles.days} role="group" aria-label="วันที่กิน">
                {WEEKDAY_CHIPS.map((w) => {
                  const on = selectedDays(draft.days).includes(w.value);
                  return (
                    <button key={w.value} type="button" className={on ? `${styles.day} ${styles.dayOn}` : styles.day} aria-pressed={on} aria-label={DAY_NAME[w.value]} onClick={() => setDraft(toggleDay(draft, w.value))}>
                      {w.label}
                    </button>
                  );
                })}
              </div>
              <p className={sheet.hint}>วันที่กินใช้กับทุกมื้อ</p>
            </div>
            <div className={sheet.actions}>
              <button type="button" className={sheet.primary} onClick={() => setOpenMeal(null)}>
                เสร็จ
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {discard && (
        <Sheet title="ทิ้งการเปลี่ยนแปลง?" onClose={() => setDiscard(false)}>
          <div className={sheet.body}>
            <p className={sheet.hint}>วิธีกินใหม่ที่ตั้งไว้จะไม่ถูกบันทึก ยาจะกินตามวิธีเดิม</p>
            <div className={sheet.actions}>
              <button type="button" className={sheet.primary} onClick={() => setDiscard(false)}>
                แก้ต่อ
              </button>
              <a className={`${sheet.danger} ${styles.linkButton}`} href={backHref}>
                ทิ้งการเปลี่ยนแปลง
              </a>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

const DAY_NAME: Record<number, string> = { 0: 'อาทิตย์', 1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัสบดี', 5: 'ศุกร์', 6: 'เสาร์' };

function Bar({ changed, backHref, saveError, onCancel, onSave }: { changed: boolean; backHref: string; saveError: string | null; onCancel: () => void; onSave: () => void }) {
  return (
    <div className={styles.bar}>
      {saveError !== null && (
        <p className={styles.saveError} role="alert">
          <WarningIcon />
          {saveError}
        </p>
      )}
      {!changed && <p className={styles.barNote}>ยังไม่ได้เปลี่ยนอะไร</p>}
      <div className={styles.barButtons}>
        {changed ? (
          <button type="button" className={styles.cancel} onClick={onCancel}>
            ยกเลิก
          </button>
        ) : (
          <a className={styles.cancel} href={backHref}>
            ยกเลิก
          </a>
        )}
        <button type="button" className={changed ? styles.save : styles.saveOff} disabled={!changed} onClick={onSave}>
          บันทึกการเปลี่ยนแปลง
        </button>
      </div>
    </div>
  );
}
