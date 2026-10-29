// Made-up houses for the secret demo links of the v3 Home (#/n?demo=normal | alert | empty0 | empty1 | notoday | backup).
// Built in memory from the PR 1 fixtures; nothing here reads or writes storage. Made-up names only.
import { blankRootV3, sampleRootV3 } from './fixtures';
import type { Assignment, Root, Schedule } from './schema';

export const DEMO_NAMES = ['normal', 'alert', 'empty0', 'empty1', 'notoday', 'backup'] as const;
export type DemoName = (typeof DEMO_NAMES)[number];

export const isDemoName = (v: string | null): v is DemoName => v !== null && (DEMO_NAMES as readonly string[]).includes(v);

/** The demos run on the fixtures' own date, so every state looks the same on any day. */
export const DEMO_TODAY = '2026-10-28'; // a Wednesday
const RECENT_BACKUP = '2026-10-27T09:00:00+07:00';
const KEPT_PEOPLE = new Set(['p1', 'p2', 'p4']);

const NOON_AND_BEDTIME: Schedule = {
  kind: 'meal',
  slots: { noon: { pills: 1, meal: 'before' }, bedtime: { pills: 1 } },
  days: { kind: 'daily' },
};
const MONDAYS_ONLY: Schedule = { kind: 'meal', slots: { morning: { pills: 1, meal: 'after' } }, days: { kind: 'weekdays', days: [1] } };

/** Three members, plenty of stock, a recent backup: nothing to warn about. */
function normalRoot(): Root {
  const s = sampleRootV3();
  const assignments = s.assignments
    .filter((a) => KEPT_PEOPLE.has(a.personId))
    .map((a): Assignment => {
      switch (a.id) {
        case 'a1':
          return { ...a, stock: { kind: 'count', strips: 20, loose: 3, countedOn: DEMO_TODAY } };
        case 'a2':
          return { ...a, stock: { kind: 'count', strips: 10, loose: 0, countedOn: DEMO_TODAY } };
        case 'a3':
          return { ...a, stock: { kind: 'volume', ml: 600, countedOn: DEMO_TODAY } };
        case 'a5':
          return { ...a, schedule: NOON_AND_BEDTIME, stock: { kind: 'count', strips: 10, loose: 0, countedOn: DEMO_TODAY } };
        default:
          return a;
      }
    });
  const ids = new Set(assignments.map((a) => a.id));
  return {
    ...s,
    persons: s.persons.filter((p) => KEPT_PEOPLE.has(p.id)).map((p) => (p.id === 'p1' ? { ...p, selfManaged: false } : p)),
    assignments,
    events: s.events.filter((e) => ids.has(e.assignmentId)),
    prepLog: { [DEMO_TODAY]: { 'a1:morning': true } },
    meta: { ...s.meta, lastBackupAt: RECENT_BACKUP },
  };
}

/** Expired + out + low + expiring: four warnings, so the banner shows one and "+3 เรื่อง". */
function alertRoot(): Root {
  const n = normalRoot();
  return {
    ...n,
    assignments: n.assignments.map((a): Assignment => {
      if (a.id === 'a1') return { ...a, expiry: '2026-10-20' };
      if (a.id === 'a2') return { ...a, stock: { kind: 'count', strips: 0, loose: 7, countedOn: DEMO_TODAY } };
      if (a.id === 'a5') return { ...a, expiry: '2026-11-05' };
      return a;
    }),
    houseItems: n.houseItems.map((h) => (h.id === 'h1' && h.stock ? { ...h, stock: { ...h.stock, qty: 0 } } : h)),
  };
}

/** Medicines exist but none is taken today (Monday only; the demo day is a Wednesday). */
function noTodayRoot(): Root {
  const n = normalRoot();
  return { ...n, assignments: n.assignments.map((a) => ({ ...a, schedule: MONDAYS_ONLY })), prepLog: {} };
}

/** A member and no medicine yet. */
function emptyOneRoot(): Root {
  const b = blankRootV3();
  return {
    ...b,
    persons: [
      { id: 'p1', name: 'สมาชิก ก', relation: 'พ่อ', avatar: 'avatar-02', color: 'blue', selfManaged: false, allergies: { status: 'unknown' } },
    ],
  };
}

export function demoRoot(name: DemoName): Root {
  switch (name) {
    case 'normal':
      return normalRoot();
    case 'alert':
      return alertRoot();
    case 'empty0':
      return blankRootV3();
    case 'empty1':
      return emptyOneRoot();
    case 'notoday':
      return noTodayRoot();
    case 'backup': {
      const { lastBackupAt: _never, ...meta } = normalRoot().meta;
      return { ...normalRoot(), meta };
    }
  }
}
