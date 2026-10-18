// The "how to take it" editor. One component for add-medicine step 2 and for the adjust-dose form, so both
// behave the same. It only edits a ScheduleForm; turning it into a Schedule is domain/scheduleForm.ts.
import { useId } from 'react';
import { formatPills } from '../domain/format';
import {
  DAY_FULL,
  EVERY_HOURS,
  MEAL_LABEL,
  MEAL_TIMINGS,
  SLOT_IDS,
  SLOT_LABEL,
  intervalPreview,
  type ScheduleForm,
} from '../domain/scheduleForm';
import { Card } from './Card';
import { Chip, ChipGroup, InfoBox, Stepper, inputClass, labelClass } from './form';
import { CheckIcon } from './icons';
import styles from './ScheduleEditor.module.css';

const MODES = [
  { id: 'meal', title: 'ตามมื้ออาหาร', sub: 'เช้า กลางวัน เย็น ก่อนนอน' },
  { id: 'interval', title: 'ทุกกี่ชั่วโมง', sub: 'เช่น ทุก 12 ชั่วโมง' },
] as const;

const FREQS = [
  { id: 'daily', label: 'ทุกวัน' },
  { id: 'alt', label: 'วันเว้นวัน' },
  { id: 'days', label: 'เลือกวัน' },
] as const;

const stepPills = (v: number, dir: 1 | -1): number => Math.min(4, Math.max(0.5, v + dir * 0.5));

