import { href, useRoute } from '../router';
import { iconUrl, type IconName } from '../visual';
import styles from './BottomNav.module.css';

interface Tab {
  path: string;
  label: string;
  icon: IconName;
}

// Order and labels follow the design canvas (BRIEF section 1).
export const TABS: Tab[] = [
  { path: '/old', label: 'หน้าแรก', icon: 'nav-home' },
  { path: '/meds', label: 'ยา', icon: 'nav-medicines' },
  { path: '/members', label: 'สมาชิก', icon: 'nav-members' },
  { path: '/settings', label: 'ตั้งค่า', icon: 'nav-settings' },
];

// The house-medicine pages (/house/...) belong to the "ยา" tab.
const isActive = (tabPath: string, current: string): boolean =>
  tabPath === '/old'
    ? current === '/old'
    : current === tabPath || current.startsWith(`${tabPath}/`) || (tabPath === '/meds' && current.startsWith('/house/'));

export function BottomNav() {
  const { path } = useRoute();
  return (
    <nav className={styles.nav} aria-label="เมนูหลัก">
      {TABS.map((tab) => (
        <a
          key={tab.path}
          className={styles.item}
          href={href(tab.path)}
          aria-current={isActive(tab.path, path) ? 'page' : undefined}
        >
          <img className={styles.icon} src={iconUrl(tab.icon)} alt="" />
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
