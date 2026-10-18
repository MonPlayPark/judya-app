// Medicine detail (board Med*): look, adjust dose, stop / resume, edit, history. The price section, "share with doctor"
// and the "allergy: coming soon" sentence are hidden until their pages exist (Q12).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { thaiDateShort } from '../domain/format';
import { errorText } from '../domain/errorText';
import { detailBadges, expiryBlock, historyEntries, shownQty, stockBlock, type HistoryEntry } from '../domain/medView';
import {
  describeSchedule,
  formProblem,
  formToSchedule,
  sameSchedule,
  scheduleToForm,
  type ScheduleForm,
} from '../domain/scheduleForm';
import { EVENT_REASONS, type Assignment, type Medication, type Person, type Root } from '../domain/schema';
import type { EventReason } from '../domain/medicine';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Actions, Chip, ChipGroup, Field, InfoBox, StepHeader, inputClass, textareaClass } from '../components/form';
import { EditIcon, PillIcon, PlayIcon, PlusIcon, SettingsIcon, StopIcon } from '../components/icons';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { StatusBadge } from '../components/StatusBadge';
import { href } from '../router';
import { useData, useRoot } from '../state/DataContext';
import { useToday } from '../state/useToday';
import styles from './MedDetail.module.css';

type Mode = 'view' | 'adjust' | 'stop' | 'edit';

export function MedDetailPage({ id }: { id: string }) {
  const root = useRoot();
  const a = root.assignments.find((x) => x.id === id);
  const med = a && root.medications.find((m) => m.id === a.medicationId);
  const person = a && root.persons.find((p) => p.id === a.personId);
  if (!a || !med || !person || person.removedAt !== undefined) return <NotFoundMed />;
  return <Detail key={a.id} root={root} a={a} med={med} person={person} />;
}

