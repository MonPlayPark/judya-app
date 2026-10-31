import { describe, expect, it } from 'vitest';
import {
  addHouseItem,
  addPersonalMedication,
  alsoLabel,
  amountText,
  buildSchedule,
  countFields,
  emptyPersonalDraft,
  emptyScheduleDraft,
  emptyStockDraft,
  findHouseItem,
  findMedication,
  hasBigDose,
  houseUnit,
  leftTextFor,
  membersUsing,
  packLine,
  planStock,
  scheduleBlocker,
  scheduleSummary,
  stepAmount,
  suggestNames,
  userCards,
  type BuyAs,
  type HouseDraft,
  type PersonalDraft,
} from './addMedicine';
import { blankRootV3 } from './fixtures';
import { rootSchema, type MedKind, type Person, type Root } from './schema';

const TODAY = '2026-10-28';
const NOW = '2026-10-28T09:00:00+07:00';
const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({ id, name, relation: 'พ่อ', avatar: 'avatar-01', color: 'blue', selfManaged: false, allergies: { status: 'unknown' }, ...extra });
const base = (): Root => ({ ...blankRootV3(), persons: [person('p1', 'สมาชิก ก', { relation: 'ตัวฉัน' }), person('p2', 'สมาชิก ข'), person('p3', 'สมาชิก ค', { removedAt: NOW })] });
let counter = 0;
const ids = (): (() => string) => () => `id${++counter}`; // ids never repeat inside one test file

function draft(kind: MedKind, buy: BuyAs, size: Partial<Record<string, string>>, counts: Partial<Record<string, string>>, extra: Partial<PersonalDraft> = {}): PersonalDraft {
  const d = emptyPersonalDraft();
  const stock = emptyStockDraft(kind);
  return {
    ...d,
    name: 'ยาทดสอบ',
    kind,
    personId: 'p1',
    schedule: emptyScheduleDraft(kind),
    stock: { buy, size: { ...stock.size, ...size }, counts: { ...stock.counts, ...counts } },
    ...extra,
  };
}

function add(d: PersonalDraft, root: Root = base()) {
  return addPersonalMedication(root, d, TODAY, NOW, ids());
}
function stockOf(d: PersonalDraft) {
  const r = add(d);
  if (!r.ok) throw new Error(r.error);
  expect(rootSchema.safeParse(r.root).success).toBe(true);
  return { med: r.root.medications.at(-1), a: r.root.assignments.at(-1), root: r.root };
}

