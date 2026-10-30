import { describe, expect, it } from 'vitest';
import { DEMO_TODAY } from './homeDemo';
import { buildMedsList, shortThaiDate, type MedsQuery } from './medsList';
import { medsDemoRoot } from './medsListDemo';
import { rootSchema } from './schema';

const Q: MedsQuery = { tab: 'mine', filter: 'all', query: '' };
const model = (q: Partial<MedsQuery> = {}, demo: Parameters<typeof medsDemoRoot>[0] = 'normal') =>
  buildMedsList(medsDemoRoot(demo), DEMO_TODAY, { ...Q, ...q });

describe('demo houses are valid data', () => {
  it.each(['normal', 'nomember', 'nomeds', 'nohouse'] as const)('%s passes the schema', (n) => {
    expect(rootSchema.safeParse(medsDemoRoot(n)).success).toBe(true);
  });
});

describe('shortThaiDate', () => {
  it('writes day, short month and two-digit Buddhist year', () => {
    expect(shortThaiDate('2026-11-05')).toBe('5 พ.ย. 69');
    expect(shortThaiDate('2026-10-08T10:00:00+07:00')).toBe('8 ต.ค. 69');
  });
});

describe('own medicines', () => {
  it('counts and groups by member', () => {
    const m = model();
    expect(m.counts).toEqual({ mine: 6, house: 5 });
    expect(m.groups.map((g) => [g.name, g.rows.length])).toEqual([['คุณพ่อ', 4], ['คุณแม่', 2]]);
    expect(m.empty).toBeNull();
  });
  it('status and days left come from the real rules (no hard-coded chips)', () => {
    const rows = model().groups.flatMap((g) => g.rows);
    const by = (n: string) => rows.find((r) => r.name.startsWith(n));
    expect(by('Simvastatin')?.chip).toEqual({ tone: 'low', label: 'ใกล้หมด' });
    expect(by('Simvastatin')?.leftText).toBe('เหลือ 3 วัน');
    expect(by('Metformin')?.chip.label).toBe('ใกล้หมด'); // 14 days = the border
    expect(by('Metformin')?.doseText).toBe('เช้า · เย็น · 1 เม็ด');
    expect(by('Amlodipine')?.chip.label).toBe('ปกติ');
    expect(by('Amlodipine')?.leftText).toBe('เหลือ 38 วัน');
    expect(by('VitaminD 1,000 IU')?.leftText).toBe('เหลือ 26 วัน');
    expect(by('Atorvastatin')?.expiryNote).toBe('ใกล้หมดอายุ 5 พ.ย. 69');
    expect(by('Atorvastatin')?.chip.label).toBe('ปกติ');
    expect(by('Simvastatin')?.doseText).toBe('ก่อนนอน · 1 เม็ด');
  });
  it('the order button counts low and out medicines per member', () => {
    expect(model().groups.map((g) => g.orderCount)).toEqual([2, 0]);
  });
  it('stopped medicines are listed apart, newest stop first, with who and when', () => {
    expect(model().stopped.map((s) => s.subText)).toEqual(['คุณพ่อ · หยุดเมื่อ 3 ก.ย. 69', 'คุณแม่ · หยุดเมื่อ 12 ก.ค. 69']);
    expect(model({ tab: 'house' }).stopped).toEqual([]);
  });
  it('filter: low keeps low/out only, expiring keeps medicines with an expiry warning', () => {
    expect(model({ filter: 'low' }).groups.flatMap((g) => g.rows.map((r) => r.name.split(' ')[0]))).toEqual(['Simvastatin', 'Metformin']);
    expect(model({ filter: 'expiring' }).groups.flatMap((g) => g.rows.map((r) => r.name.split(' ')[0]))).toEqual(['Atorvastatin']);
    expect(model({ filter: 'low' }).groups[0]?.rows.length).toBe(2); // header counts only matching rows
  });
  it('search ignores case, and hides the stopped section while filtering', () => {
    const m = model({ query: ' LOSAR ' });
    expect(m.groups.flatMap((g) => g.rows).map((r) => r.name)).toEqual(['Losartan 50 mg']);
    expect(m.stopped).toEqual([]);
    expect(m.filtering).toBe(true);
  });
  it('nothing matches -> no-match, and the add button stays', () => {
    const m = model({ query: 'zzz' });
    expect(m.empty).toBe('no-match');
    expect(m.showFab).toBe(true);
  });
});

