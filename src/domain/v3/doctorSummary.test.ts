import { describe, expect, it } from 'vitest';
import { buildDoctorSummary, activeMedCount, doctorPeople, DOCTOR_FOOTER, NO_MEDS_TEXT } from './doctorSummary';
import { sampleRootV3 } from './fixtures';
import type { MedEvent, Root } from './schema';

const TODAY = '2026-10-28';
const get = (root: Root, id: string) => {
  const s = buildDoctorSummary(root, id, TODAY);
  if (!s) throw new Error('no summary');
  return s;
};
const lines = (t: string) => t.split('\n');

describe('doctor summary: order and content', () => {
  it('p1: header, allergy second, coverage, medicines, changes, stopped, footer', () => {
    const s = get(sampleRootV3(), 'p1');
    const l = lines(s.text);
    expect(l[0]).toBe('สรุปยาของ สมาชิก ก');
    expect(l[1]).toBe('อายุ 39 ปี · ข้อมูล ณ 28 ต.ค. 2569');
    expect(l[2]).toBe('');
    expect(l[3]).toBe('การแพ้ยา:');
    expect(l[4]).toBe('ยังไม่ได้บันทึกข้อมูลการแพ้ยา โปรดสอบถามผู้ป่วยหรือญาติ');
    const idx = (h: string) => s.text.indexOf(h);
    expect(idx('สิทธิ์รักษา: บัตรทอง')).toBeGreaterThan(idx('การแพ้ยา:'));
    expect(idx('ยาที่ใช้อยู่ (1 รายการ)')).toBeGreaterThan(idx('สิทธิ์รักษา'));
    expect(idx('การปรับยาล่าสุด')).toBeGreaterThan(idx('ยาที่ใช้อยู่'));
    expect(idx('ยาที่หยุดใน 90 วันที่ผ่านมา')).toBeGreaterThan(idx('การปรับยาล่าสุด'));
    expect(s.text.endsWith(DOCTOR_FOOTER)).toBe(true);
    expect(s.text).toContain('- ยาตัวอย่าง A 500 mg');
    expect(s.text).toContain('  วิธีกิน: เช้า 1 เม็ด · หลังอาหาร · ทุกวัน; เย็น 1 เม็ด · หลังอาหาร · ทุกวัน');
    expect(s.text).toContain('  เริ่ม 1 ต.ค. 2569');
    expect(s.text).toContain('  ผลข้างเคียง: ง่วงเล็กน้อย (ตัวอย่าง)');
    expect(s.text).toContain('- 20 ต.ค. 2569 ยาตัวอย่าง G 400 IU: หยุดยา (เหตุผล หยุดตัวอย่าง)');
    expect(s.text).toContain('- ยาตัวอย่าง G 400 IU หยุดเมื่อ 20 ต.ค. 2569 (เหตุผล: หยุดตัวอย่าง)');
    expect(s.empty).toBe(false);
  });

  it('allergy is always the second section, in all three states', () => {
    const r = sampleRootV3();
    for (const id of ['p1', 'p2', 'p3']) {
      const l = lines(get(r, id).text);
      expect(l.indexOf('การแพ้ยา:')).toBe(3);
    }
  });

  it('unknown never says no allergy', () => {
    const t = get(sampleRootV3(), 'p1').text;
    expect(t).not.toMatch(/ไม่แพ้ยา|ไม่มีประวัติแพ้|ไม่พบ/);
    expect(t).toContain('ยังไม่ได้บันทึกข้อมูลการแพ้ยา โปรดสอบถามผู้ป่วยหรือญาติ');
  });

  it('none_confirmed says confirmed with the date', () => {
    expect(get(sampleRootV3(), 'p2').text).toContain('ไม่มีประวัติแพ้ยาที่ทราบ (ยืนยันเมื่อ 28 ต.ค. 2569)');
  });

  it('listed: one line per drug', () => {
    const t = get(sampleRootV3(), 'p3').text;
    expect(t).toContain('การแพ้ยา:\n- ยาตัวอย่าง Z: ผื่นตัวอย่าง');
    expect(t).not.toMatch(/ไม่แพ้|ยังไม่ได้บันทึกข้อมูลการแพ้ยา/);
  });

  it('coverage line only when set; private shows the company', () => {
    expect(get(sampleRootV3(), 'p4').text).toContain('สิทธิ์รักษา: ประกันเอกชน (บริษัทตัวอย่าง)');
    const r = sampleRootV3();
    r.persons = r.persons.map((p) => (p.id === 'p1' ? { ...p, coverage: undefined } : p));
    delete (r.persons.find((p) => p.id === 'p1') as { coverage?: unknown }).coverage;
    expect(get(r, 'p1').text).not.toContain('สิทธิ์รักษา');
  });

  it('no age line part without a birth year', () => {
    const r = sampleRootV3();
    r.assignments = r.assignments.map((a) => (a.id === 'a1' ? { ...a, personId: 'p5' } : a));
    const t = get(r, 'p5');
    expect(lines(t.text)[1]).toBe('ข้อมูล ณ 28 ต.ค. 2569');
  });

  it('adjust shows old → new and the reason; resume shows กลับมาใช้ยา', () => {
    const t = get(sampleRootV3(), 'p1').text;
    expect(t).toContain('- 15 ต.ค. 2569 ยาตัวอย่าง A 500 mg: เช้า 1 เม็ด → เช้า 1 เม็ด + เย็น 1 เม็ด (เหตุผล: หมอสั่ง)');
    const p3 = get(sampleRootV3(), 'p3').text;
    expect(p3).toContain('- 22 ต.ค. 2569 ยาตัวอย่าง F 0.5%: กลับมาใช้ยา');
  });

  it('only the last 3 changes, newest first', () => {
    const r = sampleRootV3();
    const extra = (n: number, day: string): MedEvent => ({
      id: `x${n}`, assignmentId: 'a1', type: 'stop', effectiveOn: day, at: '2026-10-28T09:00:00+07:00', reason: 'หมอสั่ง',
    });
    r.events = [...r.events, extra(1, '2026-10-21'), extra(2, '2026-10-22'), extra(3, '2026-10-23')];
    const l = lines(get(r, 'p1').text);
    const start = l.indexOf('การปรับยาล่าสุด');
    const block = l.slice(start + 1, l.indexOf('', start));
    expect(block).toHaveLength(3);
    expect(block[0]).toContain('23 ต.ค. 2569');
    expect(block[2]).toContain('21 ต.ค. 2569');
  });

  it('stopped within 90 days: 90 days is included, 91 is not', () => {
    const r = sampleRootV3();
    const stop = (day: string) => {
      r.events = r.events.map((e) => (e.id === 'e-stop' ? { ...e, effectiveOn: day } : e));
      return get(r, 'p1').text;
    };
    expect(stop('2026-07-30')).toContain('ยาที่หยุดใน 90 วันที่ผ่านมา'); // exactly 90 days before 2026-10-28
    expect(stop('2026-07-29')).not.toContain('ยาที่หยุดใน 90 วันที่ผ่านมา');
  });

  it('a stopped medicine with no stop event is left out', () => {
    const r = sampleRootV3();
    r.events = r.events.filter((e) => e.id !== 'e-stop');
    expect(get(r, 'p1').text).not.toContain('ยาที่หยุดใน 90 วันที่ผ่านมา');
  });

  it('no medicine at all: empty, no text', () => {
    const r = sampleRootV3();
    const s = get(r, 'p5');
    expect(s.empty).toBe(true);
    expect(s.text).toBe('');
    expect(NO_MEDS_TEXT).toBe('ยังไม่มียาให้สรุป');
  });

  it('a person who has only a long-stopped medicine is empty', () => {
    const r = sampleRootV3();
    r.events = r.events.map((e) => (e.id === 'e-stop' ? { ...e, effectiveOn: '2026-01-01' } : e));
    r.assignments = r.assignments.filter((a) => a.id !== 'a1');
    expect(get(r, 'p1').empty).toBe(true);
  });

  it('missing or removed member gives null', () => {
    expect(buildDoctorSummary(sampleRootV3(), 'nope', TODAY)).toBeNull();
  });

  it('activeMedCount counts active assignments', () => {
    expect(activeMedCount(sampleRootV3(), 'p3')).toBe(2);
    expect(activeMedCount(sampleRootV3(), 'p1')).toBe(1);
    expect(activeMedCount(sampleRootV3(), 'p5')).toBe(0);
  });

  it('does not mention another member', () => {
    const t = get(sampleRootV3(), 'p1').text;
    expect(t).not.toContain('สมาชิก ข');
    expect(t).not.toContain('ยาตัวอย่าง B');
  });
});

describe('doctorPeople (the Home picker)', () => {
  it('lists active members in order with the number of medicines in use', () => {
    const list = doctorPeople(sampleRootV3());
    expect(list.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(list.find((p) => p.id === 'p3')?.medText).toBe('ยา 2 รายการ');
    expect(list.find((p) => p.id === 'p5')?.medText).toBe('ยา 0 รายการ');
  });
  it('leaves out a removed member', () => {
    const r = sampleRootV3();
    r.persons = r.persons.map((p) => (p.id === 'p2' ? { ...p, removedAt: '2026-10-28T09:00:00+07:00' } : p));
    expect(doctorPeople(r).map((p) => p.id)).not.toContain('p2');
  });
});
