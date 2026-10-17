import { isBlank } from '../domain/actions';
import { Button } from '../components/Button';
import { CheckCircleIcon, InfoIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { useData, useRoot } from '../state/DataContext';
import styles from './HomePage.module.css';

/** Home tab. TEMPORARY content of step 3.2a-1: empty-house card and sample-data buttons.
 * Step 3.2a-2 replaces it with the real home screen. The add-member / add-medicine buttons stay hidden (Q12). */
export function HomePage() {
  const root = useRoot();
  const { loadSample, clearSample } = useData();
  const summary = `สมาชิก ${root.persons.length} คน ยา ${root.assignments.length} รายการ`;

  return (
    <>
      <PageHeader title="หน้าแรก" />
      <div className={styles.body}>
        {isBlank(root) ? (
          <section className={styles.card}>
            <p className={styles.line}>
              <InfoIcon />
              <strong>ยังไม่มีสมาชิกหรือยา</strong>
            </p>
            <Button onClick={loadSample}>ลองดูด้วยข้อมูลตัวอย่าง</Button>
          </section>
        ) : root.meta.isSample ? (
          <section className={styles.card}>
            <p className={styles.line}>
              <CheckCircleIcon />
              <strong>ข้อมูลตัวอย่างพร้อมแล้ว: {summary}</strong>
            </p>
            <Button variant="secondary" onClick={clearSample}>
              ลบข้อมูลตัวอย่าง
            </Button>
          </section>
        ) : (
          <section className={styles.card}>
            <p className={styles.line}>{summary}</p>
          </section>
        )}
      </div>
    </>
  );
}
