import { describe, expect, it } from 'vitest';
import { clearSample, isBlank, loadSample, markBackedUp, setSettings, tickDose, untickDose } from './actions';
import { careItems } from './care';
import { assignment, dailyMeal, person } from './helpers.test-util';
import { listBadges } from './medView';
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

describe('markBackedUp', () => {
  it('sets meta.lastBackupAt and changes nothing else', () => {
    const root = rootWith({});
    const out = markBackedUp(root, '2026-10-18T20:40:00+07:00');
    expect(out.meta).toEqual({ ...root.meta, lastBackupAt: '2026-10-18T20:40:00+07:00' });
    expect({ ...out, meta: root.meta }).toEqual(root);
    expect(root.meta.lastBackupAt).toBeUndefined();
    expect(rootSchema.safeParse(out).success).toBe(true);
  });
});

describe('setSettings (example 6, today 2026-10-18)', () => {
  const T = '2026-10-18';
  const apply = (patch: Parameters<typeof setSettings>[1]) => {
    const r = setSettings(rootWith({}), patch);
    if (!r.ok) throw new Error(r.error);
    return r.root;
  };

  it('expiryWarnDays: 0 and 366 are refused, 15 and 30 pass (and 1, 365 are the edges)', () => {
    expect(setSettings(rootWith({}), { expiryWarnDays: 0 })).toEqual({ ok: false, error: 'invalid_expiry_days' });
    expect(setSettings(rootWith({}), { expiryWarnDays: 366 })).toEqual({ ok: false, error: 'invalid_expiry_days' });
    for (const n of [1, 15, 30, 365]) expect(apply({ expiryWarnDays: n }).settings.expiryWarnDays).toBe(n);
  });
  it('lowStockDays: 61 is refused, 0 too, 1 and 60 pass', () => {
    expect(setSettings(rootWith({}), { lowStockDays: 61 })).toEqual({ ok: false, error: 'invalid_low_stock_days' });
    expect(setSettings(rootWith({}), { lowStockDays: 0 })).toEqual({ ok: false, error: 'invalid_low_stock_days' });
    for (const n of [1, 7, 60]) expect(apply({ lowStockDays: n }).settings.lowStockDays).toBe(n);
  });
  it('only whole numbers: 1.5, NaN and Infinity are refused', () => {
    for (const n of [1.5, Number.NaN, Number.POSITIVE_INFINITY, -3]) {
      expect(setSettings(rootWith({}), { expiryWarnDays: n }).ok).toBe(false);
      expect(setSettings(rootWith({}), { lowStockDays: n }).ok).toBe(false);
    }
  });
  it('if one value is refused nothing is changed; a left-out value stays; the other settings stay', () => {
    const root = rootWith({});
    expect(setSettings(root, { expiryWarnDays: 30, lowStockDays: 99 }).ok).toBe(false);
    const out = apply({ lowStockDays: 14 });
    expect(out.settings).toEqual({ ...root.settings, lowStockDays: 14 });
    expect(root.settings.lowStockDays).toBe(7);
    expect(rootSchema.safeParse(apply({ expiryWarnDays: 30, lowStockDays: 14 })).success).toBe(true);
  });

  const withExpiring = (expiryWarnDays: number) => {
    const root = rootWith({
      persons: [person()],
      medications: [{ id: 'm1', name: 'Sample Med 5 mg', unit: 'เม็ด' }],
      assignments: [assignment({ schedule: dailyMeal({ morning: { pills: 1, meal: 'after' } }), expiry: '2026-11-01' })],
    });
    return apply2(root, expiryWarnDays);
  };
  const apply2 = (root: ReturnType<typeof rootWith>, days: number) => {
    const r = setSettings(root, { expiryWarnDays: days });
    if (!r.ok) throw new Error(r.error);
    return r.root;
  };

  it('after changing to 30 the home list shows the medicine expiring 2026-11-01 as "อีก 14 วัน"', () => {
    const root = withExpiring(30);
    expect(careItems(root, T).expirySoon.map((i) => i.right)).toEqual(['อีก 14 วัน']);
    expect(listBadges(root, root.assignments[0]!, T)).toContain('soon');
  });
  it('the new value is used at once: 7 days = not listed, 14 days = listed (the edge), 30 days = listed', () => {
    expect(careItems(withExpiring(7), T).expirySoon).toHaveLength(0);
    expect(listBadges(withExpiring(7), withExpiring(7).assignments[0]!, T)).not.toContain('soon');
    expect(careItems(withExpiring(14), T).expirySoon).toHaveLength(1);
    expect(careItems(withExpiring(13), T).expirySoon).toHaveLength(0);
  });
});
