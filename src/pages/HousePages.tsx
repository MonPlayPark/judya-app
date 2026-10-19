// House medicines (step 3.3a): add (#/house/new) and edit / cut stock / delete / bring back (#/house/:id), boards AddHouse
// and EditHouse*. One form for both. Nothing is written until "บันทึก" (cutting stock and deleting save at once, like the board).
// Hidden until step 3.3b: the section "ราคาตามร้าน".
import { useState, type ReactNode } from 'react';
import { errorText } from '../domain/errorText';
import { validateHouseItem, type HouseField, type HouseFieldError } from '../domain/house';
import { HOUSE_UNIT_CHIPS, blankHouseForm, houseFormFromItem, houseFormToInput, type HouseForm } from '../domain/houseForm';
import { houseNotices } from '../domain/houseView';
import type { HouseItem } from '../domain/schema';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ClearSampleDialog } from '../components/ClearSampleDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Actions, Chip, ChipGroup, Field, InfoBox, Stepper, StepHeader, inputClass, textareaClass } from '../components/form';
import { CheckCircleIcon } from '../components/icons';
import { href } from '../router';
import { useData, useRoot } from '../state/DataContext';
import { useToday } from '../state/useToday';
import styles from './HousePages.module.css';

const LIST = '/meds?tab=house';
const go = (path: string) => {
  window.location.hash = href(path);
};

type Errors = Partial<Record<HouseField, HouseFieldError>>;

/** The sentence under the save button while it is off. Name and unit use the board's words; the other fields show their own message. */
function saveHint(errors: Errors): string | null {
  if (errors.name) return 'พิมพ์ชื่อยาอย่างน้อย 2 ตัวอักษรเพื่อบันทึก';
  if (errors.unit) return 'เลือกหรือพิมพ์หน่วยนับของจำนวนคงเหลือ';
  if (errors.qty || errors.lowAt || errors.expiry) return 'แก้ช่องที่มีข้อความเตือนก่อน แล้วค่อยกดบันทึก';
  return null;
}

/** Name, quantity, unit, [extra, e.g. cutting], warn level, expiry, note - in the order of the board. */
function Fields({
  form,
  onChange,
  errors,
  afterUnit,
  warnDays,
}: {
  form: HouseForm;
  onChange: (patch: Partial<HouseForm>) => void;
  errors: Errors;
  afterUnit?: ReactNode;
  warnDays: number;
}) {
  const unit = form.unit.trim();
  return (
    <div className={styles.cardBody}>
      <Field label="ชื่อยา">
        {(p) => (
          <input
            {...p}
            type="text"
            className={inputClass}
            value={form.name}
            maxLength={60}
            placeholder="เช่น พาราเซตามอล 500 mg"
            autoComplete="off"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        )}
      </Field>

      <Field
        label="จำนวนคงเหลือ"
        optional
        hint="ไม่ใส่ก็ได้ แต่ถ้าไม่ใส่ แอปจะไม่นับสต๊อกและไม่เตือนให้ซื้อเติม"
        {...(errors.qty ? { error: errorText(errors.qty) } : {})}
      >
        {(p) => (
          <input
            {...p}
            type="number"
            inputMode="numeric"
            min={0}
            className={inputClass}
            value={form.stock}
            placeholder="เช่น 20"
            aria-invalid={errors.qty ? true : undefined}
            onChange={(e) => onChange({ stock: e.target.value })}
          />
        )}
      </Field>

      <div className={styles.group}>
        <ChipGroup label="หน่วยนับของจำนวนคงเหลือ">
          {HOUSE_UNIT_CHIPS.map((u) => (
            <Chip key={u} on={unit === u} onClick={() => onChange({ unit: u })}>
              {u}
            </Chip>
          ))}
        </ChipGroup>
        <Field label="หรือพิมพ์หน่วยเอง" {...(errors.unit ? { error: errorText(errors.unit) } : {})}>
          {(p) => (
            <input
              {...p}
              type="text"
              className={inputClass}
              maxLength={12}
              value={form.unit}
              placeholder="เช่น ถุง"
              autoComplete="off"
              aria-invalid={errors.unit ? true : undefined}
              onChange={(e) => onChange({ unit: e.target.value })}
            />
          )}
        </Field>
      </div>

      {afterUnit}

      <Field
        label="เตือนเมื่อเหลือไม่เกิน"
        optional
        hint="ไม่ใส่ = ไม่เตือนใกล้หมด (ต้องใส่จำนวนคงเหลือด้วย)"
        {...(errors.lowAt ? { error: errorText(errors.lowAt) } : {})}
      >
        {(p) => (
          <input
            {...p}
            type="number"
            inputMode="numeric"
            min={0}
            className={inputClass}
            value={form.lowAt}
            placeholder="เช่น 10"
            aria-invalid={errors.lowAt ? true : undefined}
            onChange={(e) => onChange({ lowAt: e.target.value })}
          />
        )}
      </Field>

      <Field
        label="วันหมดอายุ"
        optional
        hint={`ใส่แล้วแอปจะเตือนก่อนหมดอายุ ${warnDays} วัน ตามเกณฑ์ในตั้งค่า`}
        {...(errors.expiry ? { error: errorText(errors.expiry) } : {})}
      >
        {(p) => <input {...p} type="date" className={inputClass} value={form.expiry} onChange={(e) => onChange({ expiry: e.target.value })} />}
      </Field>

      <Field label="บันทึกเพิ่มเติม" optional>
        {(p) => (
          <textarea
            {...p}
            rows={3}
            className={textareaClass}
            value={form.note}
            placeholder="เช่น เก็บไว้ที่ตู้ยาชั้นล่าง"
            onChange={(e) => onChange({ note: e.target.value })}
          />
        )}
      </Field>
    </div>
  );
}

