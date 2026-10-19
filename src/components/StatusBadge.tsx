import type { ReactNode } from 'react';
import { BADGE_TEXT, type BadgeKind } from '../domain/medView';
import { Pill } from './Card';
import { CalendarWarnIcon, CheckCircleIcon, InfoIcon, StopIcon, WarningIcon, XCircleIcon } from './icons';

const VIEW: Record<BadgeKind, { tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral'; icon: ReactNode }> = {
  expired: { tone: 'danger', icon: <XCircleIcon /> },
  out: { tone: 'danger', icon: <WarningIcon /> },
  low: { tone: 'warning', icon: <WarningIcon /> },
  soon: { tone: 'warning', icon: <CalendarWarnIcon /> },
  ok: { tone: 'success', icon: <CheckCircleIcon /> },
  noStock: { tone: 'neutral', icon: <InfoIcon /> },
  stopped: { tone: 'neutral', icon: <StopIcon /> },
  active: { tone: 'success', icon: <CheckCircleIcon /> },
};

/** Status of a medicine: always an icon AND a word (never colour alone). */
export function StatusBadge({ kind }: { kind: BadgeKind }) {
  const v = VIEW[kind];
  return (
    <Pill tone={v.tone} icon={v.icon}>
      {BADGE_TEXT[kind]}
    </Pill>
  );
}
