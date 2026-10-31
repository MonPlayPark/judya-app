// The v3 add-medicine screen (M4 PR 6b): view only. Every rule (what is valid, how the form becomes a Schedule / Pack /
// Stock, the texts of the numbers) is in src/domain/v3/addMedicine.ts; AddMedPage owns the data and the way back.
// Personal medicine = 3 steps (info, how to take, how much is there); house medicine = 2 steps (info, how much is there).
import { useMemo, useState, type ReactNode } from 'react';
import { BackIcon, InfoIcon, MinusIcon, PlusIcon, WarningIcon } from '../../components/icons';
import { KindIcon } from '../../components/v3/KindIcon';
import { EveningIcon, MorningIcon, NightIcon, NoonIcon } from '../../components/v3/PeriodIcons';
import { Sheet } from '../../components/v3/Sheet';
import { DateField, sheetStyles } from '../../components/v3/sheetParts';
import type { IsoDate } from '../../domain/calc';
import {
  BUY_OPTIONS,
  EVERY_HOURS,
  KIND_LABEL,
  KIND_ORDER,
  NAME_MAX,
  QUICK_ML,
  SMALL_UNIT,
  WEEKDAY_CHIPS,
  addHouseItem,
  addPersonalMedication,
  alsoLabel,
  amountText,
  buildSchedule,
  buyLabel,
  buyOfPack,
  buyQuestion,
  countFields,
  defaultStrengthUnit,
  doseRules,
  emptyPersonalDraft,
  emptyScheduleDraft,
  emptyStockDraft,
  findHouseItem,
  findMedication,
  hasBigDose,
  isBigDose,
  isTubeKind,
  leftTextFor,
  membersUsing,
  packLine,
  planStock,
  planStockWithPack,
  scheduleBlocker,
  scheduleSummary,
  sizeFields,
  stepAmount,
  strengthOf,
  suggestNames,
  userCards,
  type EveryHours,
  type FreqKind,
  type MedType,
  type PersonalDraft,
  type ScheduleDraft,
} from '../../domain/v3/addMedicine';
import { MEAL_LABEL, PERIOD_LABEL, PERIODS, formatAmount, type Meal, type Period } from '../../domain/v3/home';
import { label } from '../../domain/v3/medsList';
import { defaultNewId } from '../../domain/v3/medActions';
import { STRENGTH_UNITS, type MedKind, type Person, type Root, type Schedule } from '../../domain/v3/schema';
import { avatarUrl } from '../../visual';
import '../../styles/v3theme.css';
import styles from './AddMedV3.module.css';

const squash = (s: string): string => s.replace(/\s+/g, '').toLowerCase();
const STEP_NAMES: Record<MedType, readonly string[]> = {
  personal: ['ข้อมูลยา', 'วิธีกิน', 'จำนวนที่มี'],
  house: ['ข้อมูลยา', 'จำนวนที่มี'],
};
const PERIOD_ICON: Record<Period, (p: { size?: number }) => ReactNode> = {
  morning: MorningIcon,
  noon: NoonIcon,
  evening: EveningIcon,
  bedtime: NightIcon,
};
const MEALS: readonly Meal[] = ['before', 'with', 'after'];

export interface AddMedViewProps {
  root: Root;
  today: IsoDate;
  demo: boolean;
  /** Saves a changed root. Demo: not given, so nothing is saved. */
  persist?: (root: Root) => { ok: true } | { ok: false; text: string };
  /** '' or '?demo=...' so a demo stays a demo on the next page. */
  linkSuffix?: string;
  /** Same for links to the medicine list (it knows only its own demo names). */
  medsSuffix?: string;
  /** Starting values (from the link): the page's own `type=house` and `person=<id>`; in a demo also name / kind / step. */
  initial?: { type?: MedType; person?: string; name?: string; kind?: MedKind; step?: number };
  onBack: () => void;
  /** Called after a (pretend, in a demo) successful save. */
  onSaved: (type: MedType) => void;
  nowIso?: () => string;
  newId?: () => string;
}