describe('addPersonalMedication: table C', () => {
  it('tablet strip', () => {
    const { med, a } = stockOf(draft('tablet', 'strip', { perStrip: '10' }, { strips: '2', loose: '3.5' }));
    expect(med?.pack).toEqual({ type: 'strip', perStrip: 10 });
    expect(a?.stock).toEqual({ kind: 'count', strips: 2, loose: 3.5, countedOn: TODAY });
  });
  it('capsule box = boxes x strips per box + strips', () => {
    const { med, a } = stockOf(draft('capsule', 'box', { stripsPerBox: '3', perStrip: '10' }, { boxes: '2', strips: '1', loose: '4' }));
    expect(med?.pack).toEqual({ type: 'box', strips: 3, perStrip: 10 });
    expect(a?.stock).toEqual({ kind: 'count', strips: 7, loose: 4, countedOn: TODAY });
  });
  it('tablet bottle: full bottles + loose pills', () => {
    const { med, a } = stockOf(draft('tablet', 'bottle', { perBottle: '100' }, { strips: '2', loose: '40' }));
    expect(med?.pack).toEqual({ type: 'bottle', perBottle: 100 });
    expect(a?.stock).toEqual({ kind: 'count', strips: 2, loose: 40, countedOn: TODAY });
  });
  it('sachet box and single sachets', () => {
    const box = stockOf(draft('sachet', 'sachetBox', { sachetsPerBox: '10' }, { boxes: '2', loose: '3' }));
    expect(box.med?.pack).toEqual({ type: 'sachetBox', sachets: 10 });
    expect(box.a?.stock).toEqual({ kind: 'count', strips: 2, loose: 3, countedOn: TODAY });
    const single = stockOf(draft('sachet', 'loose', {}, { loose: '12' }));
    expect(single.med?.pack).toEqual({ type: 'none' });
    expect(single.a?.stock).toEqual({ kind: 'count', strips: 0, loose: 12, countedOn: TODAY });
  });
  it('liquid: closed bottles x ml + ml left', () => {
    const { med, a } = stockOf(draft('liquid', 'container', { amount: '60' }, { strips: '2', loose: '25' }));
    expect(med?.pack).toEqual({ type: 'container', amount: 60, unit: 'ml' });
    expect(a?.stock).toEqual({ kind: 'volume', ml: 145, countedOn: TODAY });
  });
  it('cream: N tubes -> opened / spare (0, 1, 2)', () => {
    const t = (n: string) => stockOf(draft('cream', 'tube', {}, { total: n })).a?.stock;
    expect(t('0')).toEqual({ kind: 'tubes', opened: false, spare: 0 });
    expect(t('1')).toEqual({ kind: 'tubes', opened: true, spare: 0 });
    expect(t('2')).toEqual({ kind: 'tubes', opened: true, spare: 1 });
  });
  it('cream / drops: pack from the amount, or none', () => {
    expect(stockOf(draft('cream', 'tube', { amount: '15' }, {})).med?.pack).toEqual({ type: 'container', amount: 15, unit: 'g' });
    expect(stockOf(draft('drops', 'bottle', { amount: '5' }, {})).med?.pack).toEqual({ type: 'container', amount: 5, unit: 'ml' });
    expect(stockOf(draft('drops', 'bottle', {}, {})).med?.pack).toEqual({ type: 'none' });
  });
  it('other counts pieces', () => {
    const { med, a } = stockOf(draft('other', 'loose', {}, { loose: '5' }));
    expect(med?.pack).toEqual({ type: 'none' });
    expect(a?.stock).toEqual({ kind: 'count', strips: 0, loose: 5, countedOn: TODAY });
  });
  it('"ไม่นับสต็อก" = pack none, stock null', () => {
    const { med, a } = stockOf(draft('tablet', 'none', {}, {}));
    expect(med?.pack).toEqual({ type: 'none' });
    expect(a?.stock).toBeNull();
  });
  it('every count box empty = not counted; a typed 0 = counted as 0', () => {
    expect(stockOf(draft('tablet', 'strip', { perStrip: '10' }, {})).a?.stock).toBeNull();
    expect(stockOf(draft('tablet', 'strip', { perStrip: '10' }, { strips: '0' })).a?.stock).toEqual({ kind: 'count', strips: 0, loose: 0, countedOn: TODAY });
    expect(stockOf(draft('liquid', 'container', { amount: '60' }, { loose: '0' })).a?.stock).toEqual({ kind: 'volume', ml: 0, countedOn: TODAY });
    expect(stockOf(draft('cream', 'tube', {}, { total: '0' })).a?.stock).toEqual({ kind: 'tubes', opened: false, spare: 0 });
  });
  it('loose pills must be a multiple of 0.5', () => {
    const r = add(draft('tablet', 'strip', { perStrip: '10' }, { loose: '0.25' }));
    expect(r.ok).toBe(false);
    expect(add(draft('tablet', 'strip', { perStrip: '10' }, { strips: '1.5' })).ok).toBe(false);
    expect(add(draft('tablet', 'strip', { perStrip: '10' }, { loose: 'abc' })).ok).toBe(false);
  });
  it('a pack size that is needed must be a whole number above 0', () => {
    for (const v of ['', '0', '2.5', 'x']) expect(add(draft('tablet', 'strip', { perStrip: v }, {})).ok).toBe(false);
    const r = add(draft('tablet', 'box', { stripsPerBox: '3' }, {}));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain('จำนวนเม็ดต่อแผง');
    expect(add(draft('liquid', 'container', { amount: '' }, {})).ok).toBe(false);
    expect(add(draft('liquid', 'container', { amount: '2.5' }, {})).ok).toBe(true); // ml per bottle may be a decimal
  });
});

