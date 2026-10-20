import { useEffect, useMemo, useState } from 'react';
import { doctorSummary, summaryText, type DoctorSummary } from '../domain/doctorSummary';
import { Card, CardTitle } from '../components/Card';
import { InfoBox, StepHeader } from '../components/form';
import { CheckCircleIcon, ChatIcon, CopyIcon, InfoIcon, ShieldIcon, WarningIcon } from '../components/icons';
import { renderSummaryImages, type ImageFailure } from '../components/summaryImage';
import { href } from '../router';
import { useRoot } from '../state/DataContext';
import { handOffSummary, summaryFiles } from '../state/shareImages';
import { useToday } from '../state/useToday';
import { MemberNotFound } from './MemberDetail';
import styles from './SharePage.module.css';

const LINE_URL = 'https://line.me/R/msg/text/?';
const COPY_FAIL = 'คัดลอกไม่ได้ ลองกดค้างที่ข้อความแล้วเลือกคัดลอกเอง';
const SEND_WARNING = 'ภาพนี้มีชื่อและรายการยาของสมาชิก ตรวจดูก่อนส่ง และส่งให้เฉพาะแพทย์หรือเภสัชกรที่ดูแลเท่านั้น';

const FAIL_TEXT: Record<ImageFailure, string> = {
  no_canvas: 'เครื่องนี้สร้างภาพสรุปไม่ได้ ใช้ข้อความด้านล่างคัดลอกไปส่งแทนได้',
  font: 'สร้างภาพไม่สำเร็จเพราะฟอนต์ยังโหลดไม่เสร็จ ลองเปิดหน้านี้ใหม่อีกครั้ง หรือใช้ข้อความด้านล่างคัดลอกไปส่งแทนได้',
  failed: 'สร้างภาพไม่สำเร็จ ลองเปิดหน้านี้ใหม่อีกครั้ง หรือใช้ข้อความด้านล่างคัดลอกไปส่งแทนได้',
};

type Pictures =
  | { kind: 'loading' }
  | { kind: 'failed'; reason: ImageFailure }
  | { kind: 'ready'; files: File[]; urls: string[] };

type Note = { tone: 'ok' | 'info' | 'warn'; text: string };

/** Doctor summary of one member (S14, `#/members/:id/share`): pictures + text, made on this device. It reads the house and writes
 * nothing; the pictures live in memory only and their addresses are released when the page closes. */
export function SharePage({ id }: { id: string }) {
  const root = useRoot();
  const { today } = useToday();
  const summary = useMemo(() => doctorSummary(root, id, today), [root, id, today]);
  if (!summary) return <MemberNotFound />;
  return <Share id={id} summary={summary} />;
}

