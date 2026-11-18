// The text summary for the doctor (M4 PR 15a). Pure: no storage, no clock (the caller gives today), no UI. Text only, one member = one summary.
// The order of the parts is fixed: header, allergy (always second), treatment rights, medicines in use, latest changes, stopped in 90 days, footer.
// Wording of unknown allergy is never "no allergy". Content decided by the owner in step 3.4.
import { addDays } from '../calc';
import { coverageText } from './allergy';
import { buildMedDetail, fullThaiDate, historyRow } from './medDetail';
import { label } from './medsList';
import { STOP_REASON_LABEL, type MedEvent, type Person, type Root } from './schema';

export const NO_MEDS_TEXT = 'ยังไม่มียาให้สรุป';
export const DOCTOR_FOOTER = 'จดโดยเจ้าของแอพ ไม่ใช่เวชระเบียน โปรดตรวจกับซองยาหรือใบสั่งยาจริง';
export const ALLERGY_UNKNOWN_FOR_DOCTOR = 'ยังไม่ได้บันทึกข้อมูลการแพ้ยา โปรดสอบถามผู้ป่วยหรือญาติ';
const STOPPED_DAYS = 90;
const LATEST_CHANGES = 3;

export interface DoctorSummary {
  name: string;
  /** '' when there is no medicine to summarise. */
  text: string;
  empty: boolean;
}

const activePerson = (root: Root, id: string): Person | undefined => root.persons.find((p) => p.id === id && p.removedAt === undefined);

/** Number of medicines in use (active) of a member. */
export const activeMedCount = (root: Root, personId: string): number => root.assignments.filter((a) => a.personId === personId && a.status === 'active').length;

export interface DoctorPerson {
  id: string;
  name: string;
  avatar: Person['avatar'];
  /** 'ยา N รายการ' (medicines in use). */
  medText: string;
}

/** The members the Home tile "แชร์ให้แพทย์" offers (active members, list order). */
export const doctorPeople = (root: Root): DoctorPerson[] =>
  root.persons.filter((p) => p.removedAt === undefined).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, medText: `ยา ${activeMedCount(root, p.id)} รายการ` }));

function allergyLines(p: Person): string[] {
  const a = p.allergies;
  switch (a.status) {
    case 'unknown':
      return [ALLERGY_UNKNOWN_FOR_DOCTOR];
    case 'none_confirmed':
      return [`ไม่มีประวัติแพ้ยาที่ทราบ (ยืนยันเมื่อ ${fullThaiDate(a.confirmedAt)})`];
    case 'listed':
      return a.items.map((i) => `- ${i.drug}: ${i.reaction}`);
  }
}

const stopReason = (e: Extract<MedEvent, { type: 'stop' }>): string => (e.reason === 'อื่น ๆ' ? (e.note ?? STOP_REASON_LABEL[e.reason]) : STOP_REASON_LABEL[e.reason]);

/** Newest first: by effective day, then time written, then later in the list. */
function ordered(events: readonly MedEvent[]): MedEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((x, y) => y.e.effectiveOn.localeCompare(x.e.effectiveOn) || y.e.at.localeCompare(x.e.at) || y.i - x.i)
    .map((x) => x.e);
}

export function buildDoctorSummary(root: Root, personId: string, today: string): DoctorSummary | null {
  const p = activePerson(root, personId);
  if (!p) return null;
  const mine = root.assignments.filter((a) => a.personId === personId);
  const myIds = new Set(mine.map((a) => a.id));
  const medOf = (assignmentId: string) => {
    const a = mine.find((x) => x.id === assignmentId);
    return a ? root.medications.find((m) => m.id === a.medicationId) : undefined;
  };

  // stopped within 90 days: the latest stop event of each stopped medicine
  const cutoff = addDays(today, -STOPPED_DAYS);
  const stopped = mine.flatMap((a) => {
    if (a.status !== 'stopped') return [];
    const stop = ordered(root.events.filter((e) => e.assignmentId === a.id)).find((e): e is Extract<MedEvent, { type: 'stop' }> => e.type === 'stop');
    const m = medOf(a.id);
    return stop && m && stop.effectiveOn >= cutoff && stop.effectiveOn <= today ? [{ m, stop }] : [];
  });
  const active = mine.filter((a) => a.status === 'active');
  if (active.length === 0 && stopped.length === 0) return { name: p.name, text: '', empty: true };

  const out: string[] = [];
  const birth = p.birthYearBE;
  const age = birth === undefined ? null : Number(today.slice(0, 4)) + 543 - birth;
  out.push(`สรุปยาของ ${p.name}`);
  out.push([age !== null && age >= 0 ? `อายุ ${age} ปี` : '', `ข้อมูล ณ ${fullThaiDate(today)}`].filter((x) => x !== '').join(' · '));
  out.push('', 'การแพ้ยา:', ...allergyLines(p));
  if (p.coverage) out.push('', `สิทธิ์รักษา: ${coverageText(p.coverage)}`);

  if (active.length > 0) {
    out.push('', `ยาที่ใช้อยู่ (${active.length} รายการ)`);
    for (const a of active) {
      const d = buildMedDetail(root, a.id, today);
      const m = medOf(a.id);
      if (!d || !m) continue;
      out.push(`- ${label(m)}`);
      out.push(`  วิธีกิน: ${d.doseLines.map((l) => `${l.title} ${l.sub}`).join('; ')}`);
      out.push(`  ${d.startLine.replace(/^เริ่ม(กิน|ใช้)เมื่อ /, 'เริ่ม ')}`);
      if (d.sideEffects) out.push(`  ผลข้างเคียง: ${d.sideEffects.replace(/\s+/g, ' ').trim()}`);
    }
  }

  const changes = ordered(root.events.filter((e) => myIds.has(e.assignmentId) && e.type !== 'start')).slice(0, LATEST_CHANGES);
  if (changes.length > 0) {
    out.push('', 'การปรับยาล่าสุด');
    for (const e of changes) {
      const m = medOf(e.assignmentId);
      if (!m) continue;
      const head = `- ${fullThaiDate(e.effectiveOn)} ${label(m)}:`;
      if (e.type === 'adjust') {
        const row = historyRow(e, m);
        out.push(`${head} ${row.line1 ?? ''} (${row.line2 ?? ''})`);
      } else if (e.type === 'stop') {
        const sym = e.note && e.reason !== 'อื่น ๆ' ? `, อาการ ${e.note}` : '';
        out.push(`${head} หยุดยา (เหตุผล ${stopReason(e)}${sym})`);
      } else if (e.type === 'resume') {
        out.push(`${head} กลับมาใช้ยา`);
      }
    }
  }

  if (stopped.length > 0) {
    out.push('', 'ยาที่หยุดใน 90 วันที่ผ่านมา');
    for (const { m, stop } of stopped) out.push(`- ${label(m)} หยุดเมื่อ ${fullThaiDate(stop.effectiveOn)} (เหตุผล: ${stopReason(stop)})`);
  }

  out.push('', DOCTOR_FOOTER);
  return { name: p.name, text: out.join('\n'), empty: false };
}
