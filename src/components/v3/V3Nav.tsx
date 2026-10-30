import { iconUrl, type IconName } from '../../visual';
import { ComingSoon } from './ComingSoon';
import styles from './V3Nav.module.css';

export type V3NavTab = 'home' | 'meds';

interface Tab {
  label: string;
  icon: IconName;
  /** Set when the tab has a page in v3; the others are "coming soon". */
  key?: V3NavTab;
  href?: string;
}

// Same four tabs and icons as the canvas. Home and the medicine list exist in v3 so far; the others are "coming soon".
const TABS: Tab[] = [
  { label: 'หน้าหลัก', icon: 'nav-home', key: 'home', href: '#/n' },
  { label: 'รายการยา', icon: 'nav-medicines', key: 'meds', href: '#/n/meds' },
  { label: 'สมาชิก', icon: 'nav-members' },
  { label: 'ตั้งค่า', icon: 'nav-settings' },
];

export function V3Nav({ current }: { current: V3NavTab }) {
  return (
    <nav className={styles.nav} aria-label="เมนูหลัก">
      {TABS.map((tab) =>
        tab.href ? (
          <a key={tab.label} href={tab.href} className={styles.item} aria-current={tab.key === current ? 'page' : undefined}>
            <img className={tab.key === current ? styles.iconNow : styles.icon} src={iconUrl(tab.icon)} alt="" />
            {tab.label}
          </a>
        ) : (
          <ComingSoon key={tab.label} className={`${styles.item} ${styles.soonItem}`}>
            <span className={styles.stack}>
              <img className={styles.icon} src={iconUrl(tab.icon)} alt="" />
              {tab.label}
            </span>
          </ComingSoon>
        ),
      )}
    </nav>
  );
}