export function AddMedView({ root, today, demo, persist, linkSuffix = '', medsSuffix = linkSuffix, initial, onBack, onSaved, nowIso = () => new Date().toISOString(), newId = defaultNewId }: AddMedViewProps) {
  const people = useMemo(() => root.persons.filter((p) => p.removedAt === undefined), [root.persons]);
  const [type, setType] = useState<MedType>(initial?.type ?? 'personal');
  const [step, setStep] = useState<number>(() => Math.max(1, Math.min(initial?.step ?? 1, (initial?.type ?? 'personal') === 'house' ? 2 : 3)));
  const [draft, setDraft] = useState<PersonalDraft>(() => {
    const kind = initial?.kind ?? 'tablet';
    const base = emptyPersonalDraft();
    const person = initial?.person && people.some((p) => p.id === initial.person) ? initial.person : null;
    return { ...base, name: initial?.name ?? '', kind, strength: { value: '', unit: defaultStrengthUnit(kind) }, personId: person, schedule: emptyScheduleDraft(kind), stock: emptyStockDraft(kind) };
  });
  const [listOpen, setListOpen] = useState(false); // suggestion list: open while typing, closed after a pick
  const [newFor, setNewFor] = useState<string | null>(null); // the name for which "add as a new one" was pressed
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDose, setConfirmDose] = useState(false);

  const set = (patch: Partial<PersonalDraft>): void => setDraft((d) => ({ ...d, ...patch }));
  const steps = STEP_NAMES[type];
  const last = steps.length;
  const nameKey = squash(draft.name);
  const addNew = newFor !== null && newFor === nameKey;

  // ----- what the typed name matches
  const suggestions = suggestNames(root, type, draft.name);
  const only = suggestions.length === 1 && squash(suggestions[0]?.name ?? '') === nameKey;
  const showList = listOpen && suggestions.length > 0 && !only;
  const reuse = type === 'personal' && !addNew && !showList ? findMedication(root, draft.name) : undefined;
  const houseDup = type === 'house' && !addNew && !showList ? findHouseItem(root, draft.name) : undefined;
  const usingIds = new Set(reuse ? membersUsing(root, reuse.id).map((p) => p.id) : []);
  const freePeople = people.filter((p) => !usingIds.has(p.id));
  const kind: MedKind = reuse?.kind ?? draft.kind;
  const picked = people.find((p) => p.id === draft.personId && !usingIds.has(p.id));

  // ----- step 1 blocker
  const strengthOk = strengthOf(draft.strength).ok;
  let blocker1: string | null = null;
  if ([...draft.name.trim()].length < 2) blocker1 = 'ใส่ชื่อยาก่อน แล้วค่อยกดถัดไป';
  else if (houseDup) blocker1 = 'เลือกก่อนว่าจะดูยาเดิม หรือเพิ่มเป็นรายการใหม่';
  else if (type === 'personal' && reuse && freePeople.length === 0) blocker1 = 'ทุกคนในบ้านใช้ยานี้อยู่แล้ว ไม่มีใครให้เพิ่มอีก';
  else if (type === 'personal' && !picked) blocker1 = 'เลือกว่ายานี้ของใคร แล้วค่อยกดถัดไป';
  else if (!reuse && !houseDup && !strengthOk) blocker1 = 'ความแรงต้องเป็นตัวเลขมากกว่า 0 แล้วค่อยกดถัดไป';

  // ----- schedule and stock (steps 2 and 3)
  const sched = buildSchedule(kind, draft.schedule, today);
  const blocker2 = scheduleBlocker(draft.schedule);
  const plan = reuse ? planStockWithPack(kind, reuse.pack, draft.stock, today) : planStock(kind, draft.stock, today);

  const switchType = (t: MedType): void => {
    setType(t);
    setSaveError(null);
  };
  const changeKind = (k: MedKind): void =>
    setDraft((d) => ({ ...d, kind: k, strength: d.strength.value === '' ? { value: '', unit: defaultStrengthUnit(k) } : d.strength, schedule: emptyScheduleDraft(k), stock: emptyStockDraft(k) }));

  const goNext = (): void => {
    if (step === 1 && reuse) {
      // "เพิ่มให้ … ด้วย": the existing medicine is used as it is; the schedule and the stock are asked for its kind
      setDraft((d) => ({ ...d, kind: reuse.kind, schedule: emptyScheduleDraft(reuse.kind), stock: { ...emptyStockDraft(reuse.kind), buy: buyOfPack(reuse.kind, reuse.pack) } }));
    }
    setStep((s) => Math.min(s + 1, last));
    window.scrollTo?.(0, 0);
  };
  const goBack = (): void => {
    setSaveError(null);
    if (step > 1) {
      setStep((s) => s - 1);
      window.scrollTo?.(0, 0);
    } else onBack();
  };

  const save = (): void => {
    const made =
      type === 'personal'
        ? addPersonalMedication(root, { ...draft, kind, reuseMedicationId: reuse?.id ?? null }, today, nowIso(), newId)
        : addHouseItem(root, { name: draft.name, kind: draft.kind, strength: draft.strength, stock: draft.stock, expiry: draft.expiry }, today, newId);
    if (!made.ok) {
      setSaveError(made.error);
      return;
    }
    const res = persist ? persist(made.root) : ({ ok: true } as const);
    if (!res.ok) {
      setSaveError(res.text); // the form keeps what was typed
      return;
    }
    setSaveError(null);
    onSaved(type);
  };
  const onSave = (): void => {
    if (type === 'personal' && hasBigDose(kind, draft.schedule)) setConfirmDose(true);
    else save();
  };

  // ----- the bar
  let blocker: string | null = null;
  let primary = 'ถัดไป';
  let onPrimary = goNext;
  if (step === 1) {
    blocker = blocker1;
    if (reuse && picked) primary = alsoLabel(picked);
    else if (reuse) primary = 'เพิ่มให้ … ด้วย';
  } else if (type === 'personal' && step === 2) {
    blocker = blocker2;
  } else {
    blocker = plan.missing.length > 0 ? 'กรอกช่องที่ขาดให้ครบ แล้วค่อยกดบันทึก' : plan.countProblem;
    primary = 'บันทึกยา';
    onPrimary = onSave;
  }

  return (
    <div className={`v3theme ${styles.page}`}>
      {demo && (
        <p className={styles.demo} role="status">
          <InfoIcon />
          โหมดตัวอย่าง ไม่บันทึกข้อมูล
        </p>
      )}
      <header className={styles.head}>
        <button type="button" className={styles.back} aria-label="กลับ" onClick={goBack}>
          <BackIcon />
        </button>
        <h1 className={styles.title}>เพิ่มยา</h1>
        <KindIcon kind="capsule" size={32} />
      </header>

      <ol className={styles.steps} aria-label={`ขั้นที่ ${step} จาก ${last}`}>
        {steps.map((name, i) => {
          const n = i + 1;
          const state = n < step ? 'done' : n === step ? 'now' : 'next';
          return (
            <li key={name} className={`${styles.stepItem} ${styles[`step_${state}`]}`} aria-current={state === 'now' ? 'step' : undefined}>
              <span className={styles.stepDot}>{n}</span>
              <span className={styles.stepName}>{name}</span>
            </li>
          );
        })}
      </ol>

      <div className={styles.body}>
        {step === 1 && (
          <Step1
            root={root}
            type={type}
            onType={switchType}
            draft={draft}
            set={set}
            changeKind={changeKind}
            people={people}
            usingIds={usingIds}
            suggestions={showList ? suggestions : []}
            onName={(name) => {
              set({ name });
              setListOpen(true);
            }}
            onPick={(name) => {
              set({ name });
              setListOpen(false);
            }}
            reuse={reuse}
            houseDup={houseDup}
            onAddNew={() => setNewFor(nameKey)}
            linkSuffix={linkSuffix}
            medsSuffix={medsSuffix}
            today={today}
          />
        )}
        {step === 2 && type === 'personal' && <Step2 kind={kind} d={draft.schedule} setSchedule={(s) => set({ schedule: s })} summary={scheduleSummary(kind, draft.schedule)} />}
        {step === last && (
          <Step3
            root={root}
            type={type}
            kind={kind}
            draft={draft}
            set={set}
            reuse={reuse}
            plan={plan}
            schedule={sched.ok ? sched.schedule : null}
            today={today}
            who={picked}
          />
        )}
      </div>

      <div className={styles.bar}>
        {saveError !== null && (
          <p className={styles.saveError} role="alert">
            <WarningIcon />
            {saveError}
          </p>
        )}
        {blocker !== null && (
          <p className={styles.reason}>
            <InfoIcon />
            {blocker}
          </p>
        )}
        <button type="button" className={styles.primary} disabled={blocker !== null} onClick={onPrimary}>
          {primary}
        </button>
        {step > 1 && (
          <button type="button" className={styles.secondary} onClick={goBack}>
            ย้อนกลับ
          </button>
        )}
      </div>

      {confirmDose && (
        <Sheet title="ยืนยันขนาดยา" subtitle="ขนาดยาน้ำมากกว่าปกติ ตรวจฉลากยาอีกครั้งก่อนบันทึก" onClose={() => setConfirmDose(false)}>
          <div className={sheetStyles.body}>
            <p className={styles.confirmDose}>{scheduleSummary(kind, draft.schedule)}</p>
            <div className={sheetStyles.actions}>
              <button
                type="button"
                className={sheetStyles.primary}
                onClick={() => {
                  setConfirmDose(false);
                  save();
                }}
              >
                ถูกต้อง บันทึกเลย
              </button>
              <button
                type="button"
                className={sheetStyles.cancel}
                onClick={() => {
                  setConfirmDose(false);
                  setStep(2);
                }}
              >
                กลับไปแก้
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

type SetDraft = (patch: Partial<PersonalDraft>) => void;

function Hint({ icon, tone, children }: { icon?: ReactNode; tone?: 'warn' | 'info' | 'ok' | 'error'; children: ReactNode }) {
  const cls = tone === 'warn' ? styles.boxWarn : tone === 'info' ? styles.boxInfo : tone === 'ok' ? styles.boxOk : tone === 'error' ? styles.boxError : styles.hint;
  return (
    <p className={cls} role={tone === 'error' ? 'alert' : undefined}>
      {icon}
      <span>{children}</span>
    </p>
  );
}

// ---------- step 1 ----------

interface Step1Props {
  root: Root;
  type: MedType;
  onType: (t: MedType) => void;
  draft: PersonalDraft;
  set: SetDraft;
  changeKind: (k: MedKind) => void;
  people: Person[];
  usingIds: Set<string>;
  suggestions: ReturnType<typeof suggestNames>;
  onName: (name: string) => void;
  onPick: (name: string) => void;
  reuse: ReturnType<typeof findMedication>;
  houseDup: ReturnType<typeof findHouseItem>;
  onAddNew: () => void;
  linkSuffix: string;
  medsSuffix: string;
  today: IsoDate;
}

function Step1({ root, type, onType, draft, set, changeKind, people, usingIds, suggestions, onName, onPick, reuse, houseDup, onAddNew, linkSuffix, medsSuffix, today }: Step1Props) {
  const TYPES: { value: MedType; title: string; text: string }[] = [
    { value: 'personal', title: 'ยาเฉพาะบุคคล', text: 'กินประจำ มีเวลากิน' },
    { value: 'house', title: 'ยาสามัญประจำบ้าน', text: 'ใช้ร่วมกันทั้งบ้าน ไม่มีเวลากิน' },
  ];
  const showForm = reuse === undefined && houseDup === undefined;
  const strengthBad = !strengthOf(draft.strength).ok;
  const users = reuse ? userCards(root, reuse.id, today) : [];
  return (
    <>
      <section className={styles.card} aria-label="ประเภทยา">
        <div className={styles.typeRow} role="group" aria-label="ประเภทยา">
          {TYPES.map((t) => (
            <button key={t.value} type="button" className={type === t.value ? `${styles.typeCard} ${styles.on}` : styles.typeCard} aria-pressed={type === t.value} onClick={() => onType(t.value)}>
              <span className={styles.typeTitle}>{t.title}</span>
              <span className={styles.typeText}>{t.text}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.card} aria-label="ชื่อและชนิดยา">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="am-name">
            ชื่อยา
          </label>
          <input id="am-name" className={styles.input} type="text" autoComplete="off" maxLength={NAME_MAX} placeholder="พิมพ์ชื่อยา" value={draft.name} onChange={(e) => onName(e.target.value)} />
          {suggestions.length > 0 && (
            <ul className={styles.suggest} aria-label="ชื่อที่แนะนำ">
              {suggestions.map((s) => (
                <li key={s.name}>
                  <button type="button" className={styles.suggestItem} onClick={() => onPick(s.name)}>
                    <span>{s.name}</span>
                    {s.tag && <span className={styles.tag}>{s.tag}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {showForm && (
          <>
            <div className={styles.field} role="group" aria-labelledby="am-kind">
              <span id="am-kind" className={styles.label}>
                ชนิดยา
              </span>
              <div className={styles.kinds}>
                {KIND_ORDER.map((k) => (
                  <button key={k} type="button" className={draft.kind === k ? `${styles.kindTile} ${styles.on}` : styles.kindTile} aria-pressed={draft.kind === k} onClick={() => changeKind(k)}>
                    <KindIcon kind={k} size={28} />
                    <span>{KIND_LABEL[k]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="am-strength">
                ความแรง (ไม่บังคับ)
              </label>
              <div className={styles.strengthRow}>
                <input
                  id="am-strength"
                  className={`${styles.input} ${strengthBad ? styles.inputError : ''}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="เช่น 500"
                  value={draft.strength.value}
                  aria-invalid={strengthBad}
                  onChange={(e) => set({ strength: { ...draft.strength, value: e.target.value } })}
                />
                <select className={styles.select} aria-label="หน่วยความแรง" value={draft.strength.unit} onChange={(e) => set({ strength: { ...draft.strength, unit: e.target.value as (typeof STRENGTH_UNITS)[number] } })}>
                  {STRENGTH_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              {strengthBad && (
                <Hint tone="error" icon={<WarningIcon />}>
                  ความแรงต้องเป็นตัวเลขมากกว่า 0
                </Hint>
              )}
            </div>
          </>
        )}
      </section>

      {reuse && (
        <section className={styles.card} aria-label="ยาที่มีในบ้านแล้ว">
          <p className={styles.foundTitle}>
            <span>
              {label(reuse)} มีในบ้านแล้ว · {users.map((u) => u.name).join(', ')} ใช้อยู่
            </span>
          </p>
          <p className={styles.hint}>
            {KIND_LABEL[reuse.kind]}
            {reuse.strength ? ` ${label({ name: '', strength: reuse.strength }).trim()}` : ''}
            {packLine(reuse.kind, reuse.pack) ? ` · ${packLine(reuse.kind, reuse.pack)}` : ''}
          </p>
          {users.length <= 3 ? (
            <ul className={styles.userList}>
              {users.map((u) => (
                <li key={u.personId} className={styles.userCard}>
                  <img className={styles.userAvatar} src={avatarUrl(u.avatar)} alt="" />
                  <div className={styles.userText}>
                    <p className={styles.userName}>
                      {u.name}
                      {u.status === 'stopped' ? ' · หยุดอยู่' : ''}
                    </p>
                    <p className={styles.userLine}>
                      {u.stockText} · {u.doseText}
                    </p>
                    {u.expiry && <p className={styles.userLine}>หมดอายุ {u.expiry}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className={styles.userList}>
              {users.map((u) => (
                <li key={u.personId} className={styles.userLine}>
                  {u.name} · {u.stockText}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={styles.linkButton} onClick={onAddNew}>
            ไม่ใช่ตัวเดียวกัน? เพิ่มเป็นยาใหม่
          </button>
        </section>
      )}

      {houseDup && (
        <section className={styles.card} aria-label="มียานี้ในบ้านแล้ว">
          <p className={styles.foundTitle}>
            <span>มียานี้ในบ้านแล้ว</span>
          </p>
          <p className={styles.hint}>{label(houseDup)}</p>
          <div className={styles.dupActions}>
            <a className={styles.secondaryLink} href={`#/n/meds?tab=house&item=${encodeURIComponent(houseDup.id)}${medsSuffix.replace('?', '&')}`}>
              ดูยาเดิม
            </a>
            <button type="button" className={styles.secondaryButton} onClick={onAddNew}>
              เพิ่มเป็นรายการใหม่
            </button>
          </div>
        </section>
      )}

      {type === 'personal' && (
        <section className={styles.card} aria-label="ยานี้ของใคร">
          <div className={styles.field} role="group" aria-labelledby="am-who">
            <span id="am-who" className={styles.label}>
              ยานี้ของใคร
            </span>
            <div className={styles.people}>
              {people.map((p) => {
                const used = usingIds.has(p.id);
                const on = draft.personId === p.id && !used;
                return (
                  <button key={p.id} type="button" className={on ? `${styles.person} ${styles.on}` : styles.person} aria-pressed={on} disabled={used} onClick={() => set({ personId: p.id })}>
                    <img className={styles.personAvatar} src={avatarUrl(p.avatar)} alt="" />
                    <span className={styles.personName}>{p.name}</span>
                    {used && (
                      <span className={styles.usedTag}>
                        <InfoIcon />
                        ใช้อยู่แล้ว
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <a className={styles.addMember} href={`#/n/members/new${linkSuffix}`}>
              <PlusIcon />
              เพิ่มสมาชิก
            </a>
          </div>
        </section>
      )}
    </>
  );
}

// ---------- step 2 ----------

function Stepper({ kind, value, onChange, name }: { kind: MedKind; value: number; onChange: (v: number) => void; name: string }) {
  const rules = doseRules(kind);
  if (!rules) return null;
  return (
    <div className={styles.stepperBlock}>
      <div className={styles.stepper} role="group" aria-label={`ครั้งละ ${name}`}>
        <span className={styles.stepperLabel}>ครั้งละ</span>
        <button type="button" className={styles.stepBtn} aria-label={`ลด ${name}`} disabled={value <= rules.min} onClick={() => onChange(stepAmount(kind, value, -1))}>
          <MinusIcon />
        </button>
        <output className={styles.stepValue}>{amountText(kind, value)}</output>
        <button type="button" className={styles.stepBtn} aria-label={`เพิ่ม ${name}`} disabled={value >= rules.max} onClick={() => onChange(stepAmount(kind, value, 1))}>
          <PlusIcon />
        </button>
      </div>
      <p className={styles.hint}>{rules.hint}</p>
      {kind === 'liquid' && (
        <div className={styles.quick}>
          {QUICK_ML.map((q) => (
            <button key={q.ml} type="button" className={styles.chipSmall} onClick={() => onChange(q.ml)}>
              {q.label}
            </button>
          ))}
        </div>
      )}
      {isBigDose(kind, value) && (
        <Hint tone="warn" icon={<WarningIcon />}>
          มากกว่าปกติ ตรวจฉลากยาอีกครั้ง
        </Hint>
      )}
    </div>
  );
}

function Step2({ kind, d, setSchedule, summary }: { kind: MedKind; d: ScheduleDraft; setSchedule: (s: ScheduleDraft) => void; summary: string }) {
  const tube = isTubeKind(kind);
  const patch = (p: Partial<ScheduleDraft>): void => setSchedule({ ...d, ...p });
  const togglePeriod = (p: Period): void => {
    const has = d.periods.includes(p);
    if (has && d.periods.length === 1) return; // the last one cannot be taken off
    patch({ periods: has ? d.periods.filter((x) => x !== p) : PERIODS.filter((x) => x === p || d.periods.includes(x)) });
  };
  const setSlot = (p: Period, s: Partial<{ meal: Meal; amount: number }>): void => patch({ slots: { ...d.slots, [p]: { ...d.slots[p], ...s } } });
  const FREQS: { value: FreqKind; text: string }[] = [
    { value: 'daily', text: 'ทุกวัน' },
    { value: 'alt', text: 'วันเว้นวัน' },
    { value: 'weekdays', text: 'เลือกวัน' },
  ];
  return (
    <>
      <section className={styles.card} aria-label="ทานแบบไหน">
        <span className={styles.label}>ทานแบบไหน</span>
        <div className={styles.twoRow} role="group" aria-label="ทานแบบไหน">
          <button type="button" className={d.mode === 'meal' ? `${styles.tile} ${styles.on}` : styles.tile} aria-pressed={d.mode === 'meal'} onClick={() => patch({ mode: 'meal' })}>
            ตามมื้ออาหาร
          </button>
          <button type="button" className={d.mode === 'interval' ? `${styles.tile} ${styles.on}` : styles.tile} aria-pressed={d.mode === 'interval'} onClick={() => patch({ mode: 'interval' })}>
            ทุกกี่ชั่วโมง
          </button>
        </div>
        {tube && <Hint icon={<InfoIcon />}>ตั้งเวลาเตือนได้ แต่ไม่ตัดสต็อกให้เอง</Hint>}
      </section>

      {d.mode === 'meal' ? (
        <>
          <section className={styles.card} aria-label="ช่วงเวลา">
            <span className={styles.label}>ช่วงเวลา (เลือกได้หลายช่วง)</span>
            <div className={styles.periods} role="group" aria-label="ช่วงเวลา">
              {PERIODS.map((p) => {
                const Icon = PERIOD_ICON[p];
                const on = d.periods.includes(p);
                return (
                  <button key={p} type="button" className={on ? `${styles.periodChip} ${styles.on}` : styles.periodChip} aria-pressed={on} onClick={() => togglePeriod(p)}>
                    <Icon size={24} />
                    <span>{PERIOD_LABEL[p]}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {PERIODS.filter((p) => d.periods.includes(p)).map((p) => {
            const Icon = PERIOD_ICON[p];
            return (
              <section key={p} className={styles.card} aria-label={`ช่วง${PERIOD_LABEL[p]}`}>
                <h2 className={styles.cardTitle}>
                  <Icon size={24} />
                  {PERIOD_LABEL[p]}
                </h2>
                {p !== 'bedtime' && !tube && (
                  <div className={styles.meals} role="group" aria-label={`ก่อนหรือหลังอาหาร ช่วง${PERIOD_LABEL[p]}`}>
                    {MEALS.map((m) => (
                      <button key={m} type="button" className={d.slots[p].meal === m ? `${styles.chip} ${styles.on}` : styles.chip} aria-pressed={d.slots[p].meal === m} onClick={() => setSlot(p, { meal: m })}>
                        {MEAL_LABEL[m]}
                      </button>
                    ))}
                  </div>
                )}
                <Stepper kind={kind} value={d.slots[p].amount} onChange={(v) => setSlot(p, { amount: v })} name={PERIOD_LABEL[p]} />
              </section>
            );
          })}

          <section className={styles.card} aria-label="ความถี่">
            <span className={styles.label}>ความถี่</span>
            <div className={styles.threeRow} role="group" aria-label="ความถี่">
              {FREQS.map((f) => (
                <button key={f.value} type="button" className={d.freq === f.value ? `${styles.tile} ${styles.on}` : styles.tile} aria-pressed={d.freq === f.value} onClick={() => patch({ freq: f.value })}>
                  {f.text}
                </button>
              ))}
            </div>
            {d.freq === 'weekdays' && (
              <div className={styles.weekdays} role="group" aria-label="เลือกวัน">
                {WEEKDAY_CHIPS.map((w) => {
                  const on = d.weekdays.includes(w.value);
                  return (
                    <button
                      key={w.value}
                      type="button"
                      className={on ? `${styles.dayChip} ${styles.on}` : styles.dayChip}
                      aria-pressed={on}
                      onClick={() => patch({ weekdays: on ? d.weekdays.filter((x) => x !== w.value) : [...d.weekdays, w.value] })}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className={styles.card} aria-label="ทุกกี่ชั่วโมง">
          <span className={styles.label}>ทุกกี่ชั่วโมง</span>
          <div className={styles.hours} role="group" aria-label="ทุกกี่ชั่วโมง">
            {EVERY_HOURS.map((h) => (
              <button key={h} type="button" className={d.everyHours === h ? `${styles.chip} ${styles.on}` : styles.chip} aria-pressed={d.everyHours === h} onClick={() => patch({ everyHours: h as EveryHours })}>
                {h} ชม.
              </button>
            ))}
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="am-first">
              เริ่มครั้งแรกกี่โมง
            </label>
            <input id="am-first" className={`${styles.input} ${styles.timeInput}`} type="time" value={d.firstTime} onChange={(e) => patch({ firstTime: e.target.value })} />
          </div>
          <Stepper kind={kind} value={d.amount} onChange={(v) => patch({ amount: v })} name="แต่ละครั้ง" />
          <div className={styles.field}>
            <span className={styles.label}>กินนานแค่ไหน</span>
            <div className={styles.twoRow} role="group" aria-label="กินนานแค่ไหน">
              <button type="button" className={d.course === 'ongoing' ? `${styles.tile} ${styles.on}` : styles.tile} aria-pressed={d.course === 'ongoing'} onClick={() => patch({ course: 'ongoing' })}>
                กินต่อเนื่อง
              </button>
              <button type="button" className={d.course === 'days' ? `${styles.tile} ${styles.on}` : styles.tile} aria-pressed={d.course === 'days'} onClick={() => patch({ course: 'days' })}>
                กินกี่วัน
              </button>
            </div>
            {d.course === 'days' && (
              <label className={styles.numberBox}>
                <input className={styles.numberInput} type="text" inputMode="numeric" placeholder="เช่น 7" aria-label="จำนวนวันที่กิน" value={d.courseDays} onChange={(e) => patch({ courseDays: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
                <span className={styles.unit}>วัน</span>
              </label>
            )}
          </div>
        </section>
      )}

      <section className={styles.summaryCard} aria-label="สรุปวิธีกิน">
        <span className={styles.label}>สรุปวิธีกิน</span>
        <p className={styles.summaryText}>{summary}</p>
      </section>
    </>
  );
}

// ---------- step 3 ----------

interface Step3Props {
  root: Root;
  type: MedType;
  kind: MedKind;
  draft: PersonalDraft;
  set: SetDraft;
  reuse: ReturnType<typeof findMedication>;
  plan: ReturnType<typeof planStock>;
  schedule: Schedule | null;
  today: IsoDate;
  who: Person | undefined;
}

function Step3({ root, type, kind, draft, set, reuse, plan, schedule, today, who }: Step3Props) {
  const stock = draft.stock;
  const buy = reuse ? buyOfPack(kind, reuse.pack) : stock.buy;
  const setBuy = (b: typeof buy): void => set({ stock: { ...emptyStockDraft(kind), buy: b, counts: stock.counts } });
  const sizes = reuse ? [] : sizeFields(kind, buy);
  const counts = countFields(kind, buy);
  const missing = new Set(plan.missing.map((m) => m.key));
  const left = type === 'personal' && schedule ? leftTextFor(kind, plan.pack, schedule, plan.stock, today) : null;
  const strength = strengthOf(draft.strength);
  const title = reuse ? label(reuse) : `${draft.name.trim()}${strength.ok && strength.strength ? ` ${label({ name: '', strength: strength.strength }).trim()}` : ''}`;
  return (
    <>
      <section className={styles.card} aria-label="สรุปยา">
        <div className={styles.recap}>
          <KindIcon kind={kind} size={36} />
          <div className={styles.recapText}>
            <p className={styles.recapName}>{title}</p>
            {type === 'personal' ? (
              <p className={styles.hint}>
                ของ {who?.name ?? ''} · {scheduleSummary(kind, draft.schedule)}
              </p>
            ) : (
              <p className={styles.recapTag}>ยาสามัญประจำบ้าน</p>
            )}
          </div>
        </div>
      </section>

      <section className={styles.card} aria-label="จำนวนที่มี">
        {reuse ? (
          <Hint icon={<InfoIcon />}>{packLine(kind, reuse.pack) ? `บรรจุเดิมของยานี้: ${packLine(kind, reuse.pack)}` : 'ยานี้ไม่ได้ระบุขนาดบรรจุ'}</Hint>
        ) : (
          <div className={styles.field} role="group" aria-labelledby="am-buy">
            <span id="am-buy" className={styles.label}>
              {buyQuestion(kind)}
            </span>
            <div className={styles.buys}>
              {BUY_OPTIONS[kind].map((b) => (
                <button key={b} type="button" className={buy === b ? `${styles.buyTile} ${styles.on}` : styles.buyTile} aria-pressed={buy === b} onClick={() => setBuy(b)}>
                  <KindIcon kind={kind} size={28} />
                  <span>{buyLabel(kind, b)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {sizes.length > 0 && (
          <div className={styles.field}>
            <span className={styles.label}>ขนาดบรรจุ</span>
            {sizes.map((f) => {
              const bad = missing.has(f.key);
              return (
                <div key={f.key} className={styles.sizeRow}>
                  <label className={styles.sizeLabel} htmlFor={`am-size-${f.key}`}>
                    {f.label}
                    {f.required ? '' : ' (ไม่บังคับ)'}
                  </label>
                  <div className={bad ? `${styles.numberBox} ${styles.numberBad}` : styles.numberBox}>
                    <input
                      id={`am-size-${f.key}`}
                      className={styles.numberInput}
                      type="text"
                      inputMode={f.key === 'amount' ? 'decimal' : 'numeric'}
                      placeholder="0"
                      aria-invalid={bad}
                      value={stock.size[f.key]}
                      onChange={(e) => set({ stock: { ...stock, size: { ...stock.size, [f.key]: e.target.value } } })}
                    />
                    <span className={styles.unit}>{f.unit}</span>
                  </div>
                  {bad && (
                    <Hint tone="error" icon={<WarningIcon />}>
                      ต้องกรอกช่องนี้
                    </Hint>
                  )}
                </div>
              );
            })}
            {plan.packLine && (
              <Hint tone="ok" icon={<InfoIcon />}>
                {plan.packLine}
              </Hint>
            )}
          </div>
        )}

        {counts.length > 0 && (
          <div className={styles.field}>
            <span className={styles.label}>ตอนนี้มีอยู่เท่าไหร่ (ไม่บังคับ)</span>
            <div className={styles.countGrid}>
              {counts.map((f) => (
                <div key={f.key} className={styles.sizeRow}>
                  <label className={styles.numberBox}>
                    <input
                      className={styles.numberInput}
                      type="text"
                      inputMode={f.key === 'loose' && kind === 'liquid' ? 'decimal' : 'numeric'}
                      placeholder="0"
                      aria-label={`จำนวน ${f.unit}${f.note ? ` ${f.note}` : ''}`}
                      value={stock.counts[f.key]}
                      onChange={(e) => set({ stock: { ...stock, counts: { ...stock.counts, [f.key]: e.target.value } } })}
                    />
                    <span className={styles.unit}>{f.unit}</span>
                  </label>
                  {f.note && <p className={styles.hint}>{f.note}</p>}
                </div>
              ))}
            </div>
            {plan.countProblem && (
              <Hint tone="error" icon={<WarningIcon />}>
                {plan.countProblem}
              </Hint>
            )}
            <p className={styles.hint}>เว้นว่างทุกช่อง = ยังไม่นับ · พิมพ์ 0 = นับแล้ว ไม่มียา</p>
            {type === 'house' && <p className={styles.hint}>ยาสามัญไม่มีวิธีกิน จึงไม่ตัดสต็อกอัตโนมัติ</p>}
          </div>
        )}

        {plan.total !== null && (
          <p className={styles.total}>
            ตอนนี้มีรวม {kind === 'liquid' ? plan.total : formatAmount(plan.total)} {SMALL_UNIT[kind]}
            {left !== null && <span className={styles.totalLeft}> · พอใช้ประมาณ {left}</span>}
          </p>
        )}
        {isTubeKind(kind) && buy !== 'none' && (
          <Hint tone="info" icon={<InfoIcon />}>
            ไม่ตัดสต็อกให้เอง กด “เปิดหลอดใหม่” เองที่หน้ารายละเอียดยา แอพเตือนเมื่อไม่เหลือหลอด/ขวดสำรอง
          </Hint>
        )}
        {buy === 'none' && (
          <Hint tone="info" icon={<InfoIcon />}>
            ไม่นับสต็อกก็ได้ แต่แอพจะไม่เตือนให้ซื้อเติม
          </Hint>
        )}
      </section>

      <section className={styles.card} aria-label="วันหมดอายุ">
        <span className={styles.label}>วันหมดอายุ (ไม่บังคับ)</span>
        <DateField value={draft.expiry} onChange={(v) => set({ expiry: v })} label="วันหมดอายุ" />
        <p className={styles.hint}>ใส่แล้วแอพจะเตือนก่อนหมดอายุ {root.settings.expiryWarnDays} วัน</p>
      </section>

      {plan.blocker !== null && plan.missing.length > 0 && (
        <Hint tone="warn" icon={<WarningIcon />}>
          {plan.blocker}
        </Hint>
      )}
    </>
  );
}

