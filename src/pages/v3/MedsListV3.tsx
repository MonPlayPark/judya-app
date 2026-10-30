// The v3 medicine list screen (M4 PR 5a): view only. What to show comes from `buildMedsList`
// (src/domain/v3/medsList.ts); MedsListPage owns the data and the clock. Nothing here writes data: rows are not
// pressable yet (details = PR 5b) and every place with no destination yet is <ComingSoon>.
import { useMemo, useState } from 'react';
import { CheckCircleIcon, ChevronRightIcon, ClockIcon, InfoIcon, PlusIcon, WarningIcon, XCircleIcon } from '../../components/icons';
import { ComingSoon } from '../../components/v3/ComingSoon';
import { KindIcon } from '../../components/v3/KindIcon';
import { EveningIcon, MorningIcon, NightIcon, NoonIcon } from '../../components/v3/PeriodIcons';
import { V3Nav } from '../../components/v3/V3Nav';
import type { IsoDate } from '../../domain/calc';
import type { Period } from '../../domain/v3/home';
import {
  buildMedsList,
  type EmptyKind,
  type HouseRow,
  type MedRow,
  type MedsFilter,
  type MedsTab,
  type MemberGroup,
  type StatusChip,
} from '../../domain/v3/medsList';
import type { Root } from '../../domain/v3/schema';
import { avatarUrl, iconUrl, type IconName } from '../../visual';
import mascotUrl from '../../assets/visual/mascot/pharmacist-clipboard.svg?url';
import '../../styles/v3theme.css';
import styles from './MedsListV3.module.css';

export interface MedsListViewProps {
  root: Root;
  today: IsoDate;
  demo: boolean;
  /** Test links only: which tab and which folded section start open. */
  initial?: { tab?: MedsTab; open?: 'stopped' | 'deleted' };
}

const LOGO_URL = `${import.meta.env.BASE_URL}icons/judya-mark.svg`;

const PERIOD_ICON: Record<Period, (p: { size?: number }) => JSX.Element> = {
  morning: MorningIcon,
  noon: NoonIcon,
  evening: EveningIcon,
  bedtime: NightIcon,
};

const FILTERS: { id: MedsFilter; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'low', label: 'ใกล้หมด' },
  { id: 'expiring', label: 'ใกล้หมดอายุ' },
];

const EMPTY: Record<Exclude<EmptyKind, 'no-match'>, { icon: IconName; title: string; text: string; button: string }> = {
  'no-member': { icon: 'nav-members', title: 'ยังไม่มีสมาชิก', text: 'ต้องเพิ่มสมาชิกก่อน จึงเพิ่มยาได้', button: 'เพิ่มสมาชิก' },
  'no-meds': { icon: 'nav-medicines', title: 'ยังไม่มียาประจำตัว', text: 'เพิ่มยาที่หมอสั่ง แล้วดูวันที่ยาพอใช้ได้ที่นี่', button: 'เพิ่มยา' },
  'no-house': { icon: 'household-medicine', title: 'ยังไม่มียาสามัญประจำบ้าน', text: 'ยาที่ใช้ร่วมกันทั้งบ้าน เช่น พาราเซตามอล', button: 'เพิ่มยา' },
};

const SearchGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);
const CloseGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const CartGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h2.5l2 10h10l2-7.5H7" />
    <circle cx="9" cy="19" r="1.4" />
    <circle cx="17" cy="19" r="1.4" />
  </svg>
);

