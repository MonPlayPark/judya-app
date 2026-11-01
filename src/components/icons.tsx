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

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
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

   