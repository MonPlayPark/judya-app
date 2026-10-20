// Draws the doctor summary as PNG pictures, on this device (step 3.4). All canvas code lives here; the rows and their order come from
// `domain/doctorSummary.ts`. Nothing is stored or sent: the result is a list of Blobs for the screen to show and share.
import {
  ALLERGY_LINE,
  DISCLAIMER_LINE,
  imageBlocks,
  paginate,
  type BlockRow,
  type DoctorSummary,
  type RowStyle,
} from '../domain/doctorSummary';
import { thaiDateShort } from '../domain/format';

export const PAGE_W = 1080;
export const PAGE_H = 1920;
/** Smallest letter on a picture. On a 360px wide screen the picture is 1/3 size, so 48px stays 16px (never under 15px). */
export const BODY_PX = 48;
const NAME_PX = 60;
const LINE_H = 72;
const NAME_LINE_H = 84;
const PAD = 56;
const INDENT = 56;
const BLOCK_GAP = LINE_H / 2; // half a line, counted inside each block's line total
const FAMILY = '"Noto Sans Thai"';
const FALLBACK = 'system-ui, sans-serif';
const WEIGHTS = [400, 600, 700] as const;

export type ImageFailure = 'no_canvas' | 'font' | 'failed';
export type ImageResult = { ok: true; pages: Blob[] } | { ok: false; reason: ImageFailure };

// ---- text wrapping (pure, tested with a fake measure) ----

/** Thai marks that must stay on the letter before them: vowels above / below, tone marks, ะ า ำ, ๆ. */
const isJoiner = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x0e30 && c <= 0x0e3a) || (c >= 0x0e45 && c <= 0x0e4e);
};
const isLeadingVowel = (ch: string): boolean => 'เแโใไ'.includes(ch);

/** Letters that cannot be pulled apart: a consonant with the marks above / below it, and a leading vowel with the letter after it. */
export function clusters(text: string): string[] {
  const out: string[] = [];
  let carry = '';
  for (const ch of text) {
    if (isJoiner(ch) && out.length > 0 && carry === '') {
      out[out.length - 1] += ch;
      continue;
    }
    if (carry !== '') {
      out.push(carry + ch);
      carry = '';
      continue;
    }
    if (isLeadingVowel(ch)) carry = ch;
    else out.push(ch);
  }
  if (carry !== '') out.push(carry);
  return out;
}

/** Raw word pieces: Thai words from the browser's dictionary when it has one, otherwise split after spaces. */
function rawPieces(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    try {
      return Array.from(new Intl.Segmenter('th', { granularity: 'word' }).segment(text), (s) => s.segment);
    } catch {
      // fall through to the plain split
    }
  }
  return text.match(/\S+|\s+/g) ?? [];
}

