import { describe, expect, it } from 'vitest';
import { blankRootV3, sampleRootV3 } from './fixtures';
import { rootSchema, type Root } from './schema';

/** Messages of every issue the root schema reports (empty when the root is fine). */
const problems = (r: unknown): string[] => {
  const res = rootSchema.safeParse(r);
  return res.success ? [] : res.error.issues.map((i) => i.message);
};

/** A deep copy that tests may change freely. */
const copy = (): Root => structuredClone(sampleRootV3());

describe('cross-table references: the made-up house is fine', () => {
  it('the sample house and a blank house pass', () => {
    expect(problems(sampleRootV3())).toEqual([]);
    expect(problems(blankRootV3())).toEqual([]);
  });
});

describe('cross-table references: a missing target is refused, naming the table and the id', () => {
  it('assignment -> medication', () => {
    const r = copy();
    r.assignments[0]!.medicationId = 'nope';
    expect(problems(r)).toEqual(['assignments "a1": medicationId "nope" is not in medications']);
  });

  it('assignment -> person', () => {
    const r = copy();
    r.assignments[1]!.personId = 'nope';
    expect(problems(r)).toEqual(['assignments "a2": personId "nope" is not in persons']);
  });

  it('event -> assignment', () => {
    const r = copy();
    r.events[0]!.assignmentId = 'nope';
    expect(problems(r)).toEqual([`events "${r.events[0]!.id}": assignmentId "nope" is not in assignments`]);
  });

  it('price -> shop', () => {
    const r = copy();
    r.prices[0]!.shopId = 'nope';
    expect(problems(r)).toEqual(['prices "pr1": shopId "nope" is not in shops']);
  });

  it('price -> medication (item.kind = med)', () => {
    const r = copy();
    r.prices[0]!.item = { kind: 'med', medicationId: 'nope' };
    expect(problems(r)).toEqual(['prices "pr1": item.medicationId "nope" is not in medications']);
  });

  it('price -> house item (item.kind = house)', () => {
    const r = copy();
    r.prices[2]!.item = { kind: 'house', houseItemId: 'nope' };
    expect(problems(r)).toEqual(['prices "pr3": item.houseItemId "nope" is not in houseItems']);
  });

  it('order -> shop', () => {
    const r = copy();
    r.orders[0]!.shopId = 'nope';
    expect(problems(r)).toEqual(['orders "o1": shopId "nope" is not in shops']);
  });

  it('order line (assignment) -> assignment', () => {
    const r = copy();
    r.orders[0]!.lines[0]!.source = { kind: 'assignment', assignmentId: 'nope' };
    expect(problems(r)).toEqual(['orders "o1" line 0: assignmentId "nope" is not in assignments']);
  });

  it('order line (house) -> house item', () => {
    const r = copy();
    r.orders[1]!.lines[1]!.source = { kind: 'house', houseItemId: 'nope' };
    expect(problems(r)).toEqual(['orders "o2" line 1: houseItemId "nope" is not in houseItems']);
  });

  it('every problem is reported, with a path to the row', () => {
    const r = copy();
    r.assignments[0]!.personId = 'x';
    r.prices[0]!.shopId = 'y';
    const res = rootSchema.safeParse(r);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.map((i) => i.path.join('.'))).toEqual(['assignments.0.personId', 'prices.0.shopId']);
    }
  });
});

describe('cross-table references: what is allowed', () => {
  it('a free order line points to nothing and is not checked', () => {
    const r = copy();
    r.orders[2]!.lines[0]!.source = { kind: 'free', name: 'ชื่อที่ไม่มีในตารางไหน' };
    expect(problems(r)).toEqual([]);
  });

  it('a removed person can still be referenced (history stays readable)', () => {
    const r = copy();
    r.persons.find((p) => p.id === 'p2')!.removedAt = '2026-10-28T09:00:00+07:00';
    expect(r.assignments.some((a) => a.personId === 'p2')).toBe(true);
    expect(problems(r)).toEqual([]);
  });

  it('a removed house item can still be referenced by prices and order lines', () => {
    const r = copy();
    r.houseItems.find((h) => h.id === 'h1')!.removedAt = '2026-10-28T09:00:00+07:00';
    expect(problems(r)).toEqual([]);
  });

  it('a stopped assignment can still be referenced by events and order lines', () => {
    const r = copy();
    expect(r.assignments.find((a) => a.id === 'a7')!.status).toBe('stopped');
    expect(r.events.some((e) => e.assignmentId === 'a7')).toBe(true);
    expect(problems(r)).toEqual([]);
  });
});

describe('cross-table references: the same id twice in one table is refused', () => {
  const tables = ['persons', 'medications', 'assignments', 'events', 'houseItems', 'shops', 'prices', 'orders'] as const;

  it.each(tables)('%s', (table) => {
    const r = copy();
    const rows = r[table] as { id: string }[];
    rows[1]!.id = rows[0]!.id;
    // Renaming an id can leave other rows pointing at the old id; only the duplicate message matters here.
    expect(problems(r)).toContain(`${table}: id "${rows[0]!.id}" is used more than once`);
  });

  it('the same id in two different tables is fine', () => {
    const r = copy();
    r.shops[0]!.id = 'p1'; // p1 is also a person
    r.prices.forEach((p) => { if (p.shopId === 's1') p.shopId = 'p1'; });
    r.orders.forEach((o) => { if (o.shopId === 's1') o.shopId = 'p1'; });
    expect(problems(r)).toEqual([]);
  });
});

describe('the stock rule and the reference rule together', () => {
  it('an unknown medicine is reported once, by the reference rule', () => {
    const r = copy();
    r.assignments[0]!.medicationId = 'nope';
    expect(problems(r)).toHaveLength(1);
  });
});
