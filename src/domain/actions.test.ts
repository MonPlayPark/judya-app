import { describe, expect, it } from 'vitest';
import { clearSample, isBlank, loadSample, tickDose, untickDose } from './actions';
import { NOW, sampleRoot } from './fixtures';
import { TODAY, rootWith } from './helpers.test-util';
import { addDays } from './calc';
import { dosesOn } from './schedule';
import { emptyRoot, rootSchema } from './schema';
import { daysLeft, houseStatus } from './stock';
import { todayDoses } from './today';
import { expiryStatus } from './calc';

describe('tick actions (root -> root)', () => {
  it('tickDose / untickDose change only prepLog and do not touch the input', () => {
    const root = rootWith({});
    const ticked = tickDose(root, TODAY, 'a1:morning');
    expect(ticked.prepLog).toEqual({ [TODAY]: { 'a1:morning': true } });
    expect(root.prepLog).toEqual({});
    expect(untickDose(ticked, TODAY, 'a1:morning').prepLog).toEqual({});
  });

  it('tickDose also drops tick marks older than 14 days', () => {
    const root = rootWith({ prepLog: { '2026-10-01': { k: true }, '2026-10-02': { k: true } } });
    expect(Object.keys(tickDose(root, TODAY, 'a1:morning').prepLog).sort()).toEqual(['2026-10-02', TODAY]);
  });
});

describe('sample data', () => {
  const sample = () => loadSample(emptyRoot(NOW), TODAY, NOW);

  it('is valid data, flagged meta.isSample', () => {
    const r = sample();
    expect(rootSchema.safeParse(r).success).toBe(true);
    expect(r.meta.isSample).toBe(true);
  });

  it('has 2 made-up members and 4 medicines named ยาตัวอย่าง ก/ข/ค/ง and 2 house medicines', () => {
    const r = sample();
    expect(r.persons).toHaveLength(2);
    expect(r.persons.every((p) => p.name.includes('ตัวอย่าง'))).toBe(true);
    expect(r.medications.map((m) => m.name)).toEqual(['ยาตัวอย่าง ก', 'ยาตัวอย่าง ข', 'ยาตัวอย่าง ค', 'ยาตัวอย่าง ง']);
    expect(r.assignments).toHaveLength(4);
    expect(r.houseItems).toHaveLength(2);
    expect(r.events.filter((e) => e.type === 'start')).toHaveLength(4);
  });

  it('covers daily, Mon/Wed/Fri, every 12 h for a 5-day course, and one self-managed medicine', () => {
    const r = sample();
    const kinds = r.assignments.map((a) => a.schedule);
    expect(kinds.some((s) => s.kind === 'meal' && s.days.kind === 'daily')).toBe(true);
    expect(kinds.some((s) => s.kind === 'meal' && s.days.kind === 'weekdays' && s.days.days.join() === '1,3,5')).toBe(true);
    expect(kinds.some((s) => s.kind === 'interval' && s.everyHours === 12 && s.course.kind === 'days' && s.course.days === 5)).toBe(true);
    const self = r.persons.filter((p) => p.selfManaged);
    expect(self).toHaveLength(1);
    expect(r.assignments.filter((a) => a.personId === self[0]!.id)).toHaveLength(1);
  });

  it('house medicines: one expires soon (with the default 15 days), one is fine', () => {
    const r = sample();
    const status = r.houseItems.map((h) => expiryStatus(h.expiry, TODAY, r.settings.expiryWarnDays).status);
    expect(status.sort()).toEqual(['ok', 'soon']);
    expect(r.houseItems.every((h) => houseStatus(h) !== 'untracked')).toBe(true);
  });

  it('dates follow today: the 5-day course starts today; the self-managed medicine is not in the tick list', () => {
    const r = sample();
    const course = r.assignments.find((a) => a.schedule.kind === 'interval')!;
    expect(dosesOn(course.schedule, TODAY)).toBe(2);
    expect(dosesOn(course.schedule, addDays(TODAY, 5))).toBe(0);
    const self = r.persons.find((p) => p.selfManaged)!;
    expect(todayDoses(r, TODAY).some((d) => d.personId === self.id)).toBe(false);
    expect(todayDoses(r, TODAY).length).toBeGreaterThan(0);
  });

  it('every medicine has a stock count the app can walk', () => {
    const r = sample();
    expect(r.assignments.every((a) => daysLeft(a, TODAY, r.events).status !== 'unknown')).toBe(true);
  });

  it('is not loaded on top of real data, and not twice', () => {
    const real = sampleRoot();
    expect(loadSample(real, TODAY, NOW)).toBe(real);
    const once = sample();
    expect(loadSample(once, TODAY, NOW)).toBe(once);
  });

  it('clearSample returns to a blank house but keeps settings and the creation time', () => {
    const r = sample();
    const cleared = clearSample({ ...r, settings: { ...r.settings, expiryWarnDays: 30 } });
    expect(isBlank(cleared)).toBe(true);
    expect(cleared.meta.isSample).toBeUndefined();
    expect(cleared.settings.expiryWarnDays).toBe(30);
    expect(cleared.meta.createdAt).toBe(r.meta.createdAt);
    expect(rootSchema.safeParse(cleared).success).toBe(true);
  });

  it('clearSample never deletes data that is not sample data', () => {
    const real = sampleRoot();
    expect(clearSample(real)).toBe(real);
  });
});
