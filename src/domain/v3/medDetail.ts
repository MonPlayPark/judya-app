// The v3 medicine detail (M4 PR 5b): turns one assignment into what the screen shows, and previews / applies a refill.
// Pure. Stock, days left, low stock and expiry are NOT calculated here; they come from stock.ts, stockText.ts and
// calc.ts, with the same limits as the medicine list, so the two pages never disagree.
import { expiryStatus, type IsoDate } from '../calc';
import { MEAL_LABEL, MONTHS, PERIOD_LABEL, PERIODS, formatAmount, intervalTimes, unitWord, type Period } from './home';
import { label as medLabel } from './medsList';
import {
  RESUME_REASON_LABEL,
  STOP_REASON_LABEL,
  packWord,
  rootSchema,
  unitsPerStrip,
  type Assignment,
  type MedEvent,
  type MedKind,
  type Medication,
  type Person,
  type Root,
  type Schedule,
} from './schema';
import { daysLeft, isLowStock, mergeExpiry, refillStock, stockNow, stockUnits, tubeLevel, type RefillAmount } from './stock';
import { formatDaysLeft, formatDaysLeftChange, unitFor } from './stockText';

export type Tone = 'ok' | 'low' | 'out' | 'off';
export interface Chip {
  tone: Tone;
  label: string;
}

