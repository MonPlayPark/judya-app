// Made-up houses for the secret demo links of the v3 medicine list (#/n/meds?demo=normal | nomember | nomeds | nohouse).
// Built in memory; nothing here reads or writes storage. Made-up members; the dates are fixed to DEMO_TODAY (2026-10-28).
import { addDays } from '../calc';
import { DEMO_TODAY } from './homeDemo';
import { blankRootV3, NOW } from './fixtures';
import type { Assignment, HouseItem, Medication, MedEvent, Person, Root, Schedule } from './schema';

// cream / notdaily / stopped are for the detail page (#/n/meds/:id?demo=...): the normal house plus what that view needs.
export const MEDS_DEMO_NAMES = ['normal', 'nomember', 'nomeds', 'nohouse', 'cream', 'notdaily', 'stopped'] as const;
export type MedsDemoName = (typeof MEDS_DEMO_NAMES)[number];

export const isMedsDemoName = (v: string | null): v is MedsDemoName => v !== null && (MEDS_DEMO_NAMES as readonly string[]).includes(v);

const meal = (...periods: ('morning' | 'noon' | 'evening')[]): Schedule => ({
  kind: 'meal',
  slots: Object.fromEntries(periods.map((p) => [p, { pills: 1, meal: 'after' as const }])),
  days: { kind: 'daily' },
});
const BEDTIME: Schedule = { kind: 'meal', slots: { bedtime: { pills: 1 } }, days: { kind: 'daily' } };
const MORNING = meal('morning');
const MORNING_EVENING = meal('morning', 'evening');

const PERSONS: Person[] = [
  { id: 'p1', name: 'คุณพ่อ', relation: 'พ่อ', avatar: 'avatar-01', color: 'blue', selfManaged: false, allergies: { status: 'unknown' } },
  { id: 'p2', name: 'คุณแม่', relation: 'แม่', avatar: 'avatar-02', color: 'green', selfManaged: false, allergies: { status: 'unknown' } },
];

const tablet = (id: string, name: string, value: number, unit: 'mg' | 'IU'): Medication => ({ id, name, kind: 'tablet', strength: { value, unit }, pack: { type: 'none' } });
const MEDICATIONS: Medication[] = [
  tablet('m1', 'Simvastatin', 20, 'mg'),
  tablet('m2', 'Metformin', 500, 'mg'),
  tablet('m3', 'Amlodipine', 5, 'mg'),
  { ...tablet('m4', 'VitaminD', 1000, 'IU'), pack: { type: 'box', strips: 3, perStrip: 10 } }, // 1 box + 2 strips + 3 pills = 53
  tablet('m5', 'Losartan', 50, 'mg'),
  tablet('m6', 'Atorvastatin', 20, 'mg'),
  tablet('m7', 'Brintellix', 20, 'mg'),
];

/** An active medicine whose stock lasts exactly `days` days from DEMO_TODAY (counted today, `perDay` pills a day). */
const lasting = (n: number, medicationId: string, personId: string, schedule: Schedule, days: number, perDay: number, extra: Partial<Assignment> = {}): Assignment => ({
  id: `a${n}`, medicationId, personId, schedule, status: 'active', createdAt: NOW,
  stock: { kind: 'count', strips: 0, loose: days * perDay, countedOn: DEMO_TODAY }, ...extra,
});

const ASSIGNMENTS: Assignment[] = [
  lasting(1, 'm1', 'p1', BEDTIME, 3, 1),
  lasting(2, 'm2', 'p1', MORNING_EVENING, 14, 2),
  lasting(3, 'm3', 'p1', MORNING, 38, 1),
  lasting(4, 'm4', 'p1', MORNING_EVENING, 26, 2, { stock: { kind: 'count', strips: 5, loose: 3, countedOn: DEMO_TODAY }, expiry: '2027-03-15' }), // 53 pills, 2 a day = 26 days
  lasting(5, 'm5', 'p2', MORNING, 21, 1),
  lasting(6, 'm6', 'p2', BEDTIME, 45, 1, { expiry: addDays(DEMO_TODAY, 8) }), // 2026-11-05
  { id: 'a7', medicationId: 'm7', personId: 'p1', schedule: MORNING, stock: { kind: 'count', strips: 0, loose: 12, countedOn: '2026-09-01' }, status: 'stopped', createdAt: NOW }, // 10 pills left when stopped
  { id: 'a8', medicationId: 'm3', personId: 'p2', schedule: MORNING, stock: null, status: 'stopped', createdAt: NOW },
];