function Share({ id, summary }: { id: string; summary: DoctorSummary }) {
  const text = useMemo(() => summaryText(summary), [summary]);
  const empty = summary.current.length === 0 && summary.stopped.length === 0;
  const [pictures, setPictures] = useState<Pictures>({ kind: 'loading' });
  const [note, setNote] = useState<Note | null>(null);
  const [copied, setCopied] = useState<{ text: string; ok: boolean } | null>(null);
  const [sharing, setSharing] = useState(false);

  // Make the pictures again only when the summary itself changed.
  const key = JSON.stringify(summary);
  useEffect(() => {
    if (empty) return;
    let alive = true;
    const urls: string[] = [];
    setPictures({ kind: 'loading' });
    setNote(null);
    renderSummaryImages(summary)
      .then((r) => {
        if (!alive) return;
        if (!r.ok) {
          setPictures({ kind: 'failed', reason: r.reason });
          return;
        }
        for (const b of r.pages) urls.push(URL.createObjectURL(b));
        setPictures({ kind: 'ready', files: summaryFiles(r.pages, summary.date), urls: [...urls] });
      })
      .catch(() => {
        if (alive) setPictures({ kind: 'failed', reason: 'failed' });
      });
    return () => {
      alive = false;
      for (const u of urls) URL.revokeObjectURL(u);
    };
    // `summary` is covered by `key`; a new object with the same content must not redraw the pictures.
  }, [key, empty]);

  const back = `/members/${encodeURIComponent(id)}`;

  const share = async () => {
    if (pictures.kind !== 'ready' || sharing) return;
    setSharing(true);
    try {
      const result = await handOffSummary(pictures.files, text);
      setNote(
        result === 'shared'
          ? { tone: 'ok', text: 'แชร์ภาพแล้ว' }
          : result === 'cancelled'
            ? { tone: 'info', text: 'ยกเลิกการแชร์แล้ว' }
            : { tone: 'ok', text: 'บันทึกภาพไว้แล้ว เปิด LINE แล้วเลือกรูปจากเครื่อง' },
      );
    } finally {
      setSharing(false);
    }
  };

  const copy = async () => {
    const t = text;
    try {
      await navigator.clipboard.writeText(t);
      setCopied({ text: t, ok: true });
    } catch {
      setCopied({ text: t, ok: false });
    }
  };
  const copyNote = copied && copied.text === text ? copied : null;

  return (
    <>
      <StepHeader title="แชร์ให้แพทย์" backTo={back} backLabel="กลับหน้าสมาชิก" />
      <div className={styles.body}>
        {empty ? (
          <Card>
            <div className={styles.cardBody}>
              <InfoBox>ยังไม่มียาให้สรุป</InfoBox>
            </div>
          </Card>
        ) : (
          <>
            <InfoBox tone="warn">{SEND_WARNING}</InfoBox>

            <Card>
              <CardTitle icon={<ShieldIcon />}>ภาพสรุปยา</CardTitle>
              <div className={styles.cardBody}>
                {pictures.kind === 'loading' && (
                  <p role="status" className={styles.state}>
                    <InfoIcon />
                    กำลังสร้างภาพ…
                  </p>
                )}
                {pictures.kind === 'failed' && <InfoBox tone="warn">{FAIL_TEXT[pictures.reason]}</InfoBox>}
                {pictures.kind === 'ready' &&
                  pictures.urls.map((u, i) => (
                    <img
                      key={u}
                      className={styles.picture}
                      src={u}
                      alt={`ภาพสรุปยาของ ${summary.personName} หน้า ${i + 1} จาก ${pictures.urls.length}`}
                    />
                  ))}
              </div>
            </Card>

            <Card>
              <CardTitle icon={<ChatIcon />}>
                <span id="share-text-label">ข้อความ</span>
              </CardTitle>
              <div className={styles.cardBody}>
                <textarea className={styles.text} readOnly rows={Math.min(text.split('\n').length, 14)} aria-labelledby="share-text-label" value={text} />
              </div>
            </Card>

            <div className={styles.actions}>
              {pictures.kind === 'ready' && (
                <button type="button" className={`${styles.action} ${styles.actionPrimary}`} onClick={share} disabled={sharing}>
                  <ChatIcon />
                  แชร์ภาพ
                </button>
              )}
              {note && (
                <p role="status" className={`${styles.note} ${note.tone === 'ok' ? styles.noteOk : note.tone === 'warn' ? styles.noteWarn : ''}`}>
                  {note.tone === 'ok' ? <CheckCircleIcon /> : note.tone === 'warn' ? <WarningIcon /> : <InfoIcon />}
                  {note.text}
                </p>
              )}
              <button
                type="button"
                className={`${styles.action} ${pictures.kind === 'ready' ? styles.actionSecondary : styles.actionPrimary}`}
                onClick={copy}
              >
                <CopyIcon />
                คัดลอกข้อความ
              </button>
              {copyNote && (
                <p role="status" className={`${styles.note} ${copyNote.ok ? styles.noteOk : styles.noteWarn}`}>
                  {copyNote.ok ? <CheckCircleIcon /> : <WarningIcon />}
                  {copyNote.ok ? 'คัดลอกแล้ว' : COPY_FAIL}
                </p>
              )}
              <a
                className={`${styles.action} ${styles.actionSecondary}`}
                href={LINE_URL + encodeURIComponent(text)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ChatIcon />
                เปิด LINE
              </a>
              <a className={styles.backLink} href={href(back)}>
                กลับหน้าสมาชิก
              </a>
            </div>
          </>
        )}
      </div>
    </>
  );
}
