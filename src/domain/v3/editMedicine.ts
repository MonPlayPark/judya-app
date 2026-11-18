// Editing the data of a medicine that was typed wrongly or not completely (M4 PR 8a, boards #23 - #27, #38). Pure: takes a
// root, returns a new root, never touches storage. An edit is NOT a MedEvent (the schema rejects `edit` events), so the
// history is never written here: `applyEdit` changes the Medication / Assignment / HouseItem rows and nothing else.
// The pack, kind and strength rules are the ones of the add form (addMedicine.ts); this file only reads a saved medicine
// back into that form, compares it with what was typed, and writes the result.
import type { IsoDate } from '../calc';
import {
  BUY_OPTIONS,
  DEFAULT_BUY,
  KIND_LABEL,
  SAVE_FAILED_TEXT,
  SMALL_UNIT,
  buyLabel,
  buyOfPack,
  countFields,
  defaultStrengthUnit,
  emptyStockDraft,
  emptyStrength,
  houseUnit,
  isTubeKind,
  leftTextFor,
  nameProblem,
  packLine,
  parseNum,
  planStock,
  sizeDraftOfPack,
  sizeFields,
  strengthOf,
  validDate,
  type BuyAs,
  type StockDraft,
  type StockPlan,
  type StrengthDraft,
} from './addMedicine';
import { formatAmount } from './home';
import { label } from './medsList';
import {
  doseProblem,
  rootSchema,
  unitsPerStrip,
  type Assignment,
  type HouseItem,
  type MedKind,
  type Medication,
  type Pack,
  type Person,
  type Root,
  type Stock,
} from './schema';
import { daysLeft, stockNow } from './stock';
import { formatDaysLeft, unitFor } from './stockText';

export { KIND_LABEL, buyLabel };

export type EditTarget = { type: 'personal'; assignmentId: string } | { type: 'house'; houseItemId: string };

export interface EditDraft {
  /** Which kind of medicine this draft is for. */
  type: EditTarget['type'];
  name: string;
  kind: MedKind;
  strength: StrengthDraft;
  /** Personal medicine: buy-as, pack boxes and count boxes (the add form's own draft). Not used for a house medicine. */
  stock: StockDraft;
  /** House medicine: the unit it is counted in (null = "ไม่นับสต็อก") and the number. A house item has no pack size. */
  house: { unit: string | null; qty: string };
  expiry: string; // '' or 'YYYY-MM-DD'
}

export type EditField = 'name' | 'kind' | 'strength' | 'buy' | 'pack' | 'count' | 'expiry';

export const NOTHING_CHANGED_TEXT = 'ยังไม่ได้แก้อะไร';
export const REQUIRED_TEXT = 'กรอกข้อมูลที่จำเป็นให้ครบก่อน';
export const SHARED_KIND_TEXT = 'ยานี้มีคนอื่นใช้ด้วย เปลี่ยนชนิดข้ามกลุ่มไม่ได้ ถ้าใส่ผิดให้เพิ่มยาใหม่แทน';
export const DOSE_KIND_TEXT = 'วิธีกินเดิมใช้หน่วยของชนิดเดิม ต้องปรับวิธีกินก่อนถึงจะเปลี่ยนเป็นชนิดนี้ได้';
export const CONFIRM_WARN_PERSONAL = 'จำนวนวันที่เหลือและการเตือนซื้อยาจะคำนวณใหม่จากตัวเลขนี้ การแก้ไขนี้จะไม่ปรากฏในประวัติการใช้ยา';
export const CONFIRM_WARN_HOUSE = 'แอพจะเตือนให้ซื้อเติมจากตัวเลขใหม่ การแก้ไขนี้จะไม่ปรากฏในประวัติการใช้ยา';