const checkErrors = (form: HouseForm): Errors => {
  const r = validateHouseItem(houseFormToInput(form));
  return r.ok ? {} : r.errors;
};

// ---------- add ----------

/** #/house/new. With sample data in the house it first asks to clear the sample (O5). */
export function AddHousePage() {
  const root = useRoot();
  if (root.meta.isSample) {
    return (
      <>
        <StepHeader title="เพิ่มยาสามัญประจำบ้าน" backTo={LIST} backLabel="กลับหน้ายา" />
        <ClearSampleDialog onCancel={() => go(LIST)} />
      </>
    );
  }
  return <AddForm />;
}

function AddForm() {
  const root = useRoot();
  const { addHouseItem } = useData();
  const [form, setForm] = useState<HouseForm>(blankHouseForm);
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const errors = checkErrors(form);
  const hint = saveHint(errors);
  const change = (patch: Partial<HouseForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setAdded(null);
    setError(null);
  };

  const save = () => {
    if (hint !== null) return;
    const res = addHouseItem(houseFormToInput(form));
    if (res.ok) {
      setAdded(form.name.trim());
      setForm(blankHouseForm());
      setError(null);
    } else setError(errorText(res.error));
  };

  return (
    <>
      <StepHeader title="เพิ่มยาสามัญประจำบ้าน" backTo={LIST} backLabel="กลับหน้ายา" />
      <div className={styles.body}>
        {added && <InfoBox tone="ok">เพิ่ม {added} แล้ว</InfoBox>}
        <p className={styles.lead}>ใช้ร่วมกันทุกคนในบ้าน ไม่มีเวลากินและไม่ต้องติ๊กจัดยา</p>
        <Card>
          <Fields form={form} onChange={change} errors={errors} warnDays={root.settings.expiryWarnDays} />
        </Card>
        <div className={styles.saveBlock}>
          {error && <InfoBox tone="error">{error}</InfoBox>}
          <Actions hint={hint} hintId="house-save-hint">
            <Button disabled={hint !== null} aria-describedby={hint ? 'house-save-hint' : undefined} onClick={save}>
              บันทึก
            </Button>
          </Actions>
        </div>
      </div>
    </>
  );
}

// ---------- edit ----------

/** #/house/:id. A hidden item shows the "ลบแล้ว / นำกลับ" card; an unknown id is "ไม่พบยาสามัญ". */
export function EditHousePage({ id }: { id: string }) {
  const root = useRoot();
  const item = root.houseItems.find((h) => h.id === id);
  if (!item) return <HouseNotFound />;
  if (item.removedAt !== undefined) return <RemovedCard item={item} />;
  return <EditForm key={item.id} item={item} />;
}

function HouseNotFound() {
  return (
    <>
      <StepHeader title="แก้ไขยาสามัญประจำบ้าน" backTo={LIST} backLabel="กลับหน้ายา" />
      <div className={styles.body}>
        <Card>
          <div className={styles.cardBody}>
            <InfoBox>ไม่พบยาสามัญตัวนี้ อาจไม่อยู่ในรายการแล้ว หรือลิงก์ไม่ถูกต้อง</InfoBox>
            <Button onClick={() => go(LIST)}>กลับไปหน้ายา</Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function EditForm({ item }: { item: HouseItem }) {
  const root = useRoot();
  const { today } = useToday();
  const { editHouseItem, removeHouseItem } = useData();
  const [form, setForm] = useState<HouseForm>(() => houseFormFromItem(item));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const errors = checkErrors(form);
  const hint = saveHint(errors);
  const notices = houseNotices(item, today, root.settings.expiryWarnDays);
  const change = (patch: Partial<HouseForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
    setError(null);
  };

  const save = () => {
    if (hint !== null) return;
    const res = editHouseItem(item.id, houseFormToInput(form));
    if (res.ok) {
      setSaved(true);
      setError(null);
    } else {
      setSaved(false);
      setError(errorText(res.error));
    }
  };

  const remove = () => {
    const res = removeHouseItem(item.id);
    setConfirmRemove(false);
    if (!res.ok) setError(errorText(res.error)); // on success the page turns into the "ลบแล้ว" card by itself
  };

  return (
    <>
      <StepHeader title="แก้ไขยาสามัญประจำบ้าน" backTo={LIST} backLabel="กลับหน้ายา" />
      <div className={styles.body}>
        {notices.map((n) => (
          <InfoBox key={n.title} tone={n.tone}>
            <strong className={styles.noticeTitle}>{n.title}</strong> {n.detail}
          </InfoBox>
        ))}
        <Card>
          <Fields
            form={form}
            onChange={change}
            errors={errors}
            warnDays={root.settings.expiryWarnDays}
            afterUnit={<CutBox item={item} onCut={(left) => setForm((f) => ({ ...f, stock: String(left) }))} />}
          />
        </Card>
        <div className={styles.saveBlock}>
          {error && <InfoBox tone="error">{error}</InfoBox>}
          <Actions hint={hint} hintId="house-save-hint">
            <Button disabled={hint !== null} aria-describedby={hint ? 'house-save-hint' : undefined} onClick={save}>
              บันทึก
            </Button>
          </Actions>
          {saved && <InfoBox tone="ok">บันทึกแล้ว</InfoBox>}
        </div>
        <Button variant="dangerOutline" onClick={() => setConfirmRemove(true)}>
          ลบยานี้
        </Button>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title={`ลบ ${item.name} ออกจากยาสามัญประจำบ้าน?`}
          confirmLabel="ลบ"
          onConfirm={remove}
          onCancel={() => setConfirmRemove(false)}
        >
          ยานี้จะหายจากรายการและไม่มีเตือนอีก ถ้ากดผิด กดนำกลับได้ทันทีหลังลบ
        </ConfirmDialog>
      )}
    </>
  );
}

