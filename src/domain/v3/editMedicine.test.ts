import { describe, expect, it } from 'vitest';
import { DEMO_TODAY } from './homeDemo';
import { medsDemoRoot } from './medsListDemo';
import {
  applyEdit,
  changeKind,
  changedFields,
  draftFromCurrent,
  editContext,
  evaluateEdit,
  houseUnitOptions,
  isCrossGroup,
  leftLine,
  needsConfirm,
  resetForKind,
  type EditDraft,
  type EditTarget,
} from './editMedicine';
import { rootSchema, type Root } from './schema';

const TODAY = DEMO_TODAY; // 2026-10-28
const VIT: EditTarget = { type: 'personal', assignmentId: 'a4' }; // dad's VitaminD: box 3 x 10, 5 strips + 3 loose = 53 pills, 2 a day
const AMLO: EditTarget = { type: 'personal', assignmentId: 'a3' }; // Amlodipine, no pack, 38 loose; also used (stopped) by mum
const PARA: EditTarget = { type: 'house', houseItemId: 'h5' }; // 4 แผง

const root = (): Root => medsDemoRoot('normal');
const draftOf = (r: Root, t: EditTarget): EditDraft => {
  const d = draftFromCurrent(r, t, TODAY);
  if (!d) throw new Error('no draft');
  return d;
};
const withSize = (d: EditDraft, patch: Partial<EditDraft['stock']['size']>): EditDraft => ({ ...d, stock: { ...d.stock, size: { ...d.stock.size, ...patch } } });
const withCounts = (d: EditDraft, patch: Partial<EditDraft['stock']['counts']>): EditDraft => ({ ...d, stock: { ...d.stock, counts: { ...d.stock.counts, ...patch } } });
const must = (r: ReturnType<typeof applyEdit>): Root => {
  if (!r.ok) throw new Error(r.error);
  return r.root;
};

describe('draftFromCurrent (personal)', () => {
  it('fills every field from the saved data', () => {
    const d = draftOf(root(), VIT);
    expect(d.name).toBe('VitaminD');
    expect(d.kind).toBe('tablet');
    expect(d.strength).toEqual({ value: '1000', unit: 'IU' });
    expect(d.stock.buy).toBe('box');
    expect(d.stock.size.perStrip).toBe('10');
    expect(d.stock.size.stripsPerBox).toBe('3');
    expect(d.stock.counts).toMatchObject({ boxes: '1', strips: '2', loose: '3' }); // 5 strips = 1 box + 2 strips
    expect(d.expiry).toBe('2027-03-15');
  });

  it('shows what is there NOW, not what was counted on the counting day', () => {
    const r = root();
    r.assignments = r.assignments.map((a) => (a.id === 'a4' ? { ...a, stock: { kind: 'count', strips: 5, loose: 3, countedOn: '2026-10-26' } } : a));
    // two days at 2 a day have gone: 53 - 4 = 49 = 1 box + 1 strip + 9 loose
    expect(draftOf(r, VIT).stock.counts).toMatchObject({ boxes: '1', strips: '1', loose: '9' });
  });

  it('a medicine with no pack but a count is counted in loose pieces; no stock is "ไม่นับสต็อก"', () => {
    const d = draftOf(root(), AMLO);
    expect(d.stock.buy).toBe('loose');
    expect(d.stock.counts.loose).toBe('38');
    const r = root();
    r.assignments = r.assignments.map((a) => (a.id === 'a3' ? { ...a, stock: null } : a));
    expect(draftOf(r, AMLO).stock.buy).toBe('none');
  });

  it('a cream is counted by the tube', () => {
    const d = draftOf(medsDemoRoot('cream'), { type: 'personal', assignmentId: 'a9' });
    expect(d.stock.buy).toBe('tube');
    expect(d.stock.size.amount).toBe('15');
    expect(d.stock.counts.total).toBe('3'); // 1 open + 2 spare
  });

  it('returns null for a medicine that is not there', () => {
    expect(draftFromCurrent(root(), { type: 'personal', assignmentId: 'zzz' }, TODAY)).toBeNull();
    expect(draftFromCurrent(root(), { type: 'house', houseItemId: 'zzz' }, TODAY)).toBeNull();
    expect(draftFromCurrent(root(), { type: 'house', houseItemId: 'h6' }, TODAY)).toBeNull(); // deleted
  });
});

