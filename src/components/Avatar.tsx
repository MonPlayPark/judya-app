import type { Person } from '../domain/schema';
import styles from './Avatar.module.css';

/** First letter of the name, skipping Thai leading vowels (เ แ โ ใ ไ) that cannot stand alone. */
export const initial = (name: string): string => Array.from(name.trim()).find((c) => !'เแโใไ'.includes(c)) ?? '?';

export function Avatar({ name, color }: { name: string; color: Person['color'] }) {
  return (
    <span className={`${styles.avatar} ${styles[color]}`} aria-hidden="true">
      {initial(name)}
    </span>
  );
}
