// The v3 settings pages (M4 PR 14): the list of 5 groups (#/n/settings) and one page per group (font, reminders, order, about; the data
// page is DataV3). View only: `persist` (given by SettingsPage) writes a changed root; a demo is given none, so it changes the page and
// nothing else. Every change is one tap = one write (no Save button). The page keeps its own copy of the root: when a write fails,
// the root, the chosen chip and the size of the app stay as they were.
import { useState, type ReactNode } from 'react';
import { BackIcon, CheckIcon, ChevronRightIcon, InfoIcon, WarningIcon } from '../../components/icons';
import { V3Nav } from '../../components/v3/V3Nav';
import type { IsoDate } from '../../domain/calc';
import type { Root } from '../../domain/v3/schema';
import {
  EXPIRY_CHOICES,
  FONT_CHOICES,
  LOW_CHOICES,
  ORDER_CHOICES,
  choicesWith,
  fsOf,
  listRows,
  orderTemplateText,
  updateSetting,
  type SettingsPatch,
  type SettingsPath,
} from '../../domain/v3/settingsPage';
import { applyFontSize } from '../../prefs/fontSize';
import { iconUrl, type IconName } from '../../visual';
import styles from './SettingsV3.module.css';

/** "0.1.0 (abc1234)" is what the build puts in __APP_VERSION__; the page shows the version number only. */
export const APP_VERSION: string = (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0').split(' ')[0] ?? '0.0.0';
const LOGO_URL = `${import.meta.env.BASE_URL}icons/judya-mark.svg`;

export interface SettingsViewProps {
  root: Root;
  today: IsoDate;
  demo: boolean;
  /** Saves a changed root. Demo: not given, so nothing is saved. */
  persist?: (root: Root) => { ok: true } | { ok: false; text: string };
  /** Added to every link, so a demo stays a demo ("" or "?demo=normal"). */
  linkSuffix: string;
}

const LIST_HREF = (suffix: string): string => `#/n/settings${suffix}`;

function Frame({ title, suffix, demo, back = true, children }: { title: string; suffix: string; demo: boolean; back?: boolean; children: ReactNode }) {
  return (
    <div className={styles.page}>
      {demo && (
        <p className={styles.demo} role="status">
          <InfoIcon />
          โหมดตัวอย่าง ไม่บันทึกข้อมูล
        </p>
      )}
      <header className={styles.head}>
        {back && (
          <a className={styles.round} href={LIST_HREF(suffix)} aria-label="กลับไปหน้าตั้งค่า">
            <BackIcon />
          </a>
        )}
        <h1 className={styles.title}>{title}</h1>
      </header>
      <main className={styles.body}>{children}</main>
      <V3Nav current="settings" />
    </div>
  );
}

/** The data of a page and the one way to change it: take the new root only if the write worked. */
function useSettings({ root: first, demo, persist }: SettingsViewProps) {
  const [root, setRoot] = useState(first);
  const [error, setError] = useState<string | null>(null);
  const change = (patch: SettingsPatch): boolean => {
    const made = updateSetting(root, patch);
    if (!made.ok) {
      setError('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
      return false;
    }
    const res = !demo && persist ? persist(made.root) : ({ ok: true } as const);
    if (!res.ok) {
      setError(res.text);
      return false;
    }
    setError(null);
    setRoot(made.root);
    return true;
  };
  return { root, error, change };
}

const ErrorLine = ({ text }: { text: string | null }) =>
  text === null ? null : (
    <p className={styles.error} role="alert">
      <WarningIcon />
      <span>{text}</span>
    </p>
  );

// ---------- the list ----------

const ROW_ICON: Partial<Record<SettingsPath, IconName>> = { reminders: 'expiry-alert', order: 'order', data: 'backup' };

function FontGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 18l4.5-11L12 18M4.8 14h5.4" />
      <path d="M14.5 18l3-7.5 3 7.5M15.6 15.5h3.8" />
    </svg>
  );
}