describe('changedFields / needsConfirm', () => {
  const r = root();
  const orig = draftOf(r, VIT);

  it('nothing changed = nothing listed', () => {
    expect(changedFields(orig, draftOf(r, VIT))).toEqual([]);
    expect(needsConfirm(orig, orig)).toBe(false);
  });

  it('name, strength and expiry save at once (no confirm sheet)', () => {
    const d = { ...orig, name: 'VitaminD3', strength: { value: '2000', unit: 'IU' as const }, expiry: '' };
    expect(changedFields(orig, d)).toEqual(['name', 'strength', 'expiry']);
    expect(needsConfirm(orig, d)).toBe(false);
  });

  it('typing the same number in another way is not a change; spaces around a name are not a change', () => {
    expect(changedFields(orig, withSize({ ...orig, name: ' VitaminD ' }, { perStrip: '10.0' }))).toEqual([]);
  });

  it('buy-as, pack size and counts ask for the confirm sheet', () => {
    expect(changedFields(orig, withSize(orig, { perStrip: '14' }))).toEqual(['pack']);
    expect(needsConfirm(orig, withSize(orig, { perStrip: '14' }))).toBe(true);
    expect(changedFields(orig, withCounts(orig, { loose: '4' }))).toEqual(['count']);
    expect(needsConfirm(orig, withCounts(orig, { loose: '4' }))).toBe(true);
    const strip: EditDraft = { ...orig, stock: { ...orig.stock, buy: 'strip' } };
    expect(changedFields(orig, strip)).toContain('buy');
    expect(needsConfirm(orig, strip)).toBe(true);
  });

  it('the unit of the strength does not count while the number is empty', () => {
    const none = { ...orig, strength: { value: '', unit: 'mg' as const } };
    expect(changedFields(none, { ...none, strength: { value: '', unit: 'g' } })).toEqual([]);
  });

  it('tablet <-> capsule is the same group (no sheet); tablet -> liquid is not', () => {
    expect(isCrossGroup('tablet', 'capsule')).toBe(false);
    expect(isCrossGroup('cream', 'drops')).toBe(false);
    expect(isCrossGroup('tablet', 'liquid')).toBe(true);
    expect(isCrossGroup('sachet', 'other')).toBe(true);
    const caps = changeKind(orig, 'capsule');
    expect(changedFields(orig, caps)).toEqual(['kind']);
    expect(needsConfirm(orig, caps)).toBe(false);
    expect(needsConfirm(orig, resetForKind(orig, 'liquid'))).toBe(true);
  });
});

describe('resetForKind', () => {
  it('clears pack and counts and sets the default "buy as" of the new group', () => {
    const orig = draftOf(root(), VIT);
    const liq = resetForKind(orig, 'liquid');
    expect(liq.kind).toBe('liquid');
    expect(liq.stock.buy).toBe('container');
    expect(Object.values(liq.stock.size).every((v) => v === '')).toBe(true);
    expect(Object.values(liq.stock.counts).every((v) => v === '')).toBe(true);
    expect(liq.name).toBe('VitaminD');
    expect(liq.expiry).toBe('2027-03-15');
    expect(resetForKind(orig, 'sachet').stock.buy).toBe('sachetBox');
    expect(resetForKind(orig, 'cream').stock.buy).toBe('tube');
    expect(resetForKind(orig, 'other').stock.buy).toBe('loose');
  });

  it('an empty strength takes the default unit of the new kind', () => {
    const orig = { ...draftOf(root(), VIT), strength: { value: '', unit: 'mg' as const } };
    expect(resetForKind(orig, 'liquid').strength.unit).toBe('mg/5 ml');
    expect(changeKind(orig, 'capsule').strength.unit).toBe('mg');
  });

  it('house: the unit of the new group, nothing counted yet', () => {
    const orig = draftOf(root(), PARA);
    const liq = resetForKind(orig, 'liquid');
    expect(liq.house).toEqual({ unit: 'มล.', qty: '' });
  });
});