export function ScheduleEditor({ form, onChange, unit }: { form: ScheduleForm; onChange: (next: ScheduleForm) => void; unit: string }) {
  const set = (patch: Partial<ScheduleForm>) => onChange({ ...form, ...patch });
  const timeId = useId();
  const preview = intervalPreview(form);

  return (
    <div className={styles.stack}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle} id={`${timeId}-mode`}>
          ทานแบบไหน
        </h2>
        <div role="radiogroup" aria-labelledby={`${timeId}-mode`} className={styles.modes}>
          {MODES.map((m) => {
            const on = form.mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`${styles.mode} ${on ? styles.modeOn : ''}`}
                onClick={() => set({ mode: m.id })}
              >
                <span className={styles.modeText}>
                  <span className={styles.modeTitle}>{m.title}</span>
                  <span className={styles.modeSub}>{m.sub}</span>
                </span>
                {on && (
                  <span className={styles.modeTick}>
                    <CheckIcon />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {form.mode === 'meal' ? (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              ทานตอนไหน <span className={styles.sectionHint}>เลือกได้หลายช่วง</span>
            </h2>
            <ChipGroup label="ทานตอนไหน" role="group">
              {SLOT_IDS.map((id) => (
                <Chip key={id} role="checkbox" on={form.slots[id]} onClick={() => set({ slots: { ...form.slots, [id]: !form.slots[id] } })}>
                  {SLOT_LABEL[id]}
                </Chip>
              ))}
            </ChipGroup>
          </section>

          {SLOT_IDS.filter((id) => form.slots[id]).map((id) => (
            <Card key={id}>
              <div className={styles.cardBody}>
                <h2 className={styles.sectionTitle}>{SLOT_LABEL[id]}</h2>
                {id !== 'bedtime' && (
                  <ChipGroup label={`${SLOT_LABEL[id]} เกี่ยวกับอาหาร`}>
                    {MEAL_TIMINGS.map((t) => (
                      <Chip key={t} on={form.meal[id] === t} onClick={() => set({ meal: { ...form.meal, [id]: t } })}>
                        {MEAL_LABEL[t]}
                      </Chip>
                    ))}
                  </ChipGroup>
                )}
                <Stepper
                  title="จำนวนที่ทาน"
                  label={`จำนวนที่ทาน${SLOT_LABEL[id]}`}
                  text={formatPills(form.pills[id], unit)}
                  canMinus={form.pills[id] - 0.5 >= 0.5}
                  canPlus={form.pills[id] + 0.5 <= 4}
                  onMinus={() => set({ pills: { ...form.pills, [id]: stepPills(form.pills[id], -1) } })}
                  onPlus={() => set({ pills: { ...form.pills, [id]: stepPills(form.pills[id], 1) } })}
                />
              </div>
            </Card>
          ))}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>ความถี่</h2>
            <ChipGroup label="ความถี่">
              {FREQS.map((f) => (
                <Chip key={f.id} on={form.freq === f.id} onClick={() => set({ freq: f.id })}>
                  {f.label}
                </Chip>
              ))}
            </ChipGroup>
            {form.freq === 'alt' && <InfoBox>วันเว้นวัน นับวันนี้เป็นวันแรกที่ทาน แล้วเว้นไปอีก 1 วัน</InfoBox>}
            {form.freq === 'days' && (
              <>
                <span className={styles.subTitle}>ทานวันไหนบ้าง</span>
                <ChipGroup label="วันที่ทาน" role="group">
                  {DAY_FULL.map((name, i) => {
                    const on = form.days.includes(i);
                    return (
                      <Chip
                        key={name}
                        role="checkbox"
                        on={on}
                        onClick={() => set({ days: on ? form.days.filter((d) => d !== i) : [...form.days, i].sort((a, b) => a - b) })}
                      >
                        {name}
                      </Chip>
                    );
                  })}
                </ChipGroup>
              </>
            )}
          </section>
        </>
      ) : (
        <Card>
          <div className={styles.cardBodyWide}>
            <div className={styles.section}>
              <span className={styles.subTitle}>ทานทุกกี่ชั่วโมง</span>
              <ChipGroup label="ทานทุกกี่ชั่วโมง">
                {EVERY_HOURS.map((h) => (
                  <Chip key={h} on={form.every === h} onClick={() => set({ every: h })}>
                    {h} ชม.
                  </Chip>
                ))}
              </ChipGroup>
            </div>
            <div className={styles.section}>
              <label htmlFor={timeId} className={labelClass}>
                ทานครั้งแรกกี่โมง
              </label>
              <input id={timeId} type="time" className={inputClass} value={form.first} onChange={(e) => set({ first: e.target.value })} />
            </div>
            <Stepper
              title="จำนวนที่ทาน"
              label="จำนวนที่ทาน"
              text={formatPills(form.ipills, unit)}
              canMinus={form.ipills - 0.5 >= 0.5}
              canPlus={form.ipills + 0.5 <= 4}
              onMinus={() => set({ ipills: stepPills(form.ipills, -1) })}
              onPlus={() => set({ ipills: stepPills(form.ipills, 1) })}
            />
            <div className={styles.section}>
              <span className={styles.subTitle}>ระยะเวลา</span>
              <ChipGroup label="ระยะเวลา">
                <Chip on={form.course === 'days'} onClick={() => set({ course: 'days' })}>
                  กำหนดจำนวนวัน
                </Chip>
                <Chip on={form.course === 'ongoing'} onClick={() => set({ course: 'ongoing' })}>
                  ทานต่อเนื่อง
                </Chip>
              </ChipGroup>
              {form.course === 'days' && (
                <Stepper
                  title="จำนวนวัน"
                  label="จำนวนวัน"
                  text={`${form.courseDays} วัน`}
                  canMinus={form.courseDays > 1}
                  canPlus={form.courseDays < 90}
                  onMinus={() => set({ courseDays: Math.max(1, form.courseDays - 1) })}
                  onPlus={() => set({ courseDays: Math.min(90, form.courseDays + 1) })}
                />
              )}
            </div>
            <InfoBox>
              <strong>เวลาที่ต้องทานในแต่ละวัน</strong>
              <br />
              {preview ?? 'ใส่เวลาครั้งแรกก่อน'}
            </InfoBox>
          </div>
        </Card>
      )}
    </div>
  );
}
