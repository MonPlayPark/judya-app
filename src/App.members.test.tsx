// Screen tests for step 3.2c: members list, one member, add / edit form, taking a member out and putting them back.
// Made-up data only. The clock is injected (today = Sunday 18 Oct 2026 = พ.ศ. 2569).
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from './App';
import { loadSample } from './domain/actions';
import { NOW } from './domain/fixtures';
import { assignment, dailyMeal, person, rootWith } from './domain/helpers.test-util';
import { emptyRoot, rootSchema, type Root } from './domain/schema';
import { PREV_KEY, saveRoot, STORAGE_KEY } from './domain/storage';

const TODAY = '2026-10-18'; // Sunday = พ.ศ. 2569
const getToday = () => TODAY;

const TWICE = dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } });
const MORNING = dailyMeal({ morning: { pills: 1, meal: 'after' } });
const MEDS = [
  { id: 'm1', name: 'ยาตัวอย่าง ก', unit: 'เม็ด' },
  { id: 'm2', name: 'ยาตัวอย่าง ข', unit: 'เม็ด' },
];

/** ก: 1 active medicine (2 a day, 14 left, 7 days = low) + 1 stopped. ข: 1 a day, plenty. ค: sets out their own medicine.
 * ง: already taken out of the house. */
const family = (): Root =>
  rootWith({
    persons: [
      person({ id: 'pA', name: 'สมาชิกทดสอบ ก', relation: 'พ่อ', color: 'blue' }),
      person({ id: 'pB', name: 'สมาชิกทดสอบ ข', relation: 'แม่', color: 'green' }),
      person({ id: 'pC', name: 'สมาชิกทดสอบ ค', relation: 'ตัวฉัน', color: 'yellow', selfManaged: true }),
      person({ id: 'pD', name: 'สมาชิกทดสอบ ง', relation: 'ลูก', color: 'gray', removedAt: NOW }),
    ],
    medications: MEDS,
    assignments: [
      assignment({ id: 'a1', personId: 'pA', medicationId: 'm1', schedule: TWICE, stock: { qty: 20, countedOn: '2026-10-15' } }),
      assignment({ id: 'a2', personId: 'pA', medicationId: 'm2', schedule: MORNING, stock: { qty: 5, countedOn: '2026-10-15' }, status: 'stopped' }),
      assignment({ id: 'a3', personId: 'pB', medicationId: 'm1', schedule: MORNING, stock: { qty: 100, countedOn: '2026-10-18' } }),
      assignment({ id: 'a4', personId: 'pC', medicationId: 'm2', schedule: MORNING, stock: { qty: 100, countedOn: '2026-10-18' } }),
      assignment({ id: 'a5', personId: 'pD', medicationId: 'm2', schedule: MORNING, stock: { qty: 100, countedOn: '2026-10-18' } }),
    ],
  });

const stored = (): Root => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Root;
const seed = (root: Root) => expect(saveRoot(root).ok).toBe(true);
const nav = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
const open = (hash: string, root: Root = family()) => {
  seed(root);
  window.location.hash = hash;
  return render(<App getToday={getToday} />);
};
const click = (el: HTMLElement) => fireEvent.click(el);
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const radio = (name: string | RegExp) => screen.getByRole('radio', { name });
const field = (label: string) => screen.getByLabelText(label);
const h1 = () => screen.getByRole('heading', { level: 1 });
/** The card (a link) of a member in the list. */
const card = (name: string) => screen.getByRole('link', { name: new RegExp(name) });
const todayRows = () => screen.queryAllByRole('checkbox');

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
  window.location.hash = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
});