function NotFoundMed() {
  return (
    <>
      <StepHeader title="รายละเอียดยา" backTo="/meds" backLabel="กลับหน้ายาทั้งหมด" />
      <div className={styles.body}>
        <Card>
          <div className={styles.cardBody}>
            <InfoBox>ไม่พบยานี้ ยานี้อาจไม่อยู่ในรายการแล้ว หรือลิงก์ไม่ถูกต้อง</InfoBox>
            <Button onClick={() => (window.location.hash = href('/meds'))}>กลับไปยาทั้งหมด</Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function Detail({ root, a, med, person }: { root: Root; a: Assignment; med: Medication; person: Person }) {
  const { today } = useToday();
  const { resumeMedicine } = useData();
  const [mode, setMode] = useState<Mode>('view');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopped = a.status === 'stopped';
  const open = (m: Mode) => {
    setDone(null);
    setError(null);
    setMode(m);
  };
  const finished = (text: string) => {
    setDone(text);
    setMode('view');
  };
  const resume = () => {
    const res = resumeMedicine(a.id, {});
    if (res.ok) {
      setError(null);
      finished('กลับมาใช้ยานี้แล้ว');
    } else {
      setError(errorText(res.error));
    }
  };

  const current = describeSchedule(a.schedule, med.unit, true);
  const stock = stockBlock(root, a, med.unit, today);
  const expiry = expiryBlock(root, a, today);
  const history = historyEntries(root, a.id, med.name, med.unit);

  return (
    <>
      <StepHeader title="รายละเอียดยา" sub={`ของ ${person.name}`} backTo="/meds" backLabel="กลับหน้ายาทั้งหมด" />
      <div className={styles.body}>
        <Card>
          <div className={styles.cardBody}>
            <div className={styles.head}>
              <span className={styles.headIcon} aria-hidden="true">
                <PillIcon />
              </span>
              <div>
                <h2 className={styles.name}>{med.name}</h2>
                <div className={styles.sub}>ของ {person.name}</div>
              </div>
            </div>
            <div className={styles.badges}>
              {detailBadges(root, a, today).map((k) => (
                <StatusBadge key={k} kind={k} />
              ))}
            </div>
            <div className={styles.block}>
              <div className={styles.blockLabel}>วิธีทานตอนนี้</div>
              <div className={styles.blockValue}>{stopped ? `หยุดใช้แล้ว (ล่าสุด: ${current})` : current}</div>
            </div>
            <div className={styles.blocks}>
              <div aria-label="เหลืออยู่" role="group">
                <div className={styles.blockLabel}>เหลืออยู่</div>
                <div className={styles.blockValue}>{stock.value}</div>
                {stock.sub && <div className={styles.blockLabel}>{stock.sub}</div>}
              </div>
              <div aria-label="หมดอายุ" role="group">
                <div className={styles.blockLabel}>หมดอายุ</div>
                <div className={styles.blockValue}>{expiry.value}</div>
                {expiry.sub && <div className={styles.blockLabel}>{expiry.sub}</div>}
              </div>
            </div>
            {a.note && (
              <div className={styles.block}>
                <div className={styles.blockLabel}>บันทึกเพิ่มเติม</div>
                <div className={styles.blockText}>{a.note}</div>
              </div>
            )}
          </div>
        </Card>

        {done && <InfoBox tone="ok">{done}</InfoBox>}
        {error && <InfoBox tone="error">{error}</InfoBox>}

        {mode === 'view' && (
          <div className={styles.actions}>
            {!stopped && (
              <Button onClick={() => open('adjust')}>
                <SettingsIcon />
                ปรับโดส / เปลี่ยนวิธีทาน
              </Button>
            )}
            <Button variant="secondary" onClick={() => open('edit')}>
              <EditIcon />
              แก้ไขข้อมูลยา
            </Button>
            {stopped ? (
              <Button variant="secondary" onClick={resume}>
                <PlayIcon />
                กลับมาใช้ยานี้อีก
              </Button>
            ) : (
              <Button variant="dangerOutline" onClick={() => open('stop')}>
                <StopIcon />
                หยุดยา
              </Button>
            )}
          </div>
        )}
        {mode === 'adjust' && (
          <AdjustForm a={a} med={med} today={today} onCancel={() => open('view')} onDone={() => finished('บันทึกการปรับโดสแล้ว และเพิ่มในประวัติ')} />
        )}
        {mode === 'stop' && (
          <StopForm a={a} today={today} onCancel={() => open('view')} onDone={() => finished('หยุดยาแล้ว ยานี้จะไม่ขึ้นในรายการยาวันนี้')} />
        )}
        {mode === 'edit' && (
          <EditForm root={root} a={a} med={med} today={today} onCancel={() => open('view')} onDone={() => finished('บันทึกข้อมูลยาแล้ว')} />
        )}

        <Card>
          <h2 className={styles.historyTitle}>ประวัติการใช้ยา</h2>
          <p className={styles.historyHint}>ใหม่สุดอยู่บนสุด</p>
          {history.length === 0 ? (
            <p className={styles.historyHint}>ยังไม่มีประวัติ</p>
          ) : (
            <ol className={styles.timeline} aria-label="ประวัติการใช้ยา">
              {history.map((e, i) => (
                <HistoryRow key={e.id} e={e} last={i === history.length - 1} />
              ))}
            </ol>
          )}
        </Card>

        <p className={styles.disclaimer}>ไม่ใช่คำแนะนำทางการแพทย์ ตรวจวิธีทานกับฉลากยา แพทย์ หรือเภสัชกรเสมอ</p>
      </div>
    </>
  );
}

const EVENT_ICON: Record<HistoryEntry['type'], ReactNode> = {
  start: <PlusIcon />,
  adjust: <SettingsIcon />,
  stop: <StopIcon />,
  resume: <PlayIcon />,
  edit: <EditIcon />,
};

function HistoryRow({ e, last }: { e: HistoryEntry; last: boolean }) {
  const dot = e.type === 'start' || e.type === 'resume' ? styles.dotStart : e.type === 'adjust' ? styles.dotAdjust : '';
  return (
    <li className={styles.event}>
      <div className={styles.rail} aria-hidden="true">
        <span className={`${styles.dot} ${dot}`}>{EVENT_ICON[e.type]}</span>
        {!last && <span className={styles.line} />}
      </div>
      <div className={styles.eventText}>
        <div className={styles.sub}>{e.date}</div>
        <div className={styles.eventTitle}>{e.title}</div>
        {e.lines.map((l) => (
          <div key={l} className={styles.eventLine}>
            {l}
          </div>
        ))}
        {e.reason && (
          <div className={styles.eventSmall}>
            <b>เหตุผล:</b> {e.reason}
          </div>
        )}
        {e.note && <div className={`${styles.eventSmall} ${styles.eventNote}`}>“{e.note}”</div>}
      </div>
    </li>
  );
}

// ---------- forms ----------

/** Focus lands on the heading when a form opens, so a screen reader starts reading the new form. */
function useFocusOnOpen() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView?.({ block: 'start' });
  }, []);
  return ref;
}

