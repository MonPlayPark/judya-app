import { readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blankRootV3, sampleRootV3 } from './fixtures';
import {
  AVATAR_NAMES_V3, DEFAULT_SETTINGS_V3, MED_KINDS, allergiesSchema, assignmentSchema, coverageSchema, medEventSchema,
  medicationSchema, orderSchema, packSchema, personSchema, priceSchema, rootSchema, settingsSchema, stockSchema,
} from './schema';

const person = () => structuredClone(sampleRootV3().persons[0]!);
const med = () => structuredClone(sampleRootV3().medications[0]!);
const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => expect(s.safeParse(v).success).toBe(true);
const bad = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => expect(s.safeParse(v).success).toBe(false);

describe('v3 fixtures', () => {
  it('blank and sample roots both pass the schema', () => {
    ok(rootSchema, blankRootV3());
    ok(rootSchema, sampleRootV3());
  });

  it('sample covers all 7 kinds, every pack, every stock, all allergy and coverage kinds, all order states and sources', () => {
    const r = sampleRootV3();
    expect(new Set(r.medications.map((m) => m.kind))).toEqual(new Set(MED_KINDS));
    expect(new Set(r.medications.map((m) => m.pack.type))).toEqual(new Set(['none', 'strip', 'box', 'container', 'sachetBox']));
    expect(new Set(r.assignments.flatMap((a) => (a.stock ? [a.stock.kind] : [])))).toEqual(new Set(['count', 'volume', 'tubes']));
    expect(new Set(r.persons.map((p) => p.allergies.status))).toEqual(new Set(['unknown', 'none_confirmed', 'listed']));
    expect(new Set(r.persons.flatMap((p) => (p.coverage ? [p.coverage.type] : [])))).toEqual(
      new Set(['government', 'social', 'civil_servant', 'private', 'self_pay', 'other']),
    );
    expect(new Set(r.orders.map((o) => o.status))).toEqual(new Set(['waiting', 'partial', 'received', 'cancelled']));
    expect(new Set(r.orders.flatMap((o) => o.lines.map((l) => l.source.kind)))).toEqual(new Set(['assignment', 'house', 'free']));
    expect(new Set(r.events.map((e) => e.type))).toEqual(new Set(['start', 'adjust', 'stop', 'resume']));
  });
});

describe('v3 root', () => {
  it('version must be 3', () => {
    bad(rootSchema, { ...blankRootV3(), version: 2 });
  });

  it('a second "ตัวฉัน" is rejected', () => {
    const r = sampleRootV3();
    r.persons.push({ ...person(), id: 'p-dup' });
    bad(rootSchema, r);
  });

  it('a removed "ตัวฉัน" does not block a new one', () => {
    const r = sampleRootV3();
    r.persons[0]!.removedAt = NOW_ISO;
    r.persons.push({ ...person(), id: 'p-new' });
    ok(rootSchema, r);
  });
});
const NOW_ISO = '2026-10-28T10:00:00+07:00';

