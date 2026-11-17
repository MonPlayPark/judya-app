// The v3 edit-medicine screen (M4 PR 8a, boards #24 - #27): fix what was typed wrongly or not completely. View only: every rule
// (what changed, what needs the confirm sheet, the texts of the numbers, how it is written) is in src/domain/v3/editMedicine.ts.
// An edit is not a dose change and writes nothing to the usage history. EditMedPage owns the data and the way back.
import { useMemo, useState, type ReactNode } from 'react';
import { BackIcon, CheckCircleIcon, InfoIcon, WarningIcon } from '../../components/icons';
import { ComingSoon } from '../../components/v3/ComingSoon';
import { KindIcon } from '../../components/v3/KindIcon';
import { Sheet } from '../../components/v3/Sheet';
import { DateField, sheetStyles as sheet } from '../../components/v3/sheetParts';
import type { IsoDate } from '../../domain/calc';
import {
  NAME_MAX,
  KIND_ORDER,
  buyQuestion,
  countFields,
  isTubeKind,
  sizeFields,
  type BuyAs,
} from '../../domain/v3/addMedicine';
import {
  CONFIRM_WARN_HOUSE,
  CONFIRM_WARN_PERSONAL,
  KIND_LABEL,
  SHARED_KIND_TEXT,
  applyEdit,
  changeKind,
  draftFromCurrent,
  editBuyLabel,
  editBuyOptions,
  evaluateEdit,
  editContext,
  houseUnitOptions,
  isCrossGroup,
  resetForKind,
  type EditDraft,
  type EditField,
  type EditTarget,
} from '../../domain/v3/editMedicine';
import { STRENGTH_UNITS, type MedKind, type Root } from '../../domain/v3/schema';
import { avatarUrl, iconUrl } from '../../visual';
import add from './AddMedV3.module.css';
import detail from './MedDetailV3.module.css';
import styles from './EditMedV3.module.css';

export interface EditMedViewProps {
  root: Root;
  target: EditTarget;
  today: IsoDate;
  demo: boolean;
  /** Saves a changed root. Demo: not given, so nothing is saved. */
  persist?: (root: Root) => { ok: true } | { ok: false; text: string };
  /** Where the back arrow goes (the medicine's page, or the house list). */
  backHref: string;
  /** Called after a (pretend, in a demo) successful save. */
  onSaved: () => void;
}

export function EditMedNotFound({ listHref }: { listHref: string }) {
  return (
    <div className={detail.page}>
      <main className={detail.notFound}>
        <h1 className={detail.notFoundTitle}>ไม่พบยานี้</h1>
        <p className={detail.sub}>ยานี้อาจถูกลบไปแล้ว หรือลิงก์ไม่ถูกต้อง</p>
        <a className={detail.notFoundButton} href={listHref}>
          กลับไปรายการยา
        </a>
      </main>
    </div>
  );
}

type Tone = 'warn' | 'info' | 'ok' | 'error';
function Note({ tone, icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  const cls = tone === 'warn' ? add.boxWarn : tone === 'info' ? add.boxInfo : tone === 'ok' ? add.boxOk : tone === 'error' ? add.boxError : add.hint;
  return (
    <p className={cls} role={tone === 'error' ? 'alert' : undefined}>
      {icon}
      <span>{children}</span>
    </p>
  );
}

/** The small blue "แก้แล้ว" next to a label when that part differs from the saved value (a word, never colour alone). */
function Changed({ on }: { on: boolean }) {
  return on ? (
    <span className={styles.chg}>
      <CheckCircleIcon />
      แก้แล้ว
    </span>
  ) : null;
}

const LockGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4V7z" />
  </svg>
);

type SheetName = 'confirm' | 'kind' | 'shared';

