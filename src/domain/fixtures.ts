// Made-up data for tests only. No real people, no real medicine data (BRIEF 3.6).
import { emptyRoot, type Root, type Schedule } from './schema';

export const NOW = '2026-10-16T09:00:00+07:00';

const SAMPLE_SCHEDULE: Schedule = {
  kind: 'meal',
  slots: { morning: { pills: 1, meal: 'after' } },
  days: { kind: 'daily' },
};

export function sampleRoot(): Root {
  return {
    ...emptyRoot(NOW),
    persons: [
      { id: 'p1', name: 'Test Person A', relation: 'ตัวฉัน', color: 'blue', selfManaged: false, insurance: {} },
    ],
    medications: [{ id: 'm1', name: 'Sample Med 5 mg', unit: 'เม็ด' }],
    assignments: [
      {
        id: 'a1',
        medicationId: 'm1',
        personId: 'p1',
        schedule: SAMPLE_SCHEDULE,
        stock: { qty: 30, countedOn: '2026-10-16' },
        status: 'active',
        createdAt: NOW,
      },
    ],
    events: [{ id: 'e1', assignmentId: 'a1', type: 'start', effectiveOn: '2026-10-16', at: NOW, to: { schedule: SAMPLE_SCHEDULE } }],
    prepLog: { '2026-10-16': { 'a1:morning': true } },
  };
}
