// Screen tests for step 3.2b-2: all medicines, add medicine (3 steps), medicine detail. Made-up data only; the clock is
// injected (today = Sunday 18 Oct 2026, the owner's hand examples 1-5).
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from './App';
import { loadSample } from './domain/actions';
import { NOW } from './domain/fixtures';
import { assignment, dailyMeal, person, rootWith } from './domain/helpers.test-util';
import { emptyRoot, rootSchema, type Assignment, type Root } from './domain/schema';
import { PREV_KEY, saveRoot, STORAGE_KEY } from './domain/storage';

const TODAY = '2026-10-18'; // Sunday
const clock = { today: TODAY };
const getToday = () => clock.today;

const TWICE = dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } });
const MED = { id: 'm1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด' };

/** Example 1: member A, medicine ก: every day morning 1 + evening 1, counted 20 on 15 Oct -> 14 today, 7 days left. */
const example = (over: Partial<Root> = {}, a: Partial<Assignment> = {}): Root =>
  rootWith({
    persons: [person({ id: 'pA', name: 'Test Person A' })],
    medications: [MED],
    assignments: [assignment({ id: 'a1', personId: 'pA', schedule: TWICE, stock: { qty: 20, countedOn: '2026-10-15' }, ...a })],
    ...over,
  });

const stored = (): Root => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Root;
const seed = (root: Root) => expect(saveRoot(root).ok).toBe(true);
const nav = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
const open = (hash: string, root: Root = example()) => {
  seed(root);
  window.location.hash = hash;
  return render(<App getToday={getToday} />);
};
const click = (el: HTMLElement) => fireEvent.click(el);
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const radio = (name: string | RegExp) => screen.getByRole('radio', { name });

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
  clock.today = TODAY;
  window.location.hash = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
});

/** Group with a given name (the stock / expiry blocks of the detail screen). */
const group = (name: string) => screen.getByRole('group', { name });