describe('evaluateEdit', () => {
  it('shows the pack line, the total and the days from the current schedule', () => {
    const r = root();
    const orig = draftOf(r, VIT);
    const e0 = evaluateEdit(r, VIT, orig, TODAY);
    expect(e0.packLine).toBe('1 กล่อง = 3 แผง = 30 เม็ด');
    expect(e0.totalText).toBe('ตอนนี้มีรวม 53 เม็ด');
    expect(e0.daysText).toBe('พอใช้ประมาณ 26 วัน');
    expect(e0.blocker).toBe('ยังไม่ได้แก้อะไร');
    const e1 = evaluateEdit(r, VIT, withSize(orig, { perStrip: '14' }), TODAY);
    expect(e1.packLine).toBe('1 กล่อง = 3 แผง = 42 เม็ด');
    expect(e1.totalText).toBe('ตอนนี้มีรวม 73 เม็ด');
    expect(e1.daysText).toBe('พอใช้ประมาณ 36 วัน');
    expect(e1.blocker).toBeNull();
    expect(e1.confirm).toBe(true);
  });

  it('confirm rows, in order, only for what changed (board #25)', () => {
    const r = root();
    const orig = draftOf(r, VIT);
    const rows = evaluateEdit(r, VIT, withSize(orig, { perStrip: '14' }), TODAY).rows;
    expect(rows).toEqual([
      { label: 'ขนาดบรรจุ', before: '1 กล่อง = 3 แผง = 30 เม็ด', after: '1 กล่อง = 3 แผง = 42 เม็ด' },
      { label: 'จำนวนที่มีรวม', before: '53 เม็ด', after: '73 เม็ด' },
      { label: 'พอใช้ประมาณ', before: '26 วัน', after: '36 วัน' },
    ]);
    const buy = evaluateEdit(r, VIT, { ...orig, stock: { ...orig.stock, buy: 'strip' } }, TODAY).rows;
    expect(buy[0]).toEqual({ label: 'ซื้อมาเป็น', before: 'กล่อง', after: 'แผง' });
  });

  it('a count change alone gives the total and the days, nothing else', () => {
    const r = root();
    const rows = evaluateEdit(r, VIT, withCounts(draftOf(r, VIT), { loose: '5' }), TODAY).rows;
    expect(rows.map((x) => x.label)).toEqual(['จำนวนที่มีรวม', 'พอใช้ประมาณ']);
    expect(rows[0]).toMatchObject({ before: '53 เม็ด', after: '55 เม็ด' });
  });

  it('a required pack box that is empty blocks saving and names the box', () => {
    const r = root();
    const e = evaluateEdit(r, VIT, withSize(draftOf(r, VIT), { stripsPerBox: '' }), TODAY);
    expect(e.blocker).toBe('กรอกข้อมูลที่จำเป็นให้ครบก่อน');
    expect(e.missing).toEqual(['stripsPerBox']);
    expect(e.packWarning).toBe('ต้องกรอก “จำนวนแผงต่อกล่อง” ก่อนถึงจะบันทึกได้ แอพไม่เดาตัวเลขให้');
    expect(e.packLine).toBeNull();
  });

  it('an empty or too short name blocks saving', () => {
    const r = root();
    expect(evaluateEdit(r, VIT, { ...draftOf(r, VIT), name: '  ' }, TODAY)).toMatchObject({ nameError: 'ต้องกรอกช่องนี้', blocker: 'กรอกข้อมูลที่จำเป็นให้ครบก่อน' });
    expect(evaluateEdit(r, VIT, { ...draftOf(r, VIT), name: 'A' }, TODAY).nameError).toBe('ชื่อยาต้องมีอย่างน้อย 2 ตัวอักษร');
  });

  it('a wrong strength blocks saving', () => {
    const r = root();
    const e = evaluateEdit(r, VIT, { ...draftOf(r, VIT), strength: { value: 'abc', unit: 'mg' } }, TODAY);
    expect(e.strengthBad).toBe(true);
    expect(e.blocker).toBe('กรอกข้อมูลที่จำเป็นให้ครบก่อน');
  });

  it('"ไม่นับสต็อก" has no total and no days', () => {
    const r = root();
    const orig = draftOf(r, VIT);
    const e = evaluateEdit(r, VIT, { ...orig, stock: { ...orig.stock, buy: 'none' } }, TODAY);
    expect(e.totalText).toBeNull();
    expect(e.daysText).toBeNull();
    expect(e.blocker).toBeNull();
    expect(e.rows[0]).toEqual({ label: 'ซื้อมาเป็น', before: 'กล่อง', after: 'ไม่นับสต็อก' });
  });

  it('same name on another medicine of the same person: a yellow note, but saving is allowed', () => {
    const r = root();
    const e = evaluateEdit(r, VIT, { ...draftOf(r, VIT), name: ' simva statin ' }, TODAY);
    expect(e.duplicateNote).toBe('มียาชื่อนี้ของ คุณพ่อ อยู่แล้ว');
    expect(e.blocker).toBeNull();
    // the medicine of another person is not a clash
    expect(evaluateEdit(r, VIT, { ...draftOf(r, VIT), name: 'Losartan' }, TODAY).duplicateNote).toBeNull();
  });

  it('notes for a medicine other people use (rule a)', () => {
    const r = root();
    const e = evaluateEdit(r, AMLO, { ...draftOf(r, AMLO), name: 'Amlodipine X' }, TODAY);
    expect(e.sharedPackNote).toBe('ยานี้ใช้ร่วมกับ คุณแม่ ชื่อ ชนิด ความแรง และขนาดบรรจุจะเปลี่ยนของทุกคน');
    expect(e.sharedStockNote).toBe('จำนวนที่มีและวันหมดอายุ แก้เฉพาะของ คุณพ่อ');
    const alone = evaluateEdit(r, VIT, draftOf(r, VIT), TODAY);
    expect(alone.sharedPackNote).toBeNull();
    expect(alone.sharedStockNote).toBeNull();
  });
});

