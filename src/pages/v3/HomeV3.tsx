// The v3 Home screen (M4 PR 4): view only. All decisions come from `buildHome` (src/domain/v3/home.ts); the page that
// owns the data and the clock is HomeV3Page. Places with no destination yet use <ComingSoon>.
import { CheckIcon, WarningIcon, InfoIcon, PlusIcon } from '../../components/icons';
import { ComingSoon } from '../../components/v3/ComingSoon';
import { EveningIcon, MorningIcon, NightIcon, NoonIcon } from '../../components/v3/PeriodIcons';
import { V3Nav } from '../../components/v3/V3Nav';
import { PERIOD_LABEL, type CareItem, type DoseRow, type HomeModel, type Period } from '../../domain/v3/home';
import { avatarUrl, iconUrl } from '../../visual';
import mascotUrl from '../../assets/visual/mascot/pharmacist-clipboard.svg?url';
import '../../styles/v3theme.css';
import styles from './HomeV3.module.css';

export interface HomeViewProps {
  model: HomeModel;
  demo: boolean;
  /** Readable text when the last tick could not be saved; null = nothing to report. */
  saveError: string | null;
  onPick: (personId: string) => void;
  onToggle: (key: string) => void;
  /** '' or '?demo=...' added to links, so a demo stays a demo on the next page. */
  linkSuffix?: string;
}

const PERIOD_ICON: Record<Period, (p: { size?: number }) => JSX.Element> = {
  morning: MorningIcon,
  noon: NoonIcon,
  evening: EveningIcon,
  bedtime: NightIcon,
};

/** The brand mark only (no word): public/icons/judya-mark.svg. */
const LOGO_URL = `${import.meta.env.BASE_URL}icons/judya-mark.svg`;

export function HomeView({ model, demo, saveError, onPick, onToggle, linkSuffix = '' }: HomeViewProps) {
  const addMemberHref = `#/n/members/new${linkSuffix}`;
  const m = model;
  const hero = m.headline.done ? `${styles.hero} ${styles.heroDone}` : styles.hero;
  return (
    <div className={`v3theme ${styles.page}`}>
      {demo && (
        <p className={styles.demo} role="status">
          <InfoIcon />
          โหมดตัวอย่าง ไม่บันทึกข้อมูล
        </p>
      )}

      <header className={hero}>
        <div className={styles.heroText}>
          <div className={styles.greetRow}>
            <img className={styles.logo} src={LOGO_URL} alt="JudYa" />
            <h1 className={styles.greeting}>สวัสดีค่ะ</h1>
          </div>
          <p className={m.headline.done ? `${styles.headline} ${styles.headlineDone}` : styles.headline}>
            {m.headline.done && <CheckIcon />}
            {m.headline.text}
          </p>
          {m.warning && (
            <p className={styles.warning}>
              <WarningIcon />
              <span>{m.warning.text}</span>
            </p>
          )}
          {m.extraWarnings > 0 && <p className={styles.extra}>+{m.extraWarnings} เรื่อง</p>}
          <span className={styles.datePill}>{m.dateText}</span>
        </div>
        <img className={styles.mascot} src={mascotUrl} alt="น้องเภสัชถือคลิปบอร์ด" />
      </header>

      <main className={styles.body}>
        {saveError !== null && (
          <p className={styles.saveError} role="alert">
            <WarningIcon />
            {saveError}
          </p>
        )}
        {m.state !== 'ready' && <StartCard model={m} addMemberHref={addMemberHref} />}
        {m.showMembers && <MembersCard model={m} onPick={onPick} addMemberHref={addMemberHref} />}
        {m.showToday && <TodayCard model={m} onToggle={onToggle} />}
        {m.care.length > 0 && <CareCard model={m} />}
        {m.showTiles && <Shortcuts />}
      </main>

      <V3Nav current="home" />
    </div>
  );
}

