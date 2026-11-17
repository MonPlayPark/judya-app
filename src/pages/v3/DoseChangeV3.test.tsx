import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { takeFlash } from '../../components/v3/flash';
import { medsDemoRoot } from '../../domain/v3/medsListDemo';
import { rootSchema, type Root } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY, loadRoot, saveRoot, type KeyValueStore } from '../../domain/v3/storage';
import { DoseChangeV3Route } from './DoseChangePage';
import { MedDetailV3Route } from './MedDetailPage';

const memoryStore = (): KeyValueStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const demo = (id: string, name = 'normal') => {
  window.location.hash = `#/n/meds/${id}/dose?demo=${name}`;
  return render(<DoseChangeV3Route id={id} />);
};
const live = (id: string, mutate?: (r: Root) => void) => {
  const store = memoryStore();
  const root = medsDemoRoot('dose');
  mutate?.(root);
  saveRoot(root, store);
  window.location.hash = `#/n/meds/${id}/dose`;
  render(<DoseChangeV3Route id={id} store={store} getToday={() => '2026-10-28'} />);
  return store;
};
const stored = (store: KeyValueStore): Root => {
  const res = loadRoot(store);
  if (res.status !== 'ok') throw new Error('not ok');
  return res.root;
};
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const dialog = () => screen.getByRole('dialog');
const saveButton = () => screen.getByRole('button', { name: 'บันทึกการเปลี่ยนแปลง' });

beforeEach(() => {
  window.location.hash = '';
  takeFlash();
});
afterEach(() => vi.restoreAllMocks());

