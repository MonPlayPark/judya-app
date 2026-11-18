// The text summary for the doctor (M4 PR 15a, route #/n/members/:id/summary). Text only: a textarea prefilled with the summary
// (built by src/domain/v3/doctorSummary.ts), edited freely, copied or sent to LINE. The edited text is NOT saved anywhere.
// Copy / LINE behave like the order message (same toasts, same long-message warning).
import { useMemo, useState } from 'react';
import { BackIcon, InfoIcon, WarningIcon } from '../../components/icons';
import { Toast, useToast } from '../../components/v3/Toast';
import { V3Nav } from '../../components/v3/V3Nav';
import { bangkokDate } from '../../domain/v3/backup';
import { NO_MEDS_TEXT, buildDoctorSummary } from '../../domain/v3/doctorSummary';
import { lineLink, lineLinkIsLong } from '../../domain/v3/orderMessage';
import { DemoBanner, MemberNotFound, type MembersViewProps } from './MembersV3';
import page from './MembersV3.module.css';
import { COPIED_TEXT, COPY_FAILED_TEXT, LINE_TOO_LONG_TEXT, copyText } from './OrderMessage';
import styles from './SummaryV3.module.css';

export function SummaryView({ root, id, demo, linkSuffix = '', nowIso }: MembersViewProps & { id: string }) {
  const [toast, showToast] = useToast();
  const summary = useMemo(() => buildDoctorSummary(root, id, bangkokDate(nowIso())), [root, id, nowIso]);
  const [edited, setEdited] = useState<string | null>(null);
  if (!summary) return <MemberNotFound linkSuffix={linkSuffix} />;
  const back = `#/n/members/${encodeURIComponent(id)}${linkSuffix}`;
  const text = edited ?? summary.text;
  const isLong = text.trim() !== '' && lineLinkIsLong(text);
  const blank = text.trim() === '';

  const copy = async (): Promise<void> => {
    if (blank) return;
    showToast((await copyText(text)) ? COPIED_TEXT : COPY_FAILED_TEXT);
  };
  const openLine = (): void => {
    if (blank) return;
    if (lineLinkIsLong(text)) showToast(LINE_TOO_LONG_TEXT); // a warning only: LINE still opens
    window.open(lineLink(text), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={page.page}>
      {demo && <DemoBanner />}
      <header className={page.topStrip}>
        <a className={page.back} href={back} aria-label="กลับไปหน้าสมาชิก">
          <BackIcon />
        </a>
        <h1 className={page.title}>สรุปให้แพทย์</h1>
      </header>

      <main className={page.main}>
        <p className={styles.owner}>{summary.name}</p>
        {summary.empty ? (
          <section className={`${page.card} ${styles.emptyCard}`}>
            <p className={styles.emptyText}>{NO_MEDS_TEXT}</p>
          </section>
        ) : (
          <>
            <p className={styles.info}>
              <InfoIcon />
              แก้ข้อความได้ก่อนส่ง ข้อความที่แก้จะไม่ถูกบันทึก
            </p>
            <textarea
              className={styles.area}
              aria-label="ข้อความสรุปให้แพทย์"
              value={text}
              rows={Math.max(8, text.split('\n').length + 1)}
              onChange={(e) => setEdited(e.target.value)}
            />
            {edited !== null && edited !== summary.text && (
              <button type="button" className={styles.reset} onClick={() => setEdited(null)}>
                คืนค่าข้อความเดิม
              </button>
            )}
            {isLong && (
              <p className={styles.warn} role="note">
                <WarningIcon />
                {LINE_TOO_LONG_TEXT}
              </p>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.copy} disabled={blank} onClick={() => void copy()}>
                คัดลอกข้อความ
              </button>
              <button type="button" className={styles.line} disabled={blank} onClick={openLine}>
                เปิด LINE
              </button>
            </div>
          </>
        )}
      </main>

      <V3Nav current="members" />
      <Toast text={toast} />
    </div>
  );
}