describe('house medicines', () => {
  const house = (q: Partial<MedsQuery> = {}, demo: Parameters<typeof medsDemoRoot>[0] = 'normal') => model({ tab: 'house', ...q }, demo);
  it('sorted by rank, same rank keeps the saved order', () => {
    expect(house().houseRows.map((r) => [r.name, r.chip.label, r.rank])).toEqual([
      ['ยาดมแก้วิงเวียน', 'หมดแล้ว', 0],
      ['ยาธาตุน้ำขาว', 'หมดอายุแล้ว', 0],
      ['ผงเกลือแร่ ORS', 'ใกล้หมด', 1],
      ['ยาทาแก้ผื่นคัน', 'ใกล้หมดอายุ', 1],
      ['พาราเซตามอล 500 mg', 'ปกติ', 2],
    ]);
  });
  it('sub lines: out, counted, not counted, with expiry', () => {
    const rows = house().houseRows;
    expect(rows.map((r) => r.subText)).toEqual(['ไม่มีในบ้าน', 'เหลือ 1 ขวด', 'เหลือ 2 ซอง', 'ไม่นับจำนวน', 'เหลือ 4 แผง']);
    expect(rows.map((r) => r.expiryNote)).toEqual([null, 'หมดอายุ 30 ก.ย. 69', null, 'ใกล้หมดอายุ 6 พ.ย. 69', null]);
  });
  it('order count = out + low, expired is not counted (out medicine + ORS = 2)', () => {
    expect(house().houseOrderCount).toBe(2);
  });
  it('deleted section shows when not filtering', () => {
    expect(house().deleted).toEqual([{ id: 'h6', name: 'ยาหม่อง', subText: 'ลบเมื่อ 8 ต.ค. 69' }]);
    expect(house({ query: 'ยา' }).deleted).toEqual([]);
  });
  it('a cream/drops item that is counted says "สำรอง"', () => {
    const root = medsDemoRoot('normal');
    root.houseItems = [{ id: 'h9', name: 'ยาหยอดตา', kind: 'drops', stock: { qty: 2, unit: 'ขวด' } }];
    expect(buildMedsList(root, DEMO_TODAY, { ...Q, tab: 'house' }).houseRows[0]?.subText).toBe('สำรอง 2 ขวด');
  });
  it('no kind -> other', () => {
    const root = medsDemoRoot('normal');
    root.houseItems = [{ id: 'h9', name: 'ยาไม่ระบุ' }];
    expect(buildMedsList(root, DEMO_TODAY, { ...Q, tab: 'house' }).houseRows[0]?.kind).toBe('other');
  });
});

describe('empty states', () => {
  it('no member / member but no medicine / no house medicine', () => {
    expect(model({}, 'nomember').empty).toBe('no-member');
    expect(model({}, 'nomeds').empty).toBe('no-meds');
    expect(model({ tab: 'house' }, 'nohouse').empty).toBe('no-house');
    expect(model({}, 'nohouse').empty).toBeNull();
  });
  it('the add button is hidden in the three empty states', () => {
    expect(model({}, 'nomember').showFab).toBe(false);
    expect(model({}, 'nomeds').showFab).toBe(false);
    expect(model({ tab: 'house' }, 'nohouse').showFab).toBe(false);
    expect(model().showFab).toBe(true);
  });
  it('filtering an empty list is still the plain empty state', () => {
    expect(model({ query: 'x' }, 'nomeds').empty).toBe('no-meds');
  });
  it('only deleted house items: empty state and the deleted section together', () => {
    const root = medsDemoRoot('normal');
    root.houseItems = root.houseItems.filter((h) => h.removedAt !== undefined);
    const m = buildMedsList(root, DEMO_TODAY, { ...Q, tab: 'house' });
    expect(m.empty).toBe('no-house');
    expect(m.deleted).toHaveLength(1);
  });
  it('a removed member and removed house items are not counted', () => {
    const root = medsDemoRoot('normal');
    root.persons = root.persons.map((p) => (p.id === 'p2' ? { ...p, removedAt: NOW_ISO } : p));
    expect(buildMedsList(root, DEMO_TODAY, Q).groups.map((g) => g.name)).toEqual(['คุณพ่อ']);
  });
});
const NOW_ISO = '2026-10-20T09:00:00+07:00';