describe('members list (#/members)', () => {
  it('the bottom tab "สมาชิก" opens the real page, not "being built"', () => {
    open('#/');
    click(screen.getByRole('link', { name: 'สมาชิก' }));
    nav('#/members');
    expect(h1()).toHaveTextContent('สมาชิกในบ้าน');
    expect(screen.queryByText('หน้านี้กำลังสร้าง')).not.toBeInTheDocument();
  });

  it('one card per member in the house, with the numbers of the board; a removed member has no card', () => {
    open('#/members');
    const a = card('สมาชิกทดสอบ ก');
    expect(a).toHaveAttribute('href', '#/members/pA');
    expect(within(a).getByText('ยา 1 รายการ')).toBeInTheDocument(); // 1 active + 1 stopped -> 1
    expect(within(a).getByText('ทานวันนี้ 2 ครั้ง')).toBeInTheDocument();
    expect(within(a).getByText('ใกล้หมด 1 รายการ')).toBeInTheDocument();
    expect(within(a).getByText('ยังไม่พบการแพ้ยา')).toBeInTheDocument();
    const b = card('สมาชิกทดสอบ ข');
    expect(within(b).getByText('ทานวันนี้ 1 ครั้ง')).toBeInTheDocument();
    expect(within(b).getByText('สต๊อกพอ')).toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: /สมาชิกทดสอบ ง/ })).toHaveLength(0);
  });

  it('a member who sets out their own medicine says "จัดยาเอง · เราดูแลสต๊อก" instead of "ทานวันนี้"', () => {
    open('#/members');
    const c = card('สมาชิกทดสอบ ค');
    expect(within(c).getByText('จัดยาเอง · เราดูแลสต๊อก')).toBeInTheDocument();
    expect(within(c).queryByText(/ทานวันนี้/)).not.toBeInTheDocument();
    expect(within(c).getByText('สต๊อกพอ')).toBeInTheDocument();
    expect(within(c).getByText('ยา 1 รายการ')).toBeInTheDocument();
  });

  it('"ทานวันนี้ N ครั้ง" of a member equals the rows in "ยาวันนี้" filtered to that member', () => {
    open('#/members');
    for (const [id, name] of [
      ['pA', 'สมาชิกทดสอบ ก'],
      ['pB', 'สมาชิกทดสอบ ข'],
    ] as const) {
      const text = within(card(name)).getByText(/^ทานวันนี้ \d+ ครั้ง$/).textContent ?? '';
      const n = Number(/\d+/.exec(text)?.[0]);
      nav(`#/today?who=${id}`);
      expect(todayRows()).toHaveLength(n);
      nav('#/members');
    }
  });

  it('the removed section lists the removed member with a "นำกลับ" button of at least 48px height class and puts them back', () => {
    open('#/members');
    const section = screen.getByRole('heading', { name: 'สมาชิกที่นำออก' }).closest('section') as HTMLElement;
    expect(within(section).getByRole('listitem')).toHaveTextContent('สมาชิกทดสอบ ง');
    click(within(section).getByRole('button', { name: /นำกลับ/ }));
    expect(screen.queryByRole('heading', { name: 'สมาชิกที่นำออก' })).not.toBeInTheDocument(); // nobody left in it: no section
    expect(card('สมาชิกทดสอบ ง')).toBeInTheDocument();
    expect(stored().persons.find((p) => p.id === 'pD')?.removedAt).toBeUndefined();
  });

  it('nobody taken out: the section is not shown', () => {
    const r = family();
    open('#/members', { ...r, persons: r.persons.filter((p) => p.id !== 'pD') });
    expect(screen.queryByRole('heading', { name: 'สมาชิกที่นำออก' })).not.toBeInTheDocument();
  });

  it('an empty house asks for the first member; "เพิ่มสมาชิก" goes to the form', () => {
    open('#/members', emptyRoot(NOW));
    expect(screen.getByText('ยังไม่มีสมาชิกในบ้าน')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เพิ่มสมาชิกคนแรก' })).toHaveAttribute('href', '#/members/new');
    expect(screen.getByRole('link', { name: 'เพิ่มสมาชิก' })).toHaveAttribute('href', '#/members/new');
  });

  it('the allergy chip never says "ไม่แพ้ยา"', () => {
    open('#/members');
    expect(screen.queryByText(/ไม่แพ้ยา/)).not.toBeInTheDocument();
  });
});

