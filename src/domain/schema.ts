// JudYa data model, version 2 (BRIEF section 2). Everything loaded from storage or imported from a
// backup file is checked with these schemas. Dates are 'YYYY-MM-DD' (Thai time); timestamps are
// ISO 8601 with an offset.
import { z } from 'zod';

export const DATA_VERSION = 2 as const;

const id = z.string().min(1);
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

/** 0.5 steps, e.g. pills per dose. */
const halfStep = (min: number, max: number) =>
  z
    .number()
    .min(min)
    .max(max)
    .refine((v) => Number.isInteger(v * 2), 'must be a multiple of 0.5');

export const RELATIONS = ['ตัวฉัน', 'พ่อ', 'แม่', 'คู่สมรส', 'ลูก', 'อื่น ๆ'] as const;
export const PERSON_COLORS = ['blue', 'green', 'yellow', 'gray'] as const;

export const personSchema = z.object({
  id,
  name: z.string().min(1).max(40),
  relation: z.enum(RELATIONS),
  birthYearBE: z.number().int().min(1000).max(9999).optional(), // 4 digits; the 2400..current-year rule is validate* in step 3.2
  color: z.enum(PERSON_COLORS),
  selfManaged: z.boolean(),
  insurance: z.object({ health: z.string().optional(), accident: z.string().optional() }),
  removedAt: isoDateTime.optional(),
});

// One medicine name + strength, shared by several people (prices hang here).
export const medicationSchema = z.object({
  id,
  name: z.string().min(2).max(60),
  unit: z.string().min(1),
  suggestionId: z.string().optional(),
});

const mealSlot = z.object({
  pills: halfStep(0.5, 4),
  meal: z.enum(['before', 'with', 'after']),
});
export const mealScheduleSchema = z.object({
  kind: z.literal('meal'),
  slots: z.object({
    morning: mealSlot.optional(),
    noon: mealSlot.optional(),
    evening: mealSlot.optional(),
    bedtime: z.object({ pills: halfStep(0.5, 4) }).optional(),
  }),
  days: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('daily') }),
    z.object({ kind: z.literal('alt'), anchor: isoDate }),
    z.object({ kind: z.literal('weekdays'), days: z.array(z.number().int().min(0).max(6)).min(1) }), // 0 = Sunday
  ]),
});
export const intervalScheduleSchema = z.object({
  kind: z.literal('interval'),
  everyHours: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(12), z.literal(24)]),
  firstTime: hhmm,
  pills: halfStep(0.5, 4),
  course: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('days'), days: z.number().int().min(1).max(90), startDate: isoDate }),
    z.object({ kind: z.literal('ongoing') }),
  ]),
});
export const scheduleSchema = z.discriminatedUnion('kind', [mealScheduleSchema, intervalScheduleSchema]);

// Q2: qty is the amount on the morning of countedOn; the app subtracts doses itself.
export const stockSchema = z.object({ qty: halfStep(0, 9999), countedOn: isoDate });

export const assignmentSchema = z.object({
  id,
  medicationId: id,
  personId: id,
  schedule: scheduleSchema,
  stock: stockSchema.nullable(),
  expiry: isoDate.optional(),
  note: z.string().optional(),
  status: z.enum(['active', 'stopped']),
  createdAt: isoDateTime,
});

export const EVENT_REASONS = ['หมอสั่ง', 'แพ้ยา', 'ใช้ยาไม่ได้ / ผลข้างเคียง', 'อื่น ๆ'] as const;