const squash = (s: string): string => s.replace(/\s+/g, '').toLowerCase();
const round2 = (n: number): number => Number(n.toFixed(2));
const jsonEq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A typed number for comparing: '10' and '10.0' are the same; text that is not a number is compared as typed. */
function norm(s: string): string {
  const t = s.trim();
  if (t === '') return '';
  const n = Number(t);
  return Number.isFinite(n) && /^\d+(\.\d+)?$/.test(t) ? String(n) : t;
}

// ---------- kind groups (board #27) ----------

export type KindGroup = 'solid' | 'sachet' | 'liquid' | 'tube' | 'other';

export const kindGroup = (kind: MedKind): KindGroup =>
  kind === 'tablet' || kind === 'capsule' ? 'solid' : kind === 'sachet' ? 'sachet' : kind === 'liquid' ? 'liquid' : kind === 'cream' || kind === 'drops' ? 'tube' : 'other';

/** tablet <-> capsule and cream <-> drops are the same group (applied at once); every other change is cross-group. */
export const isCrossGroup = (from: MedKind, to: MedKind): boolean => kindGroup(from) !== kindGroup(to);

// ---------- the people around a medicine ----------

const activePersons = (root: Root): Person[] => root.persons.filter((p) => p.removedAt === undefined);

interface Found {
  assignment: Assignment;
  medication: Medication;
  /** Other assignments of the same medication (any person, active or stopped). */
  others: Assignment[];
  owner: Person | undefined;
}

function findPersonal(root: Root, assignmentId: string): Found | null {
  const assignment = root.assignments.find((a) => a.id === assignmentId);
  const medication = assignment ? root.medications.find((m) => m.id === assignment.medicationId) : undefined;
  if (!assignment || !medication) return null;
  return {
    assignment,
    medication,
    others: root.assignments.filter((a) => a.medicationId === medication.id && a.id !== assignment.id),
    owner: root.persons.find((p) => p.id === assignment.personId),
  };
}

const findHouse = (root: Root, id: string): HouseItem | undefined => root.houseItems.find((h) => h.id === id && h.removedAt === undefined);

/** Names of the other people who use the same medicine (a person taken out of the house is left out; if only such people
 * use it, the text says "คนอื่น"). */
function sharedNames(root: Root, f: Found): string[] {
  const ids = new Set(f.others.map((a) => a.personId));
  if (ids.size === 0) return [];
  const names = activePersons(root).filter((p) => ids.has(p.id)).map((p) => p.name);
  return names.length > 0 ? names : ['คนอื่น'];
}

// ---------- the house unit ----------

/** The units a house medicine can be counted in, kind's own unit first; the unit it is saved with is always listed. */
export function houseUnitOptions(kind: MedKind, current: string | null): string[] {
  const base: string[] =
    kind === 'tablet' || kind === 'capsule'
      ? [SMALL_UNIT[kind], 'แผง', 'กล่อง', 'ขวด']
      : kind === 'sachet'
        ? ['ซอง', 'กล่อง']
        : isTubeKind(kind)
          ? ['หลอด', 'ขวด']
          : [SMALL_UNIT[kind]];
  const first = houseUnit(kind, DEFAULT_BUY[kind]);
  const list = [first, ...base.filter((u) => u !== first)];
  return current !== null && !list.includes(current) ? [...list, current] : list;
}

// ---------- reading a saved medicine into the form ----------

const emptyHouse = { unit: null, qty: '' } as const;

/** How the saved stock is asked again: from the pack, or in loose pieces when there is a count but no pack. */
function buyOf(m: Medication, stock: Stock | null): BuyAs {
  if (m.pack.type === 'none') {
    if (!stock) return 'none';
    if (isTubeKind(m.kind)) return 'tube';
    return 'loose';
  }
  return buyOfPack(m.kind, m.pack);
}

