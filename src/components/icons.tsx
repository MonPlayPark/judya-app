// Rounded line icons, 2px stroke, from the design canvas bottom navigation.
import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const HomeIcon = () => (
  <Icon>
    <path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z" />
  </Icon>
);

export const PillIcon = () => (
  <Icon>
    <rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)" />
    <path d="M12 8.5v7" transform="rotate(-45 12 12)" />
  </Icon>
);

export const PeopleIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M17 14c2.4 0 4 1.7 4 4.5" />
  </Icon>
);

export const SettingsIcon = () => (
  <Icon>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Icon>
);

export const WarningIcon = () => (
  <Icon>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4" />
    <path d="M12 17.2v.1" />
  </Icon>
);

export const CheckCircleIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l3 3 5-6" />
  </Icon>
);

export const InfoIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 7.8v.1" />
  </Icon>
);

export const BackIcon = () => (
  <Icon>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const ChevronRightIcon = () => (
  <Icon>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const CalendarCheckIcon = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path d="M9 15l2 2 4-4" />
  </Icon>
);

export const CalendarWarnIcon = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path d="M12 13v3M12 18.2v.01" />
  </Icon>
);

export const BagIcon = () => (
  <Icon>
    <path d="M5.5 8h13l-1 12h-11z" />
    <path d="M9 8V7a3 3 0 016 0v1" />
  </Icon>
);

export const XCircleIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </Icon>
);

export const ClockIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const SunriseIcon = () => (
  <Icon>
    <path d="M3 18h18M6 18a6 6 0 0112 0M12 6v2M4.5 11.5l1.4 1.4M19.5 11.5l-1.4 1.4" />
  </Icon>
);

export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
  </Icon>
);

export const SunsetIcon = () => (
  <Icon>
    <path d="M3 19h18M7 19a5 5 0 0110 0M12 6v5M9.5 8.5L12 11l2.5-2.5" />
  </Icon>
);

export const MoonIcon = () => (
  <Icon>
    <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const EditIcon = () => (
  <Icon>
    <path d="M4 20l4-1 11-11a2.5 2.5 0 00-4-4L4 15z" />
  </Icon>
);

export const StopIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5l5 3.5-5 3.5z" />
  </Icon>
);

export const MinusIcon = () => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
);

export const BellIcon = () => (
  <Icon>
    <path d="M6 9a6 6 0 0112 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" />
    <path d="M10 19a2 2 0 004 0" />
  </Icon>
);

/** Arrow down into a tray: save a file. */
export const SaveFileIcon = () => (
  <Icon>
    <path d="M12 4v10M8 10.5l4 4 4-4" />
    <path d="M4.5 15v3.5a1 1 0 001 1h13a1 1 0 001-1V15" />
  </Icon>
);

/** Arrow up out of a tray: pick a file. */
export const OpenFileIcon = () => (
  <Icon>
    <path d="M12 15V5M8 8.5l4-4 4 4" />
    <path d="M4.5 15v3.5a1 1 0 001 1h13a1 1 0 001-1V15" />
  </Icon>
);

export const StorageIcon = () => (
  <Icon>
    <ellipse cx="12" cy="6" rx="7" ry="2.8" />
    <path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6" />
    <path d="M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
  </Icon>
);

export const ShieldIcon = () => (
  <Icon>
    <path d="M12 3l7.5 3v5.5c0 4.5-3 8-7.5 9.5-4.5-1.5-7.5-5-7.5-9.5V6z" />
  </Icon>
);