export function SettingsListView(props: SettingsViewProps) {
  const rows = listRows(props.root, props.today, APP_VERSION);
  return (
    <Frame title="ตั้งค่า" suffix={props.linkSuffix} demo={props.demo} back={false}>
      <section className={styles.card} aria-label="หมวดการตั้งค่า">
        <ul className={styles.rows}>
          {rows.map((r) => {
            const icon = ROW_ICON[r.path];
            return (
              <li key={r.path}>
                <a className={styles.row} href={`#/n/settings/${r.path}${props.linkSuffix}`}>
                  <span className={styles.disc}>
                    {icon ? <img className={styles.discImg} src={iconUrl(icon)} alt="" /> : r.path === 'font' ? <FontGlyph /> : <InfoIcon />}
                  </span>
                  <span className={styles.main}>
                    <span className={styles.name}>{r.title}</span>
                    <span className={styles.sub}>{r.sub}</span>
                  </span>
                  <span className={styles.chevron}>
                    <ChevronRightIcon />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    </Frame>
  );
}

// ---------- chips ----------

function ChipCard({ title, sub, values, current, onPick, hint, icon }: { title: string; sub: string; values: readonly number[]; current: number; onPick: (n: number) => void; hint: string; icon?: IconName }) {
  return (
    <section className={styles.card} aria-labelledby={`h-${title}`}>
      <div className={styles.cardHead}>
        {icon && <img className={styles.cardIcon} src={iconUrl(icon)} alt="" />}
        <div className={styles.main}>
          <h2 id={`h-${title}`} className={styles.cardTitle}>
            {title}
          </h2>
          <p className={styles.sub}>{sub}</p>
        </div>
      </div>
      <div className={styles.chips} role="group" aria-labelledby={`h-${title}`}>
        {values.map((n) => {
          const on = n === current;
          return (
            <button key={n} type="button" className={on ? `${styles.chip} ${styles.chipOn}` : styles.chip} aria-pressed={on} onClick={() => onPick(n)}>
              {on && <CheckIcon />}
              {n} วัน
            </button>
          );
        })}
      </div>
      <p className={styles.hint}>{hint}</p>
    </section>
  );
}

// ---------- reminders ----------

export function RemindersView(props: SettingsViewProps) {
  const { root, error, change } = useSettings(props);
  const s = root.settings;
  return (
    <Frame title="การเตือน" suffix={props.linkSuffix} demo={props.demo}>
      <ChipCard
        title="ยาใกล้หมดอายุ"
        sub="เตือนล่วงหน้ากี่วัน"
        icon="expiry-alert"
        values={choicesWith(EXPIRY_CHOICES, s.expiryWarnDays)}
        current={s.expiryWarnDays}
        onPick={(n) => void change({ expiryWarnDays: n })}
        hint={`ยาที่หมดอายุภายใน ${s.expiryWarnDays} วัน จะขึ้นในหน้าแรก`}
      />
      <ChipCard
        title="ยาใกล้หมด"
        sub="เตือนเมื่อยาเหลือพอกินอีกกี่วัน"
        icon="restock"
        values={choicesWith(LOW_CHOICES, s.lowStockDays)}
        current={s.lowStockDays}
        onPick={(n) => void change({ lowStockDays: n })}
        hint={`ยาประจำตัวที่เหลือไม่เกิน ${s.lowStockDays} วัน จะขึ้นในหน้าแรก`}
      />
      <ErrorLine text={error} />
      <p className={styles.foot}>ปรับแล้วใช้ทันที ไม่ต้องกดบันทึก</p>
    </Frame>
  );
}

// ---------- font size ----------

const SAMPLE = 'ยาของคุณแม่ เช้า 1 เม็ด หลังอาหาร';

export function FontView(props: SettingsViewProps) {
  const { root, error, change } = useSettings(props);
  const pick = (value: (typeof FONT_CHOICES)[number]): void => {
    if (change({ fontSize: value.value })) applyFontSize(value.fs); // the whole app changes at once, only after the write worked
  };
  return (
    <Frame title="ขนาดตัวอักษร" suffix={props.linkSuffix} demo={props.demo}>
      <section className={styles.card} aria-labelledby="h-font">
        <h2 id="h-font" className={styles.cardTitle}>
          ขนาดตัวอักษร
        </h2>
        <ul className={styles.sizes}>
          {FONT_CHOICES.map((c) => {
            const on = c.value === root.settings.fontSize;
            return (
              <li key={c.value}>
                <button type="button" className={on ? `${styles.size} ${styles.sizeOn}` : styles.size} aria-pressed={on} data-size={fsOf(c.value)} onClick={() => pick(c)}>
                  <span className={styles.sizeHead}>
                    {on && <CheckIcon />}
                    {c.label}
                  </span>
                  <span className={`${styles.sample} ${styles[`sample_${c.fs}`] ?? ''}`}>{SAMPLE}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <ErrorLine text={error} />
      </section>
      <p className={styles.foot}>ปรับแล้วใช้ทันที ไม่ต้องกดบันทึก</p>
    </Frame>
  );
}

// ---------- order and shops ----------

export function OrderSettingsView(props: SettingsViewProps) {
  const { root, error, change } = useSettings(props);
  const s = root.settings;
  return (
    <Frame title="การสั่งยาและร้านค้า" suffix={props.linkSuffix} demo={props.demo}>
      <ChipCard
        title="สั่งให้พอกี่วัน"
        sub="ตอนสั่งยา แอปจะคิดจำนวนให้พอกินกี่วัน"
        icon="order"
        values={choicesWith(ORDER_CHOICES, s.orderDays)}
        current={s.orderDays}
        onPick={(n) => void change({ orderDays: n })}
        hint={`รายการสั่งยาจะคิดจำนวนให้พอกิน ${s.orderDays} วัน`}
      />
      <ErrorLine text={error} />
      <section className={styles.card} aria-labelledby="h-shops">
        <div className={styles.cardHead}>
          <img className={styles.cardIcon} src={iconUrl('shops')} alt="" />
          <div className={styles.main}>
            <h2 id="h-shops" className={styles.cardTitle}>
              ร้านค้า
            </h2>
            <p className={styles.sub}>{root.shops.length} ร้าน</p>
          </div>
        </div>
        <a className={styles.linkRow} href={`#/n/shops${props.linkSuffix}`}>
          <span className={styles.name}>จัดการร้านค้า</span>
          <span className={styles.chevron}>
            <ChevronRightIcon />
          </span>
        </a>
      </section>
      <section className={styles.card} aria-labelledby="h-template">
        <div className={styles.cardHead}>
          <img className={styles.cardIcon} src={iconUrl('order-template')} alt="" />
          <div className={styles.main}>
            <h2 id="h-template" className={styles.cardTitle}>
              ข้อความสั่งยา
            </h2>
          </div>
        </div>
        <p className={styles.template}>{orderTemplateText(s.orderTemplate)}</p>
      </section>
    </Frame>
  );
}

// ---------- about ----------

export const ABOUT_NOT_MEDICAL = 'จดโดยเจ้าของแอพ ไม่ใช่เวชระเบียน โปรดตรวจกับซองยาหรือใบสั่งยาจริง';
export const ABOUT_LOCAL = 'ข้อมูลทั้งหมดอยู่ในเครื่องนี้เท่านั้น ไม่ส่งออกไปที่ไหน สำรองข้อมูลเป็นไฟล์ได้ที่ ข้อมูลและสำรอง';

export function AboutView(props: SettingsViewProps) {
  return (
    <Frame title="เกี่ยวกับ JudYa" suffix={props.linkSuffix} demo={props.demo}>
      <section className={`${styles.card} ${styles.about}`} aria-label="เกี่ยวกับแอป">
        <img className={styles.logo} src={LOGO_URL} alt="" />
        <p className={styles.appName}>JudYa</p>
        <p className={styles.sub}>เวอร์ชัน {APP_VERSION}</p>
      </section>
      <section className={styles.card} aria-label="ข้อควรรู้">
        <p className={styles.text}>{ABOUT_NOT_MEDICAL}</p>
        <p className={styles.text}>{ABOUT_LOCAL}</p>
        <a className={styles.linkRow} href={`#/n/settings/data${props.linkSuffix}`}>
          <span className={styles.name}>ข้อมูลและสำรอง</span>
          <span className={styles.chevron}>
            <ChevronRightIcon />
          </span>
        </a>
      </section>
    </Frame>
  );
}
