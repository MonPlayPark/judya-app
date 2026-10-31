// The v3 add-member screen (M4 PR 6a): view only. What is valid, what is saved and the colour come from
// src/domain/v3/members.ts; MemberFormPage owns the data. `MemberForm` takes starting values, so the edit page
// (PR 9) can use it again. Today only the "add" mode is built.
import { useState, type FormEvent, type ReactNode } from 'react';
import { BackIcon, CheckIcon, InfoIcon, PlusIcon, WarningIcon } from '../../components/icons';
import { ComingSoon } from '../../components/v3/ComingSoon';
import { Sheet } from '../../components/v3/Sheet';
import { sheetStyles } from '../../components/v3/sheetParts';
import { defaultNewId } from '../../domain/v3/medActions';
import { NAME_MAX, createMember, defaultSelfManaged, draftState, emptyDraft, hasSelf, type MemberDraft } from '../../domain/v3/members';
import { AVATAR_NAMES_V3, RELATIONS_V3, SELF_RELATION, maxBirthYearBE, type Person, type Root } from '../../domain/v3/schema';
import { avatarUrl } from '../../visual';
import '../../styles/v3theme.css';
import styles from './MemberFormV3.module.css';

const SHOWN = 4; // pictures in the row; the rest are in the "+" sheet
const noop = (): void => undefined; // the sheet after saving cannot be closed with the curtain

export interface MemberFormProps {
  /** Starting values (the add page gives none). */
  initial?: Partial<MemberDraft>;
  /** The members of the house, to check "ตัวฉัน" and the same name. */
  persons: readonly Person[];
  title: string;
  /** Text above the save button when something stops saving it comes from the domain; this is only shown for a failed save. */
  saveError: string | null;
  onBack: () => void;
  onSubmit: (draft: MemberDraft) => void;
  initialSheet?: 'avatars';
  banner?: ReactNode;
  /** Sheets or other overlays drawn inside the page. */
  children?: ReactNode;
}

