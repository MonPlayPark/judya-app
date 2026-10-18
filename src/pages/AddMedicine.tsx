// Add medicine, 3 steps (BRIEF S4 / S5 / S5b). The half-filled form is kept in memory (DraftContext); nothing is
// written to the phone until the last step is saved through the data layer.
import { useEffect, useState } from 'react';
import { errorText } from '../domain/errorText';
import { findMedicationByName } from '../domain/medicine';
import { describeSchedule, formProblem, formToSchedule, summaryLines } from '../domain/scheduleForm';
import { houseSuggestions } from '../domain/suggest';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CheckCircleIcon, PillIcon } from '../components/icons';
import { ClearSampleDialog } from '../components/ClearSampleDialog';
import { Actions, AddChip, Chip, ChipGroup, Field, InfoBox, StepHeader, inputClass } from '../components/form';
import { MedicineNameField } from '../components/MedicineNameField';
import { QuickAddMember } from '../components/QuickAddMember';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { href, useRoute } from '../router';
import { useData, useRoot } from '../state/DataContext';
import { hasStarted, useDraft } from '../state/DraftContext';
import { useToday } from '../state/useToday';
import styles from './AddMedicine.module.css';

const go = (path: string) => {
  window.location.hash = href(path);
};

const UNIT_CHIPS = ['เม็ด', 'แคปซูล', 'ซอง', 'มล.', 'ขวด', 'หลอด', 'แผง', 'กล่อง'];
const TOTAL_STEPS = 3;