describe('applyEdit (personal)', () => {
  it('a typo fix changes the medicine, keeps the count day, and writes NO event', () => {
    const r = root();
    const d = { ...draftOf(r, VIT), name: 'Vitamin D3', expiry: '2027-04-01' };
    const next = must(applyEdit(r, VIT, d, TODAY));
    expect(next.medications.find((m) => m.id === 'm4')?.name).toBe('Vitamin D3');
    const a = next.assignments.find((x) => x.id === 'a4');
    expect(a?.expiry).toBe('2027-04-01');
    expect(a?.stock).toEqual(r.assignments.find((x) => x.id === 'a4')?.stock);
    expect(next.events).toEqual(r.events);
    expect(rootSchema.safeParse(next).success).toBe(true);
    expect(r.medications.find((m) => m.id === 'm4')?.name).toBe('VitaminD'); // the old root is not changed
  });

  it('clearing the expiry removes it; clearing the strength removes it', () => {
    const r = root();
    const next = must(applyEdit(r, VIT, { ...draftOf(r, VIT), expiry: '', strength: { value: '', unit: 'IU' } }, TODAY));
    expect(next.assignments.find((x) => x.id === 'a4')?.expiry).toBeUndefined();
    expect(next.medications.find((m) => m.id === 'm4')?.strength).toBeUndefined();
  });

  it('a new pack size re-reads the typed counts and counts them again today (rule d)', () => {
    const r = root();
    const next = must(applyEdit(r, VIT, withSize(draftOf(r, VIT), { perStrip: '14' }), TODAY));
    expect(next.medications.find((m) => m.id === 'm4')?.pack).toEqual({ type: 'box', strips: 3, perStrip: 14 });
    expect(next.assignments.find((x) => x.id === 'a4')?.stock).toEqual({ kind: 'count', strips: 5, loose: 3, countedOn: TODAY }); // 73 pills
    expect(next.events).toEqual(r.events);
  });

  it('a typed count replaces the stock with today as the count day', () => {
    const r = root();
    const next = must(applyEdit(r, VIT, withCounts(draftOf(r, VIT), { boxes: '2', strips: '0', loose: '0' }), TODAY));
    expect(next.assignments.find((x) => x.id === 'a4')?.stock).toEqual({ kind: 'count', strips: 6, loose: 0, countedOn: TODAY });
  });

  it('"ไม่นับสต็อก" makes the stock null and the pack none', () => {
    const r = root();
    const orig = draftOf(r, VIT);
    const next = must(applyEdit(r, VIT, { ...orig, stock: { ...orig.stock, buy: 'none' } }, TODAY));
    expect(next.assignments.find((x) => x.id === 'a4')?.stock).toBeNull();
    expect(next.medications.find((m) => m.id === 'm4')?.pack).toEqual({ type: 'none' });
  });

  it('refuses a draft with a missing required box, a bad name, or no change', () => {
    const r = root();
    expect(applyEdit(r, VIT, withSize(draftOf(r, VIT), { perStrip: '' }), TODAY).ok).toBe(false);
    expect(applyEdit(r, VIT, { ...draftOf(r, VIT), name: '' }, TODAY).ok).toBe(false);
    expect(applyEdit(r, VIT, { ...draftOf(r, VIT), strength: { value: '0', unit: 'mg' } }, TODAY).ok).toBe(false);
    expect(applyEdit(r, VIT, draftOf(r, VIT), TODAY)).toEqual({ ok: false, error: 'ยังไม่ได้แก้อะไร' });
    expect(applyEdit(r, { type: 'personal', assignmentId: 'zzz' }, draftOf(r, VIT), TODAY).ok).toBe(false);
  });

  it('a duplicate name is saved (only a note was shown)', () => {
    const r = root();
    const next = must(applyEdit(r, VIT, { ...draftOf(r, VIT), name: 'Simvastatin' }, TODAY));
    expect(next.medications.filter((m) => m.name === 'Simvastatin')).toHaveLength(2);
  });

  it('tablet -> capsule changes the kind and keeps the stock', () => {
    const r = root();
    const next = must(applyEdit(r, VIT, changeKind(draftOf(r, VIT), 'capsule'), TODAY));
    expect(next.medications.find((m) => m.id === 'm4')?.kind).toBe('capsule');
    expect(next.assignments.find((x) => x.id === 'a4')?.stock).toEqual(r.assignments.find((x) => x.id === 'a4')?.stock);
  });
});

