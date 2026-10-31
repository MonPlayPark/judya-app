import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Toast, useToast } from './Toast';
import styles from './ComingSoon.module.css';

export const COMING_SOON_TEXT = 'เร็ว ๆ นี้';

/** A place that has no destination yet. It looks faded; pressing it shows the floating message "เร็ว ๆ นี้" for 3
 * seconds and does nothing else (since M4 PR 5b: the word is no longer written inside the button). It is a real
 * button with aria-disabled="true", so it can be pressed and read, but it is not a link and goes nowhere.
 * A later PR replaces one use at a time with a real button or link (delete the wrapper at that spot). */
export function ComingSoon({
  children,
  className,
  badgeClassName: _unused,
  ...rest
}: { children: ReactNode; className?: string; /** No longer used (the badge is gone); kept so old call sites still compile. */ badgeClassName?: string } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'disabled' | 'onClick' | 'type' | 'children' | 'className'
>) {
  const [text, show] = useToast();
  return (
    <>
      <button type="button" aria-disabled="true" className={`${styles.soon} ${className ?? ''}`} onClick={() => show(COMING_SOON_TEXT)} {...rest}>
        <span className={styles.faded}>{children}</span>
      </button>
      <Toast text={text} />
    </>
  );
}
