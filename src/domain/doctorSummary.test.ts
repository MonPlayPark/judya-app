// Step 3.4: the owner's hand examples (today = 2026-10-20). Made-up names only.
import { describe, expect, it } from 'vitest';
import {
  ALLERGY_LINE,
  DISCLAIMER_LINE,
  changeLine,
  doctorSummary,
  imageBlocks,
  paginate,
  summaryText,
  type CurrentMed,
  type DoctorSummary,
} from './doctorSummary';
import { HOW_11, HOW_22, SIDE, TODAY, ev, house, idOf, stop } from './doctorExample.test-util';

const summary = (): DoctorSummary => {
  const s = doctorSummary(house(), 'pA', TODAY);
  if (!s) throw new Error('summary expected');
  return s;
};
const med = (s: DoctorSummary, k: string): CurrentMed => {
  const m = s.current.find((c) => c.name === `ยาทดสอบ ${k}`);
  if (!m) throw new Error(`no ${k}`);
  return m;
};

describe('doctorSummary', () => {
  it('has the member name and today', () => {
    const s = summary();
    expect(s.personName).toBe('สมาชิกทดสอบ ก');
    expect(s.date).toBe(TODAY);
  });

  it('lists active medicines sorted by Thai name: จี, บี, เอ, เอช, เอฟ', () => {
    expect(summary().current.map((c) => c.name)).toEqual(['จี', 'บี', 'เอ', 'เอช', 'เอฟ'].map((k) => `ยาทดสอบ ${k}`));
  });

  it('ยา เอ: how, start day and the two changes newest first', () => {
    const m = med(summary(), 'เอ');
    expect(m.how).toBe(HOW_11);
    expect(m.startedOn).toBe('2026-08-01');
    expect(m.changes).toEqual([
      { date: '2026-10-01', kind: 'adjust', from: HOW_22, to: HOW_11, reason: SIDE },
      { date: '2026-09-10', kind: 'adjust', from: HOW_11, to: HOW_22, reason: 'หมอสั่ง' },
    ]);
  });

  it('ยา บี: started 2026-09-15, no changes', () => {
    const m = med(summary(), 'บี');
    expect(m.startedOn).toBe('2026-09-15');
    expect(m.changes).toEqual([]);
    expect(m.how).toBe('เช้า หลังอาหาร 1 เม็ด');
  });

  it('ยา เอฟ: no start event gives null', () => {
    expect(med(summary(), 'เอฟ').startedOn).toBeNull();
  });

  it('ยา จี: four adjusts keep the 3 newest (not 2026-07-01)', () => {
    expect(med(summary(), 'จี').changes.map((c) => c.date)).toEqual(['2026-10-01', '2026-09-01', '2026-08-01']);
  });

  it('ยา เอช: stopped then resumed is active; changes are resume then stop', () => {
    const m = med(summary(), 'เอช');
    expect(m.changes).toEqual([
      { date: '2026-10-10', kind: 'resume' },
      { date: '2026-09-05', kind: 'stop', reason: SIDE },
    ]);
  });

  it('stopped: 71 days and exactly 90 days show, 91 days does not; newest stop first', () => {
    const s = summary();
    expect(s.stopped).toEqual([
      { name: 'ยาทดสอบ ซี', stoppedOn: '2026-08-10', reason: 'แพ้ยา' },
      { name: 'ยาทดสอบ ดี', stoppedOn: '2026-07-22', reason: 'หมอสั่ง' },
    ]);
  });

  it('a stopped medicine without a stop event is left out (the day is not guessed)', () => {
    const root = house();
    root.events = root.events.filter((e) => !(e.assignmentId === idOf('ซี') && e.type === 'stop'));
    const s = doctorSummary(root, 'pA', TODAY);
    expect(s?.stopped.map((m) => m.name)).toEqual(['ยาทดสอบ ดี']);
  });

  it('uses the latest stop when a medicine was stopped more than once', () => {
    const root = house();
    root.events.push(ev(idOf('ซี'), 'resume', '2026-08-20'), stop(idOf('ซี'), '2026-09-30', 'หมอสั่ง'));
    expect(doctorSummary(root, 'pA', TODAY)?.stopped[0]).toEqual({ name: 'ยาทดสอบ ซี', stoppedOn: '2026-09-30', reason: 'หมอสั่ง' });
  });

  it('does not depend on the order events were written in the list', () => {
    const root = house();
    root.events = [...root.events].reverse();
    const m = med(doctorSummary(root, 'pA', TODAY) as DoctorSummary, 'จี');
    expect(m.changes.map((c) => c.date)).toEqual(['2026-10-01', '2026-09-01', '2026-08-01']);
  });

  it('"edit" events are not counted as changes', () => {
    const root = house();
    root.events.push(ev(idOf('บี'), 'edit', '2026-10-05', { from: { note: null }, to: { note: 'x' } }));
    expect(med(doctorSummary(root, 'pA', TODAY) as DoctorSummary, 'บี').changes).toEqual([]);
  });

  it('a removed or unknown member gives null', () => {
    expect(doctorSummary(house(), 'pR', TODAY)).toBeNull();
    expect(doctorSummary(house(), 'zzz', TODAY)).toBeNull();
  });

  it('the result holds nothing of other members, insurance, relation, stock or price', () => {
    const json = JSON.stringify(summary());
    for (const bad of ['สมาชิกทดสอบ ข', 'ยาทดสอบ อื่น', 'ของคนที่ออก', 'ประกันลับ', 'พ่อ', '777', 'qty', 'price']) {
      expect(json).not.toContain(bad);
    }
  });

  it('does not change the data it reads', () => {
    const root = house();
    const before = JSON.stringify(root);
    doctorSummary(root, 'pA', TODAY);
    expect(JSON.stringify(root)).toBe(before);
  });

  it('a member with no medicine gives empty lists', () => {
    const s = doctorSummary(house(), 'pB', TODAY);
    expect(s?.current.map((c) => c.name)).toEqual(['ยาทดสอบ อื่น']);
    const root = house();
    root.assignments = [];
    expect(doctorSummary(root, 'pA', TODAY)).toMatchObject({ current: [], stopped: [] });
  });
});