describe('shared medicine (rules a, b, c)', () => {
  /** Amlodipine in strips of 10: dad has 2 strips + 1, mum (stopped) has 1 strip + 5. */
  const shared = (): Root => {
    const r = root();
    r.medications = r.medications.map((m) => (m.id === 'm3' ? { ...m, pack: { type: 'strip', perStrip: 10 } } : m));
    r.assignments = r.assignments.map((a) =>
      a.id === 'a3'
        ? { ...a, stock: { kind: 'count', strips: 2, loose: 1, countedOn: TODAY } }
        : a.id === 'a8'
          ? { ...a, stock: { kind: 'count', strips: 1, loose: 5, countedOn: '2026-09-01' } }
          : a,
    );
    return r;
  };

  it('editContext lists who else uses it (stopped counts too)', () => {
    const c = editContext(shared(), AMLO);
    expect(c?.sharedWith).toEqual(['คุณแม่']);
    expect(c?.owner?.name).toBe('คุณพ่อ');
    expect(editContext(root(), VIT)?.sharedWith).toEqual([]);
    expect(editContext(root(), PARA)?.owner).toBeNull();
  });

  it('another person keeps the same TOTAL pieces when the strip size changes (rule b)', () => {
    const r = shared();
    const next = must(applyEdit(r, AMLO, withSize(draftOf(r, AMLO), { perStrip: '14' }), TODAY));
    expect(next.medications.find((m) => m.id === 'm3')?.pack).toEqual({ type: 'strip', perStrip: 14 });
    // mum: 1 x 10 + 5 = 15 pieces -> 1 strip of 14 + 1; the count day stays
    expect(next.assignments.find((x) => x.id === 'a8')?.stock).toEqual({ kind: 'count', strips: 1, loose: 1, countedOn: '2026-09-01' });
    // dad typed his own count again: 2 strips + 1, read with the new size
    expect(next.assignments.find((x) => x.id === 'a3')?.stock).toEqual({ kind: 'count', strips: 2, loose: 1, countedOn: TODAY });
    expect(rootSchema.safeParse(next).success).toBe(true);
  });

  it("changing only the name leaves the other person's stock alone", () => {
    const r = shared();
    const next = must(applyEdit(r, AMLO, { ...draftOf(r, AMLO), name: 'Amlodipine B' }, TODAY));
    expect(next.assignments.find((x) => x.id === 'a8')?.stock).toEqual(r.assignments.find((x) => x.id === 'a8')?.stock);
    expect(next.medications.find((m) => m.id === 'm3')?.name).toBe('Amlodipine B');
  });

  it('a cross-group kind change is refused while another person uses the medicine', () => {
    const r = root();
    const d = resetForKind(draftOf(r, AMLO), 'liquid');
    const res = applyEdit(r, AMLO, { ...d, stock: { ...d.stock, size: { ...d.stock.size, amount: '60' } } }, TODAY);
    expect(res).toEqual({ ok: false, error: 'ยานี้มีคนอื่นใช้ด้วย เปลี่ยนชนิดข้ามกลุ่มไม่ได้ ถ้าใส่ผิดให้เพิ่มยาใหม่แทน' });
    expect(editContext(r, AMLO)?.crossGroupAllowed).toBe(false);
    expect(editContext(r, VIT)?.crossGroupAllowed).toBe(true);
  });

  it('a cross-group kind change on a medicine nobody else uses replaces pack and stock', () => {
    const r = root();
    const d = resetForKind(draftOf(r, VIT), 'sachet');
    // pack not filled yet: blocked
    expect(applyEdit(r, VIT, d, TODAY).ok).toBe(false);
    const filled = withCounts(withSize(d, { sachetsPerBox: '30' }), { boxes: '1', loose: '5' });
    const next = must(applyEdit(r, VIT, filled, TODAY));
    expect(next.medications.find((x) => x.id === 'm4')).toMatchObject({ kind: 'sachet', pack: { type: 'sachetBox', sachets: 30 } });
    expect(next.assignments.find((x) => x.id === 'a4')?.stock).toEqual({ kind: 'count', strips: 1, loose: 5, countedOn: TODAY });
    // typed nothing = not counted
    const empty = must(applyEdit(r, VIT, withSize(d, { sachetsPerBox: '30' }), TODAY));
    expect(empty.assignments.find((x) => x.id === 'a4')?.stock).toBeNull();
    expect(next.events).toEqual(r.events);
  });

  it('a dose that does not fit the new kind blocks the change and says to change how to take first', () => {
    const r = root();
    const d = withSize(resetForKind(draftOf(r, VIT), 'liquid'), { amount: '60' }); // 1 pill per time is not a liquid dose
    const e = evaluateEdit(r, VIT, d, TODAY);
    expect(e.doseNote).toBe('วิธีกินเดิมใช้หน่วยของชนิดเดิม ต้องปรับวิธีกินก่อนถึงจะเปลี่ยนเป็นชนิดนี้ได้');
    expect(e.blocker).toBe('กรอกข้อมูลที่จำเป็นให้ครบก่อน');
    expect(applyEdit(r, VIT, d, TODAY)).toEqual({ ok: false, error: 'วิธีกินเดิมใช้หน่วยของชนิดเดิม ต้องปรับวิธีกินก่อนถึงจะเปลี่ยนเป็นชนิดนี้ได้' });
    expect(evaluateEdit(r, VIT, draftOf(r, VIT), TODAY).doseNote).toBeNull();
  });
});