export function MedsListView({ root, today, demo, initial }: MedsListViewProps) {
  const [tab, setTab] = useState<MedsTab>(initial?.tab ?? (initial?.open === 'deleted' ? 'house' : 'mine'));
  const [filter, setFilter] = useState<MedsFilter>('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [stoppedOpen, setStoppedOpen] = useState(initial?.open === 'stopped');
  const [deletedOpen, setDeletedOpen] = useState(initial?.open === 'deleted');
  const m = useMemo(() => buildMedsList(root, today, { tab, filter, query }), [root, today, tab, filter, query]);

  // the board: chips and search button are for a list, not for the three empty states ("no match" keeps them)
  const listEmpty = m.empty !== null && m.empty !== 'no-match';
  const closeSearch = (): void => {
    setSearchOpen(false);
    setQuery('');
  };
  const clearAll = (): void => {
    setFilter('all');
    setQuery('');
  };

  return (
    <div className={`v3theme ${styles.page}`}>
      {demo && (
        <p className={styles.demo} role="status">
          <InfoIcon />
          โหมดตัวอย่าง ไม่บันทึกข้อมูล
        </p>
      )}

      <header className={styles.head}>
        <img className={styles.logo} src={LOGO_URL} alt="JudYa" />
        <h1 className={styles.title}>รายการยา</h1>
        {!listEmpty && (
          <button type="button" className={styles.searchButton} aria-label="ค้นหายา" aria-expanded={searchOpen} onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}>
            <SearchGlyph />
          </button>

        )}
      </header>

      <main className={styles.body}>
        {searchOpen && !listEmpty && (
          <div className={styles.searchBox}>
            <input
              className={styles.searchInput}
              type="search"
              inputMode="search"
              placeholder="ค้นหาชื่อยา"
              aria-label="ค้นหาชื่อยา"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="button" className={styles.searchClose} aria-label="ปิดการค้นหา" onClick={closeSearch}>
              <CloseGlyph />
            </button>
          </div>
        )}

        <div className={styles.tabs} role="tablist" aria-label="ประเภทยา">
          <TabButton selected={tab === 'mine'} onClick={() => setTab('mine')} label="ยาประจำตัว" count={m.counts.mine} />
          <TabButton selected={tab === 'house'} onClick={() => setTab('house')} label="ยาสามัญประจำบ้าน" count={m.counts.house} />
        </div>

        {!listEmpty && (
          <div className={styles.chips} role="group" aria-label="กรองรายการยา">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className={filter === f.id ? `${styles.chipButton} ${styles.chipOn}` : styles.chipButton} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>

        )}

        {m.empty === 'no-match' && <NoMatch onClear={clearAll} />}
        {m.empty !== null && m.empty !== 'no-match' && <EmptyCard kind={m.empty} />}

        {tab === 'mine' && m.groups.map((g) => <MemberCard key={g.personId} group={g} />)}
        {tab === 'house' && m.houseRows.length > 0 && (
          <>
            <p className={styles.hint}>เรียงจากที่ต้องดูแลก่อน</p>
            <section className={styles.card} aria-label="ยาสามัญประจำบ้าน">
              <ul className={styles.rows}>
                {m.houseRows.map((r) => (
                  <HouseItemRow key={r.id} row={r} />
                ))}
              </ul>
              {m.houseOrderCount > 0 && <OrderButton text={`สั่งยาสามัญที่ใกล้หมด (${m.houseOrderCount} รายการ)`} />}
            </section>
          </>
        )}

        {m.stopped.length > 0 && (
          <Fold title={`ยาที่หยุดแล้ว (${m.stopped.length})`} open={stoppedOpen} onToggle={() => setStoppedOpen((o) => !o)} icon={<ClockIcon />}>
            {m.stopped.map((r) => (
              <FoldRow key={r.id} name={r.name} sub={r.subText} action="กลับมาใช้" />
            ))}
          </Fold>
        )}
        {m.deleted.length > 0 && (
          <Fold title={`ยาสามัญที่ลบแล้ว (${m.deleted.length})`} open={deletedOpen} onToggle={() => setDeletedOpen((o) => !o)} icon={<img src={iconUrl('delete')} alt="" width={20} height={20} />}>
            {m.deleted.map((r) => (
              <FoldRow key={r.id} name={r.name} sub={r.subText} action="นำกลับ" />
            ))}
          </Fold>
        )}
      </main>

      {m.showFab && (
        <div className={styles.fab}>
          <ComingSoon className={styles.fabButton}>
            <PlusIcon />
            เพิ่มยา
          </ComingSoon>
        </div>
      )}
      <V3Nav current="meds" />
    </div>
  );
}

function TabButton({ selected, onClick, label, count }: { selected: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button type="button" role="tab" aria-selected={selected} className={selected ? `${styles.tab} ${styles.tabOn}` : styles.tab} onClick={onClick}>
      <span>{label}</span>
      <span className={styles.count}>{count}</span>
    </button>
  );
}

/** Icon + word, never colour alone. */
function Chip({ chip }: { chip: StatusChip }) {
  const Icon = chip.tone === 'ok' ? CheckCircleIcon : chip.tone === 'low' ? WarningIcon : XCircleIcon;
  return (
    <span className={`${styles.statusChip} ${styles[`tone_${chip.tone}`]}`}>
      <Icon />
      {chip.label}
    </span>
  );
}

function ExpiryNote({ text }: { text: string }) {
  return (
    <p className={styles.expiryNote}>
      <WarningIcon />
      {text}
    </p>
  );
}

