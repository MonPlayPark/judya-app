// One form for "เพิ่มสมาชิก" (#/members/new) and "แก้ไขข้อมูลสมาชิก" (#/members/:id/edit), board EditDad (Q11).
// The edit form also has "นำสมาชิกออก" (with a confirm box) and, after that, "นำกลับ". Nothing is written to the phone
// until "บันทึก"; the data layer is the only thing that saves.
import { useRef, useState } from 'react';
import { errorText } from '../domain/errorText';
import { buddhistYear, checkBirthYear, MIN_BIRTH_YEAR_BE, nextPersonColor, type Relation } from '../domain/medicine';
import { COLOR_LABEL, findMember } from '../domain/memberView';
import { PERSON_COLORS, RELATIONS, type Person } from '../domain/schema';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ClearSampleDialog } from '../components/ClearSampleDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Actions, Chip, ChipGroup, Field, InfoBox, StepHeader, Switch, hintClass, inputClass, labelClass } from '../components/form';
import { CheckCircleIcon, CheckIcon } from '../components/icons';
import { href } from '../router';
import { useData, useRoot } from '../state/DataContext';
import { useToday } from '../state/useToday';
import { MemberNotFound } from './MemberDetail';
import styles from './MemberForm.module.css';

const go = (path: string) => {
  window.location.hash = href(path);
};
const memberPath = (id: string) => `/members/${encodeURIComponent(id)}`;

/** #/members/new */
export function NewMemberPage() {
  const root = useRoot();
  if (root.meta.isSample) return <SampleGate title="เพิ่มสมาชิก" backTo="/members" backLabel="กลับสมาชิกในบ้าน" />;
  return <MemberForm />;
}

/** #/members/:id/edit. A member who was taken out of the house (or an unknown id) is "ไม่พบสมาชิก", except right after
 * pressing "นำสมาชิกออก" here: then the page says it is done and offers "นำกลับ". */
export function EditMemberPage({ id }: { id: string }) {
  const root = useRoot();
  const [removed, setRemoved] = useState<{ name: string } | null>(null);
  if (removed) return <RemovedDone id={id} name={removed.name} onRestored={() => setRemoved(null)} />;
  if (root.meta.isSample) return <SampleGate title="แก้ไขข้อมูลสมาชิก" backTo={memberPath(id)} backLabel="กลับหน้าสมาชิก" />;
  const person = findMember(root, id);
  if (!person) return <MemberNotFound />;
  return <MemberForm key={person.id} person={person} onRemoved={(name) => setRemoved({ name })} />;
}

/** O5: nothing is added or changed on top of the sample. Ask first (same box as add medicine). */
function SampleGate({ title, backTo, backLabel }: { title: string; backTo: string; backLabel: string }) {
  return (
    <>
      <StepHeader title={title} backTo={backTo} backLabel={backLabel} />
      <ClearSampleDialog onCancel={() => go(backTo)} />
    </>
  );
}

