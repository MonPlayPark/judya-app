// The v3 members tab (M4 PR 9), view only: the list (boards #10, #11, #60), one member (#12, #61) and the edit page (#14, which is
// the add form of PR 6a with starting values). What is shown comes from src/domain/v3/memberEdit.ts; MembersPage owns the data.
// One action = one `persist` call. Demo: `persist` is not given, so nothing is saved and nothing is read from storage.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackIcon, ChevronRightIcon, InfoIcon, PlusIcon, WarningIcon } from '../../components/icons';
import { ComingSoon } from '../../components/v3/ComingSoon';
import { Sheet } from '../../components/v3/Sheet';
import { Toast, useToast } from '../../components/v3/Toast';
import { V3Nav } from '../../components/v3/V3Nav';
import { setFlash, takeFlash } from '../../components/v3/flash';
import { sheetStyles } from '../../components/v3/sheetParts';
import { COVERAGE_LABEL, COVERAGE_NOT_GIVEN, type CoverageDraft } from '../../domain/v3/allergy';
import { buildMemberDetail, buildMembersList, removeMember, restoreMember, updateMember } from '../../domain/v3/memberEdit';
import { draftFromPerson, type MemberDraft } from '../../domain/v3/members';
import { COVERAGE_TYPES, type Root } from '../../domain/v3/schema';
import { avatarUrl, iconUrl } from '../../visual';
import { AllergyBlock } from './AllergyBlock';
import { MemberForm } from './MemberFormV3';
import formStyles from './MemberFormV3.module.css';
import styles from './MembersV3.module.css';

export type Persist = (root: Root) => { ok: true } | { ok: false; text: string };

export interface MembersViewProps {
  root: Root;
  demo: boolean;
  /** Saves a changed root. Demo: not given, so nothing is saved. */
  persist?: Persist;
  /** '' or '?demo=...' so a demo stays a demo on the next page. */
  linkSuffix?: string;
  nowIso: () => string;
}

const PencilIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
);

const listHref = (suffix: string): string => `#/n/members${suffix}`;
const detailHref = (id: string, suffix: string): string => `#/n/members/${encodeURIComponent(id)}${suffix}`;
const go = (hash: string): void => {
  window.location.hash = hash;
};

export function DemoBanner() {
  return (
    <p className={styles.demo} role="status">
      <InfoIcon />
      โหมดตัวอย่าง ไม่บันทึกข้อมูล
    </p>
  );
}