/** "ใช้ยาไป ตัดจำนวนออก". Works on the quantity that is SAVED (shown in the box), saves at once, and then puts the new
 * quantity into the quantity box above. More than is left is a warning and nothing changes. */
function CutBox({ item, onCut }: { item: HouseItem; onCut: (left: number) => void }) {
  const { cutHouseStock } = useData();
  const [use, setUse] = useState(1);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const stock = item.stock;
  const off = !stock ? 'ใส่จำนวนคงเหลือก่อน จึงตัดจำนวนได้' : stock.qty === 0 ? 'ไม่มีของเหลือให้ตัดแล้ว' : null;
  const unit = stock?.unit ?? '';

  const step = (next: number) => {
    setUse(next);
    setMsg(null);
  };
  const cut = () => {
    if (!stock) return;
    const res = cutHouseStock(item.id, use);
    if (res.ok) {
      setMsg({ tone: 'ok', text: `ตัดออก ${use} ${unit} แล้ว เหลือ ${res.left} ${unit}` });
      onCut(res.left);
    } else if (res.error === 'cut_over_stock') {
      setMsg({ tone: 'warn', text: `ตัดไม่ได้ จะตัด ${use} ${unit} แต่เหลือแค่ ${stock.qty} ${unit} จำนวนยังเท่าเดิม ลดจำนวนที่ตัดแล้วลองใหม่` });
    } else {
      setMsg({ tone: 'error', text: errorText(res.error) });
    }
  };

  return (
    <div className={styles.cutBox}>
      <Stepper
        title="ใช้ยาไป ตัดจำนวนออก"
        label="จำนวนที่ใช้"
        text={String(use)}
        canMinus={use > 1}
        canPlus={use < 999}
        onMinus={() => step(Math.max(1, use - 1))}
        onPlus={() => step(Math.min(999, use + 1))}
      />
      {stock && (
        <p className={styles.cutLeft}>
          เหลือในแอปตอนนี้ {stock.qty} {stock.unit}
        </p>
      )}
      <Button variant="secondary" disabled={off !== null} aria-describedby={off ? 'house-cut-hint' : undefined} onClick={cut}>
        ตัดออก {use} {unit}
      </Button>
      {off && (
        <p id="house-cut-hint" className={styles.cutLeft}>
          {off}
        </p>
      )}
      {msg && <InfoBox tone={msg.tone}>{msg.text}</InfoBox>}
    </div>
  );
}

/** After "ลบ" (or when the link points at a hidden item): done, with "นำกลับ" and a way back to the list. */
function RemovedCard({ item }: { item: HouseItem }) {
  const { restoreHouseItem } = useData();
  const [error, setError] = useState<string | null>(null);
  const restore = () => {
    const res = restoreHouseItem(item.id);
    if (!res.ok) setError(errorText(res.error)); // on success the page turns back into the form by itself
  };
  return (
    <>
      <StepHeader title="แก้ไขยาสามัญประจำบ้าน" backTo={LIST} backLabel="กลับหน้ายา" />
      <div className={styles.body}>
        <Card>
          <div className={styles.cardBody}>
            <div className={styles.doneHead}>
              <CheckCircleIcon />
              <h2 className={styles.sectionTitle}>ลบ {item.name} แล้ว</h2>
            </div>
            {error && <InfoBox tone="error">{error}</InfoBox>}
            <Button onClick={restore}>นำกลับ</Button>
            <a className={styles.backLink} href={href(LIST)}>
              กลับไปหน้ายา
            </a>
          </div>
        </Card>
      </div>
    </>
  );
}