describe('v3 person', () => {
  afterEach(() => vi.useRealTimers());

  it('birth year outside 2400..current year + 543 is rejected', () => {
    for (const y of [2399, 1999, 9999]) bad(personSchema, { ...person(), birthYearBE: y });
    ok(personSchema, { ...person(), birthYearBE: 2400 });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
    ok(personSchema, { ...person(), birthYearBE: 2569 });
    bad(personSchema, { ...person(), birthYearBE: 2570 });
  });

  it('a full birth date is rejected', () => {
    bad(personSchema, { ...person(), birthYearBE: 2530.5 });
    bad(personSchema, { ...person(), birthYearBE: '2530-01-02' });
  });

  it('relation accepts the 7 values and nothing else', () => {
    for (const relation of ['ตัวฉัน', 'พ่อ', 'แม่', 'คู่สมรส', 'ลูก', 'ญาติ', 'อื่นๆ']) ok(personSchema, { ...person(), relation });
    bad(personSchema, { ...person(), relation: 'อื่น ๆ' });
  });

  it('avatar must be one of the 12 pictures, and the names match the files on disk', () => {
    ok(personSchema, { ...person(), avatar: 'avatar-12' });
    bad(personSchema, { ...person(), avatar: 'avatar-13' });
    bad(personSchema, { ...person(), avatar: undefined });
    const files = readdirSync('src/assets/visual/avatars')
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.replace('.svg', ''))
      .sort();
    expect(files).toEqual([...AVATAR_NAMES_V3]);
  });

  it('allergies: unknown, none_confirmed and listed are accepted', () => {
    ok(allergiesSchema, { status: 'unknown' });
    ok(allergiesSchema, { status: 'none_confirmed', confirmedAt: '2026-10-28' });
    ok(allergiesSchema, { status: 'listed', items: [{ drug: 'ยาตัวอย่าง Z', reaction: 'ผื่น' }] });
  });

  it('allergies: an empty listed array, a missing date and stray fields are rejected', () => {
    bad(allergiesSchema, { status: 'listed', items: [] });
    bad(allergiesSchema, { status: 'none_confirmed' });
    bad(allergiesSchema, { status: 'unknown', items: [] });
    bad(allergiesSchema, { status: 'listed', items: [{ drug: 'x', reaction: '' }] });
    bad(personSchema, { ...person(), allergies: undefined });
  });

  it('coverage: every type is accepted; private may carry a company', () => {
    for (const type of ['government', 'social', 'civil_servant', 'private', 'self_pay', 'other']) ok(coverageSchema, { type });
    ok(coverageSchema, { type: 'private', company: 'บริษัทตัวอย่าง' });
    bad(coverageSchema, { type: 'gold' });
  });

  it('coverage: company with a type other than private is rejected', () => {
    for (const type of ['government', 'social', 'civil_servant', 'self_pay', 'other']) bad(coverageSchema, { type, company: 'บริษัทตัวอย่าง' });
  });

  it('coverage: policy-number and ID-card fields of any name are rejected', () => {
    for (const key of ['policyNo', 'policyNumber', 'policy_number', 'idCard', 'nationalId', 'cardNo', 'memberNo']) {
      bad(coverageSchema, { type: 'private', company: 'บริษัทตัวอย่าง', [key]: '1234567890' });
      bad(personSchema, { ...person(), coverage: { type: 'government', [key]: '1234567890' } });
    }
  });

  it('the two old insurance boxes are gone', () => {
    // plain objects are not strict at Person level, so check the output has no insurance key
    const parsed = personSchema.parse({ ...person(), insurance: { health: 'x' } });
    expect('insurance' in parsed).toBe(false);
  });
});