function OrderButton({ text }: { text: string }) {
  return (
    <ComingSoon className={styles.orderButton}>
      <CartGlyph />
      {text}
    </ComingSoon>
  );
}

function MemberCard({ group }: { group: MemberGroup }) {
  const headId = `member-${group.personId}`;
  return (
    <section className={styles.card} aria-labelledby={headId}>
      <div className={styles.memberHead}>
        <img className={styles.avatar} src={avatarUrl(group.avatar)} alt="" />
        <div>
          <h2 id={headId} className={styles.memberName}>
            {group.name}
          </h2>
          <p className={styles.memberCount}>{group.rows.length} รายการ</p>
        </div>
      </div>
      <ul className={styles.rows}>
        {group.rows.map((r) => (
          <MedItemRow key={r.id} row={r} />
        ))}
      </ul>
      {group.orderCount > 0 && <OrderButton text={`สั่งยาที่ใกล้หมด (${group.orderCount} รายการ)`} />}
    </section>
  );
}

function MedItemRow({ row }: { row: MedRow }) {
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <p className={styles.medName}>{row.name}</p>
        <p className={styles.medSub}>
          {row.periods.map((p) => {
            const Icon = PERIOD_ICON[p];
            return <Icon key={p} size={20} />;
          })}
          <span>{row.doseText}</span>
        </p>
        {row.expiryNote && <ExpiryNote text={row.expiryNote} />}
      </div>
      <div className={styles.rowSide}>
        <Chip chip={row.chip} />
        {row.leftText && <span className={styles.left}>{row.leftText}</span>}
      </div>
    </li>
  );
}

function HouseItemRow({ row }: { row: HouseRow }) {
  return (
    <li className={`${styles.row} ${styles.houseRow}`}>
      <span className={styles.kindCircle}>
        <KindIcon kind={row.kind} size={28} />
      </span>
      <div className={styles.rowMain}>
        <p className={styles.medName}>{row.name}</p>
        <p className={styles.medSub}>{row.subText}</p>
        {row.expiryNote && <ExpiryNote text={row.expiryNote} />}
      </div>
      <div className={styles.rowSide}>
        <Chip chip={row.chip} />
      </div>
    </li>
  );
}

function Fold({ title, open, onToggle, icon, children }: { title: string; open: boolean; onToggle: () => void; icon: JSX.Element; children: JSX.Element[] }) {
  return (
    <section className={styles.card}>
      <button type="button" className={styles.foldButton} aria-expanded={open} onClick={onToggle}>
        <span className={styles.foldIcon}>{icon}</span>
        <span className={styles.foldTitle}>{title}</span>
        <span className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}>
          <ChevronRightIcon />
        </span>
      </button>
      {open && <ul className={styles.rows}>{children}</ul>}
    </section>
  );
}

function FoldRow({ name, sub, action }: { name: string; sub: string; action: string }) {
  return (
    <li className={`${styles.row} ${styles.foldRow}`}>
      <div className={styles.rowMain}>
        <p className={styles.medName}>{name}</p>
        <p className={styles.medSub}>{sub}</p>
      </div>
      <ComingSoon className={styles.foldAction}>{action}</ComingSoon>
    </li>
  );
}

function EmptyCard({ kind }: { kind: Exclude<EmptyKind, 'no-match'> }) {
  const e = EMPTY[kind];
  return (
    <section className={`${styles.card} ${styles.empty}`} aria-label={e.title}>
      <span className={styles.emptyCircle}>
        <img src={iconUrl(e.icon)} alt="" width={64} height={64} />
      </span>
      <h2 className={styles.emptyTitle}>{e.title}</h2>
      <p className={styles.emptyText}>{e.text}</p>
      <ComingSoon className={styles.emptyButton}>{e.button}</ComingSoon>
    </section>
  );
}

function NoMatch({ onClear }: { onClear: () => void }) {
  return (
    <section className={`${styles.card} ${styles.empty}`} aria-label="ไม่พบยาที่ตรงกัน">
      <img className={styles.noMatchMascot} src={mascotUrl} alt="" />
      <h2 className={styles.emptyTitle}>ไม่พบยาที่ตรงกัน</h2>
      <p className={styles.emptyText}>ลองเปลี่ยนคำค้นหา หรือล้างตัวกรอง</p>
      <button type="button" className={styles.clearButton} onClick={onClear}>
        ล้างตัวกรอง
      </button>
    </section>
  );
}
