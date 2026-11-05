import { describe, expect, it } from 'vitest';
import { sampleRootV3 } from './fixtures';
import { LINE_LINK_WARN_LENGTH, LINE_LINK_PREFIX, buildOrderMessage, lineLink, lineLinkIsLong, messageItems, recipientComplete, recipientMissing, type MessageItem } from './orderMessage';
import { buildOrderLines, makeFreeLine, makeManualLine, type DraftLine } from './orderLines';
import type { Root } from './schema';

const TODAY = '2026-10-28';
const ROOT = (): Root => structuredClone(sampleRootV3());
const FULL = { address: 'บ้านเลขที่ 99 ซอยตัวอย่าง 1 เขตสมมติ 10000', name: 'คุณสมมติ ทดสอบ', phone: '081-000-0000' };
const free = (root: Root, input: Parameters<typeof makeFreeLine>[1]): DraftLine => {
  const r = makeFreeLine(root, input);
  if (!r.ok) throw new Error('bad free line');
  return r.line;
};

describe('buildOrderMessage - the shapes', () => {
  const items: MessageItem[] = [
    { name: 'ยาตัวอย่าง ก', strength: '500 mg', qty: 2, unit: 'กล่อง', pack: '60 เม็ด' },
    { name: 'ยาตัวอย่าง ข', qty: 1, unit: 'ขวด' },
  ];

  it('delivery, everything given', () => {
    expect(buildOrderMessage(items, 'delivery', FULL)).toBe(
      ['สั่งยาค่ะ', '', '1) ยาตัวอย่าง ก 500 mg 2 กล่อง 60 เม็ด', '2) ยาตัวอย่าง ข 1 ขวด', '', `ส่ง ${FULL.address}`, '', `${FULL.name} ${FULL.phone}`].join('\n'),
    );
  });

  it('delivery without an address: no "ส่ง" line at all', () => {
    const text = buildOrderMessage(items, 'delivery', { name: FULL.name, phone: FULL.phone });
    expect(text).not.toContain('ส่ง ');
    expect(text.endsWith(`\n\n${FULL.name} ${FULL.phone}`)).toBe(true);
    expect(text).toBe(['สั่งยาค่ะ', '', '1) ยาตัวอย่าง ก 500 mg 2 กล่อง 60 เม็ด', '2) ยาตัวอย่าง ข 1 ขวด', '', `${FULL.name} ${FULL.phone}`].join('\n'));
  });

  it('pick-up: "มารับเองค่ะ", and the address is not used even if one is saved', () => {
    const text = buildOrderMessage(items, 'pickup', FULL);
    expect(text).toBe(['สั่งยาค่ะ', '', '1) ยาตัวอย่าง ก 500 mg 2 กล่อง 60 เม็ด', '2) ยาตัวอย่าง ข 1 ขวด', '', 'มารับเองค่ะ', '', `${FULL.name} ${FULL.phone}`].join('\n'));
    expect(text).not.toContain(FULL.address);
  });

  it('no recipient at all: no recipient line, no trailing blank line', () => {
    expect(buildOrderMessage(items, 'delivery', {})).toBe(['สั่งยาค่ะ', '', '1) ยาตัวอย่าง ก 500 mg 2 กล่อง 60 เม็ด', '2) ยาตัวอย่าง ข 1 ขวด'].join('\n'));
    expect(buildOrderMessage(items, 'pickup', {})).toBe(['สั่งยาค่ะ', '', '1) ยาตัวอย่าง ก 500 mg 2 กล่อง 60 เม็ด', '2) ยาตัวอย่าง ข 1 ขวด', '', 'มารับเองค่ะ'].join('\n'));
  });

  it('part of the recipient: only a name, or only a phone (no stray spaces)', () => {
    const onlyName = buildOrderMessage(items, 'pickup', { name: 'คุณสมมติ' });
    const onlyPhone = buildOrderMessage(items, 'pickup', { phone: '081-000-0000' });
    expect(onlyName.endsWith('\n\nคุณสมมติ')).toBe(true);
    expect(onlyPhone.endsWith('\n\n081-000-0000')).toBe(true);
  });

  it('blank or spaces-only parts count as missing; line breaks in the address become one space', () => {
    const text = buildOrderMessage(items, 'delivery', { address: '  บ้าน 99 \n ซอยตัวอย่าง  ', name: '   ', phone: '' });
    expect(text).toContain('\n\nส่ง บ้าน 99 ซอยตัวอย่าง');
    expect(text.endsWith('ซอยตัวอย่าง')).toBe(true);
  });

  it('never a double space, a double blank line, or a line that starts or ends with a space', () => {
    const odd: MessageItem[] = [{ name: '  ยา   ตัวอย่าง  ', strength: '', qty: 1, unit: ' กล่อง ', pack: '  ' }];
    const text = buildOrderMessage(odd, 'delivery', { address: ' ก  ข ', name: ' ค ', phone: ' 1 2 ' });
    expect(text).not.toMatch(/ {2}/);
    expect(text).not.toMatch(/\n{3}/);
    for (const l of text.split('\n')) expect(l).toBe(l.trim());
    expect(text).toContain('1) ยา ตัวอย่าง 1 กล่อง');
  });

  it('no items = an empty text', () => {
    expect(buildOrderMessage([], 'delivery', FULL)).toBe('');
  });

  it('fractions are printed plainly (no float noise)', () => {
    expect(buildOrderMessage([{ name: 'ก', qty: 0.1 + 0.2, unit: 'ขวด' }], 'pickup', {})).toContain('1) ก 0.3 ขวด');
  });
});