export function EditMedView({ root, target, today, demo, persist, backHref, onSaved }: EditMedViewProps) {
  const ctx = useMemo(() => editContext(root, target, today), [root, target, today]);
  const [draft, setDraft] = useState<EditDraft | null>(() => draftFromCurrent(root, target, today));
  const [open, setOpen] = useState<SheetName | null>(null);
  const [pending, setPending] = useState<MedKind | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  if (!ctx || !draft) return <EditMedNotFound listHref={target.type === 'house' ? '#/n/meds?tab=house' : '#/n/meds'} />;

  const house = target.type === 'house';
  const ev = evaluateEdit(root, target, draft, today);
  const changed = (f: EditField): boolean => ev.fields.includes(f);
  const set = (patch: Partial<EditDraft>): void => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setStock = (patch: Partial<EditDraft['stock']>): void => setDraft((d) => (d ? { ...d, stock: { ...d.stock, ...patch } } : d));
  const kind = draft.kind;

  const pickKind = (k: MedKind): void => {
    if (k === kind) return;
    if (!isCrossGroup(kind, k)) {
      setDraft((d) => (d ? changeKind(d, k) : d));
      return;
    }
    setPending(k);
    setOpen(ctx.crossGroupAllowed ? 'kind' : 'shared');
  };
  const closeSheet = (): void => {
    setOpen(null);
    setPending(null);
  };

  const run = (): void => {
    const made = applyEdit(root, target, draft, today);
    if (!made.ok) {
      setSaveError(made.error);
      setOpen(null);
      return;
    }
    const res = persist ? persist(made.root) : ({ ok: true } as const);
    if (!res.ok) {
      setSaveError(res.text); // the form keeps what was typed
      setOpen(null);
      return;
    }
    setSaveError(null);
    onSaved();
  };
  const onSave = (): void => {
    setSaveError(null);
    if (ev.confirm) setOpen('confirm');
    else run();
  };

  const strengthBad = ev.strengthBad;
  const buy = draft.stock.buy;
  const sizes = house ? [] : sizeFields(kind, buy);
  const counts = house ? [] : countFields(kind, buy);
  const missing = new Set(ev.missing);
  const tube = isTubeKind(kind);
  const buyOptions = editBuyOptions(kind, buy);
  const houseUnits = houseUnitOptions(kind, draft.house.unit);
  const houseCounted = draft.house.unit !== null;

  return (
    <div className={detail.page}>
      {demo && (
        <p className={add.demo} role="status">
          <InfoIcon />
          โหมดตัวอย่าง ไม่บันทึกข้อมูล
        </p>
      )}
      <header className={detail.head}>
        <a className={detail.round} href={backHref} aria-label="กลับ">
          <BackIcon />
        </a>
        <img className={detail.headIcon} src={iconUrl('nav-medicines')} alt="" />
        <h1 className={detail.title}>แก้ข้อมูลยา</h1>
      </header>

      <div className={styles.body}>
        {/* ----- card 1: medicine ----- */}
        <section className={add.card} aria-labelledby="em-info">
          <h2 id="em-info" className={add.cardTitle}>
            ข้อมูลยา
          </h2>
          {house ? (
            <p className={styles.houseBadge}>ยาสามัญประจำบ้าน</p>
          ) : (
            ctx.owner && (
              <div className={styles.owner}>
                <img className={styles.ownerAvatar} src={avatarUrl(ctx.owner.avatar)} alt="" />
                <div>
                  <p className={styles.ownerName}>ยาของ {ctx.owner.name}</p>
                  <p className={add.hint}>เปลี่ยนเจ้าของไม่ได้ ถ้าใส่ผิดให้เพิ่มยาใหม่ให้ถูกคน</p>
                </div>
              </div>
            )
          )}

          <div className={add.field}>
            <div className={styles.labelRow}>
              <label className={add.label} htmlFor="em-name">
                ชื่อยา <span className={styles.star}>*</span>
              </label>
              <Changed on={changed('name')} />
            </div>
            <input
              id="em-name"
              className={ev.nameError ? `${add.input} ${add.inputError}` : add.input}
              type="text"
              autoComplete="off"
              maxLength={NAME_MAX}
              placeholder="เช่น VitaminD"
              aria-invalid={ev.nameError !== null}
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
            />
            {ev.nameError && (
              <Note tone="error" icon={<WarningIcon />}>
                {ev.nameError}
              </Note>
            )}
            {ev.duplicateNote && (
              <Note tone="warn" icon={<WarningIcon />}>
                {ev.duplicateNote}
              </Note>
            )}
          </div>

          <div className={add.field} role="group" aria-labelledby="em-kind">
            <div className={styles.labelRow}>
              <span id="em-kind" className={add.label}>
                ชนิดยา <span className={styles.star}>*</span>
              </span>
              <Changed on={changed('kind')} />
            </div>
            <div className={add.kinds}>
              {KIND_ORDER.map((k) => (
                <button key={k} type="button" className={kind === k ? `${add.kindTile} ${add.on}` : add.kindTile} aria-pressed={kind === k} onClick={() => pickKind(k)}>
                  <KindIcon kind={k} size={28} />
                  <span>{KIND_LABEL[k]}</span>
                </button>
              ))}
            </div>
            <p className={add.hint}>
              ชนิดที่เลือกอยู่: <strong className={styles.strong}>{KIND_LABEL[kind]}</strong>
            </p>
          </div>

          <div className={add.field}>
            <div className={styles.labelRow}>
              <label className={add.label} htmlFor="em-strength">
                ความแรง (ไม่บังคับ)
              </label>
              <Changed on={changed('strength')} />
            </div>
            <div className={add.strengthRow}>
              <input
                id="em-strength"
                className={`${add.input} ${strengthBad ? add.inputError : ''}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="เช่น 500"
                aria-invalid={strengthBad}
                value={draft.strength.value}
                onChange={(e) => set({ strength: { ...draft.strength, value: e.target.value } })}
              />
              <select className={add.select} aria-label="หน่วยความแรง" value={draft.strength.unit} onChange={(e) => set({ strength: { ...draft.strength, unit: e.target.value as (typeof STRENGTH_UNITS)[number] } })}>
                {STRENGTH_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            {strengthBad && (
              <Note tone="error" icon={<WarningIcon />}>
                ความแรงต้องเป็นตัวเลขมากกว่า 0
              </Note>
            )}
          </div>
        </section>

        {ev.doseNote && (
          <Note tone="warn" icon={<WarningIcon />}>
            {ev.doseNote}
          </Note>
        )}

        {/* ----- card 2: bought as / counted as ----- */}
        <section className={add.card} aria-labelledby="em-buy">
          <div className={styles.labelRow}>
            <h2 id="em-buy" className={add.cardTitle}>
              {house ? 'นับเป็นอะไร' : buyQuestion(kind)} {!tube && !house && <span className={styles.star}>*</span>}
            </h2>
            <Changed on={changed('buy')} />
          </div>
          {house ? (
            <div className={add.buys}>
              <button type="button" className={!houseCounted ? `${add.buyTile} ${add.on}` : add.buyTile} aria-pressed={!houseCounted} onClick={() => set({ house: { ...draft.house, unit: null } })}>
                <KindIcon kind={kind} size={28} />
                <span>ไม่นับสต็อก</span>
              </button>
              {houseUnits.map((u) => (
                <button key={u} type="button" className={draft.house.unit === u ? `${add.buyTile} ${add.on}` : add.buyTile} aria-pressed={draft.house.unit === u} onClick={() => set({ house: { ...draft.house, unit: u } })}>
                  <KindIcon kind={kind} size={28} />
                  <span>{u}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={add.buys}>
              {buyOptions.map((b: BuyAs) => (
                <button
                  key={b}
                  type="button"
                  className={buy === b ? `${add.buyTile} ${add.on}` : add.buyTile}
                  aria-pressed={buy === b}
                  onClick={() => setStock({ buy: b })}
                >
                  <KindIcon kind={kind} size={28} />
                  <span>{editBuyLabel(kind, b)}</span>
                </button>
              ))}
            </div>
          )}
          {(house ? !houseCounted : buy === 'none') && (
            <Note tone="info" icon={<InfoIcon />}>
              ไม่นับสต็อกก็ได้ แต่แอพจะไม่เตือนให้ซื้อเติม
            </Note>
          )}
        </section>

        {/* ----- card 3: pack size (personal) ----- */}
        {sizes.length > 0 && (
          <section className={add.card} aria-labelledby="em-pack">
            <div className={styles.labelRow}>
              <h2 id="em-pack" className={add.cardTitle}>
                {tube ? `ปริมาณต่อ${buy === 'bottle' ? 'ขวด' : 'หลอด'} (ถ้ามี)` : 'ขนาดบรรจุ'} {!tube && <span className={styles.star}>*</span>}
              </h2>
              <Changed on={changed('pack')} />
            </div>
            <div className={styles.joined}>
              {sizes.map((f, i) => {
                const bad = missing.has(f.key);
                return (
                  <span key={f.key} className={styles.part}>
                    {i > 0 && <span className={styles.joiner} aria-hidden="true">×</span>}
                    <span className={styles.box}>
                      <span className={bad ? `${add.numberBox} ${add.numberBad}` : add.numberBox}>
                        <input
                          className={add.numberInput}
                          type="text"
                          inputMode={f.key === 'amount' ? 'decimal' : 'numeric'}
                          placeholder="0"
                          aria-label={f.label}
                          aria-invalid={bad}
                          value={draft.stock.size[f.key]}
                          onChange={(e) => setStock({ size: { ...draft.stock.size, [f.key]: e.target.value } })}
                        />
                        <span className={add.unit}>{f.unit}</span>
                      </span>
                      {bad && (
                        <Note tone="error" icon={<WarningIcon />}>
                          ต้องกรอกช่องนี้
                        </Note>
                      )}
                    </span>
                  </span>
                );
              })}
            </div>
            {ev.packLine && (
              <Note tone="ok" icon={<CheckCircleIcon />}>
                {ev.packLine}
              </Note>
            )}
            {ev.packWarning && (
              <Note tone="warn" icon={<WarningIcon />}>
                {ev.packWarning}
              </Note>
            )}
            {ev.sharedPackNote && <Note icon={<InfoIcon />}>{ev.sharedPackNote}</Note>}
          </section>
        )}
        {sizes.length === 0 && !house && ev.sharedPackNote && (
          <Note tone="info" icon={<InfoIcon />}>
            {ev.sharedPackNote}
          </Note>
        )}

        {/* ----- card 4: how many there are now ----- */}
        {(house ? houseCounted : counts.length > 0) && (
          <section className={add.card} aria-labelledby="em-count">
            <div className={styles.labelRow}>
              <h2 id="em-count" className={add.cardTitle}>
                จำนวนที่มีตอนนี้ (ไม่บังคับ)
              </h2>
              <Changed on={changed('count')} />
            </div>
            {house ? (
              <div className={styles.joined}>
                <span className={styles.box}>
                  <span className={ev.countProblem ? `${add.numberBox} ${add.numberBad}` : add.numberBox}>
                    <input
                      className={add.numberInput}
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`จำนวน ${draft.house.unit ?? ''}`}
                      aria-invalid={ev.countProblem !== null}
                      value={draft.house.qty}
                      onChange={(e) => set({ house: { ...draft.house, qty: e.target.value } })}
                    />
                    <span className={add.unit}>{draft.house.unit}</span>
                  </span>
                </span>
              </div>
            ) : (
              <div className={styles.joined}>
                {counts.map((f, i) => (
                  <span key={f.key} className={styles.part}>
                    {i > 0 && <span className={styles.joiner} aria-hidden="true">+</span>}
                    <span className={styles.box}>
                      <label className={add.numberBox}>
                        <input
                          className={add.numberInput}
                          type="text"
                          inputMode={f.key === 'loose' ? 'decimal' : 'numeric'}
                          placeholder="0"
                          aria-label={`จำนวน ${f.unit}${f.note ? ` ${f.note}` : ''}`}
                          value={draft.stock.counts[f.key]}
                          onChange={(e) => setStock({ counts: { ...draft.stock.counts, [f.key]: e.target.value } })}
                        />
                        <span className={add.unit}>{f.unit}</span>
                      </label>
                      {f.note && <span className={add.hint}>{f.note}</span>}
                    </span>
                  </span>
                ))}
              </div>
            )}
            {ev.countProblem && (
              <Note tone="error" icon={<WarningIcon />}>
                {ev.countProblem}
              </Note>
            )}
            {ev.totalText && (
              <div className={styles.result}>
                <p className={styles.resultMain}>{ev.totalText}</p>
                {ev.daysText && <p className={styles.resultSub}>{ev.daysText}</p>}
              </div>
            )}
            {tube && !house && (
              <Note tone="info" icon={<InfoIcon />}>
                ครีมและยาหยอดไม่ตัดสต็อกให้เอง กด “เปิดหลอดใหม่” ที่หน้ายาเมื่อเริ่มใช้หลอดใหม่ แอพจะเตือนเมื่อเหลือ 1 หลอด/ขวด
              </Note>
            )}
            {house && (
              <Note tone="info" icon={<InfoIcon />}>
                ยาสามัญแอพไม่ตัดสต็อกให้ ปรับจำนวนเองได้ที่หน้ายา
              </Note>
            )}
            {ev.sharedStockNote && <Note icon={<InfoIcon />}>{ev.sharedStockNote}</Note>}
          </section>
        )}

        {/* ----- card 5: expiry ----- */}
        <section className={add.card} aria-labelledby="em-expiry">
          <div className={styles.labelRow}>
            <h2 id="em-expiry" className={add.cardTitle}>
              วันหมดอายุ (ไม่บังคับ)
            </h2>
            <Changed on={changed('expiry')} />
          </div>
          <DateField value={draft.expiry} onChange={(v) => set({ expiry: v })} label="วันหมดอายุ" />
          <p className={add.hint}>ใส่แล้วแอพจะเตือนก่อนหมดอายุ {root.settings.expiryWarnDays} วัน</p>
          {ev.sharedStockNote && !house && counts.length === 0 && <Note icon={<InfoIcon />}>{ev.sharedStockNote}</Note>}
        </section>
      </div>

      {/* ----- the bar ----- */}
      <div className={styles.bar}>
        {saveError !== null && (
          <p className={add.saveError} role="alert">
            <WarningIcon />
            {saveError}
          </p>
        )}
        {ev.blocker ? (
          <>
            <button type="button" className={styles.saveOff} disabled>
              <LockGlyph />
              บันทึกการแก้ไข
            </button>
            <p className={styles.barNote}>{ev.blocker}</p>
          </>
        ) : (
          <button type="button" className={styles.save} onClick={onSave}>
            บันทึกการแก้ไข
          </button>
        )}
      </div>

      {open === 'confirm' && (
        <Sheet title="ตรวจก่อนบันทึก" onClose={closeSheet}>
          <div className={sheet.body}>
            <ul className={styles.rows}>
              {ev.rows.map((r) => (
                <li key={r.label} className={styles.row}>
                  <p className={styles.rowLabel}>{r.label}</p>
                  <p className={styles.rowOld}>
                    <span>เดิม</span> {r.before}
                  </p>
                  <p className={styles.rowNew}>
                    <span>ใหม่</span> {r.after}
                  </p>
                </li>
              ))}
            </ul>
            <Note tone="warn" icon={<WarningIcon />}>
              {house ? CONFIRM_WARN_HOUSE : CONFIRM_WARN_PERSONAL}
            </Note>
            <div className={sheet.actions}>
              <button type="button" className={sheet.primary} onClick={run}>
                ยืนยันและบันทึก
              </button>
              <button type="button" className={sheet.cancel} onClick={closeSheet}>
                กลับไปแก้
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {open === 'kind' && pending && (
        <Sheet title={`เปลี่ยนชนิดยาเป็น ${KIND_LABEL[pending]}?`} onClose={closeSheet}>
          <div className={sheet.body}>
            <p className={styles.sheetText}>ต้องกรอกขนาดบรรจุและจำนวนที่มีใหม่ เพราะหน่วยไม่เหมือนเดิม</p>
            {!house && (
              <>
                <Note tone="warn" icon={<WarningIcon />}>
                  วิธีกินเดิมใช้หน่วยของเม็ด ถ้ายังไม่ปรับ ให้ไปที่ เปลี่ยนวิธีกิน (หมอสั่งใหม่)
                </Note>
                <ComingSoon className={styles.sheetLink}>ไปที่ เปลี่ยนวิธีกิน (หมอสั่งใหม่)</ComingSoon>
              </>
            )}
            <div className={sheet.actions}>
              <button
                type="button"
                className={sheet.primary}
                onClick={() => {
                  setDraft((d) => (d ? resetForKind(d, pending) : d));
                  closeSheet();
                }}
              >
                เปลี่ยนชนิดยา
              </button>
              <button type="button" className={sheet.cancel} onClick={closeSheet}>
                ไม่เปลี่ยน
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {open === 'shared' && pending && (
        <Sheet title={`เปลี่ยนชนิดยาเป็น ${KIND_LABEL[pending]}?`} onClose={closeSheet}>
          <div className={sheet.body}>
            <p className={styles.sheetText}>{SHARED_KIND_TEXT}</p>
            <div className={sheet.actions}>
              <button type="button" className={sheet.primary} onClick={closeSheet}>
                ตกลง
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