/** The count boxes for `qty` pieces (or ml) under `pack`: whole boxes / strips / bottles and the rest. */
function countsFor(m: Medication, buy: BuyAs, stock: Stock, qty: number): StockDraft['counts'] {
  const c: StockDraft['counts'] = { boxes: '', strips: '', loose: '', total: '' };
  const num = (n: number): string => String(round2(n));
  if (stock.kind === 'tubes') {
    c.total = String((stock.opened ? 1 : 0) + stock.spare);
    return c;
  }
  const pack = m.pack;
  if (stock.kind === 'volume') {
    if (buy === 'container' && pack.type === 'container') {
      const bottles = Math.floor(qty / pack.amount);
      c.strips = String(bottles);
      c.loose = num(qty - bottles * pack.amount);
    } else c.loose = num(qty);
    return c;
  }
  const per = unitsPerStrip(pack);
  if (per === null) {
    c.loose = num(qty);
    return c;
  }
  const strips = Math.floor(qty / per);
  const loose = num(qty - strips * per);
  if (pack.type === 'box') {
    c.boxes = String(Math.floor(strips / pack.strips));
    c.strips = String(strips % pack.strips);
    c.loose = loose;
  } else if (pack.type === 'sachetBox') {
    c.boxes = String(strips);
    c.loose = loose;
  } else {
    c.strips = String(strips);
    c.loose = loose;
  }
  return c;
}

/** Everything the form shows when it opens: the saved values. A personal count is what is there TODAY (the saved count
 * minus the doses taken since the counting day), so the number matches the detail page. null = no such medicine. */
export function draftFromCurrent(root: Root, target: EditTarget, today: IsoDate): EditDraft | null {
  if (target.type === 'house') {
    const h = findHouse(root, target.houseItemId);
    if (!h) return null;
    const kind: MedKind = h.kind ?? 'other';
    return {
      type: 'house',
      name: h.name,
      kind,
      strength: h.strength ? { value: String(h.strength.value), unit: h.strength.unit } : emptyStrength(kind),
      stock: emptyStockDraft(kind),
      house: h.stock ? { unit: h.stock.unit, qty: String(round2(h.stock.qty)) } : { ...emptyHouse },
      expiry: h.expiry ?? '',
    };
  }
  const f = findPersonal(root, target.assignmentId);
  if (!f) return null;
  const { assignment: a, medication: m } = f;
  const buy = buyOf(m, a.stock);
  const now = a.stock ? stockNow(a, m, today, root.events) : null;
  const raw = a.stock?.kind === 'count' ? a.stock.strips * (unitsPerStrip(m.pack) ?? 0) + a.stock.loose : a.stock?.kind === 'volume' ? a.stock.ml : 0;
  const counts = a.stock ? countsFor(m, buy, a.stock, now ?? raw) : emptyStockDraft(m.kind).counts;
  return {
    type: 'personal',
    name: m.name,
    kind: m.kind,
    strength: m.strength ? { value: String(m.strength.value), unit: m.strength.unit } : emptyStrength(m.kind),
    stock: { buy, size: sizeDraftOfPack(m.pack), counts },
    house: { ...emptyHouse },
    expiry: a.expiry ?? '',
  };
}

// ---------- the kind ----------

const withStrengthUnit = (d: EditDraft, kind: MedKind): StrengthDraft => (d.strength.value.trim() === '' ? { value: '', unit: defaultStrengthUnit(kind) } : d.strength);

/** A kind of the same group (tablet <-> capsule, cream <-> drops): nothing else changes. */
export function changeKind(d: EditDraft, kind: MedKind): EditDraft {
  return { ...d, kind, strength: withStrengthUnit(d, kind) };
}

/** A kind of another group, after the owner agreed (board #27): pack and counts are cleared and "buy as" goes back to the
 * default of the new group. A house medicine gets the unit of the new group and no number. */
export function resetForKind(d: EditDraft, kind: MedKind): EditDraft {
  return {
    ...d,
    kind,
    strength: withStrengthUnit(d, kind),
    stock: emptyStockDraft(kind),
    house: d.type === 'house' ? { unit: houseUnit(kind, DEFAULT_BUY[kind]), qty: '' } : { ...emptyHouse },
  };
}