describe('changeLine', () => {
  it('writes adjust, stop and resume', () => {
    expect(changeLine({ date: '2026-10-01', kind: 'adjust', from: 'ก', to: 'ข', reason: SIDE })).toBe(`ปรับโดส 1 ต.ค. 2569 จาก ก เป็น ข (เหตุผล: ${SIDE})`);
    expect(changeLine({ date: '2026-09-05', kind: 'stop', reason: SIDE })).toBe(`หยุดยา 5 ก.ย. 2569 (เหตุผล: ${SIDE})`);
    expect(changeLine({ date: '2026-10-10', kind: 'resume' })).toBe('กลับมาใช้ยา 10 ต.ค. 2569');
  });
});

describe('summaryText', () => {
  const text = summaryText(summary());
  const lines = text.split('\n');

  it('starts with the title, the source line and a blank line', () => {
    expect(lines.slice(0, 4)).toEqual(['สรุปยาของ สมาชิกทดสอบ ก', 'ข้อมูลจากแอพ JudYa วันที่ 20 ต.ค. 2569', '', 'ยาที่ใช้อยู่']);
  });

  it('ยา เอ: start line and the adjust line', () => {
    expect(text).toContain(`3) ยาทดสอบ เอ — ${HOW_11}`);
    expect(text).toContain('   เริ่มใช้ 1 ส.ค. 2569');
    expect(text).toContain(`   ปรับโดส 1 ต.ค. 2569 จาก ${HOW_22} เป็น ${HOW_11} (เหตุผล: ${SIDE})`);
  });

  it('ยา เอฟ says the start day is not given', () => {
    expect(text).toContain('เริ่มใช้ ไม่ระบุวันที่');
  });

  it('has the stopped part with name, day and reason', () => {
    expect(text).toContain('ยาที่หยุดใน 90 วันที่ผ่านมา\n- ยาทดสอบ ซี หยุด 10 ส.ค. 2569 (เหตุผล: แพ้ยา)\n- ยาทดสอบ ดี หยุด 22 ก.ค. 2569 (เหตุผล: หมอสั่ง)');
    expect(text).not.toContain('ยาทดสอบ อี');
  });

  it('ends with the allergy line and the disclaimer; never says "not allergic"', () => {
    expect(lines.slice(-3)).toEqual(['', ALLERGY_LINE, DISCLAIMER_LINE]);
    expect(ALLERGY_LINE).toBe('การแพ้ยา: แอพนี้ยังไม่มีข้อมูลการแพ้ยา — โปรดสอบถามผู้ป่วยหรือญาติ');
    for (const bad of ['ไม่แพ้', 'ไม่มีประวัติแพ้', 'ไม่พบ']) expect(text).not.toContain(bad);
  });

  it('has no other member, stock number or price word', () => {
    for (const bad of ['สมาชิกทดสอบ ข', 'ยาทดสอบ อื่น', '777', 'ราคา', 'สต๊อก', '฿']) expect(text).not.toContain(bad);
  });

  it('no active medicine gives "ยังไม่มียาที่ใช้อยู่" and no stopped part when none', () => {
    const t = summaryText({ personName: 'สมาชิกทดสอบ ก', date: TODAY, current: [], stopped: [] });
    expect(t).toContain('ยาที่ใช้อยู่\nยังไม่มียาที่ใช้อยู่\n\nการแพ้ยา:');
    expect(t).not.toContain('ยาที่หยุดใน');
  });

  it('keeps the indent under two-digit numbers', () => {
    const many: DoctorSummary = {
      personName: 'x',
      date: TODAY,
      current: Array.from({ length: 10 }, (_, i) => ({ name: `ยา ${i}`, how: 'เช้า 1 เม็ด', startedOn: null, changes: [] })),
      stopped: [],
    };
    expect(summaryText(many)).toContain('10) ยา 9 — เช้า 1 เม็ด\n    เริ่มใช้ ไม่ระบุวันที่');
  });
});