describe('addPersonalMedication: rules', () => {
  it('makes one start event and passes the schema', () => {
    const r = add(draft('tablet', 'none', {}, {}, { expiry: '2027-01-31' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.root.events).toHaveLength(1);
    const e = r.root.events[0];
    expect(e).toMatchObject({ type: 'start', effectiveOn: TODAY, at: NOW, assignmentId: r.assignmentId });
    expect(e?.type === 'start' && e.to.schedule).toEqual(r.root.assignments[0]?.schedule);
    expect(r.root.assignments[0]).toMatchObject({ status: 'active', createdAt: NOW, expiry: '2027-01-31' });
    expect(rootSchema.safeParse(r.root).success).toBe(true);
  });
  it('refuses a short name, a missing or removed member', () => {
    expect(add(draft('tablet', 'none', {}, {}, { name: 'ก' })).ok).toBe(false);
    expect(add(draft('tablet', 'none', {}, {}, { name: '  ก ' })).ok).toBe(false);
    expect(add(draft('tablet', 'none', {}, {}, { personId: null })).ok).toBe(false);
    expect(add(draft('tablet', 'none', {}, {}, { personId: 'p3' })).ok).toBe(false);
    expect(add(draft('tablet', 'none', {}, {}, { name: 'ก'.repeat(61) })).ok).toBe(false);
  });
  it('keeps the strength', () => {
    const r = add(draft('tablet', 'none', {}, {}, { strength: { value: '500', unit: 'mg' } }));
    expect(r.ok && r.root.medications[0]?.strength).toEqual({ value: 500, unit: 'mg' });
    expect(add(draft('tablet', 'none', {}, {}, { strength: { value: '0', unit: 'mg' } })).ok).toBe(false);
  });
  it('reuse keeps the pack and gives each person their own stock', () => {
    const first = stockOf(draft('tablet', 'box', { stripsPerBox: '3', perStrip: '10' }, { boxes: '1' }));
    const reuse = draft('tablet', 'strip', { perStrip: '99' }, { strips: '2', loose: '1' }, { personId: 'p2', reuseMedicationId: first.med?.id ?? '' });
    const r = addPersonalMedication(first.root, reuse, TODAY, NOW, ids());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.root.medications).toHaveLength(1);
    expect(r.root.medications[0]?.pack).toEqual({ type: 'box', strips: 3, perStrip: 10 });
    expect(r.root.assignments.at(-1)?.stock).toEqual({ kind: 'count', strips: 2, loose: 1, countedOn: TODAY });
    expect(r.root.assignments[0]?.stock).toMatchObject({ strips: 3 });
    expect(r.root.events).toHaveLength(2);
    expect(rootSchema.safeParse(r.root).success).toBe(true);
  });
  it('reuse is refused for a member who already has it (stopped counts too)', () => {
    const first = stockOf(draft('tablet', 'none', {}, {}));
    const medId = first.med?.id ?? '';
    const again = addPersonalMedication(first.root, draft('tablet', 'none', {}, {}, { reuseMedicationId: medId }), TODAY, NOW, ids());
    expect(again.ok).toBe(false);
    const stopped: Root = { ...first.root, assignments: first.root.assignments.map((a) => ({ ...a, status: 'stopped' as const })) };
    expect(addPersonalMedication(stopped, draft('tablet', 'none', {}, {}, { reuseMedicationId: medId }), TODAY, NOW, ids()).ok).toBe(false);
  });
  it('the same name can be added as a new medicine', () => {
    const first = stockOf(draft('tablet', 'none', {}, {}));
    const r = addPersonalMedication(first.root, draft('tablet', 'none', {}, {}, { personId: 'p2' }), TODAY, NOW, ids());
    expect(r.ok && r.root.medications).toHaveLength(2);
  });
  it('rejects a liquid dose that is not a multiple of 2.5 (schema)', () => {
    const d = draft('liquid', 'none', {}, {});
    d.schedule.slots.morning.amount = 3;
    expect(add(d).ok).toBe(false);
  });
});

describe('schedules', () => {
  it('meal: periods, meal and amount per period; bedtime has no meal', () => {
    const d = emptyScheduleDraft('tablet');
    d.periods = ['morning', 'bedtime'];
    d.slots.morning = { meal: 'before', amount: 1.5 };
    d.slots.bedtime = { meal: 'before', amount: 2 };
    const r = buildSchedule('tablet', d, TODAY);
    expect(r.ok && r.schedule).toEqual({ kind: 'meal', slots: { morning: { pills: 1.5, meal: 'before' }, bedtime: { pills: 2 } }, days: { kind: 'daily' } });
  });
  it('frequency: alt anchors on today, weekdays are sorted and need one', () => {
    const d = emptyScheduleDraft('tablet');
    d.freq = 'alt';
    expect(buildSchedule('tablet', d, TODAY)).toMatchObject({ ok: true, schedule: { days: { kind: 'alt', anchor: TODAY } } });
    d.freq = 'weekdays';
    expect(scheduleBlocker(d)).toBe('เลือกอย่างน้อย 1 วัน');
    expect(buildSchedule('tablet', d, TODAY).ok).toBe(false);
    d.weekdays = [0, 3, 1];
    expect(buildSchedule('tablet', d, TODAY)).toMatchObject({ ok: true, schedule: { days: { kind: 'weekdays', days: [0, 1, 3] } } }); // 0 = Sunday
  });
  it('interval: all five hours, ongoing or a course of days', () => {
    for (const h of [4, 6, 8, 12, 24] as const) {
      const d = emptyScheduleDraft('tablet');
      d.mode = 'interval';
      d.everyHours = h;
      expect(buildSchedule('tablet', d, TODAY)).toMatchObject({ ok: true, schedule: { kind: 'interval', everyHours: h, firstTime: '08:00', pills: 1, course: { kind: 'ongoing' } } });
    }
    const d = emptyScheduleDraft('tablet');
    d.mode = 'interval';
    d.course = 'days';
    expect(buildSchedule('tablet', d, TODAY).ok).toBe(false);
    d.courseDays = '91';
    expect(buildSchedule('tablet', d, TODAY).ok).toBe(false);
    d.courseDays = '7';
    expect(buildSchedule('tablet', d, TODAY)).toMatchObject({ ok: true, schedule: { course: { kind: 'days', days: 7, startDate: TODAY } } });
  });
  it('cream / drops keep dose 1 and "after"', () => {
    const d = emptyScheduleDraft('cream');
    d.slots.morning.amount = 3;
    expect(buildSchedule('cream', d, TODAY)).toMatchObject({ ok: true, schedule: { slots: { morning: { pills: 1, meal: 'after' } } } });
  });
  it('steps follow the kind', () => {
    expect(stepAmount('tablet', 4, 1)).toBe(4);
    expect(stepAmount('tablet', 0.5, -1)).toBe(0.5);
    expect(stepAmount('tablet', 1, 1)).toBe(1.5);
    expect(stepAmount('sachet', 1, 1)).toBe(2);
    expect(stepAmount('liquid', 5, 1)).toBe(7.5);
    expect(stepAmount('liquid', 2.5, -1)).toBe(2.5);
    expect(stepAmount('liquid', 100, 1)).toBe(100);
    expect(amountText('tablet', 0.5)).toBe('½ เม็ด');
  });
  it('a liquid dose over 30 ml is a big dose', () => {
    const d = emptyScheduleDraft('liquid');
    expect(hasBigDose('liquid', d)).toBe(false);
    d.slots.morning.amount = 32.5;
    expect(hasBigDose('liquid', d)).toBe(true);
    expect(hasBigDose('tablet', d)).toBe(false);
  });
  it('summary has periods and no clock times', () => {
    const d = emptyScheduleDraft('tablet');
    d.periods = ['morning', 'evening'];
    expect(scheduleSummary('tablet', d)).toBe('เช้า/เย็น · หลังอาหาร · ครั้งละ 1 เม็ด · ทุกวัน');
    d.slots.evening.amount = 2;
    expect(scheduleSummary('tablet', d)).toContain('ขนาดต่างกันตามช่วง');
  });
});

describe('addHouseItem', () => {
  const house = (kind: MedKind, buy: BuyAs, size: Partial<Record<string, string>>, counts: Partial<Record<string, string>>, extra: Partial<HouseDraft> = {}): HouseDraft => {
    const s = emptyStockDraft(kind);
    return { name: 'ยาสามัญทดสอบ', kind, strength: { value: '', unit: 'mg' }, stock: { buy, size: { ...s.size, ...size }, counts: { ...s.counts, ...counts } }, expiry: '', ...extra };
  };
  it('totals in the smallest unit, with the unit by kind and no lowAt', () => {
    const r = addHouseItem(base(), house('tablet', 'box', { stripsPerBox: '3', perStrip: '10' }, { boxes: '1', strips: '2', loose: '3' }), TODAY, ids());
    expect(r.ok && r.item).toMatchObject({ kind: 'tablet', stock: { qty: 53, unit: 'เม็ด' } });
    expect(r.ok && 'lowAt' in r.item).toBe(false);
    expect(r.ok && rootSchema.safeParse(r.root).success).toBe(true);
    const units: [MedKind, BuyAs, string, Partial<Record<string, string>>, Partial<Record<string, string>>][] = [
      ['capsule', 'strip', 'แคปซูล', { perStrip: '10' }, { strips: '1' }],
      ['sachet', 'loose', 'ซอง', {}, { loose: '4' }],
      ['liquid', 'container', 'มล.', { amount: '60' }, { strips: '1', loose: '10' }],
      ['cream', 'tube', 'หลอด', {}, { total: '2' }],
      ['drops', 'bottle', 'ขวด', {}, { total: '1' }],
      ['other', 'loose', 'ชิ้น', {}, { loose: '3' }],
    ];
    for (const [kind, buy, unit, size, counts] of units) {
      const x = addHouseItem(base(), house(kind, buy, size, counts), TODAY, ids());
      expect(x.ok && x.item.stock?.unit).toBe(unit);
    }
  });
  it('strength, expiry and no stock', () => {
    const r = addHouseItem(base(), house('tablet', 'none', {}, {}, { strength: { value: '500', unit: 'mg' }, expiry: '2027-05-01' }), TODAY, ids());
    expect(r.ok && r.item).toMatchObject({ strength: { value: 500, unit: 'mg' }, expiry: '2027-05-01' });
    expect(r.ok && r.item.stock).toBeUndefined();
  });
  it('typed 0 = counted as 0; empty = not counted', () => {
    expect(addHouseItem(base(), house('tablet', 'strip', { perStrip: '10' }, { strips: '0' }), TODAY, ids())).toMatchObject({ ok: true, item: { stock: { qty: 0 } } });
    const r = addHouseItem(base(), house('tablet', 'strip', { perStrip: '10' }, {}), TODAY, ids());
    expect(r.ok && r.item.stock).toBeUndefined();
  });
  it('refuses a short name or a missing pack size', () => {
    expect(addHouseItem(base(), house('tablet', 'none', {}, {}, { name: 'x' }), TODAY).ok).toBe(false);
    expect(addHouseItem(base(), house('tablet', 'strip', {}, {}), TODAY).ok).toBe(false);
  });
  it('houseUnit', () => {
    expect(houseUnit('cream', 'bottle')).toBe('ขวด');
    expect(houseUnit('cream', 'tube')).toBe('หลอด');
  });
});

describe('finders', () => {
  const root = (): Root => {
    const r = stockOf(draft('tablet', 'none', {}, {}, { name: 'Alpha Test' }));
    const r2 = addPersonalMedication(r.root, draft('liquid', 'none', {}, {}, { name: 'Alphabet Syrup', personId: 'p2' }), TODAY, NOW, ids());
    if (!r2.ok) throw new Error(r2.error);
    return { ...r2.root, houseItems: [{ id: 'h1', name: 'Gamma House' }, { id: 'h2', name: 'Gamma Old', removedAt: NOW }, { id: 'h3', name: 'Alpha Test' }] };
  };
  it('suggestNames: 2 chars, max 5, no repeats, tag only for personal', () => {
    const r = root();
    expect(suggestNames(r, 'personal', 'a')).toEqual([]);
    expect(suggestNames(r, 'personal', 'al').map((s) => s.name)).toEqual(['Alpha Test', 'Alphabet Syrup']);
    expect(suggestNames(r, 'personal', 'al').every((s) => s.tag === 'มีในบ้านแล้ว')).toBe(true);
    expect(suggestNames(r, 'house', 'ga')).toEqual([{ name: 'Gamma House', tag: null }]);
    expect(suggestNames(r, 'house', ' ALPHA t').map((s) => s.name)).toEqual(['Alpha Test']);
    const many: Root = { ...r, medications: Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: `Name${i}`, kind: 'tablet' as const, pack: { type: 'none' as const } })) };
    expect(suggestNames(many, 'personal', 'name')).toHaveLength(5);
    const dup: Root = { ...many, medications: [...many.medications, { id: 'mm', name: 'name 1', kind: 'tablet', pack: { type: 'none' } }] };
    expect(suggestNames(dup, 'personal', 'name1')).toHaveLength(1);
  });
  it('findMedication / findHouseItem ignore spaces and case; deleted house items do not count', () => {
    const r = root();
    expect(findMedication(r, ' alpha  TEST')?.name).toBe('Alpha Test');
    expect(findMedication(r, 'Alpha')).toBeUndefined();
    expect(findHouseItem(r, 'gamma house')?.id).toBe('h1');
    expect(findHouseItem(r, 'Gamma Old')).toBeUndefined();
  });
  it('membersUsing counts stopped, not removed members', () => {
    const r = root();
    const medId = findMedication(r, 'Alpha Test')?.id ?? '';
    expect(membersUsing(r, medId).map((p) => p.id)).toEqual(['p1']);
    const stopped: Root = { ...r, assignments: r.assignments.map((a) => ({ ...a, status: 'stopped' as const })) };
    expect(membersUsing(stopped, medId).map((p) => p.id)).toEqual(['p1']);
    const removed: Root = { ...r, persons: r.persons.map((p) => (p.id === 'p1' ? { ...p, removedAt: NOW } : p)) };
    expect(membersUsing(removed, medId)).toEqual([]);
  });
  it('userCards and alsoLabel', () => {
    const r = root();
    const medId = findMedication(r, 'Alpha Test')?.id ?? '';
    const cards = userCards(r, medId, TODAY);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ name: 'สมาชิก ก', stockText: 'ยังไม่ได้นับ' });
    expect(alsoLabel(person('x', 'สมาชิก ข', { relation: 'ตัวฉัน' }))).toBe('เพิ่มให้ฉันด้วย');
    expect(alsoLabel(person('x', 'สมาชิก ข'))).toBe('เพิ่มให้สมาชิก ขด้วย');
  });
});