// ---------- what changed ----------

/** The buy-as choices of a kind: the add form's list, and the loose count when the saved medicine is counted that way. */
export function editBuyOptions(kind: MedKind, current: BuyAs): BuyAs[] {
  const list = [...BUY_OPTIONS[kind]];
  return current === 'loose' && !list.includes('loose') ? [...list, 'loose'] : list;
}

/** The tile word. Same as the add form, except a loose count of pills reads "นับเป็นเม็ด". */
export function editBuyLabel(kind: MedKind, buy: BuyAs): string {
  return buy === 'loose' && (kind === 'tablet' || kind === 'capsule' || kind === 'liquid') ? `นับเป็น${SMALL_UNIT[kind]}` : buyLabel(kind, buy);
}

const houseQty = (d: EditDraft): string => (d.house.unit === null ? '' : norm(d.house.qty));

/** Which fields differ from the saved values, in the order of the screen. The unit of a strength is ignored while its number is empty. */
export function changedFields(original: EditDraft, draft: EditDraft): EditField[] {
  const out: EditField[] = [];
  if (draft.name.trim() !== original.name.trim()) out.push('name');
  if (draft.kind !== original.kind) out.push('kind');
  const s0 = norm(original.strength.value);
  const s1 = norm(draft.strength.value);
  if (s0 !== s1 || (s1 !== '' && original.strength.unit !== draft.strength.unit)) out.push('strength');
  if (draft.type === 'house') {
    if (draft.house.unit !== original.house.unit) out.push('buy');
    if (houseQty(draft) !== houseQty(original)) out.push('count');
  } else {
    if (draft.stock.buy !== original.stock.buy) out.push('buy');
    const sizeKeys = sizeFields(draft.kind, draft.stock.buy).map((f) => f.key);
    if (sizeKeys.some((k) => norm(draft.stock.size[k]) !== norm(original.stock.size[k]))) out.push('pack');
    const countKeys = countFields(draft.kind, draft.stock.buy).map((f) => f.key);
    if (countKeys.some((k) => norm(draft.stock.counts[k]) !== norm(original.stock.counts[k]))) out.push('count');
  }
  if (draft.expiry !== original.expiry) out.push('expiry');
  return out;
}

/** Buy-as, pack size and counts ask "ตรวจก่อนบันทึก" first; a cross-group kind change always does (the pack and counts were cleared). */
export function needsConfirm(original: EditDraft, draft: EditDraft): boolean {
  const fields = changedFields(original, draft);
  return fields.some((f) => f === 'buy' || f === 'pack' || f === 'count') || isCrossGroup(original.kind, draft.kind);
}

// ---------- the context of a screen ----------

export interface EditContext {
  type: EditTarget['type'];
  original: EditDraft;
  /** The person whose medicine it is (personal only). */
  owner: { name: string; avatar: Person['avatar'] } | null;
  /** Names of the other people who use the same medicine; [] = nobody. */
  sharedWith: string[];
  /** A cross-group kind change is allowed only when nobody else uses the medicine. */
  crossGroupAllowed: boolean;
  /** The medicine's saved label ("VitaminD 1000 IU") for headings. */
  title: string;
  stopped: boolean;
}

export function editContext(root: Root, target: EditTarget, today: IsoDate = '1970-01-01'): EditContext | null {
  const original = draftFromCurrent(root, target, today);
  if (!original) return null;
  if (target.type === 'house') {
    const h = findHouse(root, target.houseItemId);
    return { type: 'house', original, owner: null, sharedWith: [], crossGroupAllowed: true, title: h ? label(h) : original.name, stopped: false };
  }
  const f = findPersonal(root, target.assignmentId);
  if (!f) return null;
  const sharedWith = sharedNames(root, f);
  return {
    type: 'personal',
    original,
    owner: f.owner ? { name: f.owner.name, avatar: f.owner.avatar } : null,
    sharedWith,
    crossGroupAllowed: sharedWith.length === 0,
    title: label(f.medication),
    stopped: f.assignment.status === 'stopped',
  };
}