const CLOSING = /^[:;,.!?)\]·/%]+$/; // never starts a line: stays with the word before it
const OPENING = /^[(\[]+$/; // never ends a line: stays with the word after it
const NUMBER = /^[\d½]+([.,]\d+)?$/; // "1 เม็ด", "20 ต.ค.": the number stays with what follows

/** Pieces a line may break between. A piece is a word with the spaces after it; a lone ":" ")" "·" "/" joins the piece before,
 * a lone "(" or a number joins the piece after, so a line never starts with ": หมอสั่ง)" or ends with "1" before "เม็ด". */
function pieces(text: string): string[] {
  const out: string[] = [];
  let glueNext = false;
  for (const seg of rawPieces(text)) {
    const space = /^\s+$/.test(seg);
    const prev = out.length - 1;
    if (space && prev >= 0) {
      out[prev] += seg;
      continue;
    }
    const word = seg.trim();
    if (prev >= 0 && (glueNext || CLOSING.test(word))) out[prev] += seg;
    else out.push(seg);
    glueNext = OPENING.test(word) || NUMBER.test(word);
  }
  return keepPhrases(text, out);
}

/** Meal timing reads wrong when cut in two ("หลัง" / "อาหาร"), so these stay on one line. */
const NO_BREAK = ['หลังอาหาร', 'ก่อนอาหาร', 'พร้อมอาหาร', 'ก่อนนอน'];

/** Join the pieces of `parts` (which together are `text`) wherever a break would fall inside a NO_BREAK phrase. */
function keepPhrases(text: string, parts: string[]): string[] {
  const inside = new Set<number>();
  for (const phrase of NO_BREAK) {
    for (let at = text.indexOf(phrase); at >= 0; at = text.indexOf(phrase, at + 1)) {
      for (let k = at + 1; k < at + phrase.length; k++) inside.add(k);
    }
  }
  const out: string[] = [];
  let offset = 0;
  for (const part of parts) {
    if (out.length > 0 && inside.has(offset)) out[out.length - 1] += part;
    else out.push(part);
    offset += part.length;
  }
  return out;
}

/** Break `text` into lines no wider than `maxWidth`. A line breaks between words; a word wider than a whole line breaks between
 * letter clusters, so a tone mark or vowel never lands on a line without its consonant. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    const t = line.replace(/\s+$/, '');
    if (t !== '') lines.push(t);
    line = '';
  };
  for (const piece of pieces(text)) {
    if (measure((line + piece).replace(/\s+$/, '')) <= maxWidth) {
      line += piece;
      continue;
    }
    flush();
    const word = piece.replace(/^\s+/, '');
    if (measure(word.replace(/\s+$/, '')) <= maxWidth) {
      line = word;
      continue;
    }
    for (const c of clusters(word)) {
      if (line !== '' && measure(line + c) > maxWidth) flush();
      line += c;
    }
  }
  flush();
  return lines.length > 0 ? lines : [''];
}

// ---- drawing ----

function token(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v === '' ? fallback : v;
  } catch {
    return fallback;
  }
}

/** Same values as `src/styles/tokens.css` (read from the page, the fallbacks are the token values). */
function palette() {
  return {
    ink: token('--color-ink', '#202124'),
    primaryInk: token('--color-primary-ink', '#1967d2'),
    tint: token('--color-primary-tint', '#e8f0fe'),
    warnTint: token('--color-warning-tint', '#fef7e0'),
    warnInk: token('--color-warning-ink', '#8a5300'),
    border: token('--color-border', '#dadce0'),
    surface: token('--color-surface', '#ffffff'),
  };
}

const STYLE: Record<RowStyle, { weight: number; px: number; line: number }> = {
  heading: { weight: 700, px: BODY_PX, line: LINE_H },
  name: { weight: 700, px: BODY_PX, line: LINE_H },
  body: { weight: 400, px: BODY_PX, line: LINE_H },
};

const fontOf = (weight: number, px: number): string => `${weight} ${px}px ${FAMILY}, ${FALLBACK}`;

/** Wait for every weight we draw with. Without this the first draw uses a fallback font and Thai letters look wrong. */
async function loadFonts(sample: string): Promise<boolean> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts || typeof fonts.load !== 'function') return false;
  try {
    const loaded = await Promise.all(WEIGHTS.map((w) => fonts.load(`${w} ${BODY_PX}px ${FAMILY}`, sample)));
    return loaded.every((faces) => faces.length > 0);
  } catch {
    return false;
  }
}

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

interface Laid {
  row: BlockRow;
  lines: string[];
}