function ReasonField({ reason, onChange }: { reason: EventReason | null; onChange: (r: EventReason) => void }) {
  return (
    <div className={styles.cardBody}>
      <span className={styles.fieldTitle}>
        เหตุผล <span className={styles.required}>(จำเป็น)</span>
      </span>
      <ChipGroup label="เหตุผล">
        {EVENT_REASONS.map((r) => (
          <Chip key={r} on={reason === r} onClick={() => onChange(r)}>
            {r}
          </Chip>
        ))}
      </ChipGroup>
      {reason === 'แพ้ยา' && <InfoBox tone="warn">ถ้าแพ้ยานี้ ควรแจ้งแพทย์หรือเภสัชกร</InfoBox>}
    </div>
  );
}

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="หมายเหตุ" optional hint="ใส่ได้ไม่เกิน 200 ตัวอักษร">
      {(p) => (
        <textarea
          {...p}
          rows={3}
          maxLength={200}
          className={textareaClass}
          value={value}
          placeholder="เช่น หมอลดยาเพราะความดันลดลง"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

/** The effective date is always today in M3 (owner decision, O4): shown as words, not editable. */
function TodayDate({ today }: { today: string }) {
  return (
    <div className={styles.cardBody}>
      <span className={styles.fieldTitle}>วันที่มีผล</span>
      <div className={styles.staticDate}>วันนี้ (วันที่ {thaiDateShort(today)})</div>
    </div>
  );
}

function AdjustForm({
  a,
  med,
  today,
  onCancel,
  onDone,
}: {
  a: Assignment;
  med: Medication;
  today: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { adjustDose } = useData();
  const headingRef = useFocusOnOpen();
  const [form, setForm] = useState<ScheduleForm>(() => scheduleToForm(a.schedule));
  const [reason, setReason] = useState<EventReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const problem = formProblem(form);
  const next = formToSchedule(form, today, a.schedule);
  const changed = next !== null && !sameSchedule(next, a.schedule);
  const hint = problem ?? (!changed ? 'ยังไม่ได้เปลี่ยนอะไร' : reason === null ? 'เลือกเหตุผลก่อนบันทึก' : null);

  const save = () => {
    if (hint !== null || next === null || reason === null) return;
    const res = adjustDose(a.id, { schedule: next, reason, ...(note.trim() ? { note } : {}) });
    if (res.ok) onDone();
    else setError(errorText(res.error));
  };

  return (
    <>
      <Card className={styles.formCard}>
        <div className={styles.cardBody}>
          <h2 className={styles.formTitle} tabIndex={-1} ref={headingRef}>
            ปรับโดส
          </h2>
          <p className={styles.formDesc}>ใช้เมื่อแพทย์หรือเภสัชกรสั่งเปลี่ยนวิธีทาน ระบบจะบันทึกเป็นประวัติให้</p>
        </div>
      </Card>
      <ScheduleEditor form={form} unit={med.unit} onChange={setForm} />
      <Card>
        <div className={styles.cardBody}>
          <InfoBox>
            <span className={styles.fromTo}>
              <b>จาก</b> {describeSchedule(a.schedule, med.unit, true)}
              <br />
              <b>เป็น</b> {next ? describeSchedule(next, med.unit, true) : 'ยังไม่ครบ'}
            </span>
          </InfoBox>
          <TodayDate today={today} />
          <ReasonField reason={reason} onChange={setReason} />
          <NoteField value={note} onChange={setNote} />
          {error && <InfoBox tone="error">{error}</InfoBox>}
          <Actions hint={hint} hintId="adjust-hint">
            <Button disabled={hint !== null} aria-describedby={hint ? 'adjust-hint' : undefined} onClick={save}>
              บันทึกการปรับโดส
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              ยกเลิก
            </Button>
          </Actions>
        </div>
      </Card>
    </>
  );
}

function StopForm({ a, today, onCancel, onDone }: { a: Assignment; today: string; onCancel: () => void; onDone: () => void }) {
  const { stopMedicine } = useData();
  const headingRef = useFocusOnOpen();
  const [reason, setReason] = useState<EventReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hint = reason === null ? 'เลือกเหตุผลก่อนบันทึก' : null;

  const save = () => {
    if (reason === null) return;
    const res = stopMedicine(a.id, { reason, ...(note.trim() ? { note } : {}) });
    if (res.ok) onDone();
    else setError(errorText(res.error));
  };

  return (
    <Card className={styles.formCard}>
      <div className={styles.cardBody}>
        <h2 className={styles.formTitle} tabIndex={-1} ref={headingRef}>
          หยุดยา
        </h2>
        <p className={styles.formDesc}>ยาจะไม่ขึ้นในรายการยาวันนี้และการแจ้งเตือน แต่ประวัติยังอยู่ให้แพทย์ดูได้</p>
        <TodayDate today={today} />
        <ReasonField reason={reason} onChange={setReason} />
        <NoteField value={note} onChange={setNote} />
        {error && <InfoBox tone="error">{error}</InfoBox>}
        <Actions hint={hint} hintId="stop-hint">
          <Button variant="danger" disabled={hint !== null} aria-describedby={hint ? 'stop-hint' : undefined} onClick={save}>
            ยืนยันหยุดยา
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            ยกเลิก
          </Button>
        </Actions>
      </div>
    </Card>
  );
}

/** '' = no count (null); a number in halves 0..9999; anything else 'bad'. */
function parseQty(text: string): number | null | 'bad' {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 9999 && Number.isInteger(n * 2) ? n : 'bad';
}

function EditForm({
  root,
  a,
  med,
  today,
  onCancel,
  onDone,
}: {
  root: Root;
  a: Assignment;
  med: Medication;
  today: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { editMedicine } = useData();
  const headingRef = useFocusOnOpen();
  const startQty = shownQty(root, a, today);
  const [name, setName] = useState(med.name);
  const [qty, setQty] = useState(startQty === null ? '' : String(startQty));
  const [expiry, setExpiry] = useState(a.expiry ?? '');
  const [note, setNote] = useState(a.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmShared, setConfirmShared] = useState(false);

  const cleanName = name.trim();
  const q = parseQty(qty);
  const sharedWith = root.assignments.filter((x) => x.medicationId === med.id).length; // O6: counted before saving
  const renamed = cleanName !== med.name;
  const changed =
    renamed || (q !== 'bad' && q !== startQty) || (expiry || null) !== (a.expiry ?? null) || (note.trim() || null) !== (a.note ?? null);
  const hint =
    cleanName.length < 2 || cleanName.length > 60
      ? 'ใส่ชื่อยา 2–60 ตัวอักษร'
      : q === 'bad'
        ? 'ใส่จำนวนที่เหลือเป็นตัวเลข 0 ถึง 9999 หรือเว้นว่างถ้าไม่นับสต๊อก'
        : !changed
          ? 'ยังไม่ได้เปลี่ยนอะไร'
          : null;

  const commit = () => {
    if (q === 'bad') return;
    const res = editMedicine(a.id, {
      name: cleanName,
      stockQty: q,
      expiry: expiry === '' ? null : expiry,
      note: note.trim() === '' ? null : note.trim(),
    });
    if (res.ok) onDone();
    else setError(errorText(res.error));
  };
  const save = () => {
    if (hint !== null) return;
    if (renamed && sharedWith > 1) setConfirmShared(true);
    else commit();
  };

  return (
    <>
      <Card className={styles.formCard}>
        <div className={styles.cardBody}>
          <h2 className={styles.formTitle} tabIndex={-1} ref={headingRef}>
            แก้ไขข้อมูลยา
          </h2>
          <p className={styles.formDesc}>
            แก้ข้อมูลทั่วไปของยา เช่น ชื่อ จำนวนที่เหลือ วันหมดอายุ (ถ้าเปลี่ยนวิธีทาน ให้ใช้ “ปรับโดส” เพื่อให้มีประวัติ)
          </p>
          <Field label="ชื่อยาและความแรง">
            {(p) => <input {...p} type="text" className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field
            label={`จำนวนที่เหลือ (${med.unit})`}
            hint="ใส่เลขใหม่ = นับใหม่ตั้งแต่วันนี้ เว้นว่าง = ไม่นับสต๊อก"
          >
            {(p) => (
              <input
                {...p}
                type="number"
                inputMode="decimal"
                min={0}
                max={9999}
                step={0.5}
                className={inputClass}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            )}
          </Field>
          <Field label="วันหมดอายุ" optional>
            {(p) => <input {...p} type="date" className={inputClass} value={expiry} onChange={(e) => setExpiry(e.target.value)} />}
          </Field>
          <Field label="บันทึกเพิ่มเติม" optional>
            {(p) => (
              <textarea
                {...p}
                rows={3}
                className={textareaClass}
                value={note}
                placeholder="เช่น ร้านที่ซื้อ ข้อควรระวัง"
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>
          {error && <InfoBox tone="error">{error}</InfoBox>}
          <Actions hint={hint} hintId="edit-hint">
            <Button disabled={hint !== null} aria-describedby={hint ? 'edit-hint' : undefined} onClick={save}>
              บันทึกข้อมูล
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              ยกเลิก
            </Button>
          </Actions>
        </div>
      </Card>
      {confirmShared && (
        <ConfirmDialog
          title="แก้ชื่อยาของทุกคน"
          confirmLabel="เปลี่ยนชื่อให้ทุกคน"
          onConfirm={() => {
            setConfirmShared(false);
            commit();
          }}
          onCancel={() => setConfirmShared(false)}
        >
          ยานี้ใช้อยู่ {sharedWith} คน การแก้ชื่อจะเปลี่ยนให้ทุกคน
        </ConfirmDialog>
      )}
    </>
  );
}
