import { describe, expect, it } from 'vitest';
import { assignment, dailyMeal, person, rootWith } from './helpers.test-util';
import { houseSuggestions } from './suggest';

const SCHEDULE = dailyMeal({ morning: { pills: 1, meal: 'after' } });
const root = rootWith({
  persons: [person(), person({ id: 'p2', name: 'Test Person B' })],
  medications: [
    { id: 'm1', name: 'ยาตัวอย่าง ก 5 mg', unit: 'เม็ด' },
    { id: 'm2', name: 'Sample Med B', unit: 'ซอง' },
    { id: 'm3', name: 'แพ็คยาตัวอย่าง ค', unit: 'เม็ด' },
  ],
  assignments: [
    assignment({ id: 'a1', medicationId: 'm1', schedule: SCHEDULE }),
    assignment({ id: 'a2', medicationId: 'm1', personId: 'p2', schedule: SCHEDULE }),
  ],
});
const find = houseSuggestions(root);

describe('names already used in the house', () => {
  it('nothing under 2 characters (spaces do not count)', () => {
    expect(find('')).toEqual([]);
    expect(find('ย')).toEqual([]);
    expect(find('  ย  ')).toEqual([]);
  });

  it('matches ignoring letter case and spaces at both ends, and shows unit and users', () => {
    expect(find('  SAMPLE med ')).toEqual([{ label: 'Sample Med B', sub: 'หน่วย ซอง · ใช้อยู่ 0 คน', kind: 'เคยเพิ่มแล้ว' }]);
    expect(find('ตัวอย่าง ก')).toEqual([{ label: 'ยาตัวอย่าง ก 5 mg', sub: 'หน่วย เม็ด · ใช้อยู่ 2 คน', kind: 'เคยเพิ่มแล้ว' }]);
  });

  it('names that start with the text come first', () => {
    expect(find('ยาตัว').map((s) => s.label)).toEqual(['ยาตัวอย่าง ก 5 mg', 'แพ็คยาตัวอย่าง ค']);
  });

  it('no match = empty list, and an empty house gives nothing', () => {
    expect(find('zzz')).toEqual([]);
    expect(houseSuggestions(rootWith({}))('ยา')).toEqual([]);
  });
});
