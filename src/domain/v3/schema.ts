// JudYa data model, version 3 (docs/M4-GAP.md sections 4 and 5, PR 1). It lives next to the v2 model and shares
// no code with it, so v2 can be deleted later without touching this file. Dates are 'YYYY-MM-DD' (Thai time);
// timestamps are ISO 8601 with an offset.
import { z } from 'zod';

export const DATA_VERSION_V3 = 3 as const;

const id = z.string().min(1);
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');
const posInt = z.number().int().positive();
const nonNegInt = z.number().int().min(0);

/** 0.5 steps, e.g. pills per dose. */
const halfStep = (min: number, max: number) =>
  z
    .number()
    .min(min)
    .max(max)
    .refine((v) => Number.isInteger(v * 2), 'must be a multiple of 0.5');

// ---------- Person ----------

export const RELATIONS_V3 = ['ตัวฉัน', 'พ่อ', 'แม่', 'คู่สมรส', 'ลูก', 'ญาติ', 'อื่นๆ'] as const;
export const SELF_RELATION = 'ตัวฉัน' as const;
export const PERSON_COLORS = ['blue', 'green', 'yellow', 'gray'] as const;

/** File names of the 12 pictures in src/assets/visual/avatars (without extension). */
export const AVATAR_NAMES_V3 = [
  'avatar-01', 'avatar-02', 'avatar-03', 'avatar-04', 'avatar-05', 'avatar-06',
  'avatar-07', 'avatar-08', 'avatar-09', 'avatar-10', 'avatar-11', 'avatar-12',
] as const;

export const COVERAGE_TYPES = ['government', 'social', 'civil_servant', 'private', 'self_pay', 'other'] as const;

export const allergiesSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unknown') }).strict(),
  z.object({ status: z.literal('none_confirmed'), confirmedAt: isoDate }).strict(),
  z
    .object({
      status: z.literal('listed'),
      items: z.array(z.object({ drug: z.string().min(1).max(60), reaction: z.string().min(1).max(200) }).strict()).min(1),
    })
    .strict(),
]);

// strict(): no policy-number / ID-card-number field of any name is accepted.
export const coverageSchema = z
  .object({
    type: z.enum(COVERAGE_TYPES),
    company: z.string().min(1).max(60).optional(),
  })
  .strict()
  .refine((c) => c.company === undefined || c.type === 'private', {
    path: ['company'],
    message: 'company is only for type = private',
  });

/** Buddhist-era years the app accepts: 2400 up to this year. Read at validation time. */
const maxBirthYearBE = (): number => new Date().getFullYear() + 543;

export const personSchema = z.object({
  id,
  name: z.string().min(1).max(40),
  relation: z.enum(RELATIONS_V3),
  birthYearBE: z
    .number()
    .int()
    .min(2400)
    .refine((y) => y <= maxBirthYearBE(), 'birth year is in the future')
    .optional(), // year only, never a full birth date
  avatar: z.enum(AVATAR_NAMES_V3),
  color: z.enum(PERSON_COLORS),
  selfManaged: z.boolean(),
  allergies: allergiesSchema,
  coverage: coverageSchema.optional(),
  removedAt: isoDateTime.optional(),
});

// ---------- Medication ----------

export const MED_KINDS = ['tablet', 'capsule', 'liquid', 'cream', 'sachet', 'drops', 'other'] as const;
export const STRENGTH_UNITS = ['mg', 'mcg', 'g', '%', 'IU', 'mg/5 ml'] as const;

export const strengthSchema = z.object({ value: z.number().positive(), unit: z.enum(STRENGTH_UNITS) }).strict();

export const packSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }).strict(),
  z.object({ type: z.literal('strip'), perStrip: posInt }).strict(),
  z.object({ type: z.literal('box'), strips: posInt, perStrip: posInt }).strict(),
  z.object({ type: z.literal('container'), amount: z.number().positive(), unit: z.enum(['ml', 'g']) }).strict(),
  z.object({ type: z.literal('sachetBox'), sachets: posInt }).strict(),
]);

export type MedKind = (typeof MED_KINDS)[number];
export type Pack = z.infer<typeof packSchema>;

/** Loose kind <-> pack rule (see DECISIONS.md, M4 PR 1): every kind may have no pack; otherwise the pack must be
 * a shape that makes sense for the kind. Returns an error text, or null when fine. */
export function packProblem(kind: MedKind, pack: Pack): string | null {
  if (pack.type === 'none' || kind === 'other') return null;
  switch (kind) {
    case 'tablet':
    case 'capsule':
      return pack.type === 'strip' || pack.type === 'box' ? null : `${kind} uses none, strip or box`;
    case 'liquid':
      return pack.type === 'container' && pack.unit === 'ml' ? null : 'liquid uses a container in ml';
    case 'cream':
      return pack.type === 'container' && pack.unit === 'g' ? null : 'cream uses a container in g';
    case 'drops':
      return pack.type === 'container' ? null : 'drops uses a container';
    case 'sachet':
      return pack.type === 'sachetBox' ? null : 'sachet uses sachetBox';
  }
}

