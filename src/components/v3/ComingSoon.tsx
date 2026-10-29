import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './ComingSoon.module.css';

export const COMING_SOON_TEXT = 'เร็ว ๆ นี้';

/** A place that has no destination yet (v3 Home, M4 PR 4). It looks faded, carries the word "เร็ว ๆ นี้" and does
 * nothing when pressed: a real `<button disabled aria-disabled="true">`, so it is not a tab stop and has no link.
 * A later PR replaces one use at a time with a real button or link (delete the wrapper at that spot). */
export function ComingSoon({
  children,
  className,
  badgeClassName,
  ...rest
}: { children: ReactNode; className?: string; badgeClassName?: string } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'disabled' | 'onClick' | 'type' | 'children' | 'className'
>) {
  return (
    <button type="button" disabled aria-disabled="true" className={`${styles.soon} ${className ?? ''}`} {...rest}>
      <span className={styles.faded}>{children}</span>
      <span className={`${styles.badge} ${badgeClassName ?? ''}`}>{COMING_SOON_TEXT}</span>
    </button>
  );
}
