import type { ReactNode } from 'react';
import { href, useRoute } from '../router';
import { HomeIcon, PeopleIcon, PillIcon, SettingsIcon } from './icons';
import styles from './BottomNav.module.css';

interface Tab {
  path: string;
  label: string;
  icon: ReactNode;
}

// Order and labels follow the design canvas (BRIEF section 1).
export const TABS: Tab[] = [
  { path: '/', label: 'หน้าแรก', icon: <HomeIcon /> },
  { path: '/meds', label: 'ยา', icon: <PillIcon /> },
  { path: '/members', label: 'สมาชิก', icon: <PeopleIcon /> },
  { path: '/settings', label: 'ตั้งค่า', icon: <SettingsIcon /> },
];

// The house-medicine pages (/house/...) belong to the "ยา" tab.
const isActive = (tabPath: string, current: string): boolean =>
  tabPath === '/'
    ? current === '/'
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
          <span className={styles.icon}>{tab.icon}</span>
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
