// Builders for tests only. Made-up data (BRIEF 3.6).
import type { Assignment, MedEvent, Person, Root, Schedule } from './schema';
import { NOW } from './fixtures';
import { emptyRoot } from './schema';

export const TODAY = '2026-10-16'; // a Friday

export const dailyMeal = (slots: Extract<Schedule, { kind: 'meal' }>['slots']): Schedule => ({
  kind: 'meal',
  slots,
  days: { kind: 'daily' },
});

export const assignment = (over: Partial<Assignment> & { schedule: Schedule }): Assignment => ({
  id: 'a1',
  medicationId: 'm1',
  personId: 'p1',
  stock: null,
  status: 'active',
  createdAt: NOW,
  ...over,
});

export const person = (over: Partial<Person> = {}): Person => ({
  id: 'p1',
  name: 'Test Person A',
  relation: 'ตัวฉัน',
  color: 'blue',
  selfManaged: false,
  insurance: {},
  ...over,
});

export const stopEvent = (assignmentId: string, effectiveOn: string): MedEvent => ({
  id: `stop-${effectiveOn}`,
  assignmentId,
  type: 'stop',
  effectiveOn,
  at: NOW,
  reason: 'หมอสั่ง',
});
export const resumeEvent = (assignmentId: string, effectiveOn: string): MedEvent => ({
  id: `resume-${effectiveOn}`,
  assignmentId,
  type: 'resume',
  effectiveOn,
  at: NOW,
});

export const rootWith = (over: Partial<Root>): Root => ({ ...emptyRoot(NOW), ...over });
