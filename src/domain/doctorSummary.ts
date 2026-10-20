// Summary of one member's medicines to show a doctor or pharmacist (step 3.4, screen S14). Pure: `today` is passed in, nothing is
// written, nothing is sent anywhere. Only the member's name and medicine facts go in; no other member, insurance, relation, stock or price.
import { diffDays, type IsoDate } from './calc';
import { thaiDateShort } from './format';
import type { MedEvent, Root } from './schema';
import { describeSchedule } from './scheduleForm';

export type ChangeKind = 'adjust' | 'stop' | 'resume';

export interface DoseChange {
  date: IsoDate;
  kind: ChangeKind;
  /** adjust only: how it was taken before / after (full text with meal timing). */
  from?: string;
  to?: string;
  reason?: string;
}

export interface CurrentMed {
  name: string;
  /** How it is taken now. */
  how: string;
  /** Day of the first 'start' event; null when the history has none (older data). */
  startedOn: IsoDate | null;
  /** At most 3, newest first. Only adjust / stop / resume count (not "edit"). */
  changes: DoseChange[];
}

export interface StoppedMed {
  name: string;
  stoppedOn: IsoDate;
  reason?: string;
}

export interface DoctorSummary {
  personName: string;
  date: IsoDate;
  current: CurrentMed[];
  stopped: StoppedMed[];
}

export const MAX_CHANGES = 3;
export const STOPPED_WITHIN_DAYS = 90;
export const ALLERGY_LINE = 'การแพ้ยา: แอพนี้ยังไม่มีข้อมูลการแพ้ยา — โปรดสอบถามผู้ป่วยหรือญาติ';
export const DISCLAIMER_LINE = 'จดโดยเจ้าของแอพ ไม่ใช่เวชระเบียน โปรดตรวจกับซองยาหรือใบสั่งยาจริง';
export const CURRENT_HEADING = 'ยาที่ใช้อยู่';
export const STOPPED_HEADING = `ยาที่หยุดใน ${STOPPED_WITHIN_DAYS} วันที่ผ่านมา`;
export const NO_CURRENT_LINE = 'ยังไม่มียาที่ใช้อยู่';

/** Events of one medicine, oldest first. The list is append-only, so equal days keep the order they were written. */
function historyOf(events: MedEvent[], assignmentId: string): MedEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.assignmentId === assignmentId)
    .sort((a, b) => (a.e.effectiveOn === b.e.effectiveOn ? a.i - b.i : a.e.effectiveOn < b.e.effectiveOn ? -1 : 1))
    .map(({ e }) => e);
}

/** Summary of one member, or null when the member does not exist or was taken out of the house. */
export function doctorSummary(root: Root, personId: string, today: IsoDate): DoctorSummary | null {
  const person = root.persons.find((p) => p.id === personId && p.removedAt === undefined);
  if (!person) return null;

  const current: CurrentMed[] = [];
  const stopped: StoppedMed[] = [];

  for (const a of root.assignments) {
    if (a.personId !== person.id) continue;
    const med = root.medications.find((m) => m.id === a.medicationId);
    if (!med) continue;
    const history = historyOf(root.events, a.id);

    if (a.status === 'active') {
      const start = history.find((e) => e.type === 'start');
      const changes: DoseChange[] = [];
      for (let i = history.length - 1; i >= 0 && changes.length < MAX_CHANGES; i--) {
        const e = history[i];
        if (!e || (e.type !== 'adjust' && e.type !== 'stop' && e.type !== 'resume')) continue;
        const change: DoseChange = { date: e.effectiveOn, kind: e.type };
        if (e.type === 'adjust' && e.from?.schedule && e.to?.schedule) {
          change.from = describeSchedule(e.from.schedule, med.unit, true);
          change.to = describeSchedule(e.to.schedule, med.unit, true);
        }
        if (e.reason !== undefined) change.reason = e.reason;
        changes.push(change);
      }
      current.push({
        name: med.name,
        how: describeSchedule(a.schedule, med.unit, true),
        startedOn: start ? start.effectiveOn : null,
        changes,
      });
    } else {
      // A stopped medicine without a 'stop' event (older data) is left out: the day is not guessed.
      const stop = [...history].reverse().find((e) => e.type === 'stop');
      if (!stop || diffDays(stop.effectiveOn, today) > STOPPED_WITHIN_DAYS) continue;
      const item: StoppedMed = { name: med.name, stoppedOn: stop.effectiveOn };
      if (stop.reason !== undefined) item.reason = stop.reason;
      stopped.push(item);
    }
  }

  current.sort((a, b) => a.name.localeCompare(b.name, 'th'));
  stopped.sort((a, b) => (a.stoppedOn === b.stoppedOn ? a.name.localeCompare(b.name, 'th') : a.stoppedOn < b.stoppedOn ? 1 : -1));
  return { personName: person.name, date: today, current, stopped };
}