describe('plan texts', () => {
  it('pack line and total', () => {
    const d = emptyStockDraft('tablet');
    d.buy = 'box';
    d.size.stripsPerBox = '3';
    d.size.perStrip = '10';
    d.counts.boxes = '1';
    d.counts.strips = '2';
    const p = planStock('tablet', d, TODAY);
    expect(p.packLine).toBe('1 กล่อง = 3 แผง = 30 เม็ด');
    expect(p.total).toBe(50);
    expect(packLine('tablet', { type: 'bottle', perBottle: 100 })).toBe('1 ขวด = 100 เม็ด');
    expect(countFields('tablet', 'bottle').map((f) => f.unit)).toEqual(['ขวดเต็ม', 'เม็ด']);
  });
  it('missing field message names the box', () => {
    const d = emptyStockDraft('tablet');
    d.buy = 'strip';
    const p = planStock('tablet', d, TODAY);
    expect(p.missing).toEqual([{ key: 'perStrip', label: 'จำนวนเม็ดต่อแผง' }]);
    expect(p.blocker).toBe('ต้องกรอก “จำนวนเม็ดต่อแผง” ก่อนถึงจะบันทึกได้ แอพไม่เดาตัวเลขให้');
  });
  it('days left uses the shared rules', () => {
    const d = emptyScheduleDraft('tablet');
    const s = buildSchedule('tablet', d, TODAY);
    if (!s.ok) throw new Error('x');
    expect(leftTextFor('tablet', { type: 'none' }, s.schedule, { kind: 'count', strips: 0, loose: 10, countedOn: TODAY }, TODAY)).toBe('10 วัน');
    expect(leftTextFor('tablet', { type: 'none' }, s.schedule, null, TODAY)).toBeNull();
    expect(leftTextFor('cream', { type: 'none' }, s.schedule, { kind: 'tubes', opened: true, spare: 1 }, TODAY)).toBeNull();
  });
});
