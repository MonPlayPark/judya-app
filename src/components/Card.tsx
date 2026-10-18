import type { ReactNode } from 'react';
import styles from './Card.module.css';

/** White card of the design canvas. With `href` the whole card is one link. */
export function Card({ children, href, className }: { children: ReactNode; href?: string; className?: string }) {
  const cls = `${styles.card} ${className ?? ''}`;
  return href ? (
    <a className={cls} href={href}>
      {children}
    </a>
  ) : (
    <section className={cls}>{children}</section>
  );
}

/** Round icon badge + card heading (h2). */
export function CardTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className={styles.title}>
      <span className={styles.badge}>{icon}</span>
      {children}
    </h2>
  );
}

/** Small status label. Always has words (and usually an icon): status is never by colour alone. */
export function Pill({
  tone,
  icon,
  children,
  className,
}: {
  tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`${styles.pill} ${styles[tone]} ${className ?? ''}`}>
      {icon}
      {children}
    </span>
  );
}
