// Stop / resume reasons in the schema (M4 PR 5b, A1-A3).
import { describe, expect, it } from 'vitest';
import { sampleRootV3 } from './fixtures';
import { RESUME_REASONS, STOP_REASONS, STOP_REASON_LABEL, medEventSchema, rootSchema } from './schema';

const base = { id: 'e', assignmentId: 'a1', effectiveOn: '2026-10-28', at: '2026-10-28T09:00:00+07:00' };
const parses = (v: unknown) => medEventSchema.safeParse(v).success;

describe('stop reasons', () => {
  it('there are five, with a screen label for each', () => {
    expect(STOP_REASONS).toHaveLength(5);
    expect(STOP_REASONS).toContain('ยาหมดไม่ซื้อต่อ');
    expect(STOP_REASON_LABEL['หมอสั่ง']).toBe('หมอสั่งหยุด');
    expect(STOP_REASON_LABEL['อื่น ๆ']).toBe('อื่นๆ');
    for (const r of STOP_REASONS) expect(STOP_REASON_LABEL[r]).toBeTruthy();
  });
  it('every reason is accepted without a note, except อื่น ๆ', () => {
    for (const reason of STOP_REASONS) expect(parses({ ...base, type: 'stop', reason }), reason).toBe(reason !== 'อื่น ๆ');
  });
  it('อื่น ๆ needs a note that is not only spaces', () => {
    expect(parses({ ...base, type: 'stop', reason: 'อื่น ๆ', note: 'ย้ายบ้าน' })).toBe(true);
    expect(parses({ ...base, type: 'stop', reason: 'อื่น ๆ', note: '   ' })).toBe(false);
    expect(parses({ ...base, type: 'stop', reason: 'อื่น ๆ', note: '' })).toBe(false);
  });
  it('แพ้ยา keeps an optional symptom note (max 200)', () => {
    expect(parses({ ...base, type: 'stop', reason: 'แพ้ยา', note: 'ผื่นคัน' })).toBe(true);
    expect(parses({ ...base, type: 'stop', reason: 'แพ้ยา', note: 'x'.repeat(201) })).toBe(false);
  });
});

describe('resume reasons', () => {
  it('older data without a reason still passes', () => {
    expect(parses({ ...base, type: 'resume' })).toBe(true);
  });
  it('four reasons; อื่น ๆ needs a note', () => {
    expect(RESUME_REASONS).toHaveLength(4);
    for (const reason of RESUME_REASONS) expect(parses({ ...base, type: 'resume', reason }), reason).toBe(reason !== 'อื่น ๆ');
    expect(parses({ ...base, type: 'resume', reason: 'อื่น ๆ', note: 'หมอนัดใหม่' })).toBe(true);
    expect(parses({ ...base, type: 'resume', reason: 'อื่น ๆ', note: ' ' })).toBe(false);
    expect(parses({ ...base, type: 'resume', reason: 'ไม่รู้' })).toBe(false);
  });
  it('the sample house (old resume events and all) still passes', () => {
    expect(rootSchema.safeParse(sampleRootV3()).success).toBe(true);
  });
});