function MemberForm({ person, onRemoved }: { person?: Person; onRemoved?: (name: string) => void }) {
  const root = useRoot();
  const { today } = useToday();
  const { addPerson, editPerson, removePerson } = useData();
  const yearRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(person?.name ?? '');
  const [relation, setRelation] = useState<Relation | null>(person?.relation ?? null);
  const [year, setYear] = useState(person?.birthYearBE === undefined ? '' : String(person.birthYearBE));
  const [yearTouched, setYearTouched] = useState(false);
  const [color, setColor] = useState<Person['color']>(person?.color ?? nextPersonColor(root));
  const [health, setHealth] = useState(person?.insurance.health ?? '');
  const [accident, setAccident] = useState(person?.insurance.accident ?? '');
  const [selfManaged, setSelfManaged] = useState(person?.selfManaged ?? false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [askClear, setAskClear] = useState(false);

  const trimmed = name.trim();
  const shownName = trimmed || 'สมาชิก';
  const hint = trimmed === '' ? 'ใส่ชื่อก่อน แล้วค่อยกดบันทึก' : relation === null ? 'เลือกว่าเป็นใครของเรา แล้วค่อยกดบันทึก' : null;
  const yearOk = checkBirthYear(year, today).ok;
  const yearError = yearTouched && !yearOk ? `ใส่ปี พ.ศ. 4 หลัก ตั้งแต่ ${MIN_BIRTH_YEAR_BE} ถึง ${buddhistYear(today)}` : undefined;

  const failed = (code: Parameters<typeof errorText>[0]) => {
    if (code === 'sample_present') setAskClear(true);
    else setError(errorText(code));
  };

  const save = () => {
    setYearTouched(true);
    if (hint !== null || relation === null) return;
    if (!yearOk) {
      yearRef.current?.focus();
      return;
    }
    const insurance = { health, accident };
    if (person) {
      const res = editPerson(person.id, { name: trimmed, relation, birthYearBE: year, color, insurance, selfManaged });
      if (res.ok) go(memberPath(person.id));
      else failed(res.error);
    } else {
      const res = addPerson({ name: trimmed, relation, birthYearBE: year, color, insurance, selfManaged });
      if (res.ok) go(memberPath(res.personId));
      else failed(res.error);
    }
  };

  const remove = () => {
    if (!person) return;
    const res = removePerson(person.id);
    setConfirmRemove(false);
    if (res.ok) onRemoved?.(person.name);
    else failed(res.error);
  };

  return (
    <>
      <StepHeader
        title={person ? 'แก้ไขข้อมูลสมาชิก' : 'เพิ่มสมาชิก'}
        backTo={person ? memberPath(person.id) : '/members'}
        backLabel={person ? 'กลับหน้าสมาชิก' : 'กลับสมาชิกในบ้าน'}
      />
      <div className={styles.body}>
        <Card>
          <div className={styles.cardBody}>
            <div className={styles.preview}>
              <Avatar name={trimmed} color={color} size="xxl" />
            </div>

            <Field label="ชื่อ">
              {(p) => <input {...p} type="text" className={inputClass} value={name} maxLength={40} autoComplete="off" onChange={(e) => setName(e.target.value)} />}
            </Field>

            <div className={styles.group}>
              <span className={labelClass}>ความสัมพันธ์</span>
              <ChipGroup label="ความสัมพันธ์">
                {RELATIONS.map((r) => (
                  <Chip key={r} on={relation === r} onClick={() => setRelation(r)}>
                    {r}
                  </Chip>
                ))}
              </ChipGroup>
            </div>

            <Field label="ปีเกิด (พ.ศ.)" {...(yearError ? { error: yearError } : {})}>
              {(p) => (
                <input
                  {...p}
                  ref={yearRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  className={inputClass}
                  value={year}
                  placeholder="เช่น 2510"
                  autoComplete="off"
                  aria-invalid={yearError ? true : undefined}
                  onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => setYearTouched(true)}
                />
              )}
            </Field>

            <div className={styles.group}>
              <span className={labelClass}>สีโปรไฟล์</span>
              <div role="radiogroup" aria-label="สีโปรไฟล์" className={styles.swatches}>
                {PERSON_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    className={`${styles.swatch} ${color === c ? styles.swatchOn : ''}`}
                    onClick={() => setColor(c)}
                  >
                    <Avatar name={trimmed} color={c} />
                    <span className={styles.swatchName}>
                      {color === c && <CheckIcon />}
                      {COLOR_LABEL[c]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className={styles.cardBody}>
            <h2 className={styles.sectionTitle}>ประกัน</h2>
            <Field label="ประกันสุขภาพ — ชื่อบริษัท">
              {(p) => (
                <input {...p} type="text" className={inputClass} value={health} maxLength={60} placeholder="ถ้าไม่มี ปล่อยว่างได้" autoComplete="off" onChange={(e) => setHealth(e.target.value)} />
              )}
            </Field>
            <Field label="ประกันอุบัติเหตุ — ชื่อบริษัท">
              {(p) => (
                <input {...p} type="text" className={inputClass} value={accident} maxLength={60} placeholder="ถ้าไม่มี ปล่อยว่างได้" autoComplete="off" onChange={(e) => setAccident(e.target.value)} />
              )}
            </Field>
          </div>
        </Card>

        <Card>
          <div className={styles.cardBody}>
            <Switch on={selfManaged} onChange={setSelfManaged}>
              จัดยาทานเอง
            </Switch>
            <p className={hintClass}>
              {selfManaged
                ? 'เปิดอยู่: ยาไม่อยู่ในรายการยาวันนี้ แต่แอพยังนับสต๊อกและเตือนเมื่อยาใกล้หมด'
                : `ปิดอยู่: ยาของ${shownName}อยู่ในรายการยาวันนี้ให้ผู้ดูแลจัด`}
            </p>
          </div>
        </Card>

        <div className={styles.saveBlock}>
          {error && <InfoBox tone="error">{error}</InfoBox>}
          <Actions hint={hint} hintId="member-save-hint">
            <Button disabled={hint !== null} aria-describedby={hint ? 'member-save-hint' : undefined} onClick={save}>
              บันทึก
            </Button>
          </Actions>
        </div>

        {person && (
          <Button variant="dangerOutline" onClick={() => setConfirmRemove(true)}>
            นำสมาชิกออก
          </Button>
        )}
      </div>

      {confirmRemove && person && (
        <ConfirmDialog
          title={`นำ${person.name}ออกจากบ้าน?`}
          confirmLabel="นำออก"
          onConfirm={remove}
          onCancel={() => setConfirmRemove(false)}
        >
          ยาและประวัติของ{person.name}จะถูกซ่อนไว้ และนำกลับได้ภายหลังจากรายการ นำกลับ
        </ConfirmDialog>
      )}
      {askClear && <ClearSampleDialog onCancel={() => setAskClear(false)} />}
    </>
  );
}

/** After "นำออก": done, with "นำกลับ" and a way back to the list (board EditDad, removed state). */
function RemovedDone({ id, name, onRestored }: { id: string; name: string; onRestored: () => void }) {
  const { restorePerson } = useData();
  const [error, setError] = useState<string | null>(null);
  const [askClear, setAskClear] = useState(false);

  const restore = () => {
    const res = restorePerson(id);
    if (res.ok) onRestored();
    else if (res.error === 'sample_present') setAskClear(true);
    else setError(errorText(res.error));
  };

  return (
    <>
      <StepHeader title="แก้ไขข้อมูลสมาชิก" backTo="/members" backLabel="กลับสมาชิกในบ้าน" />
      <div className={styles.body}>
        <Card>
          <div className={styles.cardBody}>
            <div className={styles.doneHead}>
              <CheckCircleIcon />
              <h2 className={styles.sectionTitle}>นำ{name}ออกแล้ว</h2>
            </div>
            <p className={hintClass}>ยาและประวัติของ{name}ถูกซ่อนไว้ นำกลับได้</p>
            {error && <InfoBox tone="error">{error}</InfoBox>}
            <Button onClick={restore}>นำกลับ</Button>
            <a className={styles.backLink} href={href('/members')}>
              กลับไปสมาชิกในบ้าน
            </a>
          </div>
        </Card>
      </div>
      {askClear && <ClearSampleDialog onCancel={() => setAskClear(false)} />}
    </>
  );
}
