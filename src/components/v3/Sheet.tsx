import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Sheet.module.css';

/** Bottom sheet (M4 PR 5b). Drawn inside the v3 page so it uses the page theme. Pressing the dark curtain or Esc
 * closes it. The page puts the buttons inside `children` (see `sheetStyles`). */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  closeButton = false,
  tall = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** M4 PR 11.2: a round 44px X button at the top right (the sheets of PR 5b have none). */
  closeButton?: boolean;
  /** M4 PR 11.2: up to 92% of the screen high instead of 88%. */
  tall?: boolean;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.root}>
      <div className={styles.curtain} data-testid="sheet-curtain" onClick={onClose} aria-hidden="true" />
      <div ref={box} className={tall ? `${styles.sheet} ${styles.tall}` : styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={styles.handle} aria-hidden="true" />
        {closeButton && (
          <button type="button" className={styles.close} aria-label="ปิด" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        <h2 id={titleId} className={closeButton ? `${styles.title} ${styles.titleClosable}` : styles.title}>
          {title}
        </h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
