// Made-up data for v3 tests and the sample house. No real people, no real medicine data.
import { emptyRoot, type Assignment, type MedEvent, type Order, type Person, type Root, type Schedule } from './schema';

export const NOW = '2026-10-28T09:00:00+07:00';
const TODAY = '2026-10-28';

const MORNING: Schedule = { kind: 'meal', slots: { morning: { pills: 1, meal: 'after' } }, days: { kind: 'daily' } };
const TWICE: Schedule = {
  kind: 'meal',
  slots: { morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } },
  days: { kind: 'daily' },
};
const EVERY_8H: Schedule = { kind: 'interval', everyHours: 8, firstTime: '08:00', pills: 1, course: { kind: 'ongoing' } };

/** A blank house (no people, no medicines). */
export function blankRootV3(): Root {
  return emptyRoot(NOW);
}

/** A made-up house that uses every kind, pack, stock, allergy, coverage, order status and order source. */
export function sampleRootV3(): Root {
  const persons: Person[] = [
    { id: 'p1', name: 'สมาชิก ก', relation: 'ตัวฉัน', birthYearBE: 2530, avatar: 'avatar-01', color: 'blue', selfManaged: true, allergies: { status: 'unknown' }, coverage: { type: 'government' } },
    { id: 'p2', name: 'สมาชิก ข', relation: 'แม่', birthYearBE: 2500, avatar: 'avatar-02', color: 'green', selfManaged: false, allergies: { status: 'none_confirmed', confirmedAt: TODAY }, coverage: { type: 'social' } },
    { id: 'p3', name: 'สมาชิก ค', relation: 'พ่อ', birthYearBE: 2495, avatar: 'avatar-03', color: 'yellow', selfManaged: false, allergies: { status: 'listed', items: [{ drug: 'ยาตัวอย่าง Z', reaction: 'ผื่นตัวอย่าง' }] }, coverage: { type: 'civil_servant' } },
    { id: 'p4', name: 'สมาชิก ง', relation: 'ลูก', birthYearBE: 2560, avatar: 'avatar-04', color: 'gray', selfManaged: false, allergies: { status: 'unknown' }, coverage: { type: 'private', company: 'บริษัทตัวอย่าง' } },
    { id: 'p5', name: 'สมาชิก จ', relation: 'ญาติ', avatar: 'avatar-05', color: 'blue', selfManaged: false, allergies: { status: 'unknown' }, coverage: { type: 'self_pay' } },
    { id: 'p6', name: 'สมาชิก ฉ', relation: 'อื่นๆ', avatar: 'avatar-12', color: 'green', selfManaged: false, allergies: { status: 'unknown' }, coverage: { type: 'other' } },
    { id: 'p7', name: 'สมาชิก ช', relation: 'คู่สมรส', avatar: 'avatar-06', color: 'gray', selfManaged: false, allergies: { status: 'unknown' } }, // no coverage given
  ];

  // One medicine per kind; packs cover none, strip, box, container (ml and g) and sachetBox.
  const medications: Root['medications'] = [
    { id: 'm1', name: 'ยาตัวอย่าง A', kind: 'tablet', strength: { value: 500, unit: 'mg' }, pack: { type: 'strip', perStrip: 10 } },
    { id: 'm2', name: 'ยาตัวอย่าง B', kind: 'capsule', strength: { value: 20, unit: 'mg' }, pack: { type: 'box', strips: 3, perStrip: 10 } },
    { id: 'm3', name: 'ยาตัวอย่าง C', kind: 'liquid', strength: { value: 120, unit: 'mg/5 ml' }, pack: { type: 'container', amount: 60, unit: 'ml' } },
    { id: 'm4', name: 'ยาตัวอย่าง D', kind: 'cream', strength: { value: 1, unit: '%' }, pack: { type: 'container', amount: 15, unit: 'g' } },
    { id: 'm5', name: 'ยาตัวอย่าง E', kind: 'sachet', pack: { type: 'sachetBox', sachets: 10 } },
    { id: 'm6', name: 'ยาตัวอย่าง F', kind: 'drops', strength: { value: 0.5, unit: '%' }, pack: { type: 'container', amount: 5, unit: 'ml' } },
    { id: 'm7', name: 'ยาตัวอย่าง G', kind: 'other', strength: { value: 400, unit: 'IU' }, pack: { type: 'none' } },
  ];

  const mk = (n: number, medicationId: string, personId: string, schedule: Schedule, stock: Assignment['stock'], extra: Partial<Assignment> = {}): Assignment => ({
    id: `a${n}`, medicationId, personId, schedule, stock, status: 'active', createdAt: NOW, ...extra,
  });
  const assignments: Assignment[] = [
    mk(1, 'm1', 'p1', TWICE, { kind: 'count', strips: 2, loose: 3, countedOn: TODAY }, { expiry: '2027-06-30', sideEffects: 'ง่วงเล็กน้อย (ตัวอย่าง)' }),
    mk(2, 'm2', 'p2', MORNING, { kind: 'count', strips: 0, loose: 7, countedOn: TODAY }),
    mk(3, 'm3', 'p4', EVERY_8H, { kind: 'volume', ml: 45, countedOn: TODAY }),
    mk(4, 'm4', 'p3', MORNING, { kind: 'tubes', opened: true, spare: 1 }),
    mk(5, 'm5', 'p2', MORNING, { kind: 'count', strips: 1, loose: 4, countedOn: TODAY }),
    mk(6, 'm6', 'p3', MORNING, { kind: 'tubes', opened: false, spare: 2 }),
    mk(7, 'm7', 'p1', MORNING, null, { status: 'stopped' }),
  ];

  const events: MedEvent[] = [
    ...assignments.map((a): MedEvent => ({ id: `e-start-${a.id}`, assignmentId: a.id, type: 'start', effectiveOn: '2026-10-01', at: NOW, to: { schedule: a.schedule } })),
    { id: 'e-adjust', assignmentId: 'a1', type: 'adjust', effectiveOn: '2026-10-15', at: NOW, reason: 'doctor', note: 'ปรับตามที่หมอแจ้ง (ตัวอย่าง)', from: { schedule: MORNING }, to: { schedule: TWICE } },
    { id: 'e-adjust2', assignmentId: 'a2', type: 'adjust', effectiveOn: '2026-10-16', at: NOW, reason: 'self_or_other', from: { schedule: TWICE }, to: { schedule: MORNING } },
    { id: 'e-stop', assignmentId: 'a7', type: 'stop', effectiveOn: '2026-10-20', at: NOW, reason: 'อื่น ๆ', note: 'หยุดตัวอย่าง' },
    { id: 'e-resume', assignmentId: 'a6', type: 'resume', effectiveOn: '2026-10-22', at: NOW },
  ];

  const houseItems: Root['houseItems'] = [
    { id: 'h1', name: 'ยาสามัญตัวอย่าง ก', stock: { qty: 2, unit: 'แผง' }, lowAt: 1, expiry: '2027-03-31' },
    { id: 'h2', name: 'ยาสามัญตัวอย่าง ข' },
  ];

  const shops: Root['shops'] = [
    { id: 's1', name: 'ร้านตัวอย่าง 1', phone: '021234567', delivery: { kind: 'pickup' } },
    { id: 's2', name: 'ร้านตัวอย่าง 2', delivery: { kind: 'deliver', fee: 40, freeOver: 500 } },
    { id: 's3', name: 'ร้านตัวอย่าง 3', delivery: { kind: 'deliver', fee: 30 } },
  ];

  const prices: Root['prices'] = [
    { id: 'pr1', shopId: 's1', item: { kind: 'med', medicationId: 'm1' }, price: 45, sellUnit: 'แผง', perSellUnit: 10, date: TODAY },
    { id: 'pr2', shopId: 's2', item: { kind: 'med', medicationId: 'm1' }, price: 120, sellUnit: 'กล่อง', date: '2026-10-20' },
    { id: 'pr3', shopId: 's1', item: { kind: 'house', houseItemId: 'h1' }, price: 30, sellUnit: 'แผง', perSellUnit: 1, date: TODAY },
  ];

  const line = (source: Order['lines'][number]['source'], over: Partial<Order['lines'][number]> = {}): Order['lines'][number] => ({
    source, qtyOrdered: 2, sellUnit: 'แผง', perSellUnit: 10, unitPrice: 45, qtyReceived: 0, leftover: null, ...over,
  });
  const orders: Order[] = [
    { id: 'o1', shopId: 's1', createdAt: NOW, status: 'waiting', includeShipping: false, lines: [line({ kind: 'assignment', assignmentId: 'a1' })] },
    {
      id: 'o2', shopId: 's2', createdAt: NOW, status: 'partial', includeShipping: true,
      lines: [
        line({ kind: 'assignment', assignmentId: 'a2' }, { qtyReceived: 1, leftover: 'waiting' }),
        line({ kind: 'house', houseItemId: 'h1' }, { perSellUnit: 1, qtyReceived: 2 }),
      ],
      note: 'ตัวอย่างรับบางส่วน',
    },
    { id: 'o3', shopId: 's1', createdAt: NOW, status: 'received', includeShipping: false, lines: [line({ kind: 'free', name: 'ยาตัวอย่าง H' }, { unitPrice: undefined, qtyReceived: 2, addToList: true })] },
    { id: 'o4', shopId: 's3', createdAt: NOW, status: 'cancelled', includeShipping: false, lines: [line({ kind: 'assignment', assignmentId: 'a3' }, { qtyReceived: 1, leftover: 'dropped' })] },
  ];

  return {
    ...emptyRoot(NOW),
    persons, medications, assignments, events, houseItems, shops, prices, orders,
    prepLog: { [TODAY]: { 'a1:morning': true } },
    meta: { createdAt: NOW, isSample: true },
  };
}