// One medicine name, shared by several people (prices hang here).
export const medicationSchema = z
  .object({
    id,
    name: z.string().min(2).max(60),
    kind: z.enum(MED_KINDS),
    strength: strengthSchema.optional(),
    pack: packSchema,
    unit: z.string().min(1).optional(), // display text kept from v2; may be derived from kind later
    suggestionId: z.string().optional(),
  })
  .superRefine((m, ctx) => {
    const problem = packProblem(m.kind, m.pack);
    if (problem) ctx.addIssue({ code: 'custom', path: ['pack'], message: problem });
  });

// ---------- Schedule (same shape as v2) ----------

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

// ---------- Assignment ----------

// count: amount on the morning of countedOn (the app subtracts doses itself). volume: same, in ml.
// tubes: cream / drops are counted by the tube and never deducted automatically.
export const stockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('count'), strips: nonNegInt, loose: halfStep(0, 9999), countedOn: isoDate }).strict(),
  z.object({ kind: z.literal('volume'), ml: z.number().min(0).max(99999), countedOn: isoDate }).strict(),
  z.object({ kind: z.literal('tubes'), opened: z.boolean(), spare: nonNegInt }).strict(),
]);

export const assignmentSchema = z.object({
  id,
  medicationId: id,
  personId: id,
  schedule: scheduleSchema,
  stock: stockSchema.nullable(),
  expiry: isoDate.optional(),
  sideEffects: z.string().max(500).optional(), // free text, kept per person's medicine
  note: z.string().optional(),
  status: z.enum(['active', 'stopped']),
  createdAt: isoDateTime,
});

/** Units in one strip for a `count` stock: strip / box = perStrip, sachetBox = sachets (a "strip" is then one box).
 * null = the pack has no strip size (none, container). */
export function unitsPerStrip(pack: Pack): number | null {
  switch (pack.type) {
    case 'strip':
    case 'box':
      return pack.perStrip;
    case 'sachetBox':
      return pack.sachets;
    case 'none':
    case 'container':
      return null;
  }
}

/** Does the stock fit the medicine? tablet / capsule / sachet = count; liquid = volume; cream / drops = tubes;
 * other = any. A count with strips needs a pack that has a strip size. Returns an error text, or null when fine. */
export function stockProblem(medication: Pick<Medication, 'kind' | 'pack'>, stock: Stock | null): string | null {
  if (!stock) return null;
  const { kind } = medication;
  const wanted =
    kind === 'tablet' || kind === 'capsule' || kind === 'sachet' ? 'count' : kind === 'liquid' ? 'volume' : kind === 'other' ? null : 'tubes';
  if (wanted !== null && stock.kind !== wanted) return `${kind} uses stock kind ${wanted}, not ${stock.kind}`;
  if (stock.kind === 'count' && stock.strips > 0 && unitsPerStrip(medication.pack) === null) {
    return 'stock has strips but the pack has no strip size';
  }
  return null;
}

// ---------- MedEvent (append-only history: start, adjust, stop, resume; there is no edit) ----------

export const STOP_REASONS = ['หมอสั่ง', 'แพ้ยา', 'ใช้ยาไม่ได้ / ผลข้างเคียง', 'อื่น ๆ'] as const; // list not final (DECISIONS.md)
export const ADJUST_REASONS = ['doctor', 'self_or_other'] as const;

// Snapshot = before / after values inside an event. Only the schedule is kept.
export const snapshotSchema = z.object({ schedule: scheduleSchema }).strict();
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

const eventBase = {
  id,
  assignmentId: id,
  effectiveOn: isoDate,
  at: isoDateTime,
  note: z.string().max(200).optional(),
};

export const medEventSchema = z.discriminatedUnion('type', [
  z.object({ ...eventBase, type: z.literal('start'), to: snapshotSchema }).strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('adjust'),
      reason: z.enum(ADJUST_REASONS),
      from: snapshotSchema,
      to: snapshotSchema,
    })
    .strict()
    .refine((e) => !sameJson(e.from.schedule, e.to.schedule), { path: ['to'], message: 'adjust: from and to must differ' }),
  z.object({ ...eventBase, type: z.literal('stop'), reason: z.enum(STOP_REASONS) }).strict(),
  z.object({ ...eventBase, type: z.literal('resume') }).strict(),
]);

// ---------- House items, shops (same shape as v2) ----------

