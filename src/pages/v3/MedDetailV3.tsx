// The v3 medicine detail screen (M4 PR 5b): one page, no tabs, no bottom menu. What to show comes from
// `buildMedDetail` (src/domain/v3/medDetail.ts); MedDetailPage owns the data, the clock and saving. Stop / resume /
// refill / open a tube change a copy of the data and hand it to `persist`; if saving fails the screen keeps the old data.
import { useMemo, useState } from 'react';
import { BackIcon, ChevronRightIcon, InfoIcon, PlayIcon, StopIcon } from '../../components/icons';
import { ComingSoon } from '../../components/v3/ComingSoon';
import { KindIcon } from '../../components/v3/KindIcon';
import { EveningIcon, MorningIcon, NightIcon, NoonIcon } from '../../components/v3/PeriodIcons';
import { Sheet } from '../../components/v3/Sheet';
import { ExpiryPart, NumberField, OptionButton, sheetStyles as form } from '../../components/v3/sheetParts';
import { Toast, useToast } from '../../components/v3/Toast';
import type { IsoDate } from '../../domain/calc';
import type { Period } from '../../domain/v3/home';
import { resumeMedication, stopMedication } from '../../domain/v3/medActions';
import {
  applyRefill,
  buildMedDetail,
  previewRefill,
  refillAmount,
  refillFields,
  type Chip,
  type HistoryRow,
  type RefillValues,
} from '../../domain/v3/medDetail';
import { RESUME_REASONS, RESUME_REASON_LABEL, STOP_REASONS, STOP_REASON_LABEL, type Root } from '../../domain/v3/schema';
import { openNewTube } from '../../domain/v3/stock';
import { avatarUrl, iconUrl } from '../../visual';
import '../../styles/v3theme.css';
import styles from './MedDetailV3.module.css';

export type DetailSheet = 'refill' | 'stop' | 'resume' | 'history';
export type Persist = (root: Root) => { ok: true } | { ok: false; text: string };

export interface MedDetailViewProps {
  root: Root;
  id: string;
  today: IsoDate;
  demo: boolean;
  persist: Persist;
  /** Where the back arrow goes (keeps `?demo=` in a demo). */
  listHref: string;
  /** Test links only: `&sheet=refill|stop|resume|history`. */
  initialSheet?: DetailSheet;
  nowIso: () => string;
}

const PERIOD_ICON: Record<Period | 'interval', (p: { size?: number }) => JSX.Element> = {
  morning: MorningIcon,
  noon: NoonIcon,
  evening: EveningIcon,
  bedtime: NightIcon,
  interval: NoonIcon,
};

const HISTORY_SHOWN = 3;

export function MedDetailNotFound({ listHref }: { listHref: string }) {
  return (
    <div className={`v3theme ${styles.page}`}>
      <main className={styles.notFound}>
        <h1 className={styles.notFoundTitle}>ไม่พบยานี้</h1>
        <p className={styles.sub}>ยานี้อาจถูกลบไปแล้ว หรือลิงก์ไม่ถูกต้อง</p>
        <a className={styles.notFoundButton} href={listHref}>
          กลับไปรายการยา
        </a>
      </main>
    </div>
  );
}

