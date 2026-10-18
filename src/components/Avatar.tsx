import type { Person } from '../domain/schema';
import styles from './Avatar.module.css';

/** First letter of the name, skipping Thai leading vowels (เ แ โ ใ ไ) that cannot stand alone. */
export const initial = (name: string): string => Array.from(name.trim()).find((c) => !'เแโใไ'.includes(c)) ?? '?';

/** Sizes of the design canvas: 48 (default, lists), 56 (members list), 64 (member page), 72 (edit form). */
export function Avatar({ name, color, size }: { name: string; color: Person['color']; size?: 'lg' | 'xl' | 'xxl' }) {
  return (
    <span className={`${styles.avatar} ${styles[color]} ${size ? styles[size] : ''}`} aria-hidden="true">
      {initial(name)}
    </span>
  );
}