// ---------- the texts of the screen ----------

export interface ConfirmRow {
  label: string;
  before: string;
  after: string;
}

export interface EditEval {
  fields: EditField[];
  confirm: boolean;
  /** The grey sentence under a disabled save button; null = can save. */
  blocker: string | null;
  nameError: string | null;
  strengthBad: boolean;
  /** Keys of the required pack boxes that are empty (personal). */
  missing: string[];
  packWarning: string | null;
  /** The dose of the current schedule does not fit the new kind (personal): saving is blocked until the dose is changed. */
  doseNote: string | null;
  countProblem: string | null;
  packLine: string | null;
  /** 'ตอนนี้มีรวม 53 เม็ด'; null = nothing to say. */
  totalText: string | null;
  /** 'พอใช้ประมาณ 26 วัน'; personal, counted in pieces or ml, medicine in use. */
  daysText: string | null;
  duplicateNote: string | null;
  sharedPackNote: string | null;
  sharedStockNote: string | null;
  rows: ConfirmRow[];
}

const qtyText = (kind: MedKind, n: number): string => (kind === 'liquid' ? String(round2(n)) : formatAmount(n));

/** 'พอใช้ประมาณ 26 วัน' from the words of `formatDaysLeft` (which may already say "ประมาณ" or "ไม่ถึง"). */
export function leftLine(days: string): string {
  if (days.startsWith('พอใช้') || days.startsWith('ไม่พอ')) return days;
  if (days.startsWith('ประมาณ') || days.startsWith('ไม่ถึง')) return `พอใช้${days}`;
  return `พอใช้ประมาณ ${days}`;
}

function totalOf(kind: MedKind, plan: StockPlan): { text: string; plain: string } | null {
  const s = plan.stock;
  if (s?.kind === 'tubes') {
    const n = (s.opened ? 1 : 0) + s.spare;
    const word = houseUnit(kind, plan.pack.type === 'none' ? 'tube' : 'bottle');
    return { text: `${n} ${word}`, plain: `${n} ${word}` };
  }
  if (plan.total === null) return null;
  const plain = `${qtyText(kind, plan.total)} ${SMALL_UNIT[kind]}`;
  return { text: plain, plain };
}

const packText = (kind: MedKind, pack: Pack): string => packLine(kind, pack) ?? 'ไม่ระบุ';

function nameErrorOf(name: string): string | null {
  if (name.trim() === '') return 'ต้องกรอกช่องนี้';
  return nameProblem(name);
}

/** The pack and the stock this draft would write (personal). */
const personalPlan = (d: EditDraft, today: IsoDate): StockPlan => planStock(d.kind, d.stock, today);

/** Does the person's own stock get written again? Buy-as, pack, counts or a cross-group kind. */
function stockRewritten(fields: EditField[], original: EditDraft, draft: EditDraft): boolean {
  return fields.some((x) => x === 'buy' || x === 'pack' || x === 'count') || isCrossGroup(original.kind, draft.kind);
}

/** The pack goes back to the medicine when anything about it, or its kind, changed (cream <-> drops changes g <-> ml). */
function packRewritten(fields: EditField[], original: EditDraft, draft: EditDraft): boolean {
  return stockRewritten(fields, original, draft) || fields.includes('kind');
}

