import styles from './SubLine.module.css';

/** "who · amount" followed by "· status". The status never breaks in the middle: if the line is too long,
 * the whole "· จัดแล้ว" block moves to the next line. */
export function SubLine({ text, status }: { text: string; status: string }) {
  return (
    <>
      {text} <span className={styles.status}>· {status}</span>
    </>
  );
}