const reasonText = (reason: string | undefined): string => (reason === undefined ? '' : ` (เหตุผล: ${reason})`);

/** One line for a change, used by the text and the picture. */
export function changeLine(c: DoseChange): string {
  const date = thaiDateShort(c.date);
  if (c.kind === 'stop') return `หยุดยา ${date}${reasonText(c.reason)}`;
  if (c.kind === 'resume') return `กลับมาใช้ยา ${date}`;
  const range = c.from !== undefined && c.to !== undefined ? ` จาก ${c.from} เป็น ${c.to}` : '';
  return `ปรับโดส ${date}${range}${reasonText(c.reason)}`;
}

export const startedLine = (m: CurrentMed): string => (m.startedOn === null ? 'เริ่มใช้ ไม่ระบุวันที่' : `เริ่มใช้ ${thaiDateShort(m.startedOn)}`);
export const stoppedLine = (m: StoppedMed): string => `${m.name} หยุด ${thaiDateShort(m.stoppedOn)}${reasonText(m.reason)}`;
export const headLine = (s: DoctorSummary): string => `ข้อมูลจากแอพ JudYa วันที่ ${thaiDateShort(s.date)}`;

/** The text to copy (also shown on screen). */
export function summaryText(s: DoctorSummary): string {
  const lines: string[] = [`สรุปยาของ ${s.personName}`, headLine(s), '', CURRENT_HEADING];
  if (s.current.length === 0) lines.push(NO_CURRENT_LINE);
  s.current.forEach((m, i) => {
    const mark = `${i + 1}) `;
    const pad = ' '.repeat(mark.length);
    lines.push(`${mark}${m.name} — ${m.how}`, `${pad}${startedLine(m)}`);
    for (const c of m.changes) lines.push(`${pad}${changeLine(c)}`);
  });
  if (s.stopped.length > 0) {
    lines.push('', STOPPED_HEADING);
    for (const m of s.stopped) lines.push(`- ${stoppedLine(m)}`);
  }
  lines.push('', ALLERGY_LINE, DISCLAIMER_LINE);
  return lines.join('\n');
}

// ---- picture layout (still pure: the canvas code only wraps and draws these rows) ----

export type RowStyle = 'heading' | 'name' | 'body';
export interface BlockRow {
  text: string;
  style: RowStyle;
  /** 0 = flush left, 1 = indented under the medicine name. */
  indent: 0 | 1;
}
/** A block is never split across pictures. `heading` rows (section titles) belong to the first block of their section. */
export interface Block {
  rows: BlockRow[];
}

export function imageBlocks(s: DoctorSummary): Block[] {
  const blocks: Block[] = [];
  if (s.current.length === 0) {
    blocks.push({ rows: [{ text: CURRENT_HEADING, style: 'heading', indent: 0 }, { text: NO_CURRENT_LINE, style: 'body', indent: 0 }] });
  }
  s.current.forEach((m, i) => {
    const rows: BlockRow[] = [];
    if (i === 0) rows.push({ text: CURRENT_HEADING, style: 'heading', indent: 0 });
    rows.push({ text: `${i + 1}) ${m.name}`, style: 'name', indent: 0 });
    rows.push({ text: m.how, style: 'body', indent: 1 });
    rows.push({ text: startedLine(m), style: 'body', indent: 1 });
    for (const c of m.changes) rows.push({ text: changeLine(c), style: 'body', indent: 1 });
    blocks.push({ rows });
  });
  s.stopped.forEach((m, i) => {
    const rows: BlockRow[] = [];
    if (i === 0) rows.push({ text: STOPPED_HEADING, style: 'heading', indent: 0 });
    rows.push({ text: m.name, style: 'name', indent: 0 });
    rows.push({ text: `หยุด ${thaiDateShort(m.stoppedOn)}${reasonText(m.reason)}`, style: 'body', indent: 1 });
    blocks.push({ rows });
  });
  return blocks;
}

/** Which blocks go on which picture. Order is kept, a picture is filled before a new one starts, a block is never cut, and a block
 * bigger than `capacity` gets a picture of its own. No blocks = one empty picture. */
export function paginate(blocks: { lines: number }[], capacity: number): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  blocks.forEach((b, i) => {
    if (page.length > 0 && used + b.lines > capacity) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(i);
    used += b.lines;
  });
  pages.push(page);
  return pages;
}