/** A refresh empties the in-memory form: say so politely and offer the first step (never a blank page). */
function DraftLost() {
  return (
    <>
      <StepHeader title="เพิ่มยา" backTo="/meds" backLabel="กลับหน้ายาทั้งหมด" />
      <div className={styles.body}>
        <Card>
          <div className={styles.cardBody}>
            <InfoBox>ข้อมูลที่กรอกไว้หายไปเพราะเปิดหน้านี้ใหม่ ขอเริ่มจากขั้นแรกอีกครั้งนะคะ</InfoBox>
            <Button onClick={() => go('/meds/new')}>ไปขั้นแรก</Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function MedHead({ name, who, sub }: { name: string; who: string; sub?: string }) {
  return (
    <Card>
      <div className={styles.medHead}>
        <span className={styles.medHeadIcon} aria-hidden="true">
          <PillIcon />
        </span>
        <div>
          <div className={styles.medHeadName}>{name}</div>
          <div className={styles.medHeadSub}>ของ {who}</div>
          {sub && <div className={styles.medHeadSub}>{sub}</div>}
        </div>
      </div>
    </Card>
  );
}

// ---------- step 1: name + owner ----------

export function AddMedicineStep1() {
  const root = useRoot();
  const { draft, update, clearSaved } = useDraft();
  const { query } = useRoute();
  const [adding, setAdding] = useState(false);

  useEffect(() => clearSaved(), [clearSaved]);

  // O5: real data cannot be added on top of the sample. Ask first, never clear silently.
  if (root.meta.isSample) {
    return (
      <>
        <StepHeader title="เพิ่มยา" sub={`ขั้น 1 จาก ${TOTAL_STEPS}`} backTo="/meds" backLabel="กลับหน้ายาทั้งหมด" />
        <ClearSampleDialog onCancel={() => go('/meds')} />
      </>
    );
  }

  const members = root.persons.filter((p) => p.removedAt === undefined);
  const isMember = (id: string | null): id is string => id !== null && members.some((p) => p.id === id);
  const requested = query.get('member');
  const firstMember = members[0];
  const ownerId = isMember(draft.personId)
    ? draft.personId
    : isMember(requested)
      ? requested
      : members.length === 1 && firstMember
        ? firstMember.id
        : null;
  const showForm = adding || members.length === 0;

  const name = draft.name.trim();
  const nameOk = name.length >= 2 && name.length <= 60;
  const existing = nameOk ? findMedicationByName(root, name) : undefined;
  const owner = members.find((p) => p.id === ownerId);
  const alreadyHas =
    existing !== undefined &&
    ownerId !== null &&
    root.assignments.some((a) => a.personId === ownerId && a.medicationId === existing.id && a.status === 'active');
  const users = existing ? root.assignments.filter((a) => a.medicationId === existing.id).length : 0;

  const hint = !nameOk
    ? 'ใส่ชื่อยาก่อน แล้วค่อยกดถัดไป'
    : ownerId === null
      ? 'เลือกว่ายานี้ของใคร'
      : alreadyHas
        ? errorText('duplicate')
        : null;

  const next = () => {
    if (hint !== null || ownerId === null) return;
    update({ name, personId: ownerId });
    go('/meds/new/schedule');
  };

  return (
    <>
      <StepHeader title="เพิ่มยา" sub={`ขั้น 1 จาก ${TOTAL_STEPS}`} backTo="/meds" backLabel="กลับหน้ายาทั้งหมด" />
      <div className={styles.body}>
        <section className={styles.section}>
          <MedicineNameField value={draft.name} onChange={(v) => update({ name: v })} source={houseSuggestions(root)} />
          {nameOk && <InfoBox>ตรวจชื่อกับซองยาก่อนบันทึก ขนาดยาและวิธีกินให้กรอกเองในขั้นถัดไป</InfoBox>}
          {existing && (
            <InfoBox tone="warn">
              ยานี้มีในบ้านแล้ว ใช้อยู่ {users} คน จะใช้ชื่อและหน่วย “{existing.unit}” เดิมร่วมกัน สต๊อกแยกตามคน
            </InfoBox>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>ยานี้ของใคร</h2>
          {members.length === 0 ? (
            <InfoBox>ยังไม่มีสมาชิกในบ้าน เพิ่มสมาชิกคนแรกก่อน แล้วค่อยเลือกว่ายานี้ของใคร</InfoBox>
          ) : (
            <ChipGroup label="ยานี้ของใคร">
              {members.map((p) => (
                <Chip key={p.id} on={p.id === ownerId} onClick={() => update({ personId: p.id })}>
                  {p.name}
                </Chip>
              ))}
              {!showForm && <AddChip onClick={() => setAdding(true)}>เพิ่มสมาชิก</AddChip>}
            </ChipGroup>
          )}
          {owner && <InfoBox>ยาของสมาชิกจะนับสต๊อกและเตือนเมื่อใกล้หมด</InfoBox>}
          {showForm && (
            <QuickAddMember
              onAdded={(id) => {
                update({ personId: id });
                setAdding(false);
              }}
              {...(members.length > 0 ? { onCancel: () => setAdding(false) } : {})}
            />
          )}
        </section>

        <Actions hint={hint} hintId="step1-hint">
          <Button disabled={hint !== null} aria-describedby={hint ? 'step1-hint' : undefined} onClick={next}>
            ถัดไป
          </Button>
        </Actions>
      </div>
    </>
  );
}

// ---------- step 2: how to take it ----------

export function AddMedicineStep2() {
  const root = useRoot();
  const { draft, update } = useDraft();
  if (!hasStarted(draft)) return <DraftLost />;

  const who = root.persons.find((p) => p.id === draft.personId)?.name ?? '';
  const unit = findMedicationByName(root, draft.name)?.unit ?? draft.unit;
  const problem = formProblem(draft.form);
  const lines = summaryLines(draft.form, unit);

  return (
    <>
      <StepHeader title="ตั้งวิธีกิน" sub={`ขั้น 2 จาก ${TOTAL_STEPS}`} backTo="/meds/new" backLabel="กลับไปขั้นที่ 1" />
      <div className={styles.body}>
        <MedHead name={draft.name} who={who} />
        <ScheduleEditor form={draft.form} unit={unit} onChange={(form) => update({ form })} />

        <Card>
          <h2 className={styles.summaryTitle}>สรุป</h2>
          {lines.map((l) => (
            <div key={l} className={styles.summaryLine}>
              {l}
            </div>
          ))}
          {lines.length === 0 && <p className={styles.summaryEmpty}>{problem}</p>}
        </Card>

        <InfoBox>ใส่ตามที่แพทย์หรือเภสัชกรสั่ง ถ้าไม่แน่ใจให้ถามก่อน</InfoBox>

        <Actions hint={problem} hintId="step2-hint">
          <Button disabled={problem !== null} aria-describedby={problem ? 'step2-hint' : undefined} onClick={() => go('/meds/new/stock')}>
            ถัดไป
          </Button>
        </Actions>
      </div>
    </>
  );
}

// ---------- step 3: how many you have + unit + expiry ----------

/** '' = not counted (undefined); a number 0..9999 in halves; anything else = 'bad'. */
function parseQty(text: string): number | undefined | 'bad' {
  const t = text.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 9999 && Number.isInteger(n * 2) ? n : 'bad';
}

export function AddMedicineStep3() {
  const root = useRoot();
  const { addMedicine } = useData();
  const { draft, update, saved, finish, reset } = useDraft();
  const { today } = useToday();
  const [error, setError] = useState<string | null>(null);

  if (saved) {
    return (
      <>
        <StepHeader title="เพิ่มยา" backTo="/meds" backLabel="กลับหน้ายาทั้งหมด" />
        <div className={styles.body}>
          <Card>
            <div className={styles.cardBody}>
              <div className={styles.doneTitle}>
                <CheckCircleIcon />
                <h2>เพิ่มยาแล้ว</h2>
              </div>
              <div>
                <div className={styles.doneLine}>
                  <strong>{saved.name}</strong>
                </div>
                <div className={styles.doneLine}>ของ {saved.who}</div>
                {saved.lines.map((l) => (
                  <div key={l} className={styles.doneLine}>
                    {l}
                  </div>
                ))}
              </div>
              <a className={styles.linkPrimary} href={href('/meds')} onClick={reset}>
                ไปที่ยาทั้งหมด
              </a>
              <a className={styles.linkSecondary} href={href('/meds/new')} onClick={reset}>
                เพิ่มยาอีกตัว
              </a>
            </div>
          </Card>
        </div>
      </>
    );
  }
  if (!hasStarted(draft) || formProblem(draft.form) !== null) return <DraftLost />;

  const existing = findMedicationByName(root, draft.name);
  const unit = existing ? existing.unit : draft.unit.trim();
  const who = root.persons.find((p) => p.id === draft.personId)?.name ?? '';
  const qty = parseQty(draft.qty);
  const hint =
    unit === '' ? 'เลือกหรือพิมพ์หน่วยนับของยา' : qty === 'bad' ? 'ใส่จำนวนเป็นตัวเลข 0 ถึง 9999 ใส่ครึ่งหน่วยได้ เช่น 10.5' : null;
  const schedule = formToSchedule(draft.form, today);

  const save = () => {
    if (hint !== null || qty === 'bad' || draft.personId === null || schedule === null) return;
    const res = addMedicine({
      personId: draft.personId,
      name: draft.name.trim(),
      unit,
      schedule,
      ...(qty === undefined ? {} : { stockQty: qty }),
      ...(draft.expiry === '' ? {} : { expiry: draft.expiry }),
    });
    if (res.ok) {
      setError(null);
      finish({ name: draft.name.trim(), who, lines: summaryLines(draft.form, unit) });
    } else {
      setError(errorText(res.error));
    }
  };

  return (
    <>
      <StepHeader title="จำนวนที่มี" sub={`ขั้น 3 จาก ${TOTAL_STEPS}`} backTo="/meds/new/schedule" backLabel="กลับไปขั้นที่ 2" />
      <div className={styles.body}>
        <MedHead name={draft.name} who={who} {...(schedule ? { sub: describeSchedule(schedule, unit, true) } : {})} />
        <Card>
          <div className={styles.cardBody}>
            <Field
              label="จำนวนที่มี"
              optional
              hint="ไม่ใส่ก็ได้ แต่ถ้าไม่ใส่ แอปจะไม่นับสต๊อกและไม่เตือนให้ซื้อเติม"
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
                  value={draft.qty}
                  placeholder="เช่น 20"
                  onChange={(e) => update({ qty: e.target.value })}
                />
              )}
            </Field>

            <div className={styles.units}>
              <span className={styles.unitLabel} id="unit-label">
                หน่วยนับ
              </span>
              {existing ? (
                <>
                  <div className={styles.lockedUnit} aria-labelledby="unit-label">
                    {existing.unit}
                  </div>
                  <InfoBox>ยานี้มีในบ้านแล้ว จึงใช้หน่วย “{existing.unit}” ตามของเดิม แก้หน่วยไม่ได้</InfoBox>
                </>
              ) : (
                <>
                  <ChipGroup label="หน่วยนับ" role="group">
                    {UNIT_CHIPS.map((u) => (
                      <Chip key={u} role="toggle" on={unit === u} onClick={() => update({ unit: u })}>
                        {u}
                      </Chip>
                    ))}
                  </ChipGroup>
                  <Field label="หรือพิมพ์หน่วยเอง">
                    {(p) => (
                      <input
                        {...p}
                        type="text"
                        maxLength={12}
                        className={inputClass}
                        value={draft.unit}
                        placeholder="เช่น ถุง"
                        onChange={(e) => update({ unit: e.target.value })}
                      />
                    )}
                  </Field>
                </>
              )}
            </div>

            <Field
              label="วันหมดอายุ"
              optional
              hint={`ใส่แล้วแอปจะเตือนก่อนหมดอายุ ${root.settings.expiryWarnDays} วัน`}
            >
              {(p) => <input {...p} type="date" className={inputClass} value={draft.expiry} onChange={(e) => update({ expiry: e.target.value })} />}
            </Field>
          </div>
        </Card>

        {error && <InfoBox tone="error">{error}</InfoBox>}
        <Actions hint={hint} hintId="step3-hint">
          <Button disabled={hint !== null} aria-describedby={hint ? 'step3-hint' : undefined} onClick={save}>
            บันทึกยา
          </Button>
        </Actions>
      </div>
    </>
  );
}