function StartCard({ model, addMemberHref }: { model: HomeModel; addMemberHref: string }) {
  const memberDone = model.state === 'S1';
  return (
    <section className={`${styles.card} ${styles.cardStart}`} aria-labelledby="start-h">
      <h2 id="start-h" className={styles.heading}>
        เริ่มต้นใช้งาน
      </h2>
      <div className={styles.step}>
        <span className={memberDone ? `${styles.stepNo} ${styles.stepNoDone}` : styles.stepNo} aria-hidden="true">
          1
        </span>
        <span className={styles.stepBody}>
          <span className={styles.stepTitle}>
            เพิ่มสมาชิกคนแรก
            {memberDone && (
              <span className={styles.doneChip}>
                <CheckIcon />
                เสร็จแล้ว
              </span>
            )}
          </span>
          <span className={styles.stepSub}>
            {memberDone ? `${model.firstMemberName ?? ''} · เพิ่มแล้ว` : 'ใครเป็นคนกินยา เช่น พ่อ แม่ หรือตัวคุณเอง'}
          </span>
          {!memberDone && (
            <a className={`${styles.stepButton} ${styles.stepLink}`} href={addMemberHref}>
              <PlusIcon />
              เพิ่มสมาชิก
            </a>
          )}
        </span>
      </div>
      <div className={styles.step}>
        <span className={styles.stepNo} aria-hidden="true">
          2
        </span>
        <span className={styles.stepBody}>
          <span className={styles.stepTitle}>เพิ่มยาตัวแรก</span>
          <span className={styles.stepSub}>ใส่ยาของสมาชิก แล้ว JudYa จะนับวันที่ยาพอใช้ให้</span>
          {memberDone ? (
            <ComingSoon className={styles.stepButton} badgeClassName={styles.stepBadge}>
              <PlusIcon />
              เพิ่มยา
            </ComingSoon>
          ) : (
            <span className={styles.locked}>ต้องเพิ่มสมาชิกก่อน</span>
          )}
        </span>
      </div>
    </section>
  );
}

function MembersCard({ model, onPick, addMemberHref }: { model: HomeModel; onPick: (id: string) => void; addMemberHref: string }) {
  return (
    <section className={`${styles.card} ${styles.cardMembers}`} aria-labelledby="members-h">
      <div className={styles.cardHead}>
        <h2 id="members-h" className={styles.headingInline}>
          สมาชิกในครอบครัว
        </h2>
        <ComingSoon className={styles.manage} badgeClassName={styles.manageBadge}>
          จัดการ
        </ComingSoon>
      </div>
      <div className={styles.members}>
        {model.members.map((c) => {
          const selected = c.id === model.selectedId;
          return (
            <button
              key={c.id}
              type="button"
              className={styles.member}
              aria-pressed={selected}
              onClick={() => onPick(c.id)}
            >
              <img className={selected ? `${styles.avatar} ${styles.avatarOn}` : styles.avatar} src={avatarUrl(c.avatar)} alt="" />
              <span className={styles.memberName}>{c.name}</span>
              <span className={selected ? `${styles.memberCount} ${styles.memberCountOn}` : styles.memberCount}>{c.countText}</span>
            </button>
          );
        })}
        <a className={styles.member} href={addMemberHref}>
          <span className={styles.addCell}>
            <span className={styles.addCircle}>
              <PlusIcon />
            </span>
            <span className={styles.memberName}>เพิ่มสมาชิก</span>
          </span>
        </a>
      </div>
    </section>
  );
}

function TodayCard({ model, onToggle }: { model: HomeModel; onToggle: (key: string) => void }) {
  return (
    <section className={`${styles.card} ${styles.cardToday}`} aria-labelledby="today-h">
      <h2 id="today-h" className={styles.heading}>
        ยาของวันนี้ ({model.selectedName})
      </h2>
      {model.selectedRows.length === 0 ? (
        <div className={styles.row}>
          <span className={`${styles.rowIcon} ${styles.rowIconCheck}`}>
            <CheckIcon />
          </span>
          <span className={styles.rowText}>
            <span className={styles.rowName}>วันนี้ไม่มียาที่ต้องกิน</span>
            <span className={styles.rowSub}>{model.selectedName}ไม่มียาตามตารางวันนี้</span>
          </span>
        </div>
      ) : (
        model.selectedRows.map((r) => <DoseLine key={r.key} row={r} onToggle={onToggle} />)
      )}
    </section>
  );
}