/** Everything a screen needs to draw the draft and to know if it can be saved. */
export function evaluateEdit(root: Root, target: EditTarget, draft: EditDraft, today: IsoDate): EditEval {
  const ctx = editContext(root, target, today);
  const blank: EditEval = {
    fields: [], confirm: false, blocker: NOTHING_CHANGED_TEXT, nameError: null, strengthBad: false, missing: [], packWarning: null, doseNote: null, countProblem: null,
    packLine: null, totalText: null, daysText: null, duplicateNote: null, sharedPackNote: null, sharedStockNote: null, rows: [],
  };
  if (!ctx) return blank;
  const { original } = ctx;
  const house = target.type === 'house';
  const fields = changedFields(original, draft);
  const nameError = nameErrorOf(draft.name);
  const strengthBad = !strengthOf(draft.strength).ok;

  // ----- notes
  let duplicateNote: string | null = null;
  const key = squash(draft.name);
  if (key !== '') {
    if (house) {
      if (root.houseItems.some((h) => h.removedAt === undefined && h.id !== target.houseItemId && squash(h.name) === key)) duplicateNote = 'มียาสามัญชื่อนี้อยู่แล้ว';
    } else {
      const f = findPersonal(root, target.assignmentId);
      const mine = f ? root.assignments.filter((a) => a.personId === f.assignment.personId && a.medicationId !== f.medication.id) : [];
      const clash = mine.some((a) => squash(root.medications.find((m) => m.id === a.medicationId)?.name ?? '') === key);
      if (clash && ctx.owner) duplicateNote = `มียาชื่อนี้ของ ${ctx.owner.name} อยู่แล้ว`;
    }
  }
  const shared = ctx.sharedWith.length > 0 && ctx.owner !== null;
  const sharedPackNote = shared ? `ยานี้ใช้ร่วมกับ ${ctx.sharedWith.join(' ')} ชื่อ ชนิด ความแรง และขนาดบรรจุจะเปลี่ยนของทุกคน` : null;
  const sharedStockNote = shared && ctx.owner ? `จำนวนที่มีและวันหมดอายุ แก้เฉพาะของ ${ctx.owner.name}` : null;

  // ----- house
  if (house) {
    const q = draft.house.unit === null || draft.house.qty.trim() === '' ? { kind: 'empty' as const } : parseNum(draft.house.qty);
    const bad = q.kind === 'bad';
    const countProblem = bad ? 'ใส่ได้เฉพาะตัวเลข' : null;
    const invalid = nameError !== null || strengthBad || bad;
    const unitNow = draft.house.unit;
    const unitBefore = original.house.unit;
    const qtyOf = (d: EditDraft): string => (d.house.unit === null || d.house.qty.trim() === '' ? 'ไม่นับสต็อก' : `${norm(d.house.qty)} ${d.house.unit}`);
    const rows: ConfirmRow[] = [];
    if (fields.includes('buy')) rows.push({ label: 'นับเป็น', before: unitBefore ?? 'ไม่นับสต็อก', after: unitNow ?? 'ไม่นับสต็อก' });
    if (fields.includes('count')) rows.push({ label: 'จำนวนที่มีรวม', before: qtyOf(original), after: qtyOf(draft) });
    return {
      ...blank,
      fields,
      confirm: needsConfirm(original, draft),
      blocker: invalid ? REQUIRED_TEXT : fields.length === 0 ? NOTHING_CHANGED_TEXT : null,
      nameError,
      strengthBad,
      countProblem,
      totalText: unitNow !== null && q.kind === 'ok' ? `ตอนนี้มีรวม ${norm(draft.house.qty)} ${unitNow}` : null,
      duplicateNote,
      rows,
    };
  }

  // ----- personal
  const f = findPersonal(root, target.assignmentId);
  if (!f) return blank;
  const plan = personalPlan(draft, today);
  const planBefore = planStock(original.kind, original.stock, today);
  const missing = plan.missing.map((m) => m.key as string);
  const doseNote = doseProblem(draft.kind, f.assignment.schedule) ? DOSE_KIND_TEXT : null;
  const invalid = nameError !== null || strengthBad || plan.missing.length > 0 || plan.countProblem !== null || doseNote !== null;
  const totalNew = plan.missing.length > 0 ? null : totalOf(draft.kind, plan);
  const totalOld = totalOf(original.kind, planBefore);

  // days: the current schedule, never a made-up dose; only a medicine in use, counted in pieces or ml
  const rewritten = stockRewritten(fields, original, draft);
  const stockNew: Stock | null = rewritten ? plan.stock : f.assignment.stock;
  const packNew: Pack = packRewritten(fields, original, draft) ? plan.pack : f.medication.pack;
  const usesDays = f.assignment.status === 'active' && stockNew !== null && stockNew.kind !== 'tubes' && plan.missing.length === 0 && plan.countProblem === null;
  const daysNew = usesDays ? leftTextFor(draft.kind, packNew, f.assignment.schedule, stockNew, today) : null;
  const dl = f.assignment.status === 'active' && f.assignment.stock && f.assignment.stock.kind !== 'tubes' ? daysLeft(f.assignment, f.medication, today, root.events) : null;
  const daysOld = dl ? formatDaysLeft(dl, unitFor(f.assignment.schedule)) : null;

  const rows: ConfirmRow[] = [];
  if (fields.includes('buy')) rows.push({ label: 'ซื้อมาเป็น', before: editBuyLabel(original.kind, original.stock.buy), after: editBuyLabel(draft.kind, draft.stock.buy) });
  if (fields.includes('pack') || fields.includes('buy')) {
    const before = packText(original.kind, f.medication.pack);
    const after = plan.missing.length > 0 ? 'ยังไม่ครบ' : packText(draft.kind, plan.pack);
    if (before !== after) rows.push({ label: 'ขนาดบรรจุ', before, after });
  }
  const beforeTotal = totalOld?.plain ?? 'ไม่นับสต็อก';
  const afterTotal = totalNew?.plain ?? 'ไม่นับสต็อก';
  if (stockRewritten(fields, original, draft) && beforeTotal !== afterTotal) rows.push({ label: 'จำนวนที่มีรวม', before: beforeTotal, after: afterTotal });
  if (rows.length > 0 && daysOld !== null && daysNew !== null && daysOld !== daysNew) rows.push({ label: 'พอใช้ประมาณ', before: daysOld, after: daysNew });
  const confirm = needsConfirm(original, draft);
  if (confirm && rows.length === 0) rows.push({ label: 'จำนวนที่มี', before: 'ค่าเดิม', after: 'ค่าที่แก้แล้ว' });

  return {
    fields,
    confirm,
    blocker: invalid ? REQUIRED_TEXT : fields.length === 0 ? NOTHING_CHANGED_TEXT : null,
    nameError,
    strengthBad,
    missing,
    packWarning: plan.missing[0] ? `ต้องกรอก “${plan.missing[0].label}” ก่อนถึงจะบันทึกได้ แอพไม่เดาตัวเลขให้` : null,
    doseNote,
    countProblem: plan.countProblem,
    packLine: plan.packLine,
    totalText: totalNew && !isTubeKind(draft.kind) ? `ตอนนี้มีรวม ${totalNew.text}` : null,
    daysText: daysNew !== null && !isTubeKind(draft.kind) ? leftLine(daysNew) : null,
    duplicateNote,
    sharedPackNote,
    sharedStockNote,
    rows,
  };
}