// Snapshot = before / after values inside an event (O1, decided by the owner; BRIEF section 2).
// Every field is optional; what is required depends on the event type (see medEventSchema).
export const snapshotSchema = z
  .object({
    schedule: scheduleSchema.optional(),
    name: z.string().min(2).max(60).optional(),
    stockQty: halfStep(0, 9999).nullable().optional(),
    expiry: isoDate.nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;

/** Deep equality for JSON values; object key order does not matter. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) => k in b && sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/** Keys that really carry a value (an explicit `undefined` does not count). */
const presentKeys = (s: Snapshot): string[] =>
  Object.entries(s)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k)
    .sort();

export const medEventSchema = z
  .object({
    id,
    assignmentId: id,
    type: z.enum(['start', 'adjust', 'stop', 'resume', 'edit']),
    effectiveOn: isoDate,
    at: isoDateTime,
    from: snapshotSchema.optional(),
    to: snapshotSchema.optional(),
    reason: z.enum(EVENT_REASONS).optional(),
    note: z.string().max(200).optional(),
  })
  .superRefine((e, ctx) => {
    const bad = (path: 'from' | 'to' | 'reason', message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

    if ((e.type === 'adjust' || e.type === 'stop') && e.reason === undefined) {
      bad('reason', 'reason is required for adjust and stop');
    }

    const from = e.from ? presentKeys(e.from) : null;
    const to = e.to ? presentKeys(e.to) : null;
    switch (e.type) {
      case 'start':
        if (e.from) bad('from', 'start has no from');
        if (!to || to.join() !== 'schedule') bad('to', 'start needs to = { schedule } only');
        break;
      case 'adjust':
        if (!from || from.join() !== 'schedule') bad('from', 'adjust needs from = { schedule } only');
        if (!to || to.join() !== 'schedule') bad('to', 'adjust needs to = { schedule } only');
        else if (e.from && e.to && sameJson(e.from.schedule, e.to.schedule)) bad('to', 'adjust: from and to must differ');
        break;
      case 'edit':
        if (!from || from.length === 0) bad('from', 'edit needs at least one changed field');
        else if (!to || to.join() !== from.join()) bad('to', 'edit: from and to must have the same keys');
        else if (e.from && e.to) {
          const f = e.from as Record<string, unknown>;
          const t = e.to as Record<string, unknown>;
          if (from.some((k) => sameJson(f[k], t[k]))) bad('to', 'edit: list only fields that changed');
        }
        break;
      case 'stop':
      case 'resume':
        if (e.from) bad('from', `${e.type} has no from`);
        if (e.to) bad('to', `${e.type} has no to`);
        break;
    }
  });

export const houseItemSchema = z.object({
  id,
  name: z.string().min(2).max(60),
  stock: z.object({ qty: z.number().min(0), unit: z.string().min(1) }).optional(), // none = not counted, no low-stock reminder
  lowAt: z.number().min(0).optional(),
  expiry: isoDate.optional(),
  note: z.string().optional(),
  removedAt: isoDateTime.optional(),
}).refine((h) => h.lowAt === undefined || h.stock !== undefined, {
  path: ['lowAt'],
  message: 'lowAt needs stock',
});

export const shopSchema = z.object({
  id,
  name: z.string().min(2).max(40),
  phone: z.string().regex(/^[0-9 +-]{6,20}$/).optional(),
  delivery: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('pickup') }),
    z.object({ kind: z.literal('deliver'), fee: z.number().min(0), freeOver: z.number().positive().optional() }),
  ]),
});

export const priceSchema = z
  .object({
    id,
    shopId: id,
    item: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('med'), medicationId: id }),
      z.object({ kind: z.literal('house'), houseItemId: id }),
    ]),
    price: z.number().positive(),
    sellUnit: z.string().min(1),
    perSellUnit: z.number().positive(), // house items: always 1
  })
  .refine((p) => p.item.kind !== 'house' || p.perSellUnit === 1, {
    path: ['perSellUnit'],
    message: 'house items always have perSellUnit = 1',
  });

export const DEFAULT_SETTINGS = {
  expiryWarnDays: 15,
  lowStockDays: 7, // Q5
  orderTemplate: '',
  orderDays: 30, // Q4
} as const;

export const settingsSchema = z.object({
  expiryWarnDays: z.number().int().min(1).max(365),
  lowStockDays: z.number().int().min(1).max(60),
  orderTemplate: z.string(), // variables {ร้าน} {รายการ}
  orderDays: z.number().int().min(7).max(90),
});

// date -> doseKey -> true
export const prepLogSchema = z.record(isoDate, z.record(z.string(), z.literal(true)));

export const rootSchema = z.object({
  version: z.literal(DATA_VERSION),
  persons: z.array(personSchema),
  medications: z.array(medicationSchema),
  assignments: z.array(assignmentSchema),
  events: z.array(medEventSchema), // append-only history
  houseItems: z.array(houseItemSchema),
  shops: z.array(shopSchema),
  prices: z.array(priceSchema),
  settings: settingsSchema,
  prepLog: prepLogSchema,
  meta: z.object({
    createdAt: isoDateTime,
    lastBackupAt: isoDateTime.optional(),
    isSample: z.boolean().optional(), // true = the whole house is the made-up sample set (can be cleared in one tap)
  }),
});

export type Person = z.infer<typeof personSchema>;
export type Medication = z.infer<typeof medicationSchema>;
export type MealSchedule = z.infer<typeof mealScheduleSchema>;
export type IntervalSchedule = z.infer<typeof intervalScheduleSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type MedEvent = z.infer<typeof medEventSchema>;
export type HouseItem = z.infer<typeof houseItemSchema>;
export type Shop = z.infer<typeof shopSchema>;
export type Price = z.infer<typeof priceSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Root = z.infer<typeof rootSchema>;

/** A blank house: no people, no medicines (Q12: first launch is an empty home). */
export function emptyRoot(nowIso: string): Root {
  return {
    version: DATA_VERSION,
    persons: [],
    medications: [],
    assignments: [],
    events: [],
    houseItems: [],
    shops: [],
    prices: [],
    settings: { ...DEFAULT_SETTINGS },
    prepLog: {},
    meta: { createdAt: nowIso },
  };
}
