// Text for one dose row, shared by the home card and the "ยาวันนี้" screen.
import { formatPills } from '../domain/format';
import type { Root } from '../domain/schema';
import type { DoseSlot, MealTiming, TodayDose } from '../domain/today';

export const SLOT_LABEL: Record<DoseSlot, string> = {
  morning: 'เช้า',
  noon: 'กลางวัน',
  evening: 'เย็น',
  bedtime: 'ก่อนนอน',
};
export const MEAL_LABEL: Record<MealTiming, string> = {
  before: 'ก่อนอาหาร',
  with: 'พร้อมอาหาร',
  after: 'หลังอาหาร',
};

export interface DoseView {
  name: string;
  who: string;
  amount: string; // '1½ เม็ด'
  everyHours?: number; // interval medicines only
}

export function doseView(root: Root, d: TodayDose): DoseView {
  const med = root.medications.find((m) => m.id === d.medicationId);
  const person = root.persons.find((p) => p.id === d.personId);
  const a = root.assignments.find((x) => x.id === d.assignmentId);
  const base = {
    name: med?.name ?? '',
    who: person?.name ?? '',
    amount: formatPills(d.pills, med?.unit ?? ''),
  };
  return a?.schedule.kind === 'interval' ? { ...base, everyHours: a.schedule.everyHours } : base;
}