describe('all medicines (#/meds)', () => {
  it('example 1: member card, medicine row with the schedule text and the badge "ใกล้หมด" (7 days left, border of 7)', () => {
    open('#/meds');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ยาทั้งหมด');
    const card = screen.getByRole('heading', { name: 'Test Person A' }).closest('section') as HTMLElement;
    expect(within(card).getByText('ยา 1 รายการ')).toBeInTheDocument();
    const row = within(card).getByRole('link', { name: /ยาตัวอย่าง ก/ });
    expect(within(row).getByText('เช้า 1 เม็ด · เย็น 1 เม็ด')).toBeInTheDocument();
    expect(within(row).getByText('ใกล้หมด')).toBeInTheDocument();
    expect(row).toHaveAttribute('href', '#/meds/a1');
  });

  it('the row is a link to the detail #/meds/:id, which opens', () => {
    open('#/meds');
    const href = screen.getByRole('link', { name: /ยาตัวอย่าง ก/ }).getAttribute('href') ?? '';
    nav(href);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('รายละเอียดยา');
    expect(screen.getByRole('heading', { name: 'ยาตัวอย่าง ก' })).toBeInTheDocument();
  });

  it('"จัดยาเอง" is shown for a self-managed member; removed members are not listed', () => {
    open(
      '#/meds',
      example({
        persons: [
          person({ id: 'pA', name: 'Test Person A', selfManaged: true }),
          person({ id: 'pB', name: 'Test Person B', removedAt: NOW }),
        ],
      }),
    );
    expect(screen.getByText('ยา 1 รายการ · จัดยาเอง')).toBeInTheDocument();
    expect(screen.queryByText('Test Person B')).not.toBeInTheDocument();
  });

  it('every status has an icon AND a word: expired, low, expiring, enough, not counted, stopped', () => {
    const med = (id: string, name: string) => ({ id, name, unit: 'เม็ด' });
    const root = rootWith({
      persons: [person({ id: 'pA', name: 'Test Person A' })],
      medications: [med('m1', 'Med Expired'), med('m2', 'Med Low'), med('m3', 'Med Soon'), med('m4', 'Med Enough'), med('m5', 'Med None'), med('m6', 'Med Stopped')],
      assignments: [
        assignment({ id: 'a1', personId: 'pA', medicationId: 'm1', schedule: TWICE, stock: { qty: 500, countedOn: TODAY }, expiry: '2026-10-01' }),
        assignment({ id: 'a2', personId: 'pA', medicationId: 'm2', schedule: TWICE, stock: { qty: 20, countedOn: '2026-10-15' } }),
        assignment({ id: 'a3', personId: 'pA', medicationId: 'm3', schedule: TWICE, stock: { qty: 500, countedOn: TODAY }, expiry: '2026-10-25' }),
        assignment({ id: 'a4', personId: 'pA', medicationId: 'm4', schedule: TWICE, stock: { qty: 500, countedOn: TODAY } }),
        assignment({ id: 'a5', personId: 'pA', medicationId: 'm5', schedule: TWICE }),
        assignment({ id: 'a6', personId: 'pA', medicationId: 'm6', schedule: TWICE, status: 'stopped' }),
      ],
    });
    open('#/meds', root);
    for (const word of ['หมดอายุแล้ว', 'ใกล้หมด', 'ใกล้หมดอายุ', 'สต๊อกพอ', 'ไม่ได้ใส่จำนวน', 'หยุดใช้แล้ว']) {
      const badge = screen.getAllByText(word)[0] as HTMLElement;
      expect(badge.querySelector('svg'), `icon next to "${word}"`).not.toBeNull();
    }
  });

  it('a stopped medicine sits under "ยาที่หยุดแล้ว", after the active ones; an empty member says "ยังไม่มียา"', () => {
    const root = example(
      { persons: [person({ id: 'pA', name: 'Test Person A' }), person({ id: 'pB', name: 'Test Person B' })], medications: [MED, { id: 'm2', name: 'ยาตัวอย่าง ข', unit: 'เม็ด' }] },
    );
    root.assignments.push(assignment({ id: 'a2', personId: 'pA', medicationId: 'm2', schedule: TWICE, status: 'stopped' }));
    open('#/meds', root);
    const card = screen.getByRole('heading', { name: 'Test Person A' }).closest('section') as HTMLElement;
    const heading = within(card).getByRole('heading', { name: 'ยาที่หยุดแล้ว' });
    const stopped = within(card).getByRole('link', { name: /ยาตัวอย่าง ข/ });
    const active = within(card).getByRole('link', { name: /ยาตัวอย่าง ก/ });
    expect(active.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(stopped) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(stopped).getByText('หยุดใช้แล้ว')).toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: 'Test Person B' }).closest('section') as HTMLElement).getByText('ยังไม่มียา')).toBeInTheDocument();
  });

  it('an empty house has a lead-in sentence and an add button; the hidden part (prices, step 3.3b) is not there', () => {
    open('#/meds', emptyRoot(NOW));
    expect(screen.getByText('ยังไม่มียาในบ้าน')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'เพิ่มยา' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'ยาสามัญประจำบ้าน' })).toBeInTheDocument(); // the tab exists since step 3.3a
    expect(screen.queryByText(/ราคา/)).not.toBeInTheDocument();
  });
});