// ---------- saving ----------

export type EditResult = { ok: true; root: Root } | { ok: false; error: string };
const fail = (error: string): EditResult => ({ ok: false, error });

/** The other people's `count` stock when the strip size changes: the same TOTAL pieces, written with the new size (whole
 * strips + loose). The counting day stays, so the days taken since then are still deducted. */
function reExpress(stock: Stock | null, oldPack: Pack, newPack: Pack): Stock | null {
  if (!stock || stock.kind !== 'count') return stock;
  const total = stock.strips * (unitsPerStrip(oldPack) ?? 0) + stock.loose;
  const per = unitsPerStrip(newPack);
  if (per === null) return { ...stock, strips: 0, loose: total };
  const strips = Math.floor(total / per);
  return { ...stock, strips, loose: round2(total - strips * per) };
}

/** Writes the edit into a copy of the root and checks it with the schema. NO MedEvent is made. The old root is not changed. */
export function applyEdit(root: Root, target: EditTarget, draft: EditDraft, today: IsoDate): EditResult {
  const ctx = editContext(root, target, today);
  if (!ctx) return fail('ไม่พบยานี้');
  const { original } = ctx;
  const cross = isCrossGroup(original.kind, draft.kind);
  if (cross && !ctx.crossGroupAllowed) return fail(SHARED_KIND_TEXT);
  const nameError = nameErrorOf(draft.name);
  if (nameError) return fail(nameError);
  const strength = strengthOf(draft.strength);
  if (!strength.ok) return fail('ความแรงต้องเป็นตัวเลขมากกว่า 0');
  if (draft.expiry !== '' && !validDate(draft.expiry)) return fail('วันหมดอายุไม่ถูกต้อง');
  const fields = changedFields(original, draft);
  if (fields.length === 0) return fail(NOTHING_CHANGED_TEXT);
  const name = draft.name.trim();

  if (target.type === 'house') {
    const h = findHouse(root, target.houseItemId);
    if (!h) return fail('ไม่พบยานี้');
    let stock: HouseItem['stock'];
    if (draft.house.unit !== null && draft.house.qty.trim() !== '') {
      const q = parseNum(draft.house.qty);
      if (q.kind !== 'ok') return fail('ใส่ได้เฉพาะตัวเลข');
      stock = { qty: q.value, unit: draft.house.unit };
    }
    const keepLow = stock !== undefined && h.stock?.unit === stock.unit && !cross && h.lowAt !== undefined;
    const { stock: _s, lowAt: _l, expiry: _e, strength: _st, kind: _k, name: _n, ...rest } = h;
    const item: HouseItem = {
      ...rest,
      name,
      kind: draft.kind,
      ...(strength.strength ? { strength: strength.strength } : {}),
      ...(stock ? { stock } : {}),
      ...(keepLow && h.lowAt !== undefined ? { lowAt: h.lowAt } : {}),
      ...(draft.expiry !== '' ? { expiry: draft.expiry } : {}),
    };
    const next: Root = { ...root, houseItems: root.houseItems.map((x) => (x.id === h.id ? item : x)) };
    return rootSchema.safeParse(next).success ? { ok: true, root: next } : fail(SAVE_FAILED_TEXT);
  }

  const f = findPersonal(root, target.assignmentId);
  if (!f) return fail('ไม่พบยานี้');
  if (doseProblem(draft.kind, f.assignment.schedule)) return fail(DOSE_KIND_TEXT);
  const plan = personalPlan(draft, today);
  if (plan.missing.length > 0) return fail(plan.blocker ?? REQUIRED_TEXT);
  if (plan.countProblem) return fail(plan.countProblem);
  const rewriteStock = stockRewritten(fields, original, draft);
  const pack = packRewritten(fields, original, draft) ? plan.pack : f.medication.pack;
  const { strength: _old, ...medRest } = f.medication;
  const medication: Medication = { ...medRest, name, kind: draft.kind, pack, ...(strength.strength ? { strength: strength.strength } : {}) };
  const packChanged = !jsonEq(pack, f.medication.pack);
  const { expiry: _oldExpiry, ...aRest } = f.assignment;
  const assignment: Assignment = {
    ...aRest,
    stock: rewriteStock ? plan.stock : f.assignment.stock,
    ...(draft.expiry !== '' ? { expiry: draft.expiry } : {}),
  };
  const next: Root = {
    ...root,
    medications: root.medications.map((m) => (m.id === medication.id ? medication : m)),
    assignments: root.assignments.map((a) => {
      if (a.id === assignment.id) return assignment;
      if (a.medicationId === medication.id && packChanged) return { ...a, stock: reExpress(a.stock, f.medication.pack, pack) };
      return a;
    }),
  };
  return rootSchema.safeParse(next).success ? { ok: true, root: next } : fail(SAVE_FAILED_TEXT);
}