describe('imageBlocks', () => {
  it('one block per medicine; section headings sit inside the first block of each section', () => {
    const blocks = imageBlocks(summary());
    expect(blocks).toHaveLength(7);
    expect(blocks[0]?.rows[0]).toMatchObject({ text: 'ยาที่ใช้อยู่', style: 'heading' });
    expect(blocks[5]?.rows[0]).toMatchObject({ text: 'ยาที่หยุดใน 90 วันที่ผ่านมา', style: 'heading' });
    expect(blocks.filter((b) => b.rows.some((r) => r.style === 'heading'))).toHaveLength(2);
  });

  it('no active medicine still gives a block that says so', () => {
    const blocks = imageBlocks({ personName: 'x', date: TODAY, current: [], stopped: [{ name: 'ยา', stoppedOn: '2026-10-01' }] });
    expect(blocks[0]?.rows.map((r) => r.text)).toEqual(['ยาที่ใช้อยู่', 'ยังไม่มียาที่ใช้อยู่']);
    expect(blocks).toHaveLength(2);
  });
});

describe('paginate', () => {
  const p = (lines: number[], cap: number) => paginate(lines.map((l) => ({ lines: l })), cap);
  it('the owner examples', () => {
    expect(p([10, 10, 10], 25)).toEqual([[0, 1], [2]]);
    expect(p([30], 25)).toEqual([[0]]);
    expect(p([], 25)).toEqual([[]]);
    expect(p([20, 5, 20], 25)).toEqual([[0, 1], [2]]);
    expect(p([5, 20, 5], 25)).toEqual([[0, 1], [2]]);
  });
  it('an oversize block is alone and the blocks around it still fill pages', () => {
    expect(p([5, 30, 5, 5], 25)).toEqual([[0], [1], [2, 3]]);
  });
  it('keeps order, never cuts, and uses each index once', () => {
    const lines = [7, 3, 9, 12, 4, 4, 8, 20, 1];
    const pages = p(lines, 20);
    expect(pages.flat()).toEqual(lines.map((_, i) => i));
    for (const page of pages) expect(page.reduce((t, i) => t + (lines[i] ?? 0), 0)).toBeLessThanOrEqual(20);
  });
});