describe('v3 medication', () => {
  it('all 7 kinds are accepted and others rejected', () => {
    for (const kind of MED_KINDS) ok(medicationSchema, { ...med(), kind, pack: { type: 'none' } });
    bad(medicationSchema, { ...med(), kind: 'syrup', pack: { type: 'none' } });
  });

  it('every pack type is accepted', () => {
    ok(packSchema, { type: 'none' });
    ok(packSchema, { type: 'strip', perStrip: 10 });
    ok(packSchema, { type: 'box', strips: 3, perStrip: 10 });
    ok(packSchema, { type: 'container', amount: 60, unit: 'ml' });
    ok(packSchema, { type: 'container', amount: 7.5, unit: 'g' });
    ok(packSchema, { type: 'sachetBox', sachets: 10 });
  });

  it('pack numbers must be positive, whole where counting things', () => {
    bad(packSchema, { type: 'strip', perStrip: 0 });
    bad(packSchema, { type: 'strip', perStrip: 2.5 });
    bad(packSchema, { type: 'box', strips: 0, perStrip: 10 });
    bad(packSchema, { type: 'container', amount: 0, unit: 'ml' });
    bad(packSchema, { type: 'container', amount: 10, unit: 'oz' });
    bad(packSchema, { type: 'sachetBox', sachets: -1 });
    bad(packSchema, { type: 'strip' });
  });

  it('kind and pack must agree (loosely)', () => {
    ok(medicationSchema, { ...med(), kind: 'tablet', pack: { type: 'box', strips: 2, perStrip: 10 } });
    ok(medicationSchema, { ...med(), kind: 'liquid', pack: { type: 'container', amount: 60, unit: 'ml' } });
    ok(medicationSchema, { ...med(), kind: 'cream', pack: { type: 'container', amount: 15, unit: 'g' } });
    ok(medicationSchema, { ...med(), kind: 'sachet', pack: { type: 'sachetBox', sachets: 10 } });
    bad(medicationSchema, { ...med(), kind: 'tablet', pack: { type: 'container', amount: 60, unit: 'ml' } });
    bad(medicationSchema, { ...med(), kind: 'liquid', pack: { type: 'strip', perStrip: 10 } });
    bad(medicationSchema, { ...med(), kind: 'liquid', pack: { type: 'container', amount: 60, unit: 'g' } });
    bad(medicationSchema, { ...med(), kind: 'cream', pack: { type: 'container', amount: 15, unit: 'ml' } });
    bad(medicationSchema, { ...med(), kind: 'sachet', pack: { type: 'box', strips: 1, perStrip: 10 } });
  });

  it('strength: value above 0 and a listed unit', () => {
    for (const unit of ['mg', 'mcg', 'g', '%', 'IU', 'mg/5 ml']) ok(medicationSchema, { ...med(), strength: { value: 5, unit } });
    bad(medicationSchema, { ...med(), strength: { value: 0, unit: 'mg' } });
    bad(medicationSchema, { ...med(), strength: { value: 5, unit: 'kg' } });
    ok(medicationSchema, { ...med(), strength: undefined });
  });
});

describe('v3 assignment stock', () => {
  it('count, volume and tubes are accepted', () => {
    ok(stockSchema, { kind: 'count', strips: 2, loose: 3, countedOn: '2026-10-28' });
    ok(stockSchema, { kind: 'count', strips: 0, loose: 0.5, countedOn: '2026-10-28' });
    ok(stockSchema, { kind: 'volume', ml: 45.5, countedOn: '2026-10-28' });
    ok(stockSchema, { kind: 'tubes', opened: true, spare: 0 });
  });

  it('bad stock shapes are rejected', () => {
    bad(stockSchema, { kind: 'count', strips: -1, loose: 0, countedOn: '2026-10-28' });
    bad(stockSchema, { kind: 'count', strips: 1.5, loose: 0, countedOn: '2026-10-28' });
    bad(stockSchema, { kind: 'volume', ml: -1, countedOn: '2026-10-28' });
    bad(stockSchema, { kind: 'tubes', opened: 'yes', spare: 1 });
    bad(stockSchema, { kind: 'tubes', opened: true, spare: 1, countedOn: '2026-10-28' });
    bad(stockSchema, { qty: 5, countedOn: '2026-10-28' }); // the v2 shape
  });

  it('sideEffects is optional free text on the assignment', () => {
    const a = structuredClone(sampleRootV3().assignments[0]!);
    ok(assignmentSchema, a);
    ok(assignmentSchema, { ...a, sideEffects: undefined });
    bad(assignmentSchema, { ...a, sideEffects: 123 });
  });
});