describe('clean page (board #41)', () => {
  it('title, three cards, no summary, the bar says nothing changed', () => {
    demo('a4');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('เปลี่ยนวิธีกิน');
    for (const h of ['ยาที่กำลังปรับ', 'วิธีกินใหม่', 'เหตุผลที่ปรับ']) expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'สรุปก่อนบันทึก' })).toBeNull();
    expect(screen.getByText('ยาของ คุณพ่อ')).toBeInTheDocument();
    expect(screen.getByText('VitaminD')).toBeInTheDocument();
    expect(screen.getByText('ยังไม่ได้เปลี่ยนอะไร')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('link', { name: 'ยกเลิก' })).toHaveAttribute('href', '#/n/meds/a4?demo=normal');
    expect(screen.getByRole('link', { name: 'กลับไปรายละเอียดยา' })).toHaveAttribute('href', '#/n/meds/a4?demo=normal');
  });

  it('four tiles; morning and evening are ON; one row per meal with its sub-line and stepper value', () => {
    demo('a4');
    const tiles = within(screen.getByRole('group', { name: 'ช่วงเวลาที่กิน' })).getAllByRole('button');
    expect(tiles.map((t) => [t.textContent, t.getAttribute('aria-pressed')])).toEqual([
      ['เช้า', 'true'],
      ['กลางวัน', 'false'],
      ['เย็น', 'true'],
      ['ก่อนนอน', 'false'],
    ]);
    expect(screen.getByRole('button', { name: 'ตั้งเช้าเพิ่มเติม' })).toHaveTextContent('หลังอาหาร · ทุกวัน');
    expect(screen.getByRole('button', { name: 'ตั้งเย็นเพิ่มเติม' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ตั้งกลางวันเพิ่มเติม' })).toBeNull();
    expect(screen.getByLabelText('เช้า 1 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('เปิด/ปิดช่วงเวลาที่ต้องกิน (เหลืออย่างน้อย 1 ช่วง)')).toBeInTheDocument();
  });

  it('the last meal that is ON cannot be turned off', () => {
    demo('a4');
    press('เย็น');
    expect(screen.getByRole('button', { name: 'เช้า' })).toHaveAttribute('aria-pressed', 'true');
    press('เช้า');
    expect(screen.getByRole('button', { name: 'เช้า' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'ตั้งเช้าเพิ่มเติม' })).toBeInTheDocument();
  });
});

describe('edited (board #42)', () => {
  it('+ twice on morning: "แก้แล้ว", the summary card with the exact texts, the save button on', () => {
    demo('a4');
    press('เพิ่มจำนวน เช้า');
    press('เพิ่มจำนวน เช้า');
    expect(screen.getByLabelText('เช้า 2 เม็ด')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: 'ตั้งเช้าเพิ่มเติม' })).getByText('แก้แล้ว')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: 'ตั้งเย็นเพิ่มเติม' })).queryByText('แก้แล้ว')).toBeNull();
    const card = screen.getByRole('heading', { name: 'สรุปก่อนบันทึก' }).closest('section') as HTMLElement;
    expect(within(card).getByText('เช้า 1 เม็ด · เย็น 1 เม็ด (รวม 2 เม็ด/วัน)')).toBeInTheDocument();
    expect(within(card).getByText('เช้า 2 เม็ด · เย็น 1 เม็ด (รวม 3 เม็ด/วัน)')).toBeInTheDocument();
    expect(within(card).getByText('ยาคงเหลือ 53 เม็ด')).toBeInTheDocument();
    expect(within(card).getByText('พอใช้ประมาณ 26 วัน → 17 วัน')).toBeInTheDocument();
    expect(within(card).getByText('เพียงพอ')).toBeInTheDocument();
    expect(within(card).getByText('มีผลตั้งแต่วันนี้ 28 ต.ค. 2569')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText('ยังไม่ได้เปลี่ยนอะไร')).toBeNull();
  });

  it('the − button stops at ½ and + stops at 4 (the limit of the data)', () => {
    demo('a4');
    press('ลดจำนวน เช้า');
    expect(screen.getByLabelText('เช้า ½ เม็ด')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ลดจำนวน เช้า' })).toBeDisabled();
    for (let i = 0; i < 8; i += 1) press('เพิ่มจำนวน เช้า');
    expect(screen.getByLabelText('เช้า 4 เม็ด')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'เพิ่มจำนวน เช้า' })).toBeDisabled();
  });

  it('new meal: noon turned on shows "เพิ่มใหม่" and 1 เม็ด (board #43)', () => {
    demo('a4');
    press('กลางวัน');
    expect(within(screen.getByRole('button', { name: 'ตั้งกลางวันเพิ่มเติม' })).getByText('เพิ่มใหม่')).toBeInTheDocument();
    expect(screen.getByLabelText('กลางวัน 1 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('เช้า 1 เม็ด · กลางวัน 1 เม็ด · เย็น 1 เม็ด (รวม 3 เม็ด/วัน)')).toBeInTheDocument();
  });

  it('removed meal: "เย็น: ตัดออก", 26 days -> 53 days (board #44)', () => {
    demo('a4');
    press('เย็น');
    expect(screen.queryByRole('button', { name: 'ตั้งเย็นเพิ่มเติม' })).toBeNull();
    expect(screen.getByText('เช้า 1 เม็ด · เย็น: ตัดออก (รวม 1 เม็ด/วัน)')).toBeInTheDocument();
    expect(screen.getByText('พอใช้ประมาณ 26 วัน → 53 วัน')).toBeInTheDocument();
  });

  it('low stock: the yellow "ใกล้หมด" chip with the word (board #45)', () => {
    demo('a13', 'dose');
    press('เพิ่มจำนวน เช้า');
    press('เพิ่มจำนวน เช้า');
    expect(screen.getByText('พอใช้ประมาณ 20 วัน → 13 วัน')).toBeInTheDocument();
    expect(screen.getByText('ใกล้หมด')).toBeInTheDocument();
  });

  it('back changes: the back arrow becomes a button that opens the discard sheet (board #47)', () => {
    demo('a4');
    press('เพิ่มจำนวน เช้า');
    expect(screen.queryByRole('link', { name: 'กลับไปรายละเอียดยา' })).toBeNull();
    press('กลับ (มีการแก้ค้างอยู่)');
    const d = dialog();
    expect(within(d).getByRole('heading', { name: 'ทิ้งการเปลี่ยนแปลง?' })).toBeInTheDocument();
    expect(within(d).getByText('วิธีกินใหม่ที่ตั้งไว้จะไม่ถูกบันทึก ยาจะกินตามวิธีเดิม')).toBeInTheDocument();
    expect(within(d).getByRole('link', { name: 'ทิ้งการเปลี่ยนแปลง' })).toHaveAttribute('href', '#/n/meds/a4?demo=normal');
    fireEvent.click(within(d).getByRole('button', { name: 'แก้ต่อ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('เช้า 1½ เม็ด')).toBeInTheDocument(); // what was set stays
  });

  it('"ยกเลิก" also opens the discard sheet when something changed', () => {
    demo('a4');
    press('เพิ่มจำนวน เย็น');
    press('ยกเลิก');
    expect(within(dialog()).getByRole('heading', { name: 'ทิ้งการเปลี่ยนแปลง?' })).toBeInTheDocument();
  });
});

describe('the meal sheet (layout A, board #52)', () => {
  it('opens from the row with the meal title; timing has three options; days chips; "เสร็จ" closes', () => {
    demo('a4');
    press('ตั้งเช้าเพิ่มเติม');
    const d = dialog();
    expect(within(d).getByRole('heading', { name: 'เช้า · ตั้งค่าเพิ่มเติม' })).toBeInTheDocument();
    expect(within(d).getByText('ก่อน/หลังอาหาร')).toBeInTheDocument();
    for (const t of ['ก่อนอาหาร', 'พร้อมอาหาร', 'หลังอาหาร']) expect(within(d).getByRole('button', { name: t })).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'หลังอาหาร' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(d).getByText('วันที่กิน (เลือกครบ 7 วัน = ทุกวัน)')).toBeInTheDocument();
    expect(within(d).getAllByRole('button', { pressed: true }).length).toBe(1 + 7);
    expect(within(d).getByText('วันที่กินใช้กับทุกมื้อ')).toBeInTheDocument();
    expect(within(d).queryByText('ปริมาณตามช้อน')).toBeNull();
    fireEvent.click(within(d).getByRole('button', { name: 'ก่อนอาหาร' }));
    fireEvent.click(within(d).getByRole('button', { name: 'เสร็จ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'ตั้งเช้าเพิ่มเติม' })).toHaveTextContent('ก่อนอาหาร · ทุกวัน');
    expect(within(screen.getByRole('button', { name: 'ตั้งเช้าเพิ่มเติม' })).getByText('แก้แล้ว')).toBeInTheDocument();
  });

  it('bedtime has no timing', () => {
    demo('a4');
    press('ก่อนนอน');
    press('ตั้งก่อนนอนเพิ่มเติม');
    expect(within(dialog()).queryByText('ก่อน/หลังอาหาร')).toBeNull();
  });

  it('days are for every meal: Mon, Wed, Fri only -> rows show "จ พ ศ", summary in weeks, the last day cannot go off', () => {
    demo('a4');
    press('ตั้งเช้าเพิ่มเติม');
    const d = dialog();
    for (const name of ['อาทิตย์', 'อังคาร', 'พฤหัสบดี', 'เสาร์']) fireEvent.click(within(d).getByRole('button', { name }));
    fireEvent.click(within(d).getByRole('button', { name: 'เสร็จ' }));
    expect(screen.getByRole('button', { name: 'ตั้งเช้าเพิ่มเติม' })).toHaveTextContent('หลังอาหาร · จ พ ศ');
    expect(screen.getByRole('button', { name: 'ตั้งเย็นเพิ่มเติม' })).toHaveTextContent('หลังอาหาร · จ พ ศ');
    expect(screen.getByText('เช้า 1 เม็ด · เย็น 1 เม็ด (รวม 14 เม็ด/สัปดาห์)')).toBeInTheDocument();
    expect(screen.getByText('เช้า 1 เม็ด · เย็น 1 เม็ด · เฉพาะ จ พ ศ (รวม 6 เม็ด/สัปดาห์)')).toBeInTheDocument();
    expect(screen.getByText(/สัปดาห์ → .*สัปดาห์/)).toBeInTheDocument();
    press('ตั้งเช้าเพิ่มเติม');
    for (const name of ['จันทร์', 'พุธ']) fireEvent.click(within(dialog()).getByRole('button', { name }));
    expect(within(dialog()).getByRole('button', { name: 'ศุกร์' })).toHaveAttribute('aria-pressed', 'true'); // the last one stays
  });

  it('every-other-day shows a third pill "วันเว้นวัน" that is selected; a day chip switches to chosen days', () => {
    demo('a4');
    cleanup();
    live('a4', (r) => {
      r.assignments = r.assignments.map((a) => (a.id === 'a4' && a.schedule.kind === 'meal' ? { ...a, schedule: { ...a.schedule, days: { kind: 'alt', anchor: '2026-10-01' } } } : a));
    });
    expect(screen.getByRole('button', { name: 'ตั้งเช้าเพิ่มเติม' })).toHaveTextContent('หลังอาหาร · วันเว้นวัน');
    press('ตั้งเช้าเพิ่มเติม');
    const d = dialog();
    expect(within(d).getByRole('button', { name: 'วันเว้นวัน' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(d).getByRole('button', { name: 'พุธ' }));
    expect(within(d).getByRole('button', { name: 'วันเว้นวัน' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(within(d).getByRole('button', { name: 'วันเว้นวัน' }));
    expect(within(d).getByRole('button', { name: 'วันเว้นวัน' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(d).getByRole('button', { name: 'เสร็จ' }));
    expect(screen.getByText('ยังไม่ได้เปลี่ยนอะไร')).toBeInTheDocument();
  });
});

describe('liquid, cream, four meals (boards #48, #49, #52)', () => {
  it('liquid: ml values, 2.5 steps, spoon pills in the sheet, texts in ml', () => {
    demo('a11', 'dose');
    expect(screen.getByLabelText('เช้า 5 มล.')).toBeInTheDocument();
    press('เพิ่มจำนวน เช้า');
    expect(screen.getByLabelText('เช้า 7.5 มล.')).toBeInTheDocument();
    press('เพิ่มจำนวน เช้า');
    expect(screen.getByText('เช้า 10 มล. · เย็น 5 มล. (รวม 15 มล./วัน)')).toBeInTheDocument();
    expect(screen.getByText('ยาคงเหลือ 240 มล.')).toBeInTheDocument();
    expect(screen.getByText('พอใช้ประมาณ 24 วัน → 16 วัน')).toBeInTheDocument();
    press('ตั้งเช้าเพิ่มเติม');
    const d = dialog();
    expect(within(d).getByText('ปริมาณตามช้อน')).toBeInTheDocument();
    fireEvent.click(within(d).getByRole('button', { name: '1 ช้อนโต๊ะ = 15 มล.' }));
    fireEvent.click(within(d).getByRole('button', { name: 'เสร็จ' }));
    expect(screen.getByLabelText('เช้า 15 มล.')).toBeInTheDocument();
  });

  it('cream: no stepper, no timing, its own hint; summary has names and the tube line, no days, no chip', () => {
    demo('a9', 'cream');
    expect(screen.queryByRole('button', { name: /^เพิ่มจำนวน/ })).toBeNull();
    expect(screen.getByText('เปิด/ปิดช่วงเวลา · ทาหรือหยอดตามฉลาก ไม่ตัดสต็อกให้เอง')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ตั้งเช้าเพิ่มเติม' })).toHaveTextContent('ทุกวัน');
    press('เย็น');
    expect(screen.getByText('เช้า · เย็น')).toBeInTheDocument();
    expect(screen.getByText('ยาคงเหลือ สำรอง 2 หลอด')).toBeInTheDocument();
    expect(screen.getByText('ครีมไม่นับวันที่พอใช้')).toBeInTheDocument();
    expect(screen.queryByText('เพียงพอ')).toBeNull();
    press('ตั้งเช้าเพิ่มเติม');
    expect(within(dialog()).queryByText('ก่อน/หลังอาหาร')).toBeNull();
  });

  it('four meals: four rows and four texts in the summary', () => {
    demo('a12', 'dose');
    expect(screen.getAllByRole('button', { name: /^ตั้ง.*เพิ่มเติม$/ })).toHaveLength(4);
    press('เพิ่มจำนวน เช้า');
    press('เพิ่มจำนวน เช้า');
    expect(screen.getByText('เช้า 2 เม็ด · กลางวัน 1 เม็ด · เย็น 1 เม็ด · ก่อนนอน 1 เม็ด (รวม 5 เม็ด/วัน)')).toBeInTheDocument();
    expect(screen.getByText('พอใช้ประมาณ 30 วัน → 24 วัน')).toBeInTheDocument();
  });
});

describe('reason and note', () => {
  it('"หมอสั่งปรับ" is the default; the note counts letters up to 200', () => {
    demo('a4');
    expect(screen.getByRole('radio', { name: 'หมอสั่งปรับ' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'ปรับเอง หรืออื่นๆ' })).not.toBeChecked();
    expect(screen.getByText('0/200')).toBeInTheDocument();
    const note = screen.getByLabelText('หมายเหตุ (ไม่บังคับ)');
    expect(note).toHaveAttribute('maxlength', '200');
    expect(note).toHaveAttribute('placeholder', 'เช่น หมอเพิ่มโดสเช้า ตามผลเลือด');
    fireEvent.change(note, { target: { value: 'ทดสอบ' } });
    expect(screen.getByText('5/200')).toBeInTheDocument();
  });
});

describe('cannot change here', () => {
  it('an every-N-hours medicine: a card says so and there is no save bar', () => {
    demo('a14', 'dose');
    expect(screen.getByText('ยานี้กินทุก 8 ชั่วโมง ยังเปลี่ยนวิธีกินในหน้านี้ไม่ได้')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'บันทึกการเปลี่ยนแปลง' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'วิธีกินใหม่' })).toBeNull();
    for (const l of screen.getAllByRole('link', { name: 'กลับไปรายละเอียดยา' })) expect(l).toHaveAttribute('href', '#/n/meds/a14?demo=dose');
  });

  it('a stopped medicine: says so, no save bar', () => {
    demo('a7', 'stopped');
    expect(screen.getByText('ยานี้หยุดแล้ว กลับมากินยาก่อน ถึงจะเปลี่ยนวิธีกินได้')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'บันทึกการเปลี่ยนแปลง' })).toBeNull();
  });

  it('an unknown medicine says so', () => {
    demo('zzz');
    expect(screen.getByText('ไม่พบยานี้')).toBeInTheDocument();
  });
});

describe('save', () => {
  it('writes one adjust event + the new schedule, recounts the stock to today, goes back with the message', () => {
    const store = live('a4', (r) => {
      r.assignments = r.assignments.map((a) => (a.id === 'a4' ? { ...a, stock: { kind: 'count', strips: 10, loose: 0, countedOn: '2026-10-18' } } : a)); // 100 pills, 10 days ago
    });
    const before = medsDemoRoot('dose').events.length;
    press('เพิ่มจำนวน เช้า');
    press('เพิ่มจำนวน เช้า');
    fireEvent.click(screen.getByRole('radio', { name: 'ปรับเอง หรืออื่นๆ' }));
    fireEvent.change(screen.getByLabelText('หมายเหตุ (ไม่บังคับ)'), { target: { value: ' ปรับตามฉลากใหม่ ' } });
    press('บันทึกการเปลี่ยนแปลง');
    const r = stored(store);
    expect(rootSchema.safeParse(r).success).toBe(true);
    expect(r.events).toHaveLength(before + 1);
    expect(r.events.at(-1)).toMatchObject({ type: 'adjust', assignmentId: 'a4', reason: 'self_or_other', note: 'ปรับตามฉลากใหม่', effectiveOn: '2026-10-28' });
    const a = r.assignments.find((x) => x.id === 'a4');
    expect(a?.schedule).toMatchObject({ slots: { morning: { pills: 2 }, evening: { pills: 1 } } });
    expect(a?.stock).toEqual({ kind: 'count', strips: 8, loose: 0, countedOn: '2026-10-28' }); // 100 - 10 x 2 = 80, not back-dated
    expect(window.location.hash).toBe('#/n/meds/a4');
    expect(takeFlash()).toBe('บันทึกวิธีกินใหม่แล้ว');
  });

  it('the medicine page then shows the toast and the history entry', () => {
    const store = live('a4');
    press('เพิ่มจำนวน เช้า');
    press('เพิ่มจำนวน เช้า');
    fireEvent.change(screen.getByLabelText('หมายเหตุ (ไม่บังคับ)'), { target: { value: 'ตามผลเลือด' } });
    press('บันทึกการเปลี่ยนแปลง');
    cleanup();
    window.location.hash = '#/n/meds/a4';
    render(<MedDetailV3Route id="a4" store={store} getToday={() => '2026-10-28'} />);
    expect(screen.getByRole('status')).toHaveTextContent('บันทึกวิธีกินใหม่แล้ว');
    expect(screen.getByText('28 ต.ค. 2569')).toBeInTheDocument();
    expect(screen.getByText('ปรับโดส')).toBeInTheDocument();
    expect(screen.getByText('เช้า 1 เม็ด + เย็น 1 เม็ด → เช้า 2 เม็ด + เย็น 1 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('เหตุผล: หมอสั่ง')).toBeInTheDocument();
    expect(screen.getByText('“ตามผลเลือด”')).toBeInTheDocument();
  });

  it('a demo saves nothing (not even a read of storage) and still goes back with the message', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    demo('a4');
    press('เพิ่มจำนวน เช้า');
    press('บันทึกการเปลี่ยนแปลง');
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/n/meds/a4?demo=normal');
    expect(takeFlash()).toBe('บันทึกวิธีกินใหม่แล้ว');
  });

  it('a failed save keeps the draft and shows a Thai message', () => {
    const store = live('a4');
    const before = store.data[STORAGE_KEY];
    vi.spyOn(storage, 'saveRoot').mockReturnValue({ ok: false, reason: 'quota' });
    press('เพิ่มจำนวน เช้า');
    press('บันทึกการเปลี่ยนแปลง');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('เช้า 1½ เม็ด')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/n/meds/a4/dose');
    expect(store.data[STORAGE_KEY]).toBe(before);
  });

  it('the app route works: #/n/meds/a4/dose?demo=normal', () => {
    window.location.hash = '#/n/meds/a4/dose?demo=normal';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('เปลี่ยนวิธีกิน');
  });
});