describe('messageItems - from the ticked lines', () => {
  it('a tablet medicine of the app: name, strength, boxes and the pack size', () => {
    const r = ROOT();
    const line: DraftLine = { ...buildOrderLines(r, TODAY).find((l) => l.key === 'med:m2')!, sellUnit: 'กล่อง', perSellUnit: 30, qtyOrdered: 2, ticked: true };
    const text = buildOrderMessage(messageItems(r, [line]), 'pickup', {});
    expect(text).toContain('1) ยาตัวอย่าง B 20 mg 2 กล่อง 30 แคปซูล');
  });

  it('a sachet medicine: "2 กล่อง 30 ซอง" (no strength = part left out)', () => {
    const r = ROOT();
    const line: DraftLine = { ...buildOrderLines(r, TODAY).find((l) => l.key === 'med:m5')!, sellUnit: 'กล่อง', perSellUnit: 30, qtyOrdered: 2, ticked: true };
    expect(buildOrderMessage(messageItems(r, [line]), 'pickup', {})).toContain('1) ยาตัวอย่าง E 2 กล่อง 30 ซอง');
  });

  it('a cream: strength, tubes, no pack size', () => {
    const r = ROOT();
    r.assignments.find((a) => a.id === 'a4')!.stock = { kind: 'tubes', opened: true, spare: 0 };
    const line = buildOrderLines(r, TODAY).find((l) => l.key === 'med:m4')!;
    expect(line.sellUnit).toBe('หลอด');
    expect(buildOrderMessage(messageItems(r, [line]), 'pickup', {})).toContain('1) ยาตัวอย่าง D 1% 1 หลอด\n');
  });

  it('a liquid in bottles: the ml of one bottle is the pack size', () => {
    const r = ROOT();
    const line = { ...buildOrderLines(r, TODAY).find((l) => l.key === 'med:m3')!, qtyOrdered: 1 };
    expect(line.sellUnit).toBe('ขวด');
    expect(buildOrderMessage(messageItems(r, [line]), 'pickup', {})).toContain('1) ยาตัวอย่าง C 120 mg/5 ml 1 ขวด 60 มล.');
  });

  it('pack size unknown: left out (typed medicine without the count; sell unit is the small unit)', () => {
    const r = ROOT();
    const a = free(r, { name: 'ยาพิมพ์เอง ตัวอย่าง', qty: 2, sellUnit: 'กล่อง', medKind: 'tablet' });
    const b = free(r, { name: 'ยาพิมพ์เอง สอง', qty: 10, sellUnit: 'เม็ด', perSellUnit: 1, medKind: 'tablet' });
    expect(buildOrderMessage(messageItems(r, [a, b]), 'pickup', {})).toContain('1) ยาพิมพ์เอง ตัวอย่าง 2 กล่อง\n2) ยาพิมพ์เอง สอง 10 เม็ด\n');
  });

  it('a typed medicine follows the same rule: name + strength + qty + unit + pack size', () => {
    const r = ROOT();
    const l = free(r, { name: 'ยาพิมพ์เอง ตัวอย่าง', qty: 1, sellUnit: 'กล่อง', perSellUnit: 60, medKind: 'tablet', strength: { value: 500, unit: 'mg' } });
    expect(buildOrderMessage(messageItems(r, [l]), 'pickup', {})).toContain('1) ยาพิมพ์เอง ตัวอย่าง 500 mg 1 กล่อง 60 เม็ด');
  });

  it('a house medicine: its name, strength and own unit; no pack size', () => {
    const r = ROOT();
    r.houseItems[0] = { ...r.houseItems[0]!, strength: { value: 250, unit: 'mg' } };
    const line = makeManualLine(r, { kind: 'house', houseItemId: 'h1' }, TODAY);
    expect(line).not.toBeNull();
    expect(buildOrderMessage(messageItems(r, [{ ...line!, qtyOrdered: 2, ticked: true }]), 'pickup', {})).toContain('1) ยาสามัญตัวอย่าง ก 250 mg 2 แผง\n');
  });

  it('lines that are not ticked, or have quantity 0, are left out', () => {
    const r = ROOT();
    const lines = buildOrderLines(r, TODAY);
    expect(messageItems(r, lines.map((l) => ({ ...l, ticked: false })))).toEqual([]);
    expect(messageItems(r, [{ ...lines[0]!, ticked: true, qtyOrdered: 0 }])).toEqual([]);
  });
});

