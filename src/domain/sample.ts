// The made-up sample house (Q12). Everything here is invented: no real people, no real medicines (BRIEF 3.6).
// Dates follow `today` so the sample always has doses to tick today and a medicine that expires soon.
import { addDays, type IsoDate } from './calc';
import type { Assignment, MedEvent, Medication, Person, Root, Schedule } from './schema';

type Sample = Pick<Root, 'persons' | 'medications' | 'assignments' | 'events' | 'houseItems'>;

export function makeSample(today: IsoDate, nowIso: string): Sample {
  const persons: Person[] = [
    { id: 'sample-p1', name: 'สมาชิกตัวอย่าง ก', relation: 'แม่', color: 'blue', selfManaged: false, insurance: {} },
    { id: 'sample-p2', name: 'สมาชิกตัวอย่าง ข', relation: 'พ่อ', color: 'green', selfManaged: true, insurance: {} },
  ];
  const medications: Medication[] = ['ก', 'ข', 'ค', 'ง'].map((letter, i) => ({
    id: `sample-m${i + 1}`,
    name: `ยาตัวอย่าง ${letter}`,
    unit: 'เม็ด',
  }));

  const schedules: Schedule[] = [
    // ก: every day, morning 1 + evening 1
    {
      kind: 'meal',
      slots: { morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } },
      days: { kind: 'daily' },
    },
    // ข: Monday / Wednesday / Friday (model numbering, 0 = Sunday)
    { kind: 'meal', slots: { morning: { pills: 1, meal: 'with' } }, days: { kind: 'weekdays', days: [1, 3, 5] } },
    // ค: every 12 hours, 5-day course starting today
    { kind: 'interval', everyHours: 12, firstTime: '08:00', pills: 1, course: { kind: 'days', days: 5, startDate: today } },
    // ง: belongs to the member who sets out their own medicine
    { kind: 'meal', slots: { bedtime: { pills: 1 } }, days: { kind: 'daily' } },
  ];
  const stocks: Assignment['stock'][] = [
    { qty: 20, countedOn: addDays(today, -3) },
    { qty: 12, countedOn: today },
    { qty: 10, countedOn: today },
    { qty: 5, countedOn: today },
  ];

  const assignments: Assignment[] = schedules.map((schedule, i) => ({
    id: `sample-a${i + 1}`,
    medicationId: `sample-m${i + 1}`,
    personId: i === 3 ? 'sample-p2' : 'sample-p1',
    schedule,
    stock: stocks[i] ?? null,
    status: 'active',
    createdAt: nowIso,
  }));
  const events: MedEvent[] = assignments.map((a) => ({
    id: `sample-e-${a.id}`,
    assignmentId: a.id,
    type: 'start',
    effectiveOn: today,
    at: nowIso,
    to: { schedule: a.schedule },
  }));

  const houseItems: Root['houseItems'] = [
    { id: 'sample-h1', name: 'ยาสามัญตัวอย่าง ก', stock: { qty: 10, unit: 'แผง' }, lowAt: 2, expiry: addDays(today, 10) }, // expires soon
    { id: 'sample-h2', name: 'ยาสามัญตัวอย่าง ข', stock: { qty: 3, unit: 'ขวด' }, expiry: addDays(today, 400) },
  ];

  return { persons, medications, assignments, events, houseItems };
}
