import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { InfoIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { href } from '../router';
import styles from './BlankPage.module.css';

/** Tab whose real screen is not built yet (BRIEF section 1): a short "being built" note and a way back. */
export function BlankPage({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className={styles.body}>
        <Card>
          <p className={styles.line}>
            <InfoIcon />
            <strong>หน้านี้กำลังสร้าง</strong>
          </p>
          <Button onClick={() => (window.location.hash = href('/'))}>กลับหน้าแรก</Button>
        </Card>
      </div>
    </>
  );
}