describe('no member name, price or shop name in the message', () => {
  it('members with made-up names, prices and shops in the house: none of it reaches the text', () => {
    const r = ROOT();
    const secrets = ['คุณสมาชิกลับ หนึ่ง', 'คุณสมาชิกลับ สอง', 'คุณสมาชิกลับ สาม'];
    r.persons.forEach((p, i) => { p.name = secrets[i % 3]!; });
    r.shops[0]!.name = 'ร้านลับตัวอย่าง';
    const lines = buildOrderLines(r, TODAY).map((l) => ({ ...l, ticked: true }));
    expect(lines.length).toBeGreaterThan(0);
    for (const mode of ['delivery', 'pickup'] as const) {
      const text = buildOrderMessage(messageItems(r, lines), mode, FULL);
      for (const s of [...secrets, 'ร้านลับตัวอย่าง', 'สมาชิก', '฿', 'บาท', 'ราคา']) expect(text).not.toContain(s);
      expect(text).not.toMatch(/p[0-9]\b|a[0-9]\b/); // no ids either
    }
  });

  it('the strings the function reads are only medicines and the typed recipient (a member name typed as the recipient is the owner\'s own text)', () => {
    const r = ROOT();
    r.persons[0]!.name = 'คุณสมาชิกลับ หนึ่ง';
    const text = buildOrderMessage(messageItems(r, buildOrderLines(r, TODAY)), 'pickup', {});
    expect(text).not.toContain('คุณสมาชิกลับ');
  });
});

describe('recipient completeness', () => {
  it('delivery needs address, name and phone; pick-up needs name and phone', () => {
    expect(recipientMissing('delivery', {})).toEqual(['address', 'name', 'phone']);
    expect(recipientMissing('pickup', {})).toEqual(['name', 'phone']);
    expect(recipientMissing('pickup', { address: 'x', name: 'ก' })).toEqual(['phone']);
    expect(recipientMissing('delivery', { name: 'ก', phone: '1' })).toEqual(['address']);
    expect(recipientComplete('delivery', FULL)).toBe(true);
    expect(recipientComplete('pickup', { name: 'ก', phone: '1' })).toBe(true);
    expect(recipientComplete('pickup', { name: '  ', phone: '1' })).toBe(false);
  });
});

describe('the LINE link', () => {
  const twenty: MessageItem[] = Array.from({ length: 20 }, (_, i) => ({ name: `ยาตัวอย่างสำหรับทดสอบลิงก์ ${i + 1}`, strength: '500 mg', qty: 2, unit: 'กล่อง', pack: '60 เม็ด' }));

  it('uses line.me/R/msg/text/ and writes line breaks as %0A', () => {
    const text = buildOrderMessage(twenty.slice(0, 2), 'pickup', FULL);
    const link = lineLink(text);
    expect(link.startsWith('https://line.me/R/msg/text/?')).toBe(true);
    expect(LINE_LINK_PREFIX).toBe('https://line.me/R/msg/text/?');
    expect(link).not.toMatch(/[\n ]/);
    expect(link).toContain('%0A%0A');
    expect(decodeURIComponent(link.slice(LINE_LINK_PREFIX.length))).toBe(text);
  });

  it('the warn length is the named constant 8000; a message of 20 lines still makes a usable link (decodes back to the same text, under it)', () => {
    const text = buildOrderMessage(twenty, 'delivery', FULL);
    expect(text.split('\n').filter((l) => /^\d+\) /.test(l))).toHaveLength(20);
    const link = lineLink(text);
    expect(LINE_LINK_WARN_LENGTH).toBe(8000);
    expect(decodeURIComponent(link.slice(LINE_LINK_PREFIX.length))).toBe(text);
    expect(link.length).toBeLessThanOrEqual(LINE_LINK_WARN_LENGTH);
    expect(lineLinkIsLong(text)).toBe(false);
  });

  it('a very long message is long for the link (the page warns and points to copy; the button stays on)', () => {
    const long: MessageItem[] = Array.from({ length: 60 }, (_, i) => ({ name: `ยาตัวอย่างสำหรับทดสอบลิงก์ที่ยาวมากพอสมควร ${i + 1}`, strength: '500 mg', qty: 2, unit: 'กล่อง', pack: '60 เม็ด' }));
    expect(lineLinkIsLong(buildOrderMessage(long, 'delivery', FULL))).toBe(true);
  });

  it('keeps & # ? % + in a name safe', () => {
    const text = buildOrderMessage([{ name: 'ยา A&B #1 100% +?', qty: 1, unit: 'ขวด' }], 'pickup', {});
    expect(decodeURIComponent(lineLink(text).slice(LINE_LINK_PREFIX.length))).toBe(text);
    expect(lineLink(text).slice(LINE_LINK_PREFIX.length)).not.toMatch(/[&#?+ ]/);
  });
});