function DoseLine({ row, onToggle }: { row: DoseRow; onToggle: (key: string) => void }) {
  const Icon = PERIOD_ICON[row.period];
  return (
    <div className={styles.row}>
      <span className={styles.rowIcon}>
        <Icon />
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowName}>{row.name}</span>
        <span className={styles.rowSub}>
          {PERIOD_LABEL[row.period]} · {row.amountText}
          {row.extra ? ` · ${row.extra}` : ''}
        </span>
      </span>
      <button
        type="button"
        className={row.done ? `${styles.tick} ${styles.tickDone}` : styles.tick}
        aria-pressed={row.done}
        aria-label={`${row.name} ${row.periodLabel} ${row.done ? 'จัดแล้ว แตะเพื่อยกเลิก' : 'รอจัด แตะเพื่อทำเครื่องหมายว่าจัดแล้ว'}`}
        onClick={() => onToggle(row.key)}
      >
        {row.done ? <CheckIcon /> : <span className={styles.circle} aria-hidden="true" />}
        {row.done ? 'จัดแล้ว' : 'รอจัด'}
      </button>
    </div>
  );
}

function CareCard({ model }: { model: HomeModel }) {
  return (
    <section className={`${styles.card} ${styles.cardCare}`} aria-labelledby="care-h">
      <div className={styles.cardHead}>
        <img className={styles.careIcon} src={iconUrl('expiry-alert')} alt="" />
        <h2 id="care-h" className={styles.headingInline}>
          ยาที่ต้องดูแล
        </h2>
      </div>
      {model.careShown.map((c) => (
        <CareLine key={c.key} item={c} />
      ))}
      {model.careMore > 0 && <p className={styles.more}>และอีก {model.careMore} รายการ</p>}
      <ComingSoon className={styles.orderButton} badgeClassName={styles.orderBadge}>
        <img className={styles.orderIcon} src={iconUrl('order')} alt="" />
        สั่งยา
      </ComingSoon>
    </section>
  );
}

function CareLine({ item }: { item: CareItem }) {
  const bad = item.kind === 'expired' || item.kind === 'out';
  return (
    <div className={styles.careRow}>
      <span className={styles.rowText}>
        <span className={`${styles.rowName} ${styles.careName}`}>{item.name}</span>
        <span className={styles.rowSub}>
          {item.who} · {item.reason}
        </span>
      </span>
      <span className={bad ? `${styles.chip} ${styles.chipBad}` : `${styles.chip} ${styles.chipWarn}`}>
        <WarningIcon />
        {item.chip}
      </span>
    </div>
  );
}

function Shortcuts() {
  return (
    <div className={styles.tiles}>
      <Tile icon="order" title="สั่งซื้อยา" sub="เปรียบเทียบราคา" />
      <Tile icon="share-doctor" title="แชร์ให้แพทย์" sub="สรุปข้อมูลยา" />
      <MedsTile />
    </div>
  );
}

function Tile({ icon, title, sub }: { icon: 'order' | 'share-doctor'; title: string; sub: string }) {
  return (
    <ComingSoon className={styles.tile} badgeClassName={styles.tileBadge}>
      <img className={styles.tileIcon} src={iconUrl(icon)} alt="" />
      <span className={styles.tileText}>
        <span className={styles.tileTitle}>{title}</span>
        <span className={styles.tileSub}>{sub}</span>
      </span>
    </ComingSoon>
  );
}

/** The only shortcut with a page so far: a real link to the medicine list (same card look, no "coming soon" badge). */
function MedsTile() {
  return (
    <a href="#/n/meds" className={`${styles.tile} ${styles.tileWide} ${styles.tileLink}`}>
      <img className={styles.tileIcon} src={iconUrl('nav-medicines')} alt="" />
      <span className={styles.tileText}>
        <span className={styles.tileTitle}>รายการยา</span>
        <span className={styles.tileSub}>ดูและจัดการยา</span>
      </span>
    </a>
  );
}