describe('v3 events', () => {
  const base = { id: 'e', assignmentId: 'a1', effectiveOn: '2026-10-28', at: '2026-10-28T09:00:00+07:00' };
  const s1 = sampleRootV3().assignments[0]!.schedule;
  const s2 = sampleRootV3().assignments[1]!.schedule;

  it('start, adjust, stop and resume are accepted', () => {
    ok(medEventSchema, { ...base, type: 'start', to: { schedule: s1 } });
    ok(medEventSchema, { ...base, type: 'adjust', reason: 'doctor', from: { schedule: s1 }, to: { schedule: s2 } });
    ok(medEventSchema, { ...base, type: 'adjust', reason: 'self_or_other', note: 'x', from: { schedule: s1 }, to: { schedule: s2 } });
    ok(medEventSchema, { ...base, type: 'stop', reason: 'หมอสั่ง', note: 'x' });
    ok(medEventSchema, { ...base, type: 'resume' });
  });

  it("type 'edit' is rejected", () => {
    bad(medEventSchema, { ...base, type: 'edit', from: { schedule: s1 }, to: { schedule: s2 } });
    bad(medEventSchema, { ...base, type: 'edit' });
  });

  it('adjust needs a v3 reason and two different schedules', () => {
    bad(medEventSchema, { ...base, type: 'adjust', reason: 'หมอสั่ง', from: { schedule: s1 }, to: { schedule: s2 } });
    bad(medEventSchema, { ...base, type: 'adjust', from: { schedule: s1 }, to: { schedule: s2 } });
    bad(medEventSchema, { ...base, type: 'adjust', reason: 'doctor', from: { schedule: s1 }, to: { schedule: s1 } });
  });

  it('stop needs a reason; snapshots hold only the schedule', () => {
    bad(medEventSchema, { ...base, type: 'stop' });
    bad(medEventSchema, { ...base, type: 'stop', reason: 'ไม่รู้' });
    bad(medEventSchema, { ...base, type: 'start', to: { schedule: s1, name: 'x' } });
    bad(medEventSchema, { ...base, type: 'start', to: { schedule: s1, stockQty: 3 } });
    bad(medEventSchema, { ...base, type: 'resume', from: { schedule: s1 } });
  });
});

describe('v3 price and orders', () => {
  const price = () => structuredClone(sampleRootV3().prices[0]!);

  it('price needs a date, perSellUnit is optional, no receipt field', () => {
    ok(priceSchema, price());
    bad(priceSchema, { ...price(), date: undefined });
    ok(priceSchema, { ...price(), perSellUnit: undefined });
    bad(priceSchema, { ...price(), receipt: { id: 'r1' } });
    bad(priceSchema, { ...price(), photo: 'data:image/png;base64,AAAA' });
  });

  it('order: all 4 statuses accepted, unknown status and bad leftover rejected', () => {
    const o = () => structuredClone(sampleRootV3().orders[0]!);
    for (const status of ['waiting', 'partial', 'received', 'cancelled']) ok(orderSchema, { ...o(), status });
    bad(orderSchema, { ...o(), status: 'done' });
    const line = { ...o().lines[0]!, leftover: 'later' };
    bad(orderSchema, { ...o(), lines: [line] });
  });

  it('order has no limit on lines; a free line needs a name; sources are strict', () => {
    const o = sampleRootV3().orders[0]!;
    const many = Array.from({ length: 60 }, () => structuredClone(o.lines[0]!));
    ok(orderSchema, { ...o, lines: many });
    bad(orderSchema, { ...o, lines: [{ ...o.lines[0]!, source: { kind: 'free', name: '' } }] });
    bad(orderSchema, { ...o, lines: [{ ...o.lines[0]!, source: { kind: 'assignment', medicationId: 'm1' } }] });
  });
});

describe('v3 settings', () => {
  it('defaults: lowStockDays = 14 and fontSize = normal', () => {
    expect(DEFAULT_SETTINGS_V3.lowStockDays).toBe(14);
    expect(DEFAULT_SETTINGS_V3.fontSize).toBe('normal');
    expect(blankRootV3().settings).toMatchObject({ lowStockDays: 14, fontSize: 'normal' });
    const parsed = settingsSchema.parse({ expiryWarnDays: 15, orderTemplate: '', orderDays: 30 });
    expect(parsed.lowStockDays).toBe(14);
    expect(parsed.fontSize).toBe('normal');
  });

  it('font size accepts normal, medium, large only; lowStockDays must be positive', () => {
    const s = { ...DEFAULT_SETTINGS_V3 };
    for (const fontSize of ['normal', 'medium', 'large']) ok(settingsSchema, { ...s, fontSize });
    bad(settingsSchema, { ...s, fontSize: 'huge' });
    bad(settingsSchema, { ...s, lowStockDays: 0 });
    ok(settingsSchema, { ...s, lowStockDays: 21 });
  });
});