/** One PNG per picture. Never throws: a browser without canvas, a font that does not load or a failed PNG gives `ok: false`. */
export async function renderSummaryImages(s: DoctorSummary): Promise<ImageResult> {
  try {
    return await draw(s);
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

async function draw(s: DoctorSummary): Promise<ImageResult> {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, reason: 'no_canvas' };

  const sample = `${s.personName}${ALLERGY_LINE}${DISCLAIMER_LINE}กขฃคงจ0123456789 ()·—½/-:.หน้า`;
  if (!(await loadFonts(sample))) return { ok: false, reason: 'font' };

  const measureWith = (weight: number, px: number) => (t: string) => {
    ctx.font = fontOf(weight, px);
    return ctx.measureText(t).width;
  };
  const fullWidth = PAGE_W - PAD * 2;

  // Blocks, wrapped; each block's size in lines drives the page split.
  const blocks = imageBlocks(s).map((b) => {
    const laid: Laid[] = b.rows.map((row) => {
      const st = STYLE[row.style];
      return { row, lines: wrapText(row.text, fullWidth - row.indent * INDENT, measureWith(st.weight, st.px)) };
    });
    return { laid, lines: laid.reduce((n, l) => n + l.lines.length, 0) + BLOCK_GAP / LINE_H };
  });

  // Header and footer are the same on every picture, so their height is measured once.
  const nameLines = wrapText(s.personName, fullWidth, measureWith(700, NAME_PX));
  const subText = `สรุปยา · ${thaiDateShort(s.date)}`;
  const headerH = 40 + nameLines.length * NAME_LINE_H + LINE_H + 32;
  const innerW = fullWidth - 64;
  const allergyLines = wrapText(ALLERGY_LINE, innerW, measureWith(700, BODY_PX));
  const discLines = wrapText(DISCLAIMER_LINE, fullWidth, measureWith(400, BODY_PX));
  const allergyH = allergyLines.length * LINE_H + 32;
  const footerH = 24 + allergyH + 16 + discLines.length * LINE_H + 32;
  const contentTop = headerH + 32;
  const contentBottom = PAGE_H - footerH - 16;
  const capacity = Math.floor((contentBottom - contentTop) / LINE_H);

  const pages = paginate(blocks, capacity);
  const c = palette();

  const drawPage = (pageNo: number, indexes: number[]): void => {
    ctx.clearRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = c.surface;
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // header: name, "สรุปยา · date", and "หน้า i/n" when there is more than one picture
    ctx.fillStyle = c.tint;
    ctx.fillRect(0, 0, PAGE_W, headerH);
    ctx.fillStyle = c.ink;
    ctx.font = fontOf(700, NAME_PX);
    let y = 40;
    for (const t of nameLines) {
      ctx.fillText(t, PAD, y + NAME_LINE_H * 0.72);
      y += NAME_LINE_H;
    }
    ctx.font = fontOf(400, BODY_PX);
    ctx.fillText(subText, PAD, y + LINE_H * 0.72);
    if (pages.length > 1) {
      ctx.font = fontOf(700, BODY_PX);
      ctx.textAlign = 'right';
      ctx.fillText(`หน้า ${pageNo + 1}/${pages.length}`, PAGE_W - PAD, y + LINE_H * 0.72);
      ctx.textAlign = 'left';
    }

    // medicine blocks
    y = contentTop;
    indexes.forEach((bi, k) => {
      const b = blocks[bi];
      if (!b) return;
      for (const { row, lines } of b.laid) {
        const st = STYLE[row.style];
        ctx.font = fontOf(st.weight, st.px);
        ctx.fillStyle = row.style === 'heading' ? c.primaryInk : c.ink;
        for (const t of lines) {
          ctx.fillText(t, PAD + row.indent * INDENT, y + st.line * 0.72);
          y += st.line;
        }
      }
      if (k < indexes.length - 1) {
        ctx.fillStyle = c.border;
        ctx.fillRect(PAD, y + BLOCK_GAP / 2 - 1, fullWidth, 2);
      }
      y += BLOCK_GAP;
    });

    // footer on every picture: the allergy line (the words carry the meaning, the box is only a frame) and the disclaimer
    let fy = PAGE_H - footerH + 24;
    ctx.fillStyle = c.warnTint;
    ctx.fillRect(PAD, fy, fullWidth, allergyH);
    ctx.fillStyle = c.warnInk;
    ctx.fillRect(PAD, fy, 12, allergyH);
    ctx.fillStyle = c.ink;
    ctx.font = fontOf(700, BODY_PX);
    let ay = fy + 16;
    for (const t of allergyLines) {
      ctx.fillText(t, PAD + 40, ay + LINE_H * 0.72);
      ay += LINE_H;
    }
    fy += allergyH + 16;
    ctx.font = fontOf(400, BODY_PX);
    for (const t of discLines) {
      ctx.fillText(t, PAD, fy + LINE_H * 0.72);
      fy += LINE_H;
    }
  };

  const out: Blob[] = [];
  for (const [i, indexes] of pages.entries()) {
    drawPage(i, indexes);
    const blob = await toBlob(canvas);
    if (!blob) return { ok: false, reason: 'failed' };
    out.push(blob);
  }
  return { ok: true, pages: out };
}