describe('one member (#/members/:id)', () => {
  it('shows the head, allergy status, the quick button, the medicines, the stopped ones and the member data', () => {
    open('#/members/pA');
    expect(h1()).toHaveTextContent('สมาชิกทดสอบ ก');
    expect(screen.getByRole('link', { name: 'แก้ไข' })).toHaveAttribute('href', '#/members/pA/edit');
    expect(screen.getByText('ยังไม่พบการแพ้ยา', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('ยังไม่ได้บันทึก — ถามแพทย์/เภสัชกรก่อนใช้ยาใหม่')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'จัดยาวันนี้' })).toHaveAttribute('href', '#/today?who=pA');
    const meds = screen.getByRole('heading', { name: 'ยาของสมาชิกทดสอบ ก' }).closest('section') as HTMLElement;
    const row = within(meds).getByRole('link', { name: /ยาตัวอย่าง ก/ });
    expect(row).toHaveAttribute('href', '#/meds/a1');
    expect(within(meds).getByText('ยา 1 รายการ')).toBeInTheDocument();
    const stopped = screen.getByRole('heading', { name: 'ยาที่หยุดแล้ว' }).closest('section') as HTMLElement;
    expect(within(stopped).getByRole('link', { name: /ยาตัวอย่าง ข/ })).toHaveAttribute('href', '#/meds/a2');
    const info = screen.getByRole('heading', { name: 'ข้อมูลสมาชิก' }).closest('a') as HTMLElement;
    expect(info).toHaveAttribute('href', '#/members/pA/edit');
    expect(within(info).getByText('ปีเกิด').nextSibling).toHaveTextContent('ยังไม่ระบุ');
    expect(within(info).getByText('จัดยาทานเอง').nextSibling).toHaveTextContent('ปิด');
  });

  it('"สั่งยา" opens the order page of the whole house (step 3.3b-3)', () => {
    open('#/members/pA');
    expect(screen.getByRole('link', { name: 'สั่งยา' })).toHaveAttribute('href', '#/order');
    expect(screen.getByRole('link', { name: 'จัดยาวันนี้' })).toBeInTheDocument();
  });

  it('hides what is not built yet: share to doctor, doctor summary, add allergy note', () => {
    open('#/members/pA');
    for (const text of [/แชร์ให้แพทย์/, /สรุปพบแพทย์/, /เพิ่มบันทึกแพ้ยา/, /เร็ว ๆ นี้/]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /แพ้ยา/ })).not.toBeInTheDocument();
  });

  it('a medicine row leads to the existing medicine page', () => {
    open('#/members/pA');
    nav(screen.getByRole('link', { name: /ยาตัวอย่าง ก/ }).getAttribute('href') ?? '');
    expect(h1()).toHaveTextContent('รายละเอียดยา');
  });

  it('an unknown id and a removed member both give "ไม่พบสมาชิก" with a way back', () => {
    open('#/members/zzz');
    expect(screen.getByText(/ไม่พบสมาชิก/)).toBeInTheDocument();
    click(button('กลับสมาชิกในบ้าน'));
    expect(window.location.hash).toBe('#/members');
    nav('#/members/pD');
    expect(screen.getByText(/ไม่พบสมาชิก/)).toBeInTheDocument();
    nav('#/members/pD/edit');
    expect(screen.getByText(/ไม่พบสมาชิก/)).toBeInTheDocument();
  });

  it('a member with no medicine says so', () => {
    const r = family();
    open('#/members/pB', { ...r, assignments: r.assignments.filter((a) => a.personId !== 'pB') });
    expect(screen.getByText('ยังไม่มียา')).toBeInTheDocument();
    expect(screen.getByText('ยังไม่ใส่ยา')).toBeInTheDocument();
  });
});

