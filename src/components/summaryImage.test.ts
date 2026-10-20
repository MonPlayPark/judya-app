// Text wrapping for the pictures (pure, fake measure) and the "no canvas" outcome. Real drawing is checked in a real browser (HANDOFF).
import { describe, expect, it, vi } from 'vitest';
import { clusters, renderSummaryImages, wrapText } from './summaryImage';

const measure = (s: string): number => [...s].length * 10;
const JOINER = /[ะ-ฺๅ-๎]/;
const LEADING = 'เแโใไ';

describe('clusters', () => {
  it('keeps tone marks and vowels with their consonant', () => {
    expect(clusters('น้ำ')).toEqual(['น้ำ']);
    expect(clusters('ที่ปรึกษา')).toEqual(['ที่', 'ป', 'รึ', 'ก', 'ษา']);
  });
  it('keeps a leading vowel with the letter after it', () => {
    expect(clusters('เช้า')).toEqual(['เช้า']);
    expect(clusters('แก้ว')).toEqual(['แก้', 'ว']);
  });
  it('gives the same text back when joined', () => {
    const t = 'ปรับโดส 1 ต.ค. 2569 จาก เช้า หลังอาหาร เป็น เย็น';
    expect(clusters(t).join('')).toBe(t);
  });
});

describe('wrapText', () => {
  it('a short text is one line', () => {
    expect(wrapText('เช้า 1 เม็ด', 500, measure)).toEqual(['เช้า 1 เม็ด']);
  });

  it('no line is wider than the limit and no word is lost', () => {
    const text = 'ปรับโดส 1 ต.ค. 2569 จาก เช้า หลังอาหาร 2 เม็ด · เย็น หลังอาหาร 2 เม็ด เป็น เช้า หลังอาหาร 1 เม็ด (เหตุผล: ใช้ยาไม่ได้ / ผลข้างเคียง)';
    const lines = wrapText(text, 300, measure);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(300);
    expect(lines.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
  });

  it('a long word with no space breaks between letter clusters: no line starts with a mark or ends with a leading vowel', () => {
    const word = 'เปลี่ยนแปลงเกี่ยวกับโรคภูมิแพ้ที่รุนแรงและผลข้างเคียงใหญ่';
    const lines = wrapText(word, 90, measure);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) {
      expect(measure(l)).toBeLessThanOrEqual(90);
      expect(JOINER.test(l.charAt(0))).toBe(false);
      expect(LEADING.includes(l.charAt(l.length - 1))).toBe(false);
    }
    expect(lines.join('')).toBe(word);
  });

  it('empty text gives one empty line (the row still takes its place)', () => {
    expect(wrapText('', 100, measure)).toEqual(['']);
  });
});

describe('renderSummaryImages without a canvas', () => {
  it('says so and does not throw (jsdom has no canvas)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await renderSummaryImages({ personName: 'สมาชิกทดสอบ ก', date: '2026-10-20', current: [], stopped: [] });
    expect(r).toEqual({ ok: false, reason: 'no_canvas' });
    vi.restoreAllMocks();
  });
});

describe('wrapText punctuation and numbers', () => {
  const text = 'ปรับโดส 1 ต.ค. 2569 จาก เช้า หลังอาหาร 2 เม็ด · เย็น หลังอาหาร 2 เม็ด เป็น เช้า หลังอาหาร 1 เม็ด (เหตุผล: ใช้ยาไม่ได้ / ผลข้างเคียง)';
  it.each([200, 250, 300, 330, 400])('width %i: no line starts with ":" "·" ")" "/" or ends with "(" or a lone number', (w) => {
    const lines = wrapText(text, w, measure);
    for (const l of lines) {
      expect(l).not.toMatch(/^[:;,.)·/]/);
      expect(l).not.toMatch(/[([]$/);
      expect(l).not.toMatch(/(^|\s)[\d½]+$/);
    }
    expect(lines.join(' ').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });
});

describe('wrapText meal timing', () => {
  const text = 'เช้า หลังอาหาร 1 เม็ด · กลางวัน พร้อมอาหาร 1 เม็ด · เย็น ก่อนอาหาร 1 เม็ด · ก่อนนอน 1 เม็ด';
  it.each([150, 200, 250, 300])('width %i: "หลังอาหาร", "พร้อมอาหาร", "ก่อนอาหาร", "ก่อนนอน" are never cut', (w) => {
    const lines = wrapText(text, w, measure);
    for (const l of lines) {
      expect(l).not.toMatch(/(หลัง|พร้อม|ก่อน)$/);
      expect(l).not.toMatch(/^(อาหาร|นอน)/);
    }
    expect(lines.join(' ').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });
});
