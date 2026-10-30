import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Sheet.module.css';

/** Bottom sheet (M4 PR 5b). Drawn inside the v3 page so it uses the page theme. Pressing the dark curtain or Esc
 * closes it. The page puts the buttons inside `children` (see `sheetStyles`). */
export function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
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
      <div ref={box} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={styles.handle} aria-hidden="true" />
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