/** The message the page before left ("บันทึกแล้ว", "นำ... ออกแล้ว"), shown once. */
function useFlashToast(): string | null {
  const [toast, show] = useToast();
  useEffect(() => {
    const t = takeFlash();
    if (t) show(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return toast;
}

// ---------------------------------------------------------------------------------------------------------------
// List

export function MembersListView({ root: initialRoot, demo, persist, linkSuffix = '', initialOpen = false }: MembersViewProps & { initialOpen?: boolean }) {
  const [root, setRoot] = useState(initialRoot);
  const [open, setOpen] = useState(initialOpen);
  const [problem, setProblem] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  useEffect(() => {
    const t = takeFlash();
    if (t) showToast(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const m = useMemo(() => buildMembersList(root), [root]);
  const addHref = `#/n/members/new${linkSuffix}`;
  const empty = m.members.length === 0 && m.removed.length === 0;

  const restore = (id: string): void => {
    const r = restoreMember(root, id);
    if (!r.ok) {
      setProblem(r.error);
      return;
    }
    const res = persist ? persist(r.root) : ({ ok: true } as const);
    if (!res.ok) {
      setProblem(res.text);
      return;
    }
    setProblem(null);
    setRoot(r.root);
    showToast(`นำ${r.person.name}กลับแล้ว`);
  };

  return (
    <div className={styles.page}>
      {demo && <DemoBanner />}
      <header className={styles.topStrip}>
        <img className={styles.headIcon} src={iconUrl('nav-members')} alt="" />
        <h1 className={styles.title}>สมาชิก</h1>
      </header>

      <main className={styles.main}>
        {empty ? (
          <section className={`${styles.card} ${styles.empty}`} aria-label="ยังไม่มีสมาชิก">
            <span className={styles.emptyDisc}>
              <img src={iconUrl('nav-members')} alt="" width={64} height={64} />
            </span>
            <h2 className={styles.emptyTitle}>ยังไม่มีสมาชิก</h2>
            <p className={styles.emptyText}>เพิ่มคนที่คุณดูแลยาให้</p>
            <a className={`${styles.bigButton} ${styles.linkButton}`} href={addHref}>
              เพิ่มสมาชิก
            </a>
          </section>
        ) : (
          <>
            {m.members.length > 0 && (
              <ul className={styles.cards} aria-label="สมาชิก">
                {m.members.map((p) => (
                  <li key={p.id}>
                    <a className={`${styles.card} ${styles.memberCard}`} href={detailHref(p.id, linkSuffix)}>
                      <img className={styles.avatar} src={avatarUrl(p.avatar)} alt="" />
                      <span className={styles.memberText}>
                        <span className={styles.memberName}>{p.name}</span>
                        <span className={styles.memberSub}>{p.subText}</span>
                        {p.selfManaged && <span className={styles.chip}>จัดยาทานเอง</span>}
                      </span>
                      <span className={styles.arrow} aria-hidden="true">
                        <ChevronRightIcon />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {m.removed.length > 0 && (
              <section className={styles.card}>
                <button type="button" className={styles.foldButton} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                  <span className={styles.foldIcon}>
                    <img src={iconUrl('delete')} alt="" width={20} height={20} />
                  </span>
                  <span className={styles.foldTitle}>{`สมาชิกที่นำออก (${m.removed.length})`}</span>
                  <span className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}>
                    <ChevronRightIcon />
                  </span>
                </button>
                {open && (
                  <ul className={styles.removedRows}>
                    {m.removed.map((r) => (
                      <li key={r.id} className={styles.removedRow}>
                        <img className={styles.removedAvatar} src={avatarUrl(r.avatar)} alt="" />
                        <span className={styles.removedText}>
                          <span className={styles.removedName}>{r.name}</span>
                          <span className={styles.memberSub}>{r.removedText}</span>
                        </span>
                        <button type="button" className={styles.restore} aria-label={`นำกลับ ${r.name}`} onClick={() => restore(r.id)}>
                          นำกลับ
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {problem !== null && (
                  <p className={styles.problem} role="alert">
                    <WarningIcon />
                    {problem}
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {!empty && (
        <div className={styles.fab}>
          <a className={`${styles.fabButton} ${styles.linkButton}`} href={addHref}>
            <PlusIcon />
            เพิ่มสมาชิก
          </a>
        </div>
      )}
      <V3Nav current="members" />
      <Toast text={toast} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The question before taking a member out (no board; PR 9 decision)

function RemoveSheet({ name, error, onConfirm, onClose }: { name: string; error: string | null; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet title={`นำ${name}ออกจากรายชื่อไหม`} onClose={onClose}>
      <div className={sheetStyles.body}>
        <p className={sheetStyles.hint}>{`ยาของ${name}จะไม่ขึ้นในหน้าหลักและรายการยา นำกลับได้จากหน้ารายชื่อสมาชิก`}</p>
        {error !== null && (
          <p className={styles.problem} role="alert">
            <WarningIcon />
            {error}
          </p>
        )}
        <div className={sheetStyles.actions}>
          <button type="button" className={sheetStyles.danger} onClick={onConfirm}>
            นำออก
          </button>
          <button type="button" className={sheetStyles.cancel} onClick={onClose}>
            ไม่นำออก
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** Takes the member out (one save), leaves the message for the list and goes there. Returns an error text, or null. */
function takeOut(root: Root, id: string, name: string, props: Pick<MembersViewProps, 'persist' | 'linkSuffix' | 'nowIso'>): string | null {
  const next = removeMember(root, id, props.nowIso());
  const res = props.persist ? props.persist(next) : ({ ok: true } as const);
  if (!res.ok) return res.text;
  setFlash(`นำ${name}ออกแล้ว`);
  go(listHref(props.linkSuffix ?? ''));
  return null;
}

export function MemberNotFound({ linkSuffix = '' }: { linkSuffix?: string }) {
  return (
    <div className={styles.page}>
      <header className={styles.topStrip}>
        <a className={styles.back} href={listHref(linkSuffix)} aria-label="กลับไปหน้ารายชื่อสมาชิก">
          <BackIcon />
        </a>
        <h1 className={styles.title}>สมาชิก</h1>
      </header>
      <main className={styles.main}>
        <section className={`${styles.card} ${styles.empty}`}>
          <h2 className={styles.emptyTitle}>ไม่พบสมาชิกคนนี้</h2>
          <p className={styles.emptyText}>อาจถูกนำออกจากรายชื่อแล้ว</p>
          <a className={`${styles.bigButton} ${styles.linkButton}`} href={listHref(linkSuffix)}>
            กลับไปรายชื่อสมาชิก
          </a>
        </section>
      </main>
      <V3Nav current="members" />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// One member

export function MemberDetailView({ root, id, demo, persist, linkSuffix = '', nowIso, initialSheet }: MembersViewProps & { id: string; initialSheet?: 'remove' }) {
  const toast = useFlashToast();
  const [sheet, setSheet] = useState(initialSheet === 'remove');
  const [error, setError] = useState<string | null>(null);
  const d = buildMemberDetail(root, id);
  if (!d) return <MemberNotFound linkSuffix={linkSuffix} />;
  const medsHref = `#/n/meds${linkSuffix}`;
  const addMedHref = `#/n/meds/new?person=${encodeURIComponent(d.id)}${linkSuffix === '' ? '' : `&${linkSuffix.replace('?', '')}`}`;
  const none = d.meds.length === 0;

  return (
    <div className={styles.page}>
      {demo && <DemoBanner />}
      <header className={styles.topStrip}>
        <a className={styles.back} href={listHref(linkSuffix)} aria-label="กลับไปหน้ารายชื่อสมาชิก">
          <BackIcon />
        </a>
        <h1 className={styles.title}>{d.name}</h1>
        <a className={styles.editPill} href={`${detailHref(d.id, '')}/edit${linkSuffix}`}>
          <PencilIcon />
          แก้ไข
        </a>
      </header>

      <main className={styles.main}>
        <section className={`${styles.card} ${styles.infoCard}`} aria-labelledby="md-info">
          <h2 id="md-info" className={styles.cardTitle}>
            ข้อมูลสมาชิก
          </h2>
          <div className={styles.infoBody}>
            <img className={styles.bigAvatar} src={avatarUrl(d.avatar)} alt="" />
            <dl className={styles.infoRows}>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>ปีเกิด</dt>
                <dd className={d.birthText === 'ยังไม่ได้ระบุ' ? `${styles.infoValue} ${styles.infoEmpty}` : styles.infoValue}>{d.birthText}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>สิทธิ์รักษา</dt>
                <dd className={d.coverageText === COVERAGE_NOT_GIVEN ? `${styles.infoValue} ${styles.infoEmpty}` : styles.infoValue}>{d.coverageText}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className={styles.card} aria-labelledby="md-meds">
          <div className={styles.cardHead}>
            <h2 id="md-meds" className={styles.cardTitle}>{`ยาที่ใช้อยู่ (${d.meds.length} รายการ)`}</h2>
            {!none && (
              <a className={styles.seeAll} href={medsHref}>
                ดูทั้งหมด
                <ChevronRightIcon />
              </a>
            )}
          </div>
          {none ? (
            <div className={styles.noMeds}>
              <h3 className={styles.noMedsTitle}>{`${d.name}ยังไม่มียา`}</h3>
              <p className={styles.emptyText}>เพิ่มยาที่หมอสั่ง แล้วดูวันที่ยาพอใช้ได้ที่นี่</p>
              <a className={`${styles.bigButton} ${styles.linkButton}`} href={addMedHref}>
                {`เพิ่มยาให้${d.name}`}
              </a>
            </div>
          ) : (
            <ul className={styles.medRows}>
              {d.meds.map((r) => (
                <li key={r.id}>
                  <a className={styles.medRow} href={`#/n/meds/${encodeURIComponent(r.id)}${linkSuffix}`}>
                    <span className={styles.medText}>
                      <span className={styles.medName}>{r.name}</span>
                      <span className={styles.memberSub}>{r.subText}</span>
                    </span>
                    <span className={styles.arrow} aria-hidden="true">
                      <ChevronRightIcon />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <a className={`${styles.card} ${styles.allergyCard}`} href={`${detailHref(d.id, '')}/allergy${linkSuffix}`}>
          <span className={styles.allergyBody}>
            <span className={styles.cardTitle}>การแพ้ยา</span>
            <AllergyBlock status={d.allergyStatus} text={d.allergyText} items={d.allergyItems} />
          </span>
          <span className={styles.arrow} aria-hidden="true">
            <ChevronRightIcon />
          </span>
        </a>

        <ComingSoon className={styles.share}>
          <img src={iconUrl('share-doctor')} alt="" width={24} height={24} />
          แชร์ให้แพทย์
        </ComingSoon>

        <button type="button" className={styles.removeLink} onClick={() => setSheet(true)}>
          นำสมาชิกออก
        </button>
      </main>

      <V3Nav current="members" />
      {sheet && (
        <RemoveSheet
          name={d.name}
          error={error}
          onClose={() => setSheet(false)}
          onConfirm={() => setError(takeOut(root, d.id, d.name, { persist, linkSuffix, nowIso }))}
        />
      )}
      <Toast text={toast} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Edit

/** Treatment rights (M4 PR 10): one choice among the six types, or none. A company name only for a private insurance.
 * Only the type and the company: no ID card, policy or member number (rule S5). */
function CoverageCard({ value, onChange }: { value: CoverageDraft; onChange: (v: CoverageDraft) => void }) {
  return (
    <section className={formStyles.card} role="group" aria-labelledby="mf-cov">
      <h2 id="mf-cov" className={formStyles.cardTitle}>
        สิทธิ์รักษา (ถ้ามี)
      </h2>
      <div className={formStyles.chips}>
        {COVERAGE_TYPES.map((t) => {
          const on = value?.type === t;
          return (
            <button key={t} type="button" className={on ? `${formStyles.chip} ${formStyles.chipOn}` : formStyles.chip} aria-pressed={on} onClick={() => onChange(t === 'private' ? { type: t, company: value?.company ?? '' } : { type: t })}>
              {COVERAGE_LABEL[t]}
            </button>
          );
        })}
        <button type="button" className={value === null ? `${formStyles.chip} ${formStyles.chipOn}` : formStyles.chip} aria-pressed={value === null} onClick={() => onChange(null)}>
          ไม่ระบุ
        </button>
      </div>
      {value?.type === 'private' && (
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="mf-company">
            ชื่อบริษัทประกัน (ไม่บังคับ)
          </label>
          <input id="mf-company" className={formStyles.input} type="text" autoComplete="off" maxLength={60} value={value.company ?? ''} onChange={(e) => onChange({ type: 'private', company: e.target.value })} />
        </div>
      )}
    </section>
  );
}

export function MemberEditView({ root, id, demo, persist, linkSuffix = '', nowIso, initialSheet }: MembersViewProps & { id: string; initialSheet?: 'avatars' | 'remove' }) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(initialSheet === 'remove');
  const [removeError, setRemoveError] = useState<string | null>(null);
  const person = root.persons.find((p) => p.id === id && p.removedAt === undefined);
  const [coverage, setCoverage] = useState<CoverageDraft>(() => (person?.coverage === undefined ? null : { ...person.coverage }));
  if (!person) return <MemberNotFound linkSuffix={linkSuffix} />;
  const back = detailHref(person.id, linkSuffix);

  const onSubmit = (draft: MemberDraft): void => {
    const r = updateMember(root, person.id, draft, coverage);
    if (!r.ok) {
      setSaveError(r.error);
      return;
    }
    const res = persist ? persist(r.root) : ({ ok: true } as const);
    if (!res.ok) {
      setSaveError(res.text); // the form keeps what was typed
      return;
    }
    setFlash('บันทึกแล้ว');
    go(back);
  };

  const extra: ReactNode = (
    <>
      <CoverageCard value={coverage} onChange={setCoverage} />
      <div className={styles.removeBlock}>
      <button type="button" className={styles.removeLink} onClick={() => setRemoveOpen(true)}>
        นำสมาชิกออก
      </button>
      <p className={formStyles.hint}>นำกลับได้จากหน้ารายชื่อสมาชิก</p>
      </div>
    </>
  );

  return (
    <MemberForm
      initial={draftFromPerson(person)}
      persons={root.persons.filter((p) => p.id !== person.id)}
      title="แก้ไขข้อมูลสมาชิก"
      saveError={saveError}
      onBack={() => go(back)}
      onSubmit={onSubmit}
      initialSheet={initialSheet === 'avatars' ? 'avatars' : undefined}
      banner={
        demo && (
          <p className={formStyles.demo} role="status">
            <InfoIcon />
            โหมดตัวอย่าง ไม่บันทึกข้อมูล
          </p>
        )
      }
      extra={extra}
    >
      {removeOpen && (
        <RemoveSheet
          name={person.name}
          error={removeError}
          onClose={() => setRemoveOpen(false)}
          onConfirm={() => setRemoveError(takeOut(root, person.id, person.name, { persist, linkSuffix, nowIso }))}
        />
      )}
    </MemberForm>
  );
}
