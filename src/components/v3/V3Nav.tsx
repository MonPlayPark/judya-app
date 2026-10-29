import { iconUrl, type IconName } from '../../visual';
import { ComingSoon } from './ComingSoon';
import styles from './V3Nav.module.css';

interface Tab {
  label: string;
  icon: IconName;
  current?: boolean;
}

// Same four tabs and icons as the canvas. Only Home exists in v3 so far; the others are "coming soon".
const TABS: Tab[] = [
  { label: 'หน้าหลัก', icon: 'nav-home', current: true },
  { label: 'รายการยา', icon: 'nav-medicines' },
  { label: 'สมาชิก', icon: 'nav-members' },
  { label: 'ตั้งค่า', icon: 'nav-settings' },
];

export function V3Nav() {
  return (
    <nav className={styles.nav} aria-label="เมนูหลัก">
      {TABS.map((tab) =>
        tab.current ? (
          <span key={tab.label} className={styles.item} aria-current="page">
            <img className={styles.iconNow} src={iconUrl(tab.icon)} alt="" />
            {tab.label}
          </span>
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