/** '2026-10-12' -> '12 ต.ค. 2569' (four-digit Buddhist year; the list keeps its own two-digit `shortThaiDate`). */
export function fullThaiDate(iso: string): string {
  const [y = 0, m = 1, d = 1] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1] ?? ''} ${y + 543}`;
}

// ---------- the model ----------

export interface DoseLine {
  period: Period | 'interval';
  title: string; // 'เช้า'
  sub: string; // '1 เม็ด · หลังอาหาร · ทุกวัน'
}

export interface HistoryRow {
  id: string;
  date: string;
  title: string;
  line1: string | null;
  line2: string | null;
}

export interface StockCard {
  mode: 'count' | 'volume' | 'tubes' | 'none' | 'error';
  big: string; // '53 เม็ด', 'สำรอง 2 หลอด', 'ยังไม่ได้นับ'
  sub: string | null; // '1 กล่อง + 2 แผง + 3 เม็ด', 'กำลังใช้หลอดที่เปิดอยู่'
  note: string | null; // tubes: 'ไม่ตัดสต็อกอัตโนมัติ'
  chip: Chip | null; // null = hidden
  /** Right side: label + value ('พอใช้ได้อีก', 'ประมาณ 26 วัน'); null = hidden. */
  left: { label: string; value: string } | null;
  expiry: { text: string; chip: Chip | null };
  canRefill: boolean;
  /** Cream / drops only. */
  openTube: { label: string; disabled: boolean } | null;
}

export interface MedDetail {
  id: string;
  personName: string;
  avatar: Person['avatar'];
  name: string;
  strength: string | null;
  kind: MedKind;
  status: 'active' | 'stopped';
  stoppedLine: string | null;
  doseTitle: string;
  doseLines: DoseLine[];
  startLine: string;
  stock: StockCard;
  history: HistoryRow[];
  tubeWord: 'หลอด' | 'ขวด';
}

const tubeWordOf = (m: Medication): 'หลอด' | 'ขวด' => (m.kind === 'drops' ? 'ขวด' : 'หลอด');

const WEEKDAY_SHORT = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
function daysText(s: Extract<Schedule, { kind: 'meal' }>): string {
  switch (s.days.kind) {
    case 'daily':
      return 'ทุกวัน';
    case 'alt':
      return 'วันเว้นวัน';
    case 'weekdays':
      return `เฉพาะวัน${[...s.days.days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d] ?? '').join(' ')}`;
  }
}

function doseLines(a: Assignment, m: Medication): DoseLine[] {
  const unit = unitWord(m);
  const s = a.schedule;
  if (s.kind === 'interval') {
    const course = s.course.kind === 'days' ? `${s.course.days} วัน` : 'ต่อเนื่อง';
    const times = intervalTimes(s.everyHours, s.firstTime);
    return [{ period: 'interval', title: `ทุก ${s.everyHours} ชั่วโมง`, sub: `${formatAmount(s.pills)} ${unit} · เริ่ม ${times[0] ?? s.firstTime} น. · ${course}` }];
  }
  const days = daysText(s);
  return PERIODS.flatMap((p): DoseLine[] => {
    const slot = s.slots[p];
    if (!slot) return [];
    const meal = 'meal' in slot ? MEAL_LABEL[slot.meal] : null;
    return [{ period: p, title: PERIOD_LABEL[p], sub: [`${formatAmount(slot.pills)} ${unit}`, meal, days].filter(Boolean).join(' · ') }];
  });
}

/** 'เช้า 1 เม็ด + เย็น 1 เม็ด' / 'ทุก 8 ชั่วโมง 1 เม็ด' (before / after of a dose change). */
function scheduleBrief(s: Schedule, m: Medication): string {
  const unit = unitWord(m);
  if (s.kind === 'interval') return `ทุก ${s.everyHours} ชั่วโมง ${formatAmount(s.pills)} ${unit}`;
  return PERIODS.flatMap((p) => {
    const slot = s.slots[p];
    return slot ? [`${PERIOD_LABEL[p]} ${formatAmount(slot.pills)} ${unit}`] : [];
  }).join(' + ');
}

function reasonText(e: Extract<MedEvent, { type: 'stop' | 'resume' }>): string | null {
  if (!e.reason) return null;
  if (e.reason === 'อื่น ๆ') return e.note ?? RESUME_REASON_LABEL['อื่น ๆ'];
  const base = e.type === 'stop' ? STOP_REASON_LABEL[e.reason as keyof typeof STOP_REASON_LABEL] : RESUME_REASON_LABEL[e.reason as keyof typeof RESUME_REASON_LABEL];
  return e.type === 'stop' && e.note ? `${base} · อาการ: ${e.note}` : base;
}

function historyRow(e: MedEvent, m: Medication): HistoryRow {
  const base = { id: e.id, date: fullThaiDate(e.effectiveOn) };
  switch (e.type) {
    case 'start':
      return { ...base, title: 'เริ่มกินยา', line1: null, line2: null };
    case 'adjust':
      return {
        ...base,
        title: 'ปรับโดส',
        line1: `${scheduleBrief(e.from.schedule, m)} → ${scheduleBrief(e.to.schedule, m)}`,
        line2: e.reason === 'doctor' ? 'เหตุผล: หมอสั่ง' : 'เหตุผล: ปรับเองหรือไม่ใช่หมอสั่ง',
      };
    case 'stop': {
      const r = reasonText(e);
      return { ...base, title: 'หยุดยา', line1: null, line2: r ? `เหตุผล: ${r}` : null };
    }
    case 'resume': {
      const r = reasonText(e);
      return { ...base, title: 'กลับมากินใหม่', line1: null, line2: r ? `เหตุผล: ${r}` : null };
    }
  }
}

/** Newest first: by effective date, then by time written, then the later one in the list. */
function sortedEvents(root: Root, assignmentId: string): MedEvent[] {
  return root.events
    .map((e, i) => ({ e, i }))
    .filter((x) => x.e.assignmentId === assignmentId)
    .sort((x, y) => y.e.effectiveOn.localeCompare(x.e.effectiveOn) || y.e.at.localeCompare(x.e.at) || y.i - x.i)
    .map((x) => x.e);
}

// ----- stock card -----

/** '1 กล่อง + 2 แผง + 3 เม็ด': only the parts above 0; null when the pack has no parts to split into. */
function breakdown(qty: number, m: Medication): string | null {
  const unit = unitWord(m);
  const { pack } = m;
  if (pack.type === 'none' || pack.type === 'container') return null;
  const per = unitsPerStrip(pack) ?? 1;
  const word = packWord(pack);
  const parts: string[] = [];
  let rest = qty;
  if (pack.type === 'box') {
    const perBox = pack.strips * pack.perStrip;
    const boxes = Math.floor(rest / perBox);
    rest -= boxes * perBox;
    if (boxes > 0) parts.push(`${boxes} กล่อง`);
    const strips = Math.floor(rest / per);
    rest -= strips * per;
    if (strips > 0) parts.push(`${strips} ${word}`);
  } else if (pack.type === 'strip' || pack.type === 'bottle') {
    const strips = Math.floor(rest / per);
    rest -= strips * per;
    if (strips > 0) parts.push(`${strips} ${word}`);
  } else {
    const boxes = Math.floor(rest / per); // sachetBox: one "strip" is one box
    rest -= boxes * per;
    if (boxes > 0) parts.push(`${boxes} กล่อง`);
  }
  if (rest > 0) parts.push(`${formatAmount(rest)} ${unit}`);
  return parts.length === 0 ? 'ไม่มียาเหลือ' : parts.join(' + ');
}

function expiryCard(a: Assignment, today: IsoDate, warnDays: number): StockCard['expiry'] {
  const e = expiryStatus(a.expiry, today, warnDays);
  if (!a.expiry) return { text: 'ไม่ได้ระบุ', chip: null };
  const text = fullThaiDate(a.expiry);
  if (e.status === 'expired') return { text, chip: { tone: 'out', label: 'หมดอายุแล้ว' } };
  if (e.status === 'soon') return { text, chip: { tone: 'low', label: 'ใกล้หมดอายุ' } };
  return { text, chip: null };
}

function stockCard(a: Assignment, m: Medication, root: Root, today: IsoDate): StockCard {
  const active = a.status === 'active';
  const expiry = expiryCard(a, today, root.settings.expiryWarnDays);
  const u = stockUnits(a, m);
  const unit = unitFor(a.schedule);
  const hidden = { canRefill: active, openTube: null, expiry };

  if (u.status === 'none') {
    return { mode: 'none', big: 'ยังไม่ได้นับ', sub: active ? 'ใส่จำนวนยาที่มีเมื่อเติมสต็อก' : null, note: null, chip: null, left: null, ...hidden };
  }
  if (u.status === 'error') {
    return { mode: 'error', big: 'ข้อมูลสต็อกไม่ตรงกับยา', sub: null, note: null, chip: null, left: null, ...hidden, canRefill: false };
  }
  if (u.status === 'tubes') {
    const word = tubeWordOf(m);
    const level = tubeLevel(u);
    const chip: Chip = level === 'enough' ? { tone: 'ok', label: 'เพียงพอ' } : level === 'low' ? { tone: 'low', label: 'ใกล้หมด' } : { tone: 'out', label: 'หมด' };
    return {
      mode: 'tubes',
      big: `สำรอง ${u.spare} ${word}`,
      sub: u.opened ? `กำลังใช้${word}ที่เปิดอยู่` : `ยังไม่ได้เปิด${word}`,
      note: 'ไม่ตัดสต็อกอัตโนมัติ',
      chip,
      left: null,
      canRefill: active,
      openTube: active ? { label: `เปิด${word}ใหม่`, disabled: u.spare === 0 } : null,
      expiry,
    };
  }

  // count / volume: quantity at the start of today; a stopped medicine is walked as if active (paused days are skipped)
  const qty = stockNow({ ...a, status: 'active' }, m, today, root.events) ?? u.qty;
  const mode = u.unit === 'ml' ? 'volume' : 'count';
  const big = u.unit === 'ml' ? `${formatAmount(qty)} มล.` : `${formatAmount(qty)} ${unitWord(m)}`;
  const sub = u.unit === 'ml' ? (qty === 0 ? 'ไม่มียาเหลือ' : null) : qty === 0 ? 'ไม่มียาเหลือ' : breakdown(qty, m);
  if (!active) return { mode, big, sub, note: null, chip: null, left: null, canRefill: false, openTube: null, expiry };

  const d = daysLeft(a, m, today, root.events);
  const out = d.status === 'ok' && d.days === 0;
  const low = isLowStock(a, m, today, root.settings.lowStockDays, root.events);
  const chip: Chip = out ? { tone: 'out', label: 'หมด' } : low ? { tone: 'low', label: 'ใกล้หมด' } : { tone: 'ok', label: 'เพียงพอ' };
  let value = formatDaysLeft(d, unit);
  if (d.status === 'ok' && d.days > 0 && unit === 'days') value = `ประมาณ ${value}`;
  return { mode, big, sub, note: null, chip, left: { label: 'พอใช้ได้อีก', value }, canRefill: true, openTube: null, expiry };
}

export function buildMedDetail(root: Root, assignmentId: string, today: IsoDate): MedDetail | null {
  const a = root.assignments.find((x) => x.id === assignmentId);
  const m = a ? root.medications.find((x) => x.id === a.medicationId) : undefined;
  const person = a ? root.persons.find((p) => p.id === a.personId) : undefined;
  if (!a || !m || !person) return null;

  const events = sortedEvents(root, a.id);
  const applying = m.kind === 'cream' || m.kind === 'drops';
  const start = events.filter((e) => e.type === 'start').at(-1); // oldest start (events are newest first)
  const startDate = start ? start.effectiveOn : a.createdAt.slice(0, 10);
  const lastStop = events.find((e) => e.type === 'stop');
  const stoppedLine =
    a.status === 'stopped' && lastStop && lastStop.type === 'stop'
      ? `หยุดเมื่อ ${fullThaiDate(lastStop.effectiveOn)}${reasonText(lastStop) ? ` · เหตุผล: ${reasonText(lastStop)}` : ''}`
      : a.status === 'stopped'
        ? 'หยุดแล้ว'
        : null;

  const full = medLabel(m);
  return {
    id: a.id,
    personName: person.name,
    avatar: person.avatar,
    name: m.name,
    strength: m.strength ? full.slice(m.name.length + 1) : null,
    kind: m.kind,
    status: a.status,
    stoppedLine,
    doseTitle: a.status === 'stopped' ? 'วิธีกินก่อนหยุด' : 'วิธีกิน',
    doseLines: doseLines(a, m),
    startLine: `${applying ? 'เริ่มใช้เมื่อ' : 'เริ่มกินเมื่อ'} ${fullThaiDate(startDate)}`,
    stock: stockCard(a, m, root, today),
    history: events.map((e) => historyRow(e, m)),
    tubeWord: tubeWordOf(m),
  };
}

// ---------- refill (sheet C1) ----------

export type RefillFieldKey = 'boxes' | 'strips' | 'loose' | 'ml' | 'spare';
export interface RefillField {
  key: RefillFieldKey;
  unit: string; // text after the box: 'กล่อง', 'แผง', 'เม็ด', 'มล.', 'หลอด'
}

type Mode = 'count' | 'volume' | 'tubes';
function modeOf(a: Assignment, m: Medication): Mode {
  if (a.stock) return a.stock.kind;
  if (m.kind === 'liquid') return 'volume';
  if (m.kind === 'cream' || m.kind === 'drops') return 'tubes';
  return 'count';
}

/** The number boxes of the refill sheet, by what the medicine is packed in. */
export function refillFields(a: Assignment, m: Medication): RefillField[] {
  const mode = modeOf(a, m);
  if (mode === 'volume') return [{ key: 'ml', unit: 'มล.' }];
  if (mode === 'tubes') return [{ key: 'spare', unit: tubeWordOf(m) }];
  const unit = unitWord(m);
  switch (m.pack.type) {
    case 'box':
      return [{ key: 'boxes', unit: 'กล่อง' }, { key: 'strips', unit: 'แผง' }, { key: 'loose', unit }];
    case 'strip':
    case 'bottle':
      return [{ key: 'strips', unit: packWord(m.pack) }, { key: 'loose', unit }];
    case 'sachetBox':
      return [{ key: 'strips', unit: 'กล่อง' }, { key: 'loose', unit }];
    case 'none':
    case 'container':
      return [{ key: 'loose', unit }];
  }
}

export type RefillValues = Partial<Record<RefillFieldKey, string>>;

/** The typed numbers as a `RefillAmount`; null = nothing typed yet (all empty or 0); a text = a box holds something
 * that is not a number. A box of strips is turned into strips by the strips-per-box of the pack. */
export function refillAmount(a: Assignment, m: Medication, values: RefillValues): RefillAmount | null | { error: string } {
  const num = (k: RefillFieldKey): number | 'bad' => {
    const t = (values[k] ?? '').trim();
    if (t === '') return 0;
    const n = Number(t);
    return /^\d+(\.\d+)?$/.test(t) && Number.isFinite(n) ? n : 'bad';
  };
  const keys = refillFields(a, m).map((f) => f.key);
  const got = keys.map((k) => num(k));
  if (got.includes('bad')) return { error: 'ใส่ได้เฉพาะตัวเลข' };
  const n = Object.fromEntries(keys.map((k, i) => [k, got[i] as number])) as Partial<Record<RefillFieldKey, number>>;
  if (keys.every((k) => (n[k] ?? 0) === 0)) return null;
  const mode = modeOf(a, m);
  if (mode === 'volume') return { kind: 'volume', ml: n.ml ?? 0 };
  if (mode === 'tubes') return { kind: 'tubes', spare: n.spare ?? 0 };
  const perBox = m.pack.type === 'box' ? m.pack.strips : 1;
  return { kind: 'count', strips: (n.boxes ?? 0) * perBox + (n.strips ?? 0), loose: n.loose ?? 0 };
}

export interface RefillPreview {
  assignment: Assignment;
  /** 'จำนวนรวม' / 'พอใช้ประมาณ' / 'จำนวนหลอดสำรอง' with 'before → after'. */
  rows: { label: string; value: string }[];
  /** The expiry that will be kept (nearer of old and new), or none. */
  expiry: IsoDate | undefined;
}

export type RefillResult = { ok: true; preview: RefillPreview } | { ok: false; error: string };

/** What a refill would do; `refillStock` (stock.ts) does the work and is the only thing that decides if it is valid. */
export function previewRefill(root: Root, assignmentId: string, add: RefillAmount, newExpiry: IsoDate | undefined, today: IsoDate): RefillResult {
  const a = root.assignments.find((x) => x.id === assignmentId);
  const m = a ? root.medications.find((x) => x.id === a.medicationId) : undefined;
  if (!a || !m) return { ok: false, error: 'ไม่พบยานี้' };
  const res = refillStock(a, m, root.events, today, add, newExpiry);
  if (!res.ok) return res;
  const next = res.assignment;
  const rows: { label: string; value: string }[] = [];
  const unit = unitFor(a.schedule);
  if (add.kind === 'tubes') {
    const word = tubeWordOf(m);
    const before = a.stock?.kind === 'tubes' ? a.stock.spare : 0;
    const after = next.stock?.kind === 'tubes' ? next.stock.spare : before;
    rows.push({ label: 'จำนวนหลอดสำรอง', value: `${before} ${word} → ${after} ${word}` });
  } else {
    const q = (x: Assignment): string => {
      const v = stockNow(x, m, today, root.events);
      return v === null ? 'ยังไม่ได้นับ' : `${formatAmount(v)} ${add.kind === 'volume' ? 'มล.' : unitWord(m)}`;
    };
    rows.push({ label: 'จำนวนรวม', value: `${q(a)} → ${q(next)}` });
    rows.push({ label: 'พอใช้ประมาณ', value: formatDaysLeftChange(daysLeft(a, m, today, root.events), daysLeft(next, m, today, root.events), unit) });
  }
  return { ok: true, preview: { assignment: next, rows, expiry: mergeExpiry(a.expiry, newExpiry) } };
}

/** The root with the refilled assignment put in its place. No MedEvent is made. */
export function applyRefill(root: Root, assignmentId: string, assignment: Assignment): { ok: true; root: Root } | { ok: false; error: string } {
  const next: Root = { ...root, assignments: root.assignments.map((x) => (x.id === assignmentId ? assignment : x)) };
  return rootSchema.safeParse(next).success ? { ok: true, root: next } : { ok: false, error: 'ข้อมูลไม่ถูกต้อง บันทึกไม่ได้ ลองใหม่อีกครั้ง' };
}