export function MedDetailView({ root: initialRoot, id, today, demo, persist, listHref, initialSheet, nowIso }: MedDetailViewProps) {
  const [root, setRoot] = useState(initialRoot);
  const [sheet, setSheet] = useState<DetailSheet | null>(() => {
    const d = buildMedDetail(initialRoot, id, today);
    if (!d || !initialSheet) return null;
    if (initialSheet === 'refill' && !d.stock.canRefill) return null;
    if (initialSheet === 'stop' && d.status !== 'active') return null;
    if (initialSheet === 'resume' && d.status !== 'stopped') return null;
    return initialSheet;
  });
  const [toast, showToast] = useToast();
  const [pageError, setPageError] = useState<string | null>(null);
  const d = useMemo(() => buildMedDetail(root, id, today), [root, id, today]);
  if (!d) return <MedDetailNotFound listHref={listHref} />;

  const stopped = d.status === 'stopped';
  const close = (): void => setSheet(null);
  /** Saves a new root; on success shows it, closes the sheet and says `message`. On failure nothing changes. */
  const commit = (next: Root, message: string): string | null => {
    const res = persist(next);
    if (!res.ok) return res.text;
    setRoot(next);
    setPageError(null);
    setSheet(null);
    showToast(message);
    return null;
  };

  const onOpenTube = (): void => {
    const a = root.assignments.find((x) => x.id === id);
    if (!a) return;
    const res = openNewTube(a);
    if (!res.ok) {
      setPageError(res.error);
      return;
    }
    const next: Root = { ...root, assignments: root.assignments.map((x) => (x.id === id ? res.assignment : x)) };
    const saved = persist(next);
    if (!saved.ok) {
      setPageError(saved.text);
      return;
    }
    setRoot(next);
    setPageError(null);
    const spare = res.assignment.stock?.kind === 'tubes' ? res.assignment.stock.spare : 0;
    showToast(`เปิด${d.tubeWord}ใหม่แล้ว สำรองเหลือ ${spare} ${d.tubeWord}`);
  };

  const s = d.stock;
  return (
    <div className={`v3theme ${styles.page}`}>
      {demo && (
        <p className={styles.demo} role="status">
          <InfoIcon />
          โหมดตัวอย่าง ไม่บันทึกข้อมูล
        </p>
      )}

      <header className={styles.head}>
        <a className={styles.round} href={listHref} aria-label="กลับไปรายการยา">
          <BackIcon />
        </a>
        <img className={styles.headIcon} src={iconUrl('nav-medicines')} alt="" />
        <h1 className={styles.title}>รายละเอียดยา</h1>
        <ComingSoon className={styles.round} aria-label="แก้ไขยานี้">
          <MoreGlyph />
        </ComingSoon>
      </header>

      <main className={styles.body}>
        {pageError && (
          <p className={styles.pageError} role="alert">
            {pageError}
          </p>
        )}

        {/* ----- card 1: medicine ----- */}
        <section className={styles.card} aria-labelledby="card-info">
          <div className={styles.cardHead}>
            <img className={styles.cardIcon} src={iconUrl('rx-medicine')} alt="" />
            <h2 id="card-info" className={styles.cardTitle}>
              ข้อมูลยา
            </h2>
            <StatusChip chip={stopped ? { tone: 'off', label: 'หยุดแล้ว' } : { tone: 'ok', label: 'กำลังใช้อยู่' }} />
          </div>
          <div className={styles.infoBody}>
            <img className={styles.avatar} src={avatarUrl(d.avatar)} alt="" />
            <div className={styles.infoText}>
              <p className={styles.sub}>ยาของ {d.personName}</p>
              <p className={styles.medName}>{d.name}</p>
              <p className={styles.kindLine}>
                <KindIcon kind={d.kind} size={28} />
                {d.strength && <strong>{d.strength}</strong>}
              </p>
            </div>
          </div>
          {d.stoppedLine && <p className={`${styles.sub} ${styles.stoppedLine}`}>{d.stoppedLine}</p>}
        </section>

        {/* ----- card 2: how to take it ----- */}
        <section className={styles.card} aria-labelledby="card-dose">
          <div className={styles.cardHead}>
            <img className={styles.cardIcon} src={iconUrl('prepare-meds')} alt="" />
            <h2 id="card-dose" className={styles.cardTitle}>
              {d.doseTitle}
            </h2>
          </div>
          <ul className={styles.list}>
            {d.doseLines.map((l) => {
              const Icon = PERIOD_ICON[l.period];
              return (
                <li key={l.title} className={styles.doseRow}>
                  <Icon size={32} />
                  <div>
                    <p className={styles.rowTitle}>{l.title}</p>
                    <p className={styles.sub}>{l.sub}</p>
                  </div>
                </li>
              );
            })}
            <li className={styles.startRow}>
              <p className={styles.sub}>{d.startLine}</p>
            </li>
          </ul>
        </section>

        {/* ----- card 3: stock ----- */}
        <section className={styles.card} aria-labelledby="card-stock">
          <div className={styles.cardHead}>
            <img className={styles.cardIcon} src={iconUrl('restock')} alt="" />
            <h2 id="card-stock" className={styles.cardTitle}>
              ยาคงเหลือ
            </h2>
            {s.chip && <StatusChip chip={s.chip} />}
          </div>
          <div className={styles.stockBody}>
            <div className={styles.stockMain}>
              <p className={styles.big}>{s.big}</p>
              {s.sub && <p className={styles.sub}>{s.sub}</p>}
              {s.note && <p className={styles.sub}>{s.note}</p>}
            </div>
            {s.left && (
              <div className={styles.stockLeft}>
                <p className={styles.sub}>{s.left.label}</p>
                <p className={styles.leftValue}>{s.left.value}</p>
              </div>
            )}
          </div>
          <div className={styles.expiryRow}>
            <span className={styles.sub}>วันหมดอายุ</span>
            <span className={styles.expiryValue}>{s.expiry.text}</span>
            {s.expiry.chip && <StatusChip chip={s.expiry.chip} />}
          </div>
          {(s.canRefill || s.openTube) && (
            <div className={styles.cardButtons}>
              {s.openTube && (
                <button type="button" className={styles.btn3} disabled={s.openTube.disabled} onClick={onOpenTube}>
                  {s.openTube.label}
                </button>
              )}
              {s.canRefill && (
                <button type="button" className={styles.btn3} onClick={() => setSheet('refill')}>
                  <img src={iconUrl('restock')} alt="" width={22} height={22} />
                  เติมสต็อก
                </button>
              )}
            </div>
          )}
        </section>

        {/* ----- card 4: history ----- */}
        <section className={styles.card} aria-labelledby="card-history">
          <div className={styles.cardHead}>
            <img className={styles.cardIcon} src={iconUrl('history')} alt="" />
            <h2 id="card-history" className={styles.cardTitle}>
              ประวัติการใช้ยา
            </h2>
          </div>
          <Timeline rows={d.history.slice(0, HISTORY_SHOWN)} />
          {d.history.length > HISTORY_SHOWN && (
            <button type="button" className={styles.seeAll} onClick={() => setSheet('history')}>
              <span>ดูทั้งหมด ({d.history.length})</span>
              <ChevronRightIcon />
            </button>
          )}
        </section>

        {stopped ? (
          <button type="button" className={styles.resume} onClick={() => setSheet('resume')}>
            <PlayIcon />
            กลับมากินใหม่
          </button>
        ) : (
          <button type="button" className={styles.stop} onClick={() => setSheet('stop')}>
            <StopIcon />
            หยุดยานี้
          </button>
        )}
      </main>

      {sheet === 'refill' && <RefillSheet root={root} id={id} medName={d.strength ? `${d.name} ${d.strength}` : d.name} today={today} onClose={close} commit={commit} />}
      {sheet === 'stop' && <ReasonSheet kind="stop" root={root} id={id} today={today} nowIso={nowIso} onClose={close} commit={commit} />}
      {sheet === 'resume' && <ReasonSheet kind="resume" root={root} id={id} today={today} nowIso={nowIso} onClose={close} commit={commit} />}
      {sheet === 'history' && (
        <Sheet title="ประวัติการใช้ยา" subtitle="มีเฉพาะเหตุการณ์ที่หมอสั่ง การแก้ข้อมูลที่ใส่ผิดและการเติมสต็อกไม่อยู่ในนี้" onClose={close}>
          <div className={form.body}>
            <Timeline rows={d.history} />
            <div className={form.actions}>
              <button type="button" className={form.cancel} onClick={close}>
                ปิด
              </button>
            </div>
          </div>
        </Sheet>
      )}
      <Toast text={toast} />
    </div>
  );
}

const MoreGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

/** Dot + word (never colour alone). */
function StatusChip({ chip }: { chip: Chip }) {
  return (
    <span className={`${styles.chip} ${styles[`tone_${chip.tone}`]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {chip.label}
    </span>
  );
}

function Timeline({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) return <p className={`${styles.sub} ${styles.timelineEmpty}`}>ยังไม่มีประวัติ</p>;
  return (
    <ol className={styles.timeline}>
      {rows.map((r) => (
        <li key={r.id} className={styles.event}>
          <p className={styles.sub}>{r.date}</p>
          <p className={styles.rowTitle}>{r.title}</p>
          {r.line1 && <p className={styles.sub}>{r.line1}</p>}
          {r.line2 && <p className={styles.sub}>{r.line2}</p>}
        </li>
      ))}
    </ol>
  );
}

type Commit = (next: Root, message: string) => string | null;

function RefillSheet({ root, id, medName, today, onClose, commit }: { root: Root; id: string; medName: string; today: IsoDate; onClose: () => void; commit: Commit }) {
  const a = root.assignments.find((x) => x.id === id);
  const m = a ? root.medications.find((x) => x.id === a.medicationId) : undefined;
  const [values, setValues] = useState<RefillValues>({});
  const [expiry, setExpiry] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  if (!a || !m) return null;

  const fields = refillFields(a, m);
  const amount = refillAmount(a, m, values);
  const typed = amount !== null && !('error' in amount);
  const result = typed ? previewRefill(root, id, amount, expiry === '' ? undefined : expiry, today) : null;
  const problem = amount !== null && 'error' in amount ? amount.error : result && !result.ok ? result.error : null;
  const preview = result?.ok ? result.preview : null;

  const save = (): void => {
    if (!preview) return;
    const applied = applyRefill(root, id, preview.assignment);
    if (!applied.ok) {
      setSaveError(applied.error);
      return;
    }
    const err = commit(applied.root, 'เติมสต็อกแล้ว');
    if (err) setSaveError(err);
  };

  return (
    <Sheet title="เติมสต็อก" subtitle={`${medName} · ใส่จำนวนที่ซื้อเพิ่ม`} onClose={onClose}>
      <div className={form.body}>
        <div className={form.fields}>
          {fields.map((f, i) => (
            <span key={f.key} className={styles.fieldWrap}>
              {i > 0 && <span className={form.plus}>+</span>}
              <NumberField unit={f.unit} value={values[f.key] ?? ''} onChange={(v) => setValues({ ...values, [f.key]: v })} />
            </span>
          ))}
        </div>
        {problem && (
          <p className={form.error} role="alert">
            {problem}
          </p>
        )}
        {preview && (
          <div className={form.summary}>
            {preview.rows.map((r) => (
              <p key={r.label} className={form.summaryRow}>
                <span>{r.label}</span>
                <strong>{r.value}</strong>
              </p>
            ))}
          </div>
        )}
        <ExpiryPart oldExpiry={a.expiry} value={expiry} onChange={setExpiry} kept={preview?.expiry} />
        {saveError && (
          <p className={form.error} role="alert">
            {saveError}
          </p>
        )}
        <div className={form.actions}>
          <button type="button" className={form.primary} disabled={!preview} onClick={save}>
            บันทึก
          </button>
          <button type="button" className={form.cancel} onClick={onClose}>
            ยกเลิก
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function ReasonSheet({ kind, root, id, today, nowIso, onClose, commit }: { kind: 'stop' | 'resume'; root: Root; id: string; today: IsoDate; nowIso: () => string; onClose: () => void; commit: Commit }) {
  const isStop = kind === 'stop';
  const reasons: readonly string[] = isStop ? STOP_REASONS : RESUME_REASONS;
  const labelOf = (r: string): string => (isStop ? STOP_REASON_LABEL[r as keyof typeof STOP_REASON_LABEL] : RESUME_REASON_LABEL[r as keyof typeof RESUME_REASON_LABEL]);
  const [reason, setReason] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const other = reason === 'อื่น ๆ';
  const symptom = isStop && (reason === 'แพ้ยา' || reason === 'ใช้ยาไม่ได้ / ผลข้างเคียง');
  const ready = reason !== null && (!other || text.trim() !== '');

  const confirm = (): void => {
    if (!ready || reason === null) return;
    const input = { reason, ...(other || symptom ? { note: text } : {}) };
    const res = isStop
      ? stopMedication(root, id, input as Parameters<typeof stopMedication>[2], today, nowIso())
      : resumeMedication(root, id, input as Parameters<typeof resumeMedication>[2], today, nowIso());
    if (!res.ok) {
      setSaveError(res.error);
      return;
    }
    const err = commit(res.root, isStop ? 'หยุดยาแล้ว' : 'กลับมากินยาแล้ว');
    if (err) setSaveError(err);
  };

  return (
    <Sheet title={isStop ? 'หยุดยานี้' : 'กลับมากินยานี้'} subtitle="เลือกเหตุผล ระบบจะบันทึกลงในประวัติการใช้ยา" onClose={onClose}>
      <div className={form.body}>
        <div className={form.options}>
          {reasons.map((r) => (
            <OptionButton key={r} on={reason === r} onClick={() => { setReason(r); setText(''); }}>
              {labelOf(r)}
            </OptionButton>
          ))}
        </div>
        {other && (
          <label className={styles.textLabel}>
            <span className={form.label}>พิมพ์เหตุผล</span>
            <input className={form.textInput} type="text" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        {symptom && (
          <label className={styles.textLabel}>
            <span className={form.label}>อาการที่เกิด (ไม่บังคับ แต่ควรบันทึกไว้เผื่อใช้ประกอบการสั่งยาในอนาคต)</span>
            <input className={form.textInput} type="text" maxLength={200} placeholder="เช่น ผื่นคัน บวม คลื่นไส้ ใจสั่น" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        {saveError && (
          <p className={form.error} role="alert">
            {saveError}
          </p>
        )}
        <div className={form.actions}>
          <button type="button" className={isStop ? form.danger : form.primary} disabled={!ready} onClick={confirm}>
            {isStop ? 'ยืนยันหยุดยา' : 'ยืนยันกลับมากินยา'}
          </button>
          <button type="button" className={form.cancel} onClick={onClose}>
            ยกเลิก
          </button>
        </div>
      </div>
    </Sheet>
  );
}