export function MemberForm({ initial, persons, title, saveError, onBack, onSubmit, initialSheet, banner, children }: MemberFormProps) {
  const [draft, setDraft] = useState<MemberDraft>(() => ({ ...emptyDraft(), ...initial }));
  const [switchTouched, setSwitchTouched] = useState(initial?.selfManaged !== undefined);
  const [avatarSheet, setAvatarSheet] = useState(initialSheet === 'avatars');
  const state = draftState(draft, persons);
  const selfTaken = hasSelf(persons);

  const set = (patch: Partial<MemberDraft>): void => setDraft((d) => ({ ...d, ...patch }));
  const setRelation = (relation: MemberDraft['relation']): void =>
    setDraft((d) => ({ ...d, relation, ...(switchTouched ? {} : { selfManaged: defaultSelfManaged(relation) }) }));
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (state.blocker === null) onSubmit(draft);
  };

  // the first pictures; a chosen one that is not among them takes the 4th place
  const first = AVATAR_NAMES_V3.slice(0, SHOWN);
  const row = first.includes(draft.avatar) ? [...first] : [...first.slice(0, SHOWN - 1), draft.avatar];
  const birth = state.birth;

  return (
    <div className={`v3theme ${styles.page}`}>
      {banner}
      <header className={styles.head}>
        <button type="button" className={styles.back} aria-label="กลับ" onClick={onBack}>
          <BackIcon />
        </button>
        <h1 className={styles.title}>{title}</h1>
      </header>

      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.body}>
          {/* ----- card 1: picture ----- */}
          <section className={styles.card} aria-labelledby="mf-photo">
            <h2 id="mf-photo" className={styles.cardTitle}>
              รูปโปรไฟล์
            </h2>
            <div className={styles.avatars}>
              {row.map((name) => {
                const on = name === draft.avatar;
                return (
                  <button key={name} type="button" className={on ? `${styles.pick} ${styles.pickOn}` : styles.pick} aria-pressed={on} aria-label={`รูปที่ ${AVATAR_NAMES_V3.indexOf(name) + 1}`} onClick={() => set({ avatar: name })}>
                    <img src={avatarUrl(name)} alt="" />
                    {on && (
                      <span className={styles.tick} aria-hidden="true">
                        <CheckIcon />
                      </span>
                    )}
                  </button>
                );
              })}
              <button type="button" className={styles.more} aria-label="ดูรูปทั้งหมด" onClick={() => setAvatarSheet(true)}>
                <PlusIcon />
              </button>
            </div>
            <p className={styles.hint}>เลือกรูปให้สมาชิก · กด + เพื่อดูรูปทั้งหมด</p>
          </section>

          {/* ----- card 2: name, relation, birth year ----- */}
          <section className={styles.card} aria-label="ข้อมูลสมาชิก">
            <div className={styles.field}>
              <label className={styles.label} htmlFor="mf-name">
                ชื่อที่เรียก
              </label>
              <input
                id="mf-name"
                className={styles.input}
                type="text"
                placeholder="เช่น คุณแม่"
                autoComplete="off"
                maxLength={NAME_MAX}
                value={draft.name}
                aria-describedby={state.duplicate ? 'mf-name-note' : undefined}
                onChange={(e) => set({ name: e.target.value })}
              />
              {state.duplicate && (
                <p id="mf-name-note" className={`${styles.hint} ${styles.hintWarn}`}>
                  <WarningIcon />
                  มีสมาชิกชื่อนี้แล้ว
                </p>
              )}
            </div>

            <div className={styles.field} role="group" aria-labelledby="mf-rel">
              <span id="mf-rel" className={styles.label}>
                ความสัมพันธ์
              </span>
              <div className={styles.chips}>
                {RELATIONS_V3.map((r) => {
                  const on = draft.relation === r;
                  const locked = r === SELF_RELATION && selfTaken;
                  return (
                    <button key={r} type="button" className={on ? `${styles.chip} ${styles.chipOn}` : styles.chip} aria-pressed={on} disabled={locked} aria-describedby={locked ? 'mf-self-note' : undefined} onClick={() => setRelation(r)}>
                      {r}
                    </button>
                  );
                })}
              </div>
              {selfTaken && (
                <p id="mf-self-note" className={styles.hint}>
                  <InfoIcon />
                  มี 'ตัวฉัน' แล้ว
                </p>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="mf-year">
                ปีเกิด (พ.ศ.)
              </label>
              <input
                id="mf-year"
                className={`${styles.input} ${styles.year} ${birth.kind === 'bad' ? styles.inputError : ''}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="เช่น 2503"
                maxLength={4}
                value={draft.birthYear}
                aria-invalid={birth.kind === 'bad'}
                aria-describedby="mf-year-note"
                onChange={(e) => set({ birthYear: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              />
              <p id="mf-year-note" className={birth.kind === 'bad' ? `${styles.hint} ${styles.hintError}` : styles.hint}>
                {birth.kind === 'bad' && <WarningIcon />}
                {birth.kind === 'ok' ? `อายุ ${birth.age} ปี` : birth.kind === 'empty' ? 'ใช้คำนวณอายุ ไม่บังคับ' : `ปีเกิดต้องเป็น พ.ศ. 4 หลัก ตั้งแต่ 2400 ถึง ${maxBirthYearBE()}`}
              </p>
            </div>
          </section>

          {/* ----- card 3: self-managed ----- */}
          <section className={`${styles.card} ${styles.switchRow}`} aria-label="จัดยาทานเอง">
            <div className={styles.switchText}>
              <h2 id="mf-self" className={styles.cardTitle}>
                จัดยาทานเอง
              </h2>
              <p className={styles.switchDesc}>สมาชิกคนนี้จัดและกินยาเอง</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.selfManaged}
              aria-labelledby="mf-self"
              className={draft.selfManaged ? `${styles.switch} ${styles.switchOn}` : styles.switch}
              onClick={() => {
                setSwitchTouched(true);
                set({ selfManaged: !draft.selfManaged });
              }}
            >
              <span className={styles.switchWord}>{draft.selfManaged ? 'เปิด' : 'ปิด'}</span>
              <span className={styles.track} aria-hidden="true">
                <span className={styles.thumb} />
              </span>
            </button>
          </section>
        </div>

        <div className={styles.bar}>
          {saveError !== null && (
            <p className={styles.saveError} role="alert">
              <WarningIcon />
              {saveError}
            </p>
          )}
          {state.blocker !== null && (
            <p className={styles.reason}>
              <InfoIcon />
              {state.blocker}
            </p>
          )}
          <button type="submit" className={styles.save} disabled={state.blocker !== null}>
            บันทึก
          </button>
        </div>
      </form>

      {avatarSheet && (
        <Sheet title="เลือกรูปโปรไฟล์" onClose={() => setAvatarSheet(false)}>
          <div className={styles.grid} role="group" aria-label="รูปโปรไฟล์ทั้งหมด">
            {AVATAR_NAMES_V3.map((name, i) => {
              const on = name === draft.avatar;
              return (
                <button
                  key={name}
                  type="button"
                  className={on ? `${styles.gridPick} ${styles.pickOn}` : styles.gridPick}
                  aria-pressed={on}
                  aria-label={`รูปที่ ${i + 1}`}
                  onClick={() => {
                    set({ avatar: name });
                    setAvatarSheet(false);
                  }}
                >
                  <img src={avatarUrl(name)} alt="" />
                  {on && (
                    <span className={styles.tick} aria-hidden="true">
                      <CheckIcon />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export interface MemberFormViewProps {
  root: Root;
  demo: boolean;
  /** Saves a changed root. Demo: not given, so nothing is saved. */
  persist?: (root: Root) => { ok: true } | { ok: false; text: string };
  /** '' or '?demo=...' so a demo stays a demo on the next page. */
  linkSuffix?: string;
  /** Where "back" goes when there is no earlier page. */
  homeHref: string;
  onBack: () => void;
  /** Test links: `avatars` opens the picture sheet, `done` the sheet after saving (with a made-up member in a demo). */
  initialSheet?: 'avatars' | 'done';
  newId?: () => string;
}

const SAMPLE_SAVED: Person = { id: 'sample', name: 'คุณแม่', relation: 'แม่', avatar: 'avatar-02', color: 'green', selfManaged: false, allergies: { status: 'unknown' } };

export function MemberFormView({ root: initialRoot, demo, persist, homeHref, onBack, initialSheet, newId = defaultNewId }: MemberFormViewProps) {
  const [root, setRoot] = useState(initialRoot);
  const [saved, setSaved] = useState<Person | null>(demo && initialSheet === 'done' ? SAMPLE_SAVED : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [round, setRound] = useState(0); // a new number = a blank form

  const onSubmit = (draft: MemberDraft): void => {
    const made = createMember(root, draft, newId);
    if (!made.ok) {
      setSaveError(made.error);
      return;
    }
    const res = persist ? persist(made.root) : ({ ok: true } as const);
    if (!res.ok) {
      setSaveError(res.text); // the form keeps what was typed
      return;
    }
    setRoot(made.root);
    setSaveError(null);
    setSaved(made.person);
  };
  const another = (): void => {
    setSaved(null);
    setSaveError(null);
    setRound((n) => n + 1);
    window.scrollTo?.(0, 0);
  };

  return (
    <MemberForm
      key={round}
      persons={root.persons}
      title="เพิ่มสมาชิก"
      saveError={saveError}
      onBack={onBack}
      onSubmit={onSubmit}
      initialSheet={round === 0 && initialSheet === 'avatars' ? 'avatars' : undefined}
      banner={
        demo && (
          <p className={styles.demo} role="status">
            <InfoIcon />
            โหมดตัวอย่าง ไม่บันทึกข้อมูล
          </p>
        )
      }
    >
      {saved && (
        <Sheet title="เพิ่มสมาชิกแล้ว" onClose={noop}>
          <div className={styles.done}>
            <img className={styles.doneAvatar} src={avatarUrl(saved.avatar)} alt="" />
            <div>
              <p className={styles.doneName}>{saved.name}</p>
              <p className={styles.doneRelation}>{saved.relation}</p>
            </div>
          </div>
          <div className={sheetStyles.body}>
            <div className={sheetStyles.actions}>
              <ComingSoon className={sheetStyles.cancel}>เพิ่มยาให้ {saved.name}</ComingSoon>
              <button type="button" className={sheetStyles.cancel} onClick={another}>
                เพิ่มสมาชิกอีกคน
              </button>
              <a className={`${sheetStyles.cancel} ${styles.linkButton}`} href={homeHref}>
                กลับหน้าหลัก
              </a>
            </div>
          </div>
        </Sheet>
      )}
    </MemberForm>
  );
}