describe('house medicine', () => {
  it('draft: the unit it is counted in and the number', () => {
    const d = draftOf(root(), PARA);
    expect(d.name).toBe('พาราเซตามอล 500 mg');
    expect(d.kind).toBe('tablet');
    expect(d.house).toEqual({ unit: 'แผง', qty: '4' });
    expect(draftOf(root(), { type: 'house', houseItemId: 'h4' }).house).toEqual({ unit: null, qty: '' });
  });

  it('unit choices: the kind\'s own unit first, and the saved one even if unusual', () => {
    expect(houseUnitOptions('tablet', 'แผง')).toEqual(['เม็ด', 'แผง', 'กล่อง', 'ขวด']);
    expect(houseUnitOptions('other', 'ตลับ')).toEqual(['ชิ้น', 'ตลับ']);
    expect(houseUnitOptions('cream', null)).toEqual(['หลอด', 'ขวด']);
  });

  it('count and unit changes ask for the confirm sheet; the rows say old and new', () => {
    const r = root();
    const orig = draftOf(r, PARA);
    const up = { ...orig, house: { unit: 'แผง', qty: '5' } };
    expect(changedFields(orig, up)).toEqual(['count']);
    expect(needsConfirm(orig, up)).toBe(true);
    const e = evaluateEdit(r, PARA, up, TODAY);
    expect(e.rows).toEqual([{ label: 'จำนวนที่มีรวม', before: '4 แผง', after: '5 แผง' }]);
    expect(e.totalText).toBe('ตอนนี้มีรวม 5 แผง');
    expect(e.daysText).toBeNull();
    const unit = { ...orig, house: { unit: 'เม็ด', qty: '4' } };
    expect(changedFields(orig, unit)).toEqual(['buy']);
    expect(evaluateEdit(r, PARA, unit, TODAY).rows[0]).toEqual({ label: 'นับเป็น', before: 'แผง', after: 'เม็ด' });
    expect(changedFields(orig, { ...orig, name: 'พารา' })).toEqual(['name']);
    expect(needsConfirm(orig, { ...orig, name: 'พารา' })).toBe(false);
  });

  it('saves name, strength, expiry and the count; writes no event', () => {
    const r = root();
    const d = { ...draftOf(r, PARA), name: 'พาราเซตามอล', strength: { value: '500', unit: 'mg' as const }, expiry: '2027-01-31', house: { unit: 'แผง', qty: '6' } };
    const next = must(applyEdit(r, PARA, d, TODAY));
    const h = next.houseItems.find((x) => x.id === 'h5');
    expect(h).toMatchObject({ name: 'พาราเซตามอล', kind: 'tablet', strength: { value: 500, unit: 'mg' }, stock: { qty: 6, unit: 'แผง' }, expiry: '2027-01-31', lowAt: 1 });
    expect(next.events).toEqual(r.events);
    expect(rootSchema.safeParse(next).success).toBe(true);
  });

  it('"ไม่นับสต็อก" or an empty number removes the count and the low mark', () => {
    const r = root();
    const none = must(applyEdit(r, PARA, { ...draftOf(r, PARA), house: { unit: null, qty: '4' } }, TODAY));
    expect(none.houseItems.find((x) => x.id === 'h5')?.stock).toBeUndefined();
    expect(none.houseItems.find((x) => x.id === 'h5')?.lowAt).toBeUndefined();
    const blank = must(applyEdit(r, PARA, { ...draftOf(r, PARA), house: { unit: 'แผง', qty: '' } }, TODAY));
    expect(blank.houseItems.find((x) => x.id === 'h5')?.stock).toBeUndefined();
  });

  it('a bad number is refused; the low mark is dropped when the unit changes', () => {
    const r = root();
    expect(applyEdit(r, PARA, { ...draftOf(r, PARA), house: { unit: 'แผง', qty: 'abc' } }, TODAY).ok).toBe(false);
    expect(evaluateEdit(r, PARA, { ...draftOf(r, PARA), house: { unit: 'แผง', qty: 'abc' } }, TODAY).blocker).toBe('กรอกข้อมูลที่จำเป็นให้ครบก่อน');
    const next = must(applyEdit(r, PARA, { ...draftOf(r, PARA), house: { unit: 'เม็ด', qty: '40' } }, TODAY));
    expect(next.houseItems.find((x) => x.id === 'h5')?.lowAt).toBeUndefined();
  });

  it('a cross-group kind change is always allowed for a house medicine', () => {
    const r = root();
    expect(editContext(r, PARA)?.crossGroupAllowed).toBe(true);
    const d = { ...resetForKind(draftOf(r, PARA), 'liquid'), house: { unit: 'มล.', qty: '120' } };
    const next = must(applyEdit(r, PARA, d, TODAY));
    expect(next.houseItems.find((x) => x.id === 'h5')).toMatchObject({ kind: 'liquid', stock: { qty: 120, unit: 'มล.' } });
  });

  it('same name as another house medicine: a note, still saved', () => {
    const r = root();
    const d = { ...draftOf(r, PARA), name: 'ยาธาตุ น้ำขาว' };
    expect(evaluateEdit(r, PARA, d, TODAY).duplicateNote).toBe('มียาสามัญชื่อนี้อยู่แล้ว');
    expect(applyEdit(r, PARA, d, TODAY).ok).toBe(true);
  });

  it('house medicine with no counted stock: editing the name keeps it uncounted', () => {
    const r = root();
    const t: EditTarget = { type: 'house', houseItemId: 'h4' };
    const next = must(applyEdit(r, t, { ...draftOf(r, t), name: 'ยาทาผื่นคัน' }, TODAY));
    expect(next.houseItems.find((x) => x.id === 'h4')).toMatchObject({ name: 'ยาทาผื่นคัน', kind: 'cream' });
    expect(next.houseItems.find((x) => x.id === 'h4')?.stock).toBeUndefined();
  });
});

describe('leftLine', () => {
  it('puts "พอใช้" in front without saying "ประมาณ" twice', () => {
    expect(leftLine('26 วัน')).toBe('พอใช้ประมาณ 26 วัน');
    expect(leftLine('ประมาณ 3 สัปดาห์')).toBe('พอใช้ประมาณ 3 สัปดาห์');
    expect(leftLine('ไม่ถึง 2 สัปดาห์')).toBe('พอใช้ไม่ถึง 2 สัปดาห์');
    expect(leftLine('ไม่พอสำหรับวันนี้')).toBe('ไม่พอสำหรับวันนี้');
    expect(leftLine('พอใช้ตลอดคอร์ส')).toBe('พอใช้ตลอดคอร์ส');
  });
});