describe('medicine detail (#/meds/:id)', () => {
  it('example 1: name, whose it is, badges, how it is taken, 14 left for 7 days, no expiry, prices are there since 3.3b-2, nothing hidden-but-promised', () => {
    open('#/meds/a1');
    expect(screen.getByRole('heading', { name: 'ยาตัวอย่าง ก' })).toBeInTheDocument();
    expect(screen.getByText('กำลังใช้')).toBeInTheDocument();
    expect(screen.getByText('ใกล้หมด')).toBeInTheDocument();
    expect(screen.getByText('เช้า หลังอาหาร 1 เม็ด · เย็น หลังอาหาร 1 เม็ด')).toBeInTheDocument();
    const stock = within(group('เหลืออยู่'));
    expect(stock.getByText('14 เม็ด')).toBeInTheDocument();
    expect(stock.getByText('พอทาน 7 วัน (ถึง 24 ต.ค. 2569)')).toBeInTheDocument();
    expect(within(group('หมดอายุ')).getByText('ไม่ระบุ')).toBeInTheDocument();
    for (const hidden of [/แชร์ให้แพทย์/, /กำลังจะมา/]) expect(screen.queryByText(hidden)).not.toBeInTheDocument();
  });

  it('no count is "ไม่ได้ใส่จำนวนคงเหลือ", never 0', () => {
    open('#/meds/a1', example({}, { stock: null }));
    expect(within(group('เหลืออยู่')).getByText('ไม่ได้ใส่จำนวนคงเหลือ')).toBeInTheDocument();
    expect(within(group('เหลืออยู่')).queryByText(/^0/)).not.toBeInTheDocument();
  });

  it('expiry: Thai date and distance; an expired medicine says so in words with an icon', () => {
    open('#/meds/a1', example({}, { expiry: '2026-10-10' }));
    expect(within(group('หมดอายุ')).getByText('10 ต.ค. 2569')).toBeInTheDocument();
    expect(within(group('หมดอายุ')).getByText('หมดอายุแล้ว (เกิน 8 วัน)')).toBeInTheDocument();
    expect(screen.getByText('หมดอายุแล้ว').querySelector('svg')).not.toBeNull();
  });

  it('an unknown id is a polite note with a way back, not a blank page', () => {
    open('#/meds/nope');
    expect(screen.getByText(/ไม่พบยานี้/)).toBeInTheDocument();
    click(button('กลับไปยาทั้งหมด'));
    expect(window.location.hash).toBe('#/meds');
  });

  it('example 2: adjusting to morning 2 + evening 2 needs a reason; stock stays 14; history has the adjustment with the reason', () => {
    open('#/meds/a1');
    click(button('ปรับโดส / เปลี่ยนวิธีทาน'));
    expect(button('บันทึกการปรับโดส')).toBeDisabled();
    expect(screen.getByText('ยังไม่ได้เปลี่ยนอะไร')).toBeInTheDocument();

    for (let i = 0; i < 2; i++) {
      click(button('เพิ่มจำนวนที่ทานเช้า')); // 1 -> 1½ -> 2 (steps of half)
      click(button('เพิ่มจำนวนที่ทานเย็น'));
    }
    expect(screen.getByText(/เป็น/, { selector: 'b' })).toBeInTheDocument();
    expect(button('บันทึกการปรับโดส')).toBeDisabled(); // no reason yet
    expect(screen.getByText('เลือกเหตุผลก่อนบันทึก')).toBeInTheDocument();
    expect(screen.getByText('วันนี้ (วันที่ 18 ต.ค. 2569)')).toBeInTheDocument();

    click(radio('หมอสั่ง'));
    expect(button('บันทึกการปรับโดส')).toBeEnabled();
    click(button('บันทึกการปรับโดส'));

    expect(screen.getByText('บันทึกการปรับโดสแล้ว และเพิ่มในประวัติ')).toBeInTheDocument();
    expect(within(group('เหลืออยู่')).getByText('14 เม็ด')).toBeInTheDocument();
    expect(screen.getAllByText('เช้า หลังอาหาร 2 เม็ด · เย็น หลังอาหาร 2 เม็ด').length).toBeGreaterThan(0); // "วิธีทานตอนนี้" is the new one
    const history = within(screen.getByRole('list', { name: 'ประวัติการใช้ยา' }));
    expect(history.getAllByRole('listitem')).toHaveLength(1);
    expect(history.getByText('ปรับโดส')).toBeInTheDocument();
    expect(history.getByText('18 ต.ค. 2569')).toBeInTheDocument();
    expect(history.getByText('จาก เช้า หลังอาหาร 1 เม็ด · เย็น หลังอาหาร 1 เม็ด')).toBeInTheDocument();
    expect(history.getByText('เป็น เช้า หลังอาหาร 2 เม็ด · เย็น หลังอาหาร 2 เม็ด')).toBeInTheDocument();
    expect(history.getByText('หมอสั่ง', { exact: false })).toBeInTheDocument();
    expect(stored().events).toHaveLength(1);
    expect(stored().events[0]).toMatchObject({ type: 'adjust', reason: 'หมอสั่ง', effectiveOn: TODAY });
  });

  it('adjust: the note is limited to 200 characters and the allergy reason only says to tell the doctor', () => {
    open('#/meds/a1');
    click(button('ปรับโดส / เปลี่ยนวิธีทาน'));
    expect(screen.getByRole('textbox', { name: /หมายเหตุ/ })).toHaveAttribute('maxlength', '200');
    click(radio('แพ้ยา'));
    expect(screen.getByText('ถ้าแพ้ยานี้ ควรแจ้งแพทย์หรือเภสัชกร')).toBeInTheDocument();
    expect(screen.queryByText(/กำลังจะมา/)).not.toBeInTheDocument();
  });

  it('example 3: stop with a reason -> moved to "ยาที่หยุดแล้ว", gone from today; resume -> back, and the stopped days are not deducted', () => {
    const view = open('#/meds/a1');
    click(button('หยุดยา'));
    expect(button('ยืนยันหยุดยา')).toBeDisabled();
    click(radio('ใช้ยาไม่ได้ / ผลข้างเคียง'));
    click(button('ยืนยันหยุดยา'));
    expect(screen.getByText('หยุดยาแล้ว ยานี้จะไม่ขึ้นในรายการยาวันนี้')).toBeInTheDocument();
    expect(screen.getByText('หยุดใช้แล้ว')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'กลับมาใช้ยานี้อีก' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'หยุดยา' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ปรับโดส/ })).not.toBeInTheDocument();

    nav('#/meds');
    const card = screen.getByRole('heading', { name: 'Test Person A' }).closest('section') as HTMLElement;
    expect(within(card).getByRole('heading', { name: 'ยาที่หยุดแล้ว' })).toBeInTheDocument();
    expect(within(card).getByText('ยา 0 รายการ')).toBeInTheDocument();
    nav('#/today');
    expect(screen.queryByText('ยาตัวอย่าง ก')).not.toBeInTheDocument();
    nav('#/');
    expect(screen.queryByText('ยาตัวอย่าง ก')).not.toBeInTheDocument();

    clock.today = '2026-10-21'; // three days later: nothing is deducted while stopped
    view.unmount();
    window.location.hash = '#/meds/a1';
    render(<App getToday={getToday} />);
    expect(within(group('เหลืออยู่')).getByText('14 เม็ด')).toBeInTheDocument();
    click(button('กลับมาใช้ยานี้อีก'));
    expect(screen.getByText('กลับมาใช้ยานี้แล้ว')).toBeInTheDocument();
    expect(screen.getByText('กำลังใช้')).toBeInTheDocument();
    expect(within(group('เหลืออยู่')).getByText('14 เม็ด')).toBeInTheDocument();
    expect(stored().events.map((e) => e.type)).toEqual(['stop', 'resume']);
    nav('#/today');
    expect(screen.getAllByText('ยาตัวอย่าง ก').length).toBeGreaterThan(0);
  });

  it('example 4: renaming a medicine used by 2 people warns "ยานี้ใช้อยู่ 2 คน" first; cancel changes nothing; confirm renames for both', () => {
    const root = example({
      persons: [person({ id: 'pA', name: 'Test Person A' }), person({ id: 'pB', name: 'Test Person B' })],
    });
    root.assignments.push(assignment({ id: 'a2', personId: 'pB', schedule: TWICE, stock: { qty: 30, countedOn: TODAY } }));
    open('#/meds/a1', root);
    click(button('แก้ไขข้อมูลยา'));
    type(screen.getByLabelText('ชื่อยาและความแรง'), 'ยาตัวอย่าง ก 10 mg');
    click(button('บันทึกข้อมูล'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('ยานี้ใช้อยู่ 2 คน การแก้ชื่อจะเปลี่ยนให้ทุกคน')).toBeInTheDocument();
    expect(stored().medications[0]?.name).toBe('ยาตัวอย่าง ก'); // nothing saved before the person agrees

    click(within(dialog).getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stored().medications[0]?.name).toBe('ยาตัวอย่าง ก');

    click(button('บันทึกข้อมูล'));
    click(within(screen.getByRole('dialog')).getByRole('button', { name: 'เปลี่ยนชื่อให้ทุกคน' }));
    expect(screen.getByText('บันทึกข้อมูลยาแล้ว')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ยาตัวอย่าง ก 10 mg' })).toBeInTheDocument();
    expect(stored().medications[0]?.name).toBe('ยาตัวอย่าง ก 10 mg');
    expect(stored().events.filter((e) => e.type === 'edit')).toHaveLength(2); // one for each member
  });

  it('renaming a medicine only one person uses needs no warning; a recount is a new count from today, listed in the history', () => {
    open('#/meds/a1');
    click(button('แก้ไขข้อมูลยา'));
    expect(button('บันทึกข้อมูล')).toBeDisabled();
    expect(screen.getByText('ยังไม่ได้เปลี่ยนอะไร')).toBeInTheDocument();
    expect(screen.getByLabelText(/จำนวนที่เหลือ/)).toHaveValue(14);
    type(screen.getByLabelText(/จำนวนที่เหลือ/), '30');
    type(screen.getByLabelText(/บันทึกเพิ่มเติม/), 'เก็บในตู้');
    click(button('บันทึกข้อมูล'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(group('เหลืออยู่')).getByText('30 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('เก็บในตู้')).toBeInTheDocument();
    expect(screen.getByText('จำนวนที่เหลือ: 14 เม็ด → 30 เม็ด')).toBeInTheDocument();
    expect(stored().assignments[0]?.stock).toEqual({ qty: 30, countedOn: TODAY });
  });

  it('a save that fails: no success message, the form stays open with the Thai reason, and nothing changed in memory or on disk', () => {
    open('#/meds/a1');
    click(button('ปรับโดส / เปลี่ยนวิธีทาน'));
    click(button('เพิ่มจำนวนที่ทานเช้า'));
    click(radio('หมอสั่ง'));
    const before = localStorage.getItem(STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    click(button('บันทึกการปรับโดส'));

    expect(screen.queryByText(/บันทึกการปรับโดสแล้ว/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
    expect(button('บันทึกการปรับโดส')).toBeInTheDocument(); // still in the form
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);

    vi.restoreAllMocks(); // disk fine again: the same form saves
    click(button('บันทึกการปรับโดส'));
    expect(screen.getByText('บันทึกการปรับโดสแล้ว และเพิ่มในประวัติ')).toBeInTheDocument();
    expect(stored().events).toHaveLength(1);
  });
});

describe('add medicine, 3 steps (#/meds/new ...)', () => {
  /** Step 1 with the member chosen. */
  const fillStep1 = (name = 'ยาตัวอย่าง ใหม่') => {
    type(screen.getByLabelText('ชื่อยา'), name);
  };

  it('three steps with counters "ขั้น N จาก 3"; the medicine appears in today; the sentence about asking the doctor stays', () => {
    open('#/meds/new', rootWith({ persons: [person({ id: 'pA', name: 'Test Person A' }), person({ id: 'pB', name: 'Test Person B' })] }));
    expect(screen.getByText('ขั้น 1 จาก 3')).toBeInTheDocument();
    expect(button('ถัดไป')).toBeDisabled();
    expect(screen.getByText('ใส่ชื่อยาก่อน แล้วค่อยกดถัดไป')).toBeInTheDocument();
    fillStep1();
    expect(screen.getByText('ตรวจชื่อกับซองยาก่อนบันทึก ขนาดยาและวิธีกินให้กรอกเองในขั้นถัดไป')).toBeInTheDocument();
    expect(button('ถัดไป')).toBeDisabled();
    expect(screen.getByText('เลือกว่ายานี้ของใคร')).toBeInTheDocument();
    click(radio('Test Person A'));
    expect(button('ถัดไป')).toBeEnabled();
    click(button('ถัดไป'));
    nav(window.location.hash);

    expect(screen.getByText('ขั้น 2 จาก 3')).toBeInTheDocument();
    expect(screen.getByText('ใส่ตามที่แพทย์หรือเภสัชกรสั่ง ถ้าไม่แน่ใจให้ถามก่อน')).toBeInTheDocument();
    expect(screen.getByText('เช้า · หลังอาหาร · 1 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('ความถี่: ทุกวัน')).toBeInTheDocument();
    click(button('ถัดไป'));
    nav(window.location.hash);

    expect(screen.getByText('ขั้น 3 จาก 3')).toBeInTheDocument();
    type(screen.getByLabelText(/จำนวนที่มี/), '20');
    click(button('ซอง'));
    click(button('บันทึกยา'));
    expect(screen.getByRole('heading', { name: 'เพิ่มยาแล้ว' })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    const root = stored();
    expect(rootSchema.safeParse(root).success).toBe(true);
    expect(root.medications).toMatchObject([{ name: 'ยาตัวอย่าง ใหม่', unit: 'ซอง' }]);
    expect(root.assignments[0]).toMatchObject({ personId: 'pA', status: 'active', stock: { qty: 20, countedOn: TODAY } });
    expect(root.events).toMatchObject([{ type: 'start', effectiveOn: TODAY }]);

    click(screen.getByRole('link', { name: 'ไปที่ยาทั้งหมด' }));
    nav('#/meds');
    expect(screen.getByRole('link', { name: /ยาตัวอย่าง ใหม่/ })).toBeInTheDocument();
    nav('#/today');
    expect(screen.getByText('ยาตัวอย่าง ใหม่')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Test Person A · 1 ซอง · ยังไม่จัด')).toBeInTheDocument();
  });

  it('"เพิ่มยาอีกตัว" starts again from an empty first step', () => {
    open('#/meds/new', rootWith({ persons: [person({ id: 'pA', name: 'Test Person A' })] }));
    fillStep1();
    click(button('ถัดไป')); // only one member: chosen already
    nav(window.location.hash);
    click(button('ถัดไป'));
    nav(window.location.hash);
    click(button('บันทึกยา')); // no count, default unit
    expect(screen.getByRole('heading', { name: 'เพิ่มยาแล้ว' })).toBeInTheDocument();
    expect(stored().assignments[0]?.stock).toBeNull();
    click(screen.getByRole('link', { name: 'เพิ่มยาอีกตัว' }));
    nav('#/meds/new');
    expect(screen.getByLabelText('ชื่อยา')).toHaveValue('');
    expect(screen.getByText('ขั้น 1 จาก 3')).toBeInTheDocument();
  });

  it('going back keeps what was typed; a refresh in the middle brings back a polite note, not a blank page', () => {
    const view = open('#/meds/new', rootWith({ persons: [person({ id: 'pA', name: 'Test Person A' })] }));
    fillStep1('ยาตัวอย่าง เก็บไว้');
    click(button('ถัดไป'));
    nav(window.location.hash);
    click(screen.getByRole('link', { name: 'กลับไปขั้นที่ 1' }));
    nav('#/meds/new');
    expect(screen.getByLabelText('ชื่อยา')).toHaveValue('ยาตัวอย่าง เก็บไว้');
    expect(radio('Test Person A')).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull(); // the seed only: the draft wrote nothing new
    expect(stored().medications).toHaveLength(0);

    view.unmount(); // refresh on step 2
    window.location.hash = '#/meds/new/schedule';
    render(<App getToday={getToday} />);
    expect(screen.getByText(/ข้อมูลที่กรอกไว้หายไป/)).toBeInTheDocument();
    click(button('ไปขั้นแรก'));
    expect(window.location.hash).toBe('#/meds/new');
  });

  it('step 2 deep-link with nothing typed and step 3 deep-link both give the polite note', () => {
    open('#/meds/new/stock', rootWith({ persons: [person()] }));
    expect(screen.getByText(/ข้อมูลที่กรอกไว้หายไป/)).toBeInTheDocument();
  });

  it('example 5: choosing จันทร์ พุธ ศุกร์ stores [1, 3, 5]; the medicine shows "จ. พ. ศ." and the adjust form shows the same days ticked', () => {
    open('#/meds/new', rootWith({ persons: [person({ id: 'pA', name: 'Test Person A' })] }));
    fillStep1();
    click(button('ถัดไป'));
    nav(window.location.hash);
    expect(button('ถัดไป')).toBeEnabled();
    click(radio('เลือกวัน'));
    expect(button('ถัดไป')).toBeDisabled();
    expect(screen.getAllByText('เลือกวันอย่างน้อย 1 วัน').length).toBeGreaterThan(0);
    for (const d of ['จันทร์', 'พุธ', 'ศุกร์']) click(screen.getByRole('checkbox', { name: d }));
    expect(screen.getByText('ความถี่: จ. พ. ศ.')).toBeInTheDocument();
    click(button('ถัดไป'));
    nav(window.location.hash);
    click(button('บันทึกยา'));

    expect(stored().assignments[0]?.schedule).toMatchObject({ days: { kind: 'weekdays', days: [1, 3, 5] } });
    click(screen.getByRole('link', { name: 'ไปที่ยาทั้งหมด' }));
    nav('#/meds');
    expect(screen.getByText('เช้า 1 เม็ด · จ. พ. ศ.')).toBeInTheDocument();
    const id = stored().assignments[0]?.id ?? '';
    nav(`#/meds/${id}`);
    click(button('ปรับโดส / เปลี่ยนวิธีทาน'));
    expect(radio('เลือกวัน')).toHaveAttribute('aria-checked', 'true');
    for (const d of ['จันทร์', 'พุธ', 'ศุกร์']) expect(screen.getByRole('checkbox', { name: d })).toHaveAttribute('aria-checked', 'true');
    for (const d of ['อังคาร', 'พฤหัสบดี', 'เสาร์', 'อาทิตย์']) expect(screen.getByRole('checkbox', { name: d })).toHaveAttribute('aria-checked', 'false');
  });

  it('every X hours: first time, amount and course; the day schedule shows the times; "every other day" counts from today', () => {
    open('#/meds/new', rootWith({ persons: [person({ id: 'pA', name: 'Test Person A' })] }));
    fillStep1();
    click(button('ถัดไป'));
    nav(window.location.hash);
    click(radio(/ทุกกี่ชั่วโมง/));
    expect(screen.getByText('08:00 · 20:00')).toBeInTheDocument();
    click(radio('8 ชม.'));
    expect(screen.getByText('00:00 · 08:00 · 16:00')).toBeInTheDocument();
    expect(screen.getByText('ทาน 5 วัน (รวม 15 ครั้ง)')).toBeInTheDocument();
    click(radio('ทานต่อเนื่อง'));
    expect(screen.getByText('ทานต่อเนื่อง ไม่กำหนดวันสิ้นสุด')).toBeInTheDocument();
    click(radio('กำหนดจำนวนวัน'));
    click(button('เพิ่มจำนวนวัน'));
    expect(screen.getByText('6 วัน')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ทานครั้งแรกกี่โมง'), { target: { value: '' } });
    expect(button('ถัดไป')).toBeDisabled();
    expect(screen.getAllByText('ใส่เวลาที่ทานครั้งแรกก่อน').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('ทานครั้งแรกกี่โมง'), { target: { value: '06:30' } });
    click(button('ถัดไป'));
    nav(window.location.hash);
    click(button('บันทึกยา'));
    expect(stored().assignments[0]?.schedule).toEqual({
      kind: 'interval',
      everyHours: 8,
      firstTime: '06:30',
      pills: 1,
      course: { kind: 'days', days: 6, startDate: TODAY },
    });
  });

  it('every other day: anchor = today', () => {
    open('#/meds/new', rootWith({ persons: [person({ id: 'pA', name: 'Test Person A' })] }));
    fillStep1();
    click(button('ถัดไป'));
    nav(window.location.hash);
    click(radio('วันเว้นวัน'));
    expect(screen.getByText('ความถี่: วันเว้นวัน (เริ่มวันนี้)')).toBeInTheDocument();
    click(button('ถัดไป'));
    nav(window.location.hash);
    click(button('บันทึกยา'));
    expect(stored().assignments[0]?.schedule).toMatchObject({ days: { kind: 'alt', anchor: TODAY } });
  });

  it('name suggestions: after 2 letters the names already in the house, a row "ใช้ชื่อ “…” ตามที่พิมพ์", always free typing', () => {
    open('#/meds/new');
    const input = screen.getByLabelText('ชื่อยา');
    type(input, 'ย');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    type(input, 'ตัวอย่าง');
    const list = within(screen.getByRole('listbox'));
    expect(list.getByRole('option', { name: /ยาตัวอย่าง ก/ })).toBeInTheDocument();
    expect(list.getByRole('button', { name: 'ใช้ชื่อ “ตัวอย่าง” ตามที่พิมพ์' })).toBeInTheDocument();
    click(list.getByRole('option', { name: /ยาตัวอย่าง ก/ }));
    expect(input).toHaveValue('ยาตัวอย่าง ก');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    type(input, 'zzz');
    expect(within(screen.getByRole('listbox')).getByText('ไม่พบชื่อที่เคยเพิ่มในบ้าน')).toBeInTheDocument();
    click(screen.getByRole('button', { name: 'ใช้ชื่อ “zzz” ตามที่พิมพ์' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('example 4: the same name for member 2 uses the same medicine, the unit is locked, and one medicine is kept', () => {
    const root = example({ persons: [person({ id: 'pA', name: 'Test Person A' }), person({ id: 'pB', name: 'Test Person B' })] });
    open('#/meds/new', root);
    fillStep1('  ยาตัวอย่าง ก ');
    expect(screen.getByText(/ยานี้มีในบ้านแล้ว ใช้อยู่ 1 คน/)).toBeInTheDocument();
    click(radio('Test Person B'));
    click(button('ถัดไป'));
    nav(window.location.hash);
    click(button('ถัดไป'));
    nav(window.location.hash);
    expect(screen.getByText(/ใช้หน่วย “เม็ด” ตามของเดิม/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ซอง' })).not.toBeInTheDocument();
    click(button('บันทึกยา'));
    expect(stored().medications).toHaveLength(1);
    expect(stored().assignments).toHaveLength(2);
    expect(stored().assignments[1]).toMatchObject({ personId: 'pB', medicationId: 'm1' });
  });

  it('a member who already uses the medicine: the first step stops with the Thai text', () => {
    open('#/meds/new');
    fillStep1('ยาตัวอย่าง ก');
    expect(button('ถัดไป')).toBeDisabled();
    expect(screen.getByText('สมาชิกคนนี้มียานี้ใช้อยู่แล้ว ไปแก้ที่หน้ายาทั้งหมดแทน')).toBeInTheDocument();
  });

  it('the last step cannot be saved while the unit or the count is wrong, and says what is missing', () => {
    open('#/meds/new', rootWith({ persons: [person({ id: 'pA', name: 'Test Person A' })] }));
    fillStep1();
    click(button('ถัดไป'));
    nav(window.location.hash);
    click(button('ถัดไป'));
    nav(window.location.hash);
    type(screen.getByLabelText('หรือพิมพ์หน่วยเอง'), '  ');
    expect(button('บันทึกยา')).toBeDisabled();
    expect(screen.getByText('เลือกหรือพิมพ์หน่วยนับของยา')).toBeInTheDocument();
    type(screen.getByLabelText('หรือพิมพ์หน่วยเอง'), 'ถุง');
    type(screen.getByLabelText(/จำนวนที่มี/), '10.3');
    expect(button('บันทึกยา')).toBeDisabled();
    expect(screen.getByText(/ใส่จำนวนเป็นตัวเลข 0 ถึง 9999/)).toBeInTheDocument();
    type(screen.getByLabelText(/จำนวนที่มี/), '10.5');
    expect(button('บันทึกยา')).toBeEnabled();
  });

  it('a save that fails on the last step: no "เพิ่มยาแล้ว", the Thai reason, nothing stored; saving again works', () => {
    open('#/meds/new', rootWith({ persons: [person({ id: 'pA', name: 'Test Person A' })] }));
    fillStep1();
    click(button('ถัดไป'));
    nav(window.location.hash);
    click(button('ถัดไป'));
    nav(window.location.hash);
    const before = localStorage.getItem(STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    click(button('บันทึกยา'));
    expect(screen.queryByRole('heading', { name: 'เพิ่มยาแล้ว' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(stored().assignments).toHaveLength(0);

    vi.restoreAllMocks();
    click(button('บันทึกยา'));
    expect(screen.getByRole('heading', { name: 'เพิ่มยาแล้ว' })).toBeInTheDocument();
    expect(stored().assignments).toHaveLength(1);
  });

  it('O5: while the sample is there, the box asks first; cancel keeps the sample; "ลบตัวอย่างแล้วเริ่ม" clears it and the form opens', () => {
    const sample = loadSample(emptyRoot(NOW), TODAY, NOW);
    open('#/meds/new', sample);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('ตอนนี้เป็นข้อมูลตัวอย่าง ต้องลบตัวอย่างก่อนจึงจะเพิ่มข้อมูลจริงได้')).toBeInTheDocument();
    expect(screen.queryByLabelText('ชื่อยา')).not.toBeInTheDocument();
    expect(stored().meta.isSample).toBe(true); // nothing is cleared silently

    click(within(dialog).getByRole('button', { name: 'ยกเลิก' }));
    expect(window.location.hash).toBe('#/meds');
    expect(stored().meta.isSample).toBe(true);
    expect(stored().persons).toHaveLength(2);

    nav('#/meds/new');
    click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ลบตัวอย่างแล้วเริ่ม' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('ชื่อยา')).toBeInTheDocument();
    expect(stored().meta.isSample).toBeUndefined();
    expect(stored().persons).toHaveLength(0);
  });

  it('an empty house: a simple add-member form is on the page (name, relation, own-medicine switch) and the new member is chosen', () => {
    open('#/meds/new', emptyRoot(NOW));
    expect(screen.getByText(/ยังไม่มีสมาชิกในบ้าน/)).toBeInTheDocument();
    const add = button('เพิ่มสมาชิก');
    expect(add).toBeDisabled();
    expect(screen.getByText('ใส่ชื่อสมาชิกก่อน')).toBeInTheDocument();
    type(screen.getByLabelText('ชื่อสมาชิก'), 'Test Person Z');
    expect(screen.getByText('เลือกว่าเป็นใครของเรา')).toBeInTheDocument();
    click(radio('แม่'));
    const own = screen.getByRole('switch', { name: /จัดยาทานเอง/ });
    expect(own).toHaveAttribute('aria-checked', 'false');
    click(own);
    expect(own).toHaveAttribute('aria-checked', 'true');
    expect(within(own).getByText('เปิด')).toBeInTheDocument();
    click(button('เพิ่มสมาชิก'));

    expect(stored().persons).toMatchObject([{ name: 'Test Person Z', relation: 'แม่', selfManaged: true }]);
    expect(radio('Test Person Z')).toHaveAttribute('aria-checked', 'true');
    fillStep1();
    expect(button('ถัดไป')).toBeEnabled();
  });
});