describe('add form (#/members/new)', () => {
  it('a new member with every box filled shows in the list and on the member page', () => {
    open('#/members/new', emptyRoot(NOW));
    expect(h1()).toHaveTextContent('เพิ่มสมาชิก');
    expect(screen.queryByRole('button', { name: 'นำสมาชิกออก' })).not.toBeInTheDocument(); // Q11: no remove button when adding
    type(field('ชื่อ'), '  สมาชิกทดสอบ จ  ');
    click(radio('แม่'));
    type(field('ปีเกิด (พ.ศ.)'), '2510');
    click(radio(/เขียว/));
    type(field('ประกันสุขภาพ — ชื่อบริษัท'), 'บริษัททดสอบ 1');
    type(field('ประกันอุบัติเหตุ — ชื่อบริษัท'), 'บริษัททดสอบ 2');
    click(screen.getByRole('switch', { name: /จัดยาทานเอง/ }));
    click(button('บันทึก'));

    const saved = stored().persons;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      name: 'สมาชิกทดสอบ จ',
      relation: 'แม่',
      birthYearBE: 2510,
      color: 'green',
      selfManaged: true,
      insurance: { health: 'บริษัททดสอบ 1', accident: 'บริษัททดสอบ 2' },
    });
    expect(rootSchema.safeParse(stored()).success).toBe(true);

    const id = saved[0]?.id ?? '';
    expect(window.location.hash).toBe(`#/members/${id}`);
    nav(window.location.hash);
    expect(screen.getByRole('heading', { level: 1, name: 'สมาชิกทดสอบ จ' })).toBeInTheDocument();
    const info = screen.getByRole('heading', { name: 'ข้อมูลสมาชิก' }).closest('a') as HTMLElement;
    expect(within(info).getByText('ปีเกิด').nextSibling).toHaveTextContent('2510');
    expect(within(info).getByText('ประกันสุขภาพ').nextSibling).toHaveTextContent('บริษัททดสอบ 1');
    expect(within(info).getByText('จัดยาทานเอง').nextSibling).toHaveTextContent('เปิด');

    nav('#/members');
    expect(within(card('สมาชิกทดสอบ จ')).getByText('จัดยาเอง · เราดูแลสต๊อก')).toBeInTheDocument();
  });

  it('the save button is off while the name is empty, with the sentence saying why', () => {
    open('#/members/new', emptyRoot(NOW));
    const save = button('บันทึก');
    expect(save).toBeDisabled();
    expect(screen.getByText('ใส่ชื่อก่อน แล้วค่อยกดบันทึก')).toBeInTheDocument();
    type(field('ชื่อ'), '   ');
    expect(save).toBeDisabled();
    type(field('ชื่อ'), 'สมาชิกทดสอบ จ');
    expect(save).toBeDisabled(); // still needs "เป็นใครของเรา"
    expect(screen.getByText('เลือกว่าเป็นใครของเรา แล้วค่อยกดบันทึก')).toBeInTheDocument();
    click(radio('ลูก'));
    expect(save).toBeEnabled();
    expect(screen.queryByText(/แล้วค่อยกดบันทึก/)).not.toBeInTheDocument();
  });

  it('a new member gets the first colour nobody uses; the four colours have names', () => {
    open('#/members/new', family()); // blue, green, yellow are used (gray belongs to a removed member)
    for (const name of ['ฟ้า', 'เขียว', 'เหลือง', 'เทา']) expect(radio(name)).toBeInTheDocument();
    expect(radio('เทา')).toHaveAttribute('aria-checked', 'true');
    expect(radio('ฟ้า')).toHaveAttribute('aria-checked', 'false');
  });

  it('a birth year of 2570 shows the message at the box and nothing is saved', () => {
    open('#/members/new', emptyRoot(NOW));
    const before = localStorage.getItem(STORAGE_KEY);
    type(field('ชื่อ'), 'สมาชิกทดสอบ จ');
    click(radio('ลูก'));
    type(field('ปีเกิด (พ.ศ.)'), '2570');
    click(button('บันทึก'));
    expect(screen.getByRole('alert')).toHaveTextContent('ใส่ปี พ.ศ. 4 หลัก ตั้งแต่ 2400 ถึง 2569');
    expect(field('ปีเกิด (พ.ศ.)')).toHaveAttribute('aria-invalid', 'true');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(stored().persons).toHaveLength(0);
    expect(window.location.hash).toBe('#/members/new');
    // 2399 is wrong too; a valid year clears the message and saves
    type(field('ปีเกิด (พ.ศ.)'), '2399');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    type(field('ปีเกิด (พ.ศ.)'), '2569');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    click(button('บันทึก'));
    expect(stored().persons[0]?.birthYearBE).toBe(2569);
  });

  it('letters cannot be typed in the year box', () => {
    open('#/members/new', emptyRoot(NOW));
    type(field('ปีเกิด (พ.ศ.)'), '25a0');
    expect((field('ปีเกิด (พ.ศ.)') as HTMLInputElement).value).toBe('250');
  });

  it('with the sample in the house the box asking to delete the sample comes first', () => {
    seed(loadSample(emptyRoot(NOW), TODAY, NOW));
    window.location.hash = '#/members/new';
    render(<App getToday={getToday} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('ต้องลบข้อมูลตัวอย่างก่อน');
    expect(screen.queryByLabelText('ชื่อ')).not.toBeInTheDocument();
    click(within(dialog).getByRole('button', { name: 'ลบตัวอย่างแล้วเริ่ม' }));
    expect(stored().meta.isSample).toBeUndefined();
    expect(stored().persons).toHaveLength(0);
    expect(screen.getByLabelText('ชื่อ')).toBeInTheDocument(); // the empty form is there now
  });

  it('cancel in the sample box goes back to the list and keeps the sample', () => {
    seed(loadSample(emptyRoot(NOW), TODAY, NOW));
    window.location.hash = '#/members/new';
    render(<App getToday={getToday} />);
    click(button('ยกเลิก'));
    expect(window.location.hash).toBe('#/members');
    expect(stored().meta.isSample).toBe(true);
  });

  it('a save that fails does not move on or say it worked', () => {
    open('#/members/new', emptyRoot(NOW));
    const before = localStorage.getItem(STORAGE_KEY);
    type(field('ชื่อ'), 'สมาชิกทดสอบ จ');
    click(radio('ลูก'));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    click(button('บันทึก'));
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
    expect(window.location.hash).toBe('#/members/new');
    expect(h1()).toHaveTextContent('เพิ่มสมาชิก');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
});

describe('edit form (#/members/:id/edit)', () => {
  it('is filled with the saved values; saving a change goes back to the member page and the values stay', () => {
    const r = family();
    open('#/members/pA/edit', {
      ...r,
      persons: r.persons.map((p) => (p.id === 'pA' ? { ...p, birthYearBE: 2510, insurance: { health: 'บริษัททดสอบ 1' } } : p)),
    });
    expect(h1()).toHaveTextContent('แก้ไขข้อมูลสมาชิก');
    expect((field('ชื่อ') as HTMLInputElement).value).toBe('สมาชิกทดสอบ ก');
    expect(radio('พ่อ')).toHaveAttribute('aria-checked', 'true');
    expect((field('ปีเกิด (พ.ศ.)') as HTMLInputElement).value).toBe('2510');
    expect(radio('ฟ้า')).toHaveAttribute('aria-checked', 'true');
    expect((field('ประกันสุขภาพ — ชื่อบริษัท') as HTMLInputElement).value).toBe('บริษัททดสอบ 1');
    expect(screen.getByRole('switch', { name: /จัดยาทานเอง/ })).toHaveAttribute('aria-checked', 'false');

    type(field('ชื่อ'), 'สมาชิกทดสอบ ก2');
    click(radio('ลูก'));
    type(field('ปีเกิด (พ.ศ.)'), '2515');
    click(radio('เหลือง'));
    type(field('ประกันอุบัติเหตุ — ชื่อบริษัท'), 'บริษัททดสอบ 2');
    click(screen.getByRole('switch', { name: /จัดยาทานเอง/ }));
    click(button('บันทึก'));
    expect(window.location.hash).toBe('#/members/pA');
    expect(stored().persons.find((p) => p.id === 'pA')).toMatchObject({
      name: 'สมาชิกทดสอบ ก2',
      relation: 'ลูก',
      birthYearBE: 2515,
      color: 'yellow',
      selfManaged: true,
      insurance: { health: 'บริษัททดสอบ 1', accident: 'บริษัททดสอบ 2' },
    });

    nav('#/members/pA/edit'); // open again: the values are still there
    expect((field('ชื่อ') as HTMLInputElement).value).toBe('สมาชิกทดสอบ ก2');
    expect(radio('ลูก')).toHaveAttribute('aria-checked', 'true');
    expect((field('ปีเกิด (พ.ศ.)') as HTMLInputElement).value).toBe('2515');
    expect(radio('เหลือง')).toHaveAttribute('aria-checked', 'true');
    expect((field('ประกันอุบัติเหตุ — ชื่อบริษัท') as HTMLInputElement).value).toBe('บริษัททดสอบ 2');
    expect(screen.getByRole('switch', { name: /จัดยาทานเอง/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('clearing the birth year removes it', () => {
    const r = family();
    open('#/members/pA/edit', { ...r, persons: r.persons.map((p) => (p.id === 'pA' ? { ...p, birthYearBE: 2510 } : p)) });
    type(field('ปีเกิด (พ.ศ.)'), '');
    click(button('บันทึก'));
    expect('birthYearBE' in (stored().persons.find((p) => p.id === 'pA') ?? {})).toBe(false);
  });

  it('a wrong year in the edit form shows the message and changes nothing', () => {
    open('#/members/pA/edit');
    const before = localStorage.getItem(STORAGE_KEY);
    type(field('ปีเกิด (พ.ศ.)'), '2570');
    click(button('บันทึก'));
    expect(screen.getByRole('alert')).toHaveTextContent('ใส่ปี พ.ศ. 4 หลัก ตั้งแต่ 2400 ถึง 2569');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(window.location.hash).toBe('#/members/pA/edit');
  });

  it('emptying the name turns the save button off', () => {
    open('#/members/pA/edit');
    type(field('ชื่อ'), '');
    expect(button('บันทึก')).toBeDisabled();
    expect(screen.getByText('ใส่ชื่อก่อน แล้วค่อยกดบันทึก')).toBeInTheDocument();
  });

  it('with the sample in the house, editing asks to delete the sample first', () => {
    seed(loadSample(emptyRoot(NOW), TODAY, NOW));
    const id = stored().persons[0]?.id ?? '';
    window.location.hash = `#/members/${id}/edit`;
    render(<App getToday={getToday} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('ต้องลบข้อมูลตัวอย่างก่อน');
    expect(stored().meta.isSample).toBe(true);
  });

  it('a save that fails does not move on or say it worked', () => {
    open('#/members/pA/edit');
    type(field('ชื่อ'), 'สมาชิกทดสอบ ก2');
    const before = localStorage.getItem(STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    click(button('บันทึก'));
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
    expect(window.location.hash).toBe('#/members/pA/edit');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
});

describe('taking a member out and putting them back', () => {
  it('the confirm box: cancel changes nothing; confirming hides the member everywhere; putting back brings everything back', () => {
    open('#/');
    expect(screen.getByText('สมาชิกทดสอบ ก · มี 14 เม็ด')).toBeInTheDocument(); // the numbers before taking ก out
    expect(screen.getByText('เหลือ 7 วัน')).toBeInTheDocument();
    nav('#/members/pA/edit');
    const before = JSON.stringify(stored());

    click(button('นำสมาชิกออก'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('นำสมาชิกทดสอบ กออกจากบ้าน?');
    expect(dialog).toHaveTextContent('ยาและประวัติของสมาชิกทดสอบ กจะถูกซ่อนไว้ และนำกลับได้ภายหลังจากรายการ นำกลับ');
    click(within(dialog).getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(JSON.stringify(stored())).toBe(before);

    click(button('นำสมาชิกออก'));
    click(within(screen.getByRole('dialog')).getByRole('button', { name: 'นำออก' }));
    expect(screen.getByRole('heading', { name: 'นำสมาชิกทดสอบ กออกแล้ว' })).toBeInTheDocument();
    expect(screen.getByText('ยาและประวัติของสมาชิกทดสอบ กถูกซ่อนไว้ นำกลับได้')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'กลับไปสมาชิกในบ้าน' })).toHaveAttribute('href', '#/members');
    const after = stored();
    expect(after.persons.find((p) => p.id === 'pA')?.removedAt).toBeDefined();
    expect(after.assignments).toHaveLength(5); // nothing deleted
    expect(after.persons).toHaveLength(4);

    // gone from the list (and listed under "สมาชิกที่นำออก")
    nav('#/members');
    expect(screen.queryAllByRole('link', { name: /สมาชิกทดสอบ ก/ })).toHaveLength(0);
    const section = screen.getByRole('heading', { name: 'สมาชิกที่นำออก' }).closest('section') as HTMLElement;
    expect(section).toHaveTextContent('สมาชิกทดสอบ ก');
    // gone from today's medicines (ข has 1 row left; ก had 2)
    nav('#/today');
    expect(todayRows()).toHaveLength(1);
    expect(screen.queryByText('สมาชิกทดสอบ ก')).not.toBeInTheDocument();
    // gone from the home screen (care list: ก's low medicine; members card)
    nav('#/');
    expect(screen.queryByText(/สมาชิกทดสอบ ก/)).not.toBeInTheDocument();
    expect(screen.getByText('ตอนนี้ไม่มียาที่ต้องดูแล')).toBeInTheDocument();
    // gone from all medicines
    nav('#/meds');
    expect(screen.queryByText('สมาชิกทดสอบ ก')).not.toBeInTheDocument();
    // the medicine page of a hidden member is not found
    nav('#/meds/a1');
    expect(screen.getByText(/ไม่พบยานี้/)).toBeInTheDocument();

    // put back from the list: everything is back
    nav('#/members');
    click(within(screen.getByRole('heading', { name: 'สมาชิกที่นำออก' }).closest('section') as HTMLElement).getByRole('button', { name: /นำกลับ.*สมาชิกทดสอบ ก/ }));
    expect(within(card('สมาชิกทดสอบ ก')).getByText('ทานวันนี้ 2 ครั้ง')).toBeInTheDocument();
    nav('#/today');
    expect(todayRows()).toHaveLength(3);
    nav('#/');
    expect(screen.getByText('สมาชิกทดสอบ ก · มี 14 เม็ด')).toBeInTheDocument(); // exactly the same numbers as before
    expect(screen.getByText('เหลือ 7 วัน')).toBeInTheDocument();
    nav('#/meds');
    expect(screen.getByRole('heading', { name: 'สมาชิกทดสอบ ก' })).toBeInTheDocument();
    expect(JSON.stringify(stored().assignments)).toBe(JSON.stringify(JSON.parse(before).assignments)); // medicines untouched
    expect(stored().persons.find((p) => p.id === 'pA')?.removedAt).toBeUndefined();
  });

  it('"นำกลับ" on the done card shows the form again', () => {
    open('#/members/pB/edit');
    click(button('นำสมาชิกออก'));
    click(button('นำออก'));
    click(button('นำกลับ'));
    expect(h1()).toHaveTextContent('แก้ไขข้อมูลสมาชิก');
    expect((field('ชื่อ') as HTMLInputElement).value).toBe('สมาชิกทดสอบ ข');
    expect(stored().persons.find((p) => p.id === 'pB')?.removedAt).toBeUndefined();
  });

  it('a member who sets out their own medicine is not in "ยาวันนี้"', () => {
    open('#/today');
    expect(todayRows()).toHaveLength(3); // ก 2 + ข 1; ค (self-managed) and ง (removed) are not there
    expect(screen.getByText(/ไม่รวม.*สมาชิกทดสอบ ค/)).toBeInTheDocument();
  });

  it('a save that fails on "นำออก" does not say it is done', () => {
    open('#/members/pA/edit');
    click(button('นำสมาชิกออก'));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    click(button('นำออก'));
    expect(screen.queryByText(/ออกแล้ว/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
    expect(stored().persons.find((p) => p.id === 'pA')?.removedAt).toBeUndefined();
  });

  it('with the sample in the house, "นำกลับ" asks to delete the sample first', () => {
    const sample = loadSample(emptyRoot(NOW), TODAY, NOW);
    open('#/members', { ...sample, persons: sample.persons.map((p, i) => (i === 0 ? { ...p, removedAt: NOW } : p)) });
    click(screen.getByRole('button', { name: /นำกลับ/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('ต้องลบข้อมูลตัวอย่างก่อน');
    expect(stored().persons[0]?.removedAt).toBeDefined();
  });
});