export const houseItemSchema = z
  .object({
    id,
    name: z.string().min(2).max(60),
    stock: z.object({ qty: z.number().min(0), unit: z.string().min(1) }).optional(), // none = not counted, no low-stock reminder
    lowAt: z.number().min(0).optional(),
    expiry: isoDate.optional(),
    note: z.string().optional(),
    removedAt: isoDateTime.optional(),
  })
  .refine((h) => h.lowAt === undefined || h.stock !== undefined, {
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

// ---------- Price (no receipt, no photo) ----------

export const priceSchema = z
  .object({
    id,
    shopId: id,
    item: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('med'), medicationId: id }),
      z.object({ kind: z.literal('house'), houseItemId: id }),
    ]),
    price: z.number().positive(), // price of one sell unit (v2 field name kept)
    sellUnit: z.string().min(1),
    perSellUnit: z.number().positive().optional(), // house items: 1 when given
    date: isoDate,
  })
  .strict()
  .refine((p) => p.item.kind !== 'house' || p.perSellUnit === undefined || p.perSellUnit === 1, {
    path: ['perSellUnit'],
    message: 'house items always have perSellUnit = 1',
  });

// ---------- Order (new table) ----------

export const ORDER_STATUSES = ['waiting', 'partial', 'received', 'cancelled'] as const;

export const orderLineSchema = z
  .object({
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('assignment'), assignmentId: id }).strict(),
      z.object({ kind: z.literal('house'), houseItemId: id }).strict(),
      z.object({ kind: z.literal('free'), name: z.string().min(1).max(60) }).strict(),
    ]),
    qtyOrdered: z.number().positive(),
    sellUnit: z.string().min(1),
    perSellUnit: z.number().positive().optional(),
    unitPrice: z.number().min(0).optional(),
    qtyReceived: z.number().min(0),
    leftover: z.enum(['waiting', 'dropped']).nullable(),
    addToList: z.boolean().optional(),
  })
  .strict();

export const orderSchema = z
  .object({
    id,
    shopId: id,
    createdAt: isoDateTime,
    status: z.enum(ORDER_STATUSES),
    includeShipping: z.boolean(),
    lines: z.array(orderLineSchema), // no limit on lines (or on shops / orders)
    note: z.string().max(500).optional(),
  })
  .strict();

// ---------- Settings, root ----------

export const DEFAULT_SETTINGS_V3 = {
  expiryWarnDays: 15,
  lowStockDays: 14,
  orderTemplate: '',
  orderDays: 30,
  fontSize: 'normal',
} as const;

export const FONT_SIZES = ['normal', 'medium', 'large'] as const;

export const settingsSchema = z.object({
  expiryWarnDays: z.number().int().min(1).max(365),
  lowStockDays: z.number().positive().max(60).default(DEFAULT_SETTINGS_V3.lowStockDays),
  orderTemplate: z.string(), // variables {ร้าน} {รายการ}
  orderDays: z.number().int().min(7).max(90),
  fontSize: z.enum(FONT_SIZES).default(DEFAULT_SETTINGS_V3.fontSize),
});

// date -> doseKey -> true
export const prepLogSchema = z.record(isoDate, z.record(z.string(), z.literal(true)));

export const rootSchema = z
  .object({
    version: z.literal(DATA_VERSION_V3),
    persons: z.array(personSchema), // v2 table name kept
    medications: z.array(medicationSchema),
    assignments: z.array(assignmentSchema),
    events: z.array(medEventSchema), // v2 table name kept; append-only history
    houseItems: z.array(houseItemSchema),
    shops: z.array(shopSchema),
    prices: z.array(priceSchema),
    orders: z.array(orderSchema),
    settings: settingsSchema,
    prepLog: prepLogSchema,
    meta: z.object({
      createdAt: isoDateTime,
      lastBackupAt: isoDateTime.optional(),
      isSample: z.boolean().optional(),
    }),
  })
  .refine((r) => r.persons.filter((p) => p.relation === SELF_RELATION && p.removedAt === undefined).length <= 1, {
    path: ['persons'],
    message: 'at most one active person can be "ตัวฉัน"',
  })
  .superRefine((r, ctx) => {
    r.assignments.forEach((a, i) => {
      const medication = r.medications.find((m) => m.id === a.medicationId);
      const problem = medication ? stockProblem(medication, a.stock) : null;
      if (problem) ctx.addIssue({ code: 'custom', path: ['assignments', i, 'stock'], message: problem });
    });
  });

export type Person = z.infer<typeof personSchema>;
export type Allergies = z.infer<typeof allergiesSchema>;
export type Coverage = z.infer<typeof coverageSchema>;
export type Medication = z.infer<typeof medicationSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type Stock = z.infer<typeof stockSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type MedEvent = z.infer<typeof medEventSchema>;
export type HouseItem = z.infer<typeof houseItemSchema>;
export type Shop = z.infer<typeof shopSchema>;
export type Price = z.infer<typeof priceSchema>;
export type OrderLine = z.infer<typeof orderLineSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Root = z.infer<typeof rootSchema>;

/** A blank house: no people, no medicines. */
export function emptyRoot(nowIso: string): Root {
  return {
    version: DATA_VERSION_V3,
    persons: [],
    medications: [],
    assignments: [],
    events: [],
    houseItems: [],
    shops: [],
    prices: [],
    orders: [],
    settings: { ...DEFAULT_SETTINGS_V3 },
    prepLog: {},
    meta: { createdAt: nowIso },
  };
}