const stop = (id: string, assignmentId: string, effectiveOn: string, extra: { reason?: 'แพ้ยา'; note?: string } = {}): MedEvent => ({
  id, assignmentId, type: 'stop', effectiveOn, at: `${effectiveOn}T09:00:00+07:00`, reason: extra.reason ?? 'หมอสั่ง', ...(extra.note ? { note: extra.note } : {}),
});
const start = (a: Assignment, on = '2026-06-01', schedule: Schedule = a.schedule): MedEvent => ({ id: `e-start-${a.id}`, assignmentId: a.id, type: 'start', effectiveOn: on, at: NOW, to: { schedule } });
const EVENTS: MedEvent[] = [
  // a4 (dad's VitaminD) has every kind of event: start, a dose change, a stop and a resume
  ...ASSIGNMENTS.map((a) => start(a, '2026-06-01', a.id === 'a4' ? MORNING : a.schedule)),
  { id: 'e-adjust-a4', assignmentId: 'a4', type: 'adjust', effectiveOn: '2026-08-10', at: '2026-08-10T09:00:00+07:00', reason: 'doctor', from: { schedule: MORNING }, to: { schedule: MORNING_EVENING } },
  stop('e-stop-a4', 'a4', '2026-09-05'),
  { id: 'e-resume-a4', assignmentId: 'a4', type: 'resume', effectiveOn: '2026-09-20', at: '2026-09-20T09:00:00+07:00', reason: 'อาการกลับมาหรือกำเริบ' },
  stop('e-stop-a7', 'a7', '2026-09-03', { reason: 'แพ้ยา', note: 'ผื่นคัน' }),
  stop('e-stop-a8', 'a8', '2026-07-12'),
];

// extra medicines for the detail views: a cream counted by the tube, and a medicine not taken every day
const EXTRA_MEDICATIONS: Medication[] = [
  { id: 'm8', name: 'Hydrocortisone', kind: 'cream', strength: { value: 1, unit: '%' }, pack: { type: 'container', amount: 15, unit: 'g' } },
  tablet('m9', 'Folic acid', 5, 'mg'),
];
const MON_WED_FRI: Schedule = { kind: 'meal', slots: { morning: { pills: 1, meal: 'after' } }, days: { kind: 'weekdays', days: [1, 3, 5] } };
const CREAM: Assignment = { id: 'a9', medicationId: 'm8', personId: 'p1', schedule: MORNING, stock: { kind: 'tubes', opened: true, spare: 2 }, status: 'active', createdAt: NOW };
const NOT_DAILY: Assignment = { id: 'a10', medicationId: 'm9', personId: 'p2', schedule: MON_WED_FRI, stock: { kind: 'count', strips: 0, loose: 30, countedOn: DEMO_TODAY }, status: 'active', createdAt: NOW };

const HOUSE: HouseItem[] = [
  { id: 'h1', name: 'ยาดมแก้วิงเวียน', kind: 'other', stock: { qty: 0, unit: 'อัน' } },
  { id: 'h2', name: 'ยาธาตุน้ำขาว', kind: 'liquid', stock: { qty: 1, unit: 'ขวด' }, expiry: '2026-09-30' },
  { id: 'h3', name: 'ผงเกลือแร่ ORS', kind: 'sachet', stock: { qty: 2, unit: 'ซอง' }, lowAt: 3 },
  { id: 'h4', name: 'ยาทาแก้ผื่นคัน', kind: 'cream', expiry: addDays(DEMO_TODAY, 9) }, // 2026-11-06, not counted
  { id: 'h5', name: 'พาราเซตามอล 500 mg', kind: 'tablet', stock: { qty: 4, unit: 'แผง' }, lowAt: 1 },
  { id: 'h6', name: 'ยาหม่อง', kind: 'other', stock: { qty: 1, unit: 'ตลับ' }, removedAt: '2026-10-08T10:00:00+07:00' },
];

/** The house of a demo link. All dates follow DEMO_TODAY. */
export function medsDemoRoot(name: MedsDemoName): Root {
  const blank = blankRootV3();
  switch (name) {
    case 'nomember':
      return blank;
    case 'nomeds':
      return { ...blank, persons: PERSONS, houseItems: HOUSE };
    case 'nohouse':
      return { ...blank, persons: PERSONS, medications: MEDICATIONS, assignments: ASSIGNMENTS, events: EVENTS };
    case 'normal':
    case 'stopped':
      return { ...blank, persons: PERSONS, medications: MEDICATIONS, assignments: ASSIGNMENTS, events: EVENTS, houseItems: HOUSE };
    case 'cream':
      return { ...blank, persons: PERSONS, medications: [...MEDICATIONS, ...EXTRA_MEDICATIONS], assignments: [...ASSIGNMENTS, CREAM], events: [...EVENTS, start(CREAM)], houseItems: HOUSE };
    case 'notdaily':
      return { ...blank, persons: PERSONS, medications: [...MEDICATIONS, ...EXTRA_MEDICATIONS], assignments: [...ASSIGNMENTS, NOT_DAILY], events: [...EVENTS, start(NOT_DAILY)], houseItems: HOUSE };
  }
}
