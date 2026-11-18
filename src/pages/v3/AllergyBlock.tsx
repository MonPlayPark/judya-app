// The allergy state as words + icon (never colour only): unknown (info), none confirmed (check), listed (warning, red-tint block).
// M4 PR 10. `unknown` never says "no allergy" (rule S1). Shared by the member page card and the allergy page.
import { CheckCircleIcon, InfoIcon, WarningIcon } from '../../components/icons';
import styles from './AllergyBlock.module.css';

export interface AllergyBlockProps {
  status: 'unknown' | 'none_confirmed' | 'listed';
  /** The words of the state (domain/v3/allergy.ts allergyStateText). */
  text: string;
  items: readonly { drug: string; reaction: string }[];
}

export function AllergyBlock({ status, text, items }: AllergyBlockProps) {
  if (status === 'listed') {
    return (
      <div className={`${styles.state} ${styles.listed}`}>
        <span className={styles.line}>
          <WarningIcon />
          <span className={styles.word}>{text}</span>
        </span>
        <ul className={styles.items}>
          {items.map((i, n) => (
            <li key={`${n}-${i.drug}`}>
              <span className={styles.drug}>{i.drug}</span> <span className={styles.reaction}>{`อาการ: ${i.reaction}`}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className={styles.state}>
      <span className={styles.line}>
        {status === 'none_confirmed' ? <CheckCircleIcon /> : <InfoIcon />}
        {text}
      </span>
    </div>
  );
}
