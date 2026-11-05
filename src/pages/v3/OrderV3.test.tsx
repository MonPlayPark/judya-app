import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { sampleRootV3 } from '../../domain/v3/fixtures';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { ORDER_DEMO_NAMES, orderDemoRoot, withDemoHistory, type OrderDemoName } from '../../domain/v3/orderDemo';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY, type KeyValueStore } from '../../domain/v3/storage';
import { OrderV3Route } from './OrderPage';
import { OrderView } from './OrderV3';
import type { Root } from '../../domain/v3/schema';
import { orderCandidates } from '../../domain/v3/orderDraft';
import { buildOrderLines } from '../../domain/v3/orderLines';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const demo = (name: OrderDemoName, extra = '') => {
  window.location.hash = `#/n/order?demo=${name}${extra}`;
  return render(<OrderV3Route />);
};
/** The floating message is drawn in <body> after the page, so it is the last element with role status (the demo banner has the role too). */
/** Moves to another hash and lets the page see it (jsdom sends hashchange later, so it is sent here). */
const go = (hash: string): void => {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
};
const toastOf = (): HTMLElement => screen.getAllByRole('status').at(-1)!;
const row = (name: RegExp | string) => screen.getByRole('checkbox', { name: new RegExp(`เลือกสั่ง ${typeof name === 'string' ? name : name.source}`) }).closest('li') as HTMLElement;

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => vi.restoreAllMocks());

describe('the list', () => {
  it('title, back link, the list card, and every demo house builds', () => {
    demo('normal');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สั่งซื้อยา');
    expect(screen.getByRole('link', { name: 'กลับหน้าหลัก' })).toHaveAttribute('href', '#/n');
    expect(screen.getByRole('heading', { name: 'รายการที่จะสั่ง' })).toBeInTheDocument();
    expect(screen.getByText('โหมดตัวอย่าง ไม่บันทึกข้อมูล')).toBeInTheDocument();
    for (const n of ORDER_DEMO_NAMES) expect(orderDemoRoot(n).persons.length).toBeGreaterThan(0);
  });

  it('running-low medicines are ticked, an unknown stock is shown but not ticked, each with a word on its chip (never colour alone)', () => {
    demo('normal');
    expect(screen.getByRole('checkbox', { name: 'เลือกสั่ง Simvastatin 20 mg' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'เลือกสั่ง Hydrocortisone 1%' })).toBeChecked(); // a cream with no spare tube
    expect(screen.getByRole('checkbox', { name: 'เลือกสั่ง Amlodipine 5 mg' })).not.toBeChecked();
    expect(within(row('Simvastatin')).getByText('ใกล้หมด')).toBeInTheDocument();
    expect(within(row('Amlodipine')).getByText('ไม่ทราบสต็อก')).toBeInTheDocument();
    expect(screen.getByText('5 รายการ')).toBeInTheDocument();
    expect(screen.getByText('ยอดรวม –')).toBeInTheDocument();
  });

  it('the big number is pills, the cream counts in tubes with no note; + ticks the line, - stops at 1', () => {
    demo('normal');
    const simva = row('Simvastatin');
    expect(within(simva).getByText('27')).toBeInTheDocument();
    expect(within(simva).getByText('เม็ด')).toBeInTheDocument();
    const cream = row('Hydrocortisone');
    expect(within(cream).getByText('หลอด')).toBeInTheDocument();
    expect(within(cream).getByRole('button', { name: /ลดจำนวน/ })).toBeDisabled();
    fireEvent.click(within(cream).getByRole('button', { name: /เพิ่มจำนวน/ }));
    expect(within(cream).getByText('2')).toBeInTheDocument();
    expect(within(cream).getByRole('button', { name: /ลดจำนวน/ })).toBeEnabled();
    // + on an unticked line ticks it
    const amlo = row('Amlodipine');
    fireEvent.click(within(amlo).getByRole('button', { name: /เพิ่มจำนวน/ }));
    expect(screen.getByRole('checkbox', { name: 'เลือกสั่ง Amlodipine 5 mg' })).toBeChecked();
    expect(screen.getByText('6 รายการ')).toBeInTheDocument();
  });

  it('unticking everything shows the hint card; ticking one hides it', () => {
    demo('normal');
    expect(screen.queryByText('ติ๊กยาที่ต้องการสั่งก่อน แล้วแอพจะเทียบราคาร้านให้')).not.toBeInTheDocument();
    for (const box of screen.getAllByRole('checkbox')) if ((box as HTMLInputElement).checked) fireEvent.click(box);
    expect(screen.getByText('ติ๊กยาที่ต้องการสั่งก่อน แล้วแอพจะเทียบราคาร้านให้')).toBeInTheDocument();
    expect(screen.getByText('0 รายการ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือกสั่ง Simvastatin 20 mg' }));
    expect(screen.queryByText('ติ๊กยาที่ต้องการสั่งก่อน แล้วแอพจะเทียบราคาร้านให้')).not.toBeInTheDocument();
  });

  it('nothing running low: a small empty state with the add button; nothing at all in the house: same', () => {
    for (const name of ['nolow', 'nomeds'] as const) {
      const { unmount } = demo(name);
      expect(screen.getByText('ยังไม่มียาที่ใกล้หมด')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'เพิ่มรายการ' })).toBeInTheDocument();
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
      expect(screen.getByText('0 รายการ')).toBeInTheDocument();
      unmount();
    }
  });

  it('the main button "ดูข้อความสั่งยา" is a real button now (it scrolls to the message card), not coming soon (M4 PR 11.3b-1)', () => {
    demo('normal');
    const b = screen.getByRole('button', { name: 'ดูข้อความสั่งยา' });
    expect(b).not.toHaveAttribute('aria-disabled');
    fireEvent.click(b);
    expect(screen.queryByText('เร็ว ๆ นี้')).toBeNull();
  });

  it('the main button follows the ticks: 0 ticked = faded and does nothing; 1 ticked = works; untick again = faded (M4 PR 11.3b-2b fix)', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    demo('normal');
    const main = (): HTMLElement => screen.getByRole('button', { name: 'ดูข้อความสั่งยา' });
    const ticks = (): HTMLInputElement[] => screen.getAllByRole('checkbox') as HTMLInputElement[];
    for (const box of ticks().filter((b) => b.checked)) fireEvent.click(box);
    expect(main()).toBeDisabled();
    expect(screen.getByText('0 รายการ')).toBeInTheDocument();
    expect(screen.getByText('ยอดรวม –')).toBeInTheDocument();
    fireEvent.click(main());
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(ticks()[0]!);
    expect(main()).toBeEnabled();
    expect(screen.getByText('1 รายการ')).toBeInTheDocument();
    fireEvent.click(main());
    expect(scroll).toHaveBeenCalledTimes(1);
    fireEvent.click(ticks()[0]!);
    expect(main()).toBeDisabled();
  });

  it('the page publishes the top of its bottom bar for the floating message, and takes it back when it leaves', () => {
    const { unmount } = demo('normal');
    expect(document.documentElement.style.getPropertyValue('--toast-bottom')).toMatch(/^\d+(\.\d+)?px$/);
    unmount();
    expect(document.documentElement.style.getPropertyValue('--toast-bottom')).toBe('');
  });

  it('is reached from #/n/order in the app, and the route is not tied to any button of Home', () => {
    window.location.hash = '#/n/order?demo=normal';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สั่งซื้อยา');
    const home = readFileSync(resolve(__dirname, 'HomeV3.tsx'), 'utf8');
    expect(home).not.toContain('/n/order');
  });
});

describe('the unit sheet "แก้หน่วยสั่ง"', () => {
  it('opens from a medicine of the app, changes the unit for this order only, and shows the pills note', () => {
    demo('normal');
    fireEvent.click(screen.getByRole('button', { name: 'แก้หน่วยสั่ง Simvastatin 20 mg' }));
    const sheet = screen.getByRole('dialog', { name: 'แก้หน่วยสั่ง' });
    expect(within(sheet).getByText('แก้เฉพาะใบนี้ ไม่เปลี่ยนข้อมูลยาในรายการยา')).toBeInTheDocument();
    for (const u of ['กล่อง', 'แผง', 'ขวด', 'เม็ด']) expect(within(sheet).getByRole('button', { name: u })).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'กล่อง' }));
    expect(within(sheet).getByRole('button', { name: 'ตกลง' })).toBeDisabled(); // count per box is needed
    fireEvent.change(within(sheet).getByLabelText('เม็ดต่อกล่อง'), { target: { value: '30' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'ตกลง' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const simva = row('Simvastatin');
    expect(within(simva).getByText('= 1 กล่อง (30 เม็ด)')).toBeInTheDocument(); // 27 pills -> 1 box of 30
    expect(within(simva).getByText('30')).toBeInTheDocument();
    fireEvent.click(within(simva).getByRole('button', { name: /เพิ่มจำนวน/ }));
    expect(within(simva).getByText('= 2 กล่อง (60 เม็ด)')).toBeInTheDocument(); // one sell unit at a time
  });

  it('a house medicine has no way into it, and a typed medicine neither', () => {
    demo('normal');
    expect(screen.queryByRole('button', { name: /แก้หน่วยสั่ง ผงเกลือแร่/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /แก้หน่วยสั่ง ยาดม/ })).not.toBeInTheDocument();
  });

  it('cancel changes nothing', () => {
    demo('normal');
    fireEvent.click(screen.getByRole('button', { name: 'แก้หน่วยสั่ง Simvastatin 20 mg' }));
    fireEvent.click(screen.getByRole('button', { name: 'ขวด' }));
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(within(row('Simvastatin')).getByText('27')).toBeInTheDocument();
  });
});

describe('the add sheet: from the medicine list', () => {
  it('opens with two tabs and the medicines not yet in the draft, nearest to empty first, with days and the member', () => {
    demo('normal');
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มรายการ' }));
    const sheet = screen.getByRole('dialog', { name: 'เพิ่มรายการ' });
    expect(within(sheet).getByRole('tab', { name: 'จากรายการยา', selected: true })).toBeInTheDocument();
    expect(within(sheet).getByRole('tab', { name: 'ยาใหม่', selected: false })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'ปิด' })).toBeInTheDocument();
    expect(within(sheet).getByText('เหลือ 21 วัน · คุณแม่')).toBeInTheDocument();
    expect(within(sheet).queryByText(/Simvastatin/)).not.toBeInTheDocument(); // already in the draft
    expect(within(sheet).queryByLabelText('ค้นหาชื่อยา')).not.toBeInTheDocument(); // few medicines: no search box
  });

  it('pressing + เพิ่ม puts the line in (ticked, "เลือกเพิ่มเอง") with a floating message, and the row leaves the sheet', () => {
    demo('normal', '&sheet=add&tab=meds');
    const sheet = screen.getByRole('dialog', { name: 'เพิ่มรายการ' });
    fireEvent.click(within(sheet).getByRole('button', { name: /^เพิ่ม Losartan/ }));
    expect(toastOf()).toHaveTextContent('Losartan 50 mg เข้ารายการสั่งแล้ว');
    expect(within(sheet).queryByText('Losartan 50 mg')).not.toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'ปิด' }));
    const added = row('Losartan');
    expect(within(added).getByText('เลือกเพิ่มเอง')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'เลือกสั่ง Losartan 50 mg' })).toBeChecked();
    expect(screen.getByText('6 รายการ')).toBeInTheDocument();
  });

  it('many medicines: a search box, a short list with "ดูเพิ่ม", search by name, and the not-found text', () => {
    demo('nolow', '&sheet=add&tab=meds');
    const sheet = screen.getByRole('dialog', { name: 'เพิ่มรายการ' });
    expect(within(sheet).getAllByRole('button', { name: /^เพิ่ม / }).filter((b) => b.textContent === 'เพิ่ม')).toHaveLength(6);
    fireEvent.click(within(sheet).getByRole('button', { name: /^ดูเพิ่ม/ }));
    expect(within(sheet).getAllByRole('button', { name: /^เพิ่ม / }).length).toBeGreaterThan(6);
    fireEvent.change(within(sheet).getByLabelText('ค้นหาชื่อยา'), { target: { value: ' metFORMIN ' } });
    expect(within(sheet).getAllByRole('button', { name: /^เพิ่ม / })).toHaveLength(1);
    fireEvent.change(within(sheet).getByLabelText('ค้นหาชื่อยา'), { target: { value: 'zzzz' } });
    expect(within(sheet).getByText('ไม่พบยาชื่อนี้ในรายการยา ถ้าเป็นยาที่ยังไม่มี ให้เลือกแท็บ "ยาใหม่"')).toBeInTheDocument();
  });

  it('everything is in the draft already: the "all there" text; no medicine at all: its own text', () => {
    const { unmount } = demo('normal', '&sheet=add&tab=meds');
    const sheet = screen.getByRole('dialog', { name: 'เพิ่มรายการ' });
    for (const b of within(sheet).getAllByRole('button', { name: /^เพิ่ม / }).filter((x) => x.textContent === 'เพิ่ม')) fireEvent.click(b);
    expect(within(sheet).getByText('ยาในรายการยาอยู่ในรายการสั่งครบแล้ว')).toBeInTheDocument();
    unmount();
    demo('nomeds', '&sheet=add&tab=meds');
    expect(screen.getByText('ยังไม่มียาในรายการยา ถ้าจะสั่งยาที่ยังไม่มี ให้เลือกแท็บ "ยาใหม่"')).toBeInTheDocument();
  });

  it('the X button, the dark curtain and Esc close the sheet', () => {
    demo('normal', '&sheet=add&tab=meds');
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มรายการ' }));
    fireEvent.click(screen.getByTestId('sheet-curtain'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มรายการ' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('the add sheet: a new medicine', () => {
  const open = (extra = '') => {
    demo('normal', `&sheet=add&tab=new${extra}`);
    return screen.getByRole('dialog', { name: 'เพิ่มรายการ' });
  };
  const addButton = (sheet: HTMLElement) => within(sheet).getByRole('button', { name: 'เพิ่มลงรายการสั่ง' });

  it('the form: name, strength with every unit, seven kinds, the choices of the kind, quantity, the ask-later box; the button is off until there is a name', () => {
    const sheet = open();
    expect(within(sheet).getByText('ชื่อยา*')).toBeInTheDocument();
    expect(within(sheet).getByText('ความแรง (ไม่บังคับ)')).toBeInTheDocument();
    expect(within(sheet).getByText('ชนิดยา*')).toBeInTheDocument();
    expect(within(sheet).getByText('จำนวนที่จะสั่ง*')).toBeInTheDocument();
    const units = within(within(sheet).getByLabelText('หน่วยความแรง')).getAllByRole('option').map((o) => o.textContent);
    expect(units).toEqual(['mg', 'mcg', 'g', '%', 'IU', 'mg/5 ml']);
    const kinds = within(within(sheet).getByRole('group', { name: 'ชนิดยา*' })).getAllByRole('button');
    expect(kinds).toHaveLength(7);
    expect(within(sheet).getByRole('checkbox', { name: 'หลังได้ยามา ถามว่าจะเพิ่มเข้ารายการยาไหม' })).toBeChecked();
    expect(addButton(sheet)).toBeDisabled();
  });

  it('the sell-as choices follow the kind; "other" asks for a typed unit; the count per unit shows only for a unit that is not the pill', () => {
    const sheet = open();
    const pills = () => within(within(sheet).getByRole('group', { name: 'สั่งเป็น' })).queryAllByRole('button').map((b) => b.textContent);
    expect(pills()).toEqual(['กล่อง', 'แผง', 'ขวด', 'เม็ด']);
    expect(within(sheet).getByLabelText('เม็ดต่อกล่อง (ไม่บังคับ)')).toHaveValue(''); // never filled in for the owner
    fireEvent.click(within(sheet).getByRole('button', { name: 'เม็ด' }));
    expect(within(sheet).queryByLabelText(/ต่อเม็ด/)).not.toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'ยาน้ำ' }));
    expect(pills()).toEqual(['ขวด']);
    fireEvent.click(within(sheet).getByRole('button', { name: 'ครีม' }));
    expect(pills()).toEqual(['หลอด']);
    expect(within(sheet).queryByLabelText(/ต่อหลอด/)).not.toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'ผงชงดื่ม' }));
    expect(pills()).toEqual(['กล่อง', 'ซอง']);
    fireEvent.click(within(sheet).getByRole('button', { name: 'ยาหยอด' }));
    expect(pills()).toEqual(['ขวด']);
    fireEvent.click(within(sheet).getByRole('button', { name: 'อื่นๆ' }));
    expect(pills()).toEqual([]);
    expect(within(sheet).getByLabelText('หน่วยที่สั่ง')).toHaveValue('ชิ้น');
  });

  it('adds a typed medicine with kind, strength and count per unit: a new-medicine chip, the pills note, a floating message', () => {
    const sheet = open();
    fireEvent.change(within(sheet).getByPlaceholderText('พิมพ์ชื่อยา'), { target: { value: 'ยาใหม่ทดสอบ' } });
    fireEvent.change(within(sheet).getByPlaceholderText('เช่น 500'), { target: { value: '250' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'แคปซูล' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'กล่อง' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'เพิ่มจำนวน' }));
    fireEvent.change(within(sheet).getByLabelText(/ต่อกล่อง/), { target: { value: '20' } });
    fireEvent.click(addButton(sheet));
    expect(toastOf()).toHaveTextContent('ยาใหม่ทดสอบ 250 mg เข้ารายการสั่งแล้ว');
    fireEvent.click(within(sheet).getByRole('button', { name: 'ปิด' }));
    const added = row('ยาใหม่ทดสอบ');
    expect(within(added).getByText('ยาใหม่ ยังไม่อยู่ในรายการยา')).toBeInTheDocument();
    expect(within(added).getByText('= 2 กล่อง (40 แคปซูล)')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'เลือกสั่ง ยาใหม่ทดสอบ 250 mg' })).toBeChecked();
  });

  it('the button stays off for an empty name and for quantity 0; a wrong strength / count says so and adds nothing', () => {
    const sheet = open('&name=ยาใหม่ทดสอบ');
    expect(addButton(sheet)).toBeEnabled();
    const qty = within(sheet).getAllByRole('textbox').find((b) => (b as HTMLInputElement).value === '1') as HTMLInputElement;
    fireEvent.change(qty, { target: { value: '0' } });
    expect(addButton(sheet)).toBeDisabled();
    fireEvent.change(qty, { target: { value: '2' } });
    fireEvent.change(within(sheet).getByPlaceholderText('เช่น 500'), { target: { value: 'abc' } });
    fireEvent.click(addButton(sheet));
    expect(within(sheet).getByText('ความแรงต้องเป็นตัวเลขมากกว่า 0')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1); // only the demo banner: no floating message
  });

  it('a name that is in the medicine list shows a "มีในรายการยา" chip; pressing it adds the medicine of the app', () => {
    const sheet = open();
    fireEvent.change(within(sheet).getByPlaceholderText('พิมพ์ชื่อยา'), { target: { value: 'Los' } });
    fireEvent.click(within(sheet).getByRole('button', { name: /มีในรายการยา Losartan 50 mg/ }));
    expect(toastOf()).toHaveTextContent('Losartan 50 mg เข้ารายการสั่งแล้ว');
    fireEvent.click(within(sheet).getByRole('button', { name: 'ปิด' }));
    expect(within(row('Losartan')).getByText('เลือกเพิ่มเอง')).toBeInTheDocument();
  });

  it('the same name as a medicine of the app (not yet in the draft): a warning under the name, "ใช้ยาในระบบ" / "เพิ่มเป็นยาใหม่"; the add button waits', () => {
    const sheet = open();
    fireEvent.change(within(sheet).getByPlaceholderText('พิมพ์ชื่อยา'), { target: { value: ' losartan ' } });
    expect(within(sheet).getByRole('alert')).toHaveTextContent('มียา "Losartan" ในระบบแล้ว');
    expect(addButton(sheet)).toBeDisabled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'ใช้ยาในระบบ' }));
    expect(toastOf()).toHaveTextContent('Losartan 50 mg เข้ารายการสั่งแล้ว');
    fireEvent.click(within(sheet).getByRole('button', { name: 'ปิด' }));
    expect(within(row('Losartan')).getByText('เลือกเพิ่มเอง')).toBeInTheDocument();
  });

  it('"เพิ่มเป็นยาใหม่" keeps the typed name as a new medicine and unlocks the add button', () => {
    const sheet = open();
    fireEvent.change(within(sheet).getByPlaceholderText('พิมพ์ชื่อยา'), { target: { value: 'Losartan' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'เพิ่มเป็นยาใหม่' }));
    expect(within(sheet).queryByRole('alert')).not.toBeInTheDocument();
    expect(addButton(sheet)).toBeEnabled();
    fireEvent.click(addButton(sheet));
    fireEvent.click(within(sheet).getByRole('button', { name: 'ปิด' }));
    expect(within(screen.getAllByRole('checkbox', { name: 'เลือกสั่ง Losartan' })[0]!.closest('li') as HTMLElement).getByText('ยาใหม่ ยังไม่อยู่ในรายการยา')).toBeInTheDocument();
  });

  it('the same name as a medicine already in the draft: no "use" button, only "เพิ่มเป็นยาใหม่"', () => {
    const sheet = open('&name=Simvastatin');
    expect(within(sheet).queryByRole('button', { name: 'ใช้ยาในระบบ' })).not.toBeInTheDocument();
    expect(within(sheet).getByText('ยานี้อยู่ในรายการสั่งแล้ว')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'เพิ่มเป็นยาใหม่' })).toBeInTheDocument();
  });

  it('typing the same new name twice is refused', () => {
    const sheet = open('&name=ยาใหม่ทดสอบ');
    fireEvent.click(addButton(sheet));
    fireEvent.change(within(sheet).getByPlaceholderText('พิมพ์ชื่อยา'), { target: { value: 'ยาใหม่ ทดสอบ' } });
    expect(within(sheet).getByText('ชื่อนี้อยู่ในรายการสั่งแล้ว')).toBeInTheDocument();
    expect(addButton(sheet)).toBeDisabled();
  });
});

describe('F. this page writes storage in one way only', () => {
  const FILES = ['OrderPage.tsx', 'OrderV3.tsx', 'OrderSheets.tsx', 'OrderMessage.tsx'];

  it('the source files never mention a write; only OrderPage names saveRoot (the one function that saves, used for the recipient)', () => {
    for (const f of FILES) {
      const code = readFileSync(resolve(__dirname, f), 'utf8').replace(/\/\/.*$/gm, '');
      for (const word of ['restoreRoot', 'startFresh', 'setItem', 'removeItem', 'localStorage', 'sessionStorage', 'indexedDB']) {
        expect(code, `${f} mentions ${word}`).not.toContain(word);
      }
      if (f !== 'OrderPage.tsx') expect(code, `${f} mentions saveRoot`).not.toContain('saveRoot');
    }
  });

  const press = async (tick: string, clash: string) => {
    // a long session: tick, +, -, unit sheet, add from the list, add a new medicine, name clash, close sheets
    fireEvent.click(screen.getByRole('checkbox', { name: tick }));
    fireEvent.click(screen.getAllByRole('button', { name: /เพิ่มจำนวน/ })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: /ลดจำนวน/ })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: /^แก้หน่วยสั่ง/ })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'แผง' }));
    fireEvent.change(screen.getByLabelText(/ต่อแผง/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'ตกลง' }));
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มรายการ' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^เพิ่ม / }).find((b) => b.textContent === 'เพิ่ม')!);
    fireEvent.click(screen.getByRole('tab', { name: 'ยาใหม่' }));
    fireEvent.change(screen.getByPlaceholderText('พิมพ์ชื่อยา'), { target: { value: 'ยาใหม่ทดสอบ' } });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มลงรายการสั่ง' }));
    fireEvent.change(screen.getByPlaceholderText('พิมพ์ชื่อยา'), { target: { value: clash } });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มเป็นยาใหม่' }));
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    fireEvent.click(screen.getByRole('button', { name: 'ดูข้อความสั่งยา' }));
    await act(async () => {});
  };

  it('demo mode: saveRoot is never called and nothing is written to localStorage', async () => {
    const save = vi.spyOn(storage, 'saveRoot');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const read = vi.spyOn(Storage.prototype, 'getItem');
    demo('normal');
    await press('เลือกสั่ง Simvastatin 20 mg', 'Simvastatin');
    expect(save).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled(); // a demo does not even read
  });

  it('normal mode: only reads judya.v3; saveRoot and every write stay uncalled and the store is byte for byte the same', async () => {
    const store = memoryStore();
    expect(storage.saveRoot(sampleRootV3(), store)).toEqual({ ok: true });
    const before = JSON.stringify(store.data);
    const save = vi.spyOn(storage, 'saveRoot');
    const set = vi.spyOn(store, 'setItem');
    const remove = vi.spyOn(store, 'removeItem');
    const lsSet = vi.spyOn(Storage.prototype, 'setItem');
    const lsRemove = vi.spyOn(Storage.prototype, 'removeItem');
    const lsGet = vi.spyOn(Storage.prototype, 'getItem');
    window.location.hash = '#/n/order';
    render(<OrderV3Route getToday={() => DEMO_TODAY} store={store} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สั่งซื้อยา');
    await press('เลือกสั่ง ยาตัวอย่าง A 500 mg', 'ยาตัวอย่าง A');
    expect(save).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(lsSet).not.toHaveBeenCalled();
    expect(lsRemove).not.toHaveBeenCalled();
    expect(lsGet).not.toHaveBeenCalled(); // the injected store is read, not the browser's
    expect(JSON.stringify(store.data)).toBe(before);
    expect(Object.keys(store.data)).toEqual([STORAGE_KEY]);
  });

  it('normal mode on the real browser storage: reads judya.v3 only, writes nothing', () => {
    const real = JSON.stringify(sampleRootV3());
    window.localStorage.setItem(STORAGE_KEY, real);
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const get = vi.spyOn(Storage.prototype, 'getItem');
    window.location.hash = '#/n/order?sheet=add&tab=new';
    render(<OrderV3Route getToday={() => DEMO_TODAY} />);
    expect(screen.getByRole('dialog', { name: 'เพิ่มรายการ' })).toBeInTheDocument();
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    for (const call of get.mock.calls) expect(call[0]).toBe(STORAGE_KEY);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(real);
    window.localStorage.clear();
  });
});

describe('history (M4 PR 11.4)', () => {
  const HIST = '&orders=history&screen=history';
  const card = (date: string): HTMLElement => screen.getByText(date).closest('li') as HTMLElement;
  const liveStore = () => {
    const store = memoryStore();
    expect(storage.saveRoot(withDemoHistory(orderDemoRoot('normal')), store)).toEqual({ ok: true });
    return store;
  };
  const live = (store: ReturnType<typeof memoryStore>) => {
    window.location.hash = `#/n/order?screen=history`;
    return render(<OrderV3Route getToday={() => DEMO_TODAY} store={store} />);
  };
  const saved = (store: ReturnType<typeof memoryStore>): Root => {
    const res = storage.loadRoot(store);
    if (res.status !== 'ok') throw new Error('store not readable');
    return res.root;
  };

  it('header: back, clock icon, title "ประวัติการสั่งยา"; the main menu is there and the bottom bar is not', () => {
    demo('normal', HIST);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ประวัติการสั่งยา');
    expect(screen.getByRole('link', { name: 'กลับหน้าสั่งซื้อยา' })).toHaveAttribute('href', '#/n/order?demo=normal&orders=history');
    expect(screen.getByRole('navigation', { name: 'เมนูหลัก' })).toBeInTheDocument();
    expect(screen.queryByText('ดูข้อความสั่งยา')).not.toBeInTheDocument();
  });

  it('the clock button on the order page is a link to the history (not coming soon) and keeps the demo options', () => {
    demo('normal', '&orders=history');
    expect(screen.getByRole('link', { name: 'ประวัติการสั่งซื้อ' })).toHaveAttribute('href', '#/n/order?demo=normal&orders=history&screen=history');
  });

  it('the ticked lines survive going to the history and back', () => {
    demo('normal', '&orders=history');
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือกสั่ง Amlodipine 5 mg' }));
    go('#/n/order?demo=normal&orders=history&screen=history');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ประวัติการสั่งยา');
    go('#/n/order?demo=normal&orders=history');
    expect(screen.getByRole('checkbox', { name: 'เลือกสั่ง Amlodipine 5 mg' })).toBeChecked();
  });

  it('filter: starts at all (4 cards, newest first, with the cancelled one); waiting = waiting + partial; received; pills say which is pressed', () => {
    demo('normal', HIST);
    const names = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.closest('li')?.textContent ?? '');
    expect(screen.getByRole('button', { name: 'ทั้งหมด' })).toHaveAttribute('aria-pressed', 'true');
    expect(names()).toHaveLength(4);
    const dates = ['28 ต.ค. 2569', '20 ต.ค. 2569', '12 ต.ค. 2569', '5 ต.ค. 2569'];
    const text = names();
    dates.forEach((d, i) => expect(text[i]).toContain(d));
    fireEvent.click(screen.getByRole('button', { name: 'รอรับของ' }));
    expect(screen.getByRole('button', { name: 'รอรับของ' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'ทั้งหมด' })).toHaveAttribute('aria-pressed', 'false');
    expect(names()).toHaveLength(2);
    expect(screen.queryByText('5 ต.ค. 2569')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'รับแล้ว' }));
    expect(names()).toHaveLength(1);
    expect(screen.getByText('12 ต.ค. 2569')).toBeInTheDocument();
  });

  it('an empty category says so', () => {
    demo('normal', '&screen=history');
    expect(screen.getByText('ยังไม่มีใบสั่งในหมวดนี้')).toBeInTheDocument();
    cleanup();
    demo('normal', HIST.replace('orders=history', 'orders=waiting'));
    fireEvent.click(screen.getByRole('button', { name: 'รับแล้ว' }));
    expect(screen.getByText('ยังไม่มีใบสั่งในหมวดนี้')).toBeInTheDocument();
  });

  it('card: shop name, date, N รายการ, a status chip with a word, and the total (18px navy is in the css)', () => {
    demo('normal', HIST);
    const c = within(card('28 ต.ค. 2569'));
    expect(c.getByText('ร้านทดสอบ ก')).toBeInTheDocument();
    expect(c.getByText('2 รายการ')).toBeInTheDocument();
    expect(c.getByText('รอรับของ')).toBeInTheDocument();
    expect(within(card('20 ต.ค. 2569')).getByText('รับบางส่วน')).toBeInTheDocument();
    expect(within(card('12 ต.ค. 2569')).getByText('รับแล้ว')).toBeInTheDocument();
    expect(within(card('5 ต.ค. 2569')).getByText('ยกเลิก', { selector: 'span' })).toBeInTheDocument();
    const css = readFileSync(resolve(__dirname, 'OrderHistory.module.css'), 'utf8');
    expect(css).toMatch(/\.total\s*\{[^}]*18px[^}]*navy/);
  });

  it('total: with the fee when it was included, a note for lines without a price, "ยังไม่มีราคา" when none has one', () => {
    demo('normal', HIST);
    expect(within(card('28 ต.ค. 2569')).getByText('฿100')).toBeInTheDocument(); // 30 x 2 + fee 40
    expect(within(card('28 ต.ค. 2569')).getByText('ไม่รวม 1 รายการที่ยังไม่มีราคา')).toBeInTheDocument();
    expect(within(card('20 ต.ค. 2569')).getByText('฿50')).toBeInTheDocument(); // no fee: shipping was off
    expect(within(card('12 ต.ค. 2569')).getByText('฿190')).toBeInTheDocument();
    expect(within(card('12 ต.ค. 2569')).queryByText(/ไม่รวม/)).not.toBeInTheDocument();
    expect(within(card('5 ต.ค. 2569')).getByText('ยังไม่มีราคา')).toBeInTheDocument();
  });

  it('buttons by status: waiting = faded "รับของแล้ว" + working "ยกเลิกใบสั่ง"; partial = chip "ยังรอ N รายการ" + two faded, no cancel; received / cancelled = "สั่งซ้ำ"', () => {
    demo('normal', HIST);
    const w = within(card('28 ต.ค. 2569'));
    expect(w.getByRole('button', { name: /รับของแล้ว/ })).toHaveAttribute('aria-disabled', 'true');
    expect(w.getByRole('button', { name: 'ยกเลิกใบสั่ง' })).not.toHaveAttribute('aria-disabled');
    expect(w.queryByRole('button', { name: /สั่งซ้ำ/ })).not.toBeInTheDocument();
    const p = within(card('20 ต.ค. 2569'));
    expect(p.getByText('ยังรอ 2 รายการ')).toBeInTheDocument();
    expect(p.getByRole('button', { name: /รับของที่เหลือ/ })).toHaveAttribute('aria-disabled', 'true');
    expect(p.getByRole('button', { name: /ไม่รอแล้ว/ })).toHaveAttribute('aria-disabled', 'true');
    expect(p.queryByRole('button', { name: 'ยกเลิกใบสั่ง' })).not.toBeInTheDocument();
    expect(p.queryByRole('button', { name: /สั่งซ้ำ/ })).not.toBeInTheDocument();
    for (const d of ['12 ต.ค. 2569', '5 ต.ค. 2569']) {
      expect(within(card(d)).getByRole('button', { name: /สั่งซ้ำ/ })).not.toHaveAttribute('aria-disabled');
      expect(within(card(d)).queryByRole('button', { name: 'ยกเลิกใบสั่ง' })).not.toBeInTheDocument();
    }
    expect(within(card('28 ต.ค. 2569')).getByRole('button', { name: /รับของแล้ว/ })).toHaveTextContent('เร็ว ๆ นี้');
  });

  it('the three faded buttons do nothing when pressed: no message, no sheet, no write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    demo('normal', HIST);
    const pressed = [
      within(card('28 ต.ค. 2569')).getByRole('button', { name: /รับของแล้ว/ }),
      within(card('20 ต.ค. 2569')).getByRole('button', { name: /รับของที่เหลือ/ }),
      within(card('20 ต.ค. 2569')).getByRole('button', { name: /ไม่รอแล้ว/ }),
    ];
    for (const b of pressed) fireEvent.click(b);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1); // only the demo banner: no floating message
    expect(setItem).not.toHaveBeenCalled();
  });

  it('cancel sheet: the title, the line "<shop> · <date> · N รายการ", the small line; "ไม่ยกเลิก" closes it and writes nothing', () => {
    const store = liveStore();
    const setItem = vi.spyOn(store, 'setItem');
    live(store);
    fireEvent.click(within(card('28 ต.ค. 2569')).getByRole('button', { name: 'ยกเลิกใบสั่ง' }));
    const sheet = screen.getByRole('dialog', { name: 'ยกเลิกใบสั่งนี้ไหม' });
    expect(within(sheet).getByText('ร้านทดสอบ ก · 28 ต.ค. 2569 · 2 รายการ')).toBeInTheDocument();
    expect(within(sheet).getByText('ใบสั่งจะเป็นสถานะ "ยกเลิก" สต็อกยาไม่เปลี่ยน')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'ไม่ยกเลิก' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
    expect(saved(store).orders.find((o) => o.id === 'o1')?.status).toBe('waiting');
  });

  it('cancel works: ONE write, status cancelled + closedAt, nothing else changed; the sheet closes, the message shows, the card becomes cancelled', () => {
    const store = liveStore();
    const before = saved(store);
    const save = vi.spyOn(storage, 'saveRoot');
    live(store);
    fireEvent.click(within(card('28 ต.ค. 2569')).getByRole('button', { name: 'ยกเลิกใบสั่ง' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยกเลิกใบสั่ง' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(toastOf()).toHaveTextContent('ยกเลิกใบสั่งแล้ว');
    const after = saved(store);
    const o = after.orders.find((x) => x.id === 'o1')!;
    expect(o.status).toBe('cancelled');
    expect(typeof o.closedAt).toBe('string');
    expect({ ...after, orders: [] }).toEqual({ ...before, orders: [] });
    expect(after.orders.filter((x) => x.id !== 'o1')).toEqual(before.orders.filter((x) => x.id !== 'o1'));
    expect(within(card('28 ต.ค. 2569')).getByText('ยกเลิก', { selector: 'span' })).toBeInTheDocument();
    expect(within(card('28 ต.ค. 2569')).getByRole('button', { name: /สั่งซ้ำ/ })).toBeInTheDocument();
  });

  it('a failed write: the data stays as it was, the sheet stays with a message, pressing again works', () => {
    const store = liveStore();
    const before = JSON.stringify(saved(store));
    const save = vi.spyOn(storage, 'saveRoot').mockReturnValueOnce({ ok: false, reason: 'quota' });
    live(store);
    fireEvent.click(within(card('28 ต.ค. 2569')).getByRole('button', { name: 'ยกเลิกใบสั่ง' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยกเลิกใบสั่ง' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('บันทึกไม่ได้');
    expect(JSON.stringify(saved(store))).toBe(before);
    expect(within(card('28 ต.ค. 2569')).getByText('รอรับของ')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยกเลิกใบสั่ง' }));
    expect(save).toHaveBeenCalledTimes(2);
    expect(saved(store).orders.find((o) => o.id === 'o1')?.status).toBe('cancelled');
  });

  it('demo: a cancelled order lives in memory, nothing is written; its medicine is a normal suggestion again on the list', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    demo('normal', '&orders=history');
    expect(within(row('Simvastatin')).getByText('สั่งแล้ว รอรับ')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'เลือกสั่ง Simvastatin 20 mg' })).not.toBeChecked();
    go('#/n/order?demo=normal&orders=history&screen=history');
    fireEvent.click(within(card('28 ต.ค. 2569')).getByRole('button', { name: 'ยกเลิกใบสั่ง' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยกเลิกใบสั่ง' }));
    expect(within(card('28 ต.ค. 2569')).getByText('ยกเลิก', { selector: 'span' })).toBeInTheDocument();
    go('#/n/order?demo=normal&orders=history');
    expect(within(row('Simvastatin')).queryByText('สั่งแล้ว รอรับ')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'เลือกสั่ง Simvastatin 20 mg' })).toBeChecked();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('"สั่งซ้ำ" from a received order: adds to the list that is there (nothing removed, no double), all ticked, label "สั่งซ้ำ", the chosen shop is cleared, floating message', () => {
    demo('normal', '&orders=history&shops=three&shop=s1');
    // the list now: suggested lines; tick one by hand to prove it stays
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือกสั่ง Amlodipine 5 mg' }));
    const rowsBefore = screen.getAllByRole('checkbox').length;
    expect(screen.getByText('เลือกแล้ว')).toBeInTheDocument(); // shop s1 is chosen
    go('#/n/order?demo=normal&orders=history&shops=three&shop=s1&screen=history');
    fireEvent.click(within(card('12 ต.ค. 2569')).getByRole('button', { name: /สั่งซ้ำ/ }));
    expect(window.location.hash).not.toContain('screen=history');
    go('#/n/order?demo=normal&orders=history&shops=three&shop=s1');
    expect(toastOf()).toHaveTextContent('คัดลอกรายการมาแล้ว ใช้ราคาล่าสุดของแต่ละร้าน');
    expect(screen.getByRole('checkbox', { name: 'เลือกสั่ง Amlodipine 5 mg' })).toBeChecked(); // still there, untouched
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThanOrEqual(rowsBefore); // nothing removed
    expect(screen.queryByText('เลือกแล้ว')).not.toBeInTheDocument(); // the shop is cleared
    // Simvastatin was on the list already (suggested): not doubled; Losartan was not on it: added, ticked, labelled "สั่งซ้ำ", old quantity
    expect(screen.getAllByRole('checkbox', { name: 'เลือกสั่ง Simvastatin 20 mg' })).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'เลือกสั่ง Losartan 50 mg' })).toBeChecked();
    expect(within(row('Losartan')).getByText('สั่งซ้ำ')).toBeInTheDocument();
    expect(within(row('Losartan')).getByText('30')).toBeInTheDocument();
  });

  it('"สั่งซ้ำ" from a cancelled order works too, and a medicine that is gone is skipped and counted in the message', () => {
    const r = withDemoHistory(orderDemoRoot('normal'));
    const draftKeys = new Set(buildOrderLines(r, DEMO_TODAY).map((l) => l.key));
    const other = orderCandidates(r, DEMO_TODAY, draftKeys).find((c) => c.ref.kind === 'med')!;
    const medId = other.ref.kind === 'med' ? other.ref.medicationId : '';
    const a = r.assignments.find((x) => x.medicationId === medId)!;
    const o4 = r.orders.find((o) => o.id === 'o4')!;
    const lines = [
      { ...o4.lines[0]!, source: { kind: 'med' as const, medicationId: medId, shares: [{ assignmentId: a.id, qty: 1 }] }, qtyOrdered: 2 },
      { ...o4.lines[0]!, source: { kind: 'med' as const, medicationId: 'gone', shares: [{ assignmentId: 'gone', qty: 1 }] } },
    ];
    // the order refers to a medicine that no longer exists: the schema would refuse it in storage, so this is a view-level check with a memory root
    const root = { ...r, orders: r.orders.map((o) => (o.id === 'o4' ? { ...o, lines } : o)) };
    window.location.hash = '#/n/order?demo=normal&screen=history';
    render(<OrderView root={root} today={DEMO_TODAY} demo />);
    fireEvent.click(within(card('5 ต.ค. 2569')).getByRole('button', { name: /สั่งซ้ำ/ }));
    expect(toastOf()).toHaveTextContent('ข้าม 1 รายการที่ไม่มีในรายการยาแล้ว');
    go('#/n/order?demo=normal');
    const added = within(row(other.name.split(' ')[0]!));
    expect(added.getByText('สั่งซ้ำ')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: new RegExp(`เลือกสั่ง ${other.name.split(' ')[0]}`) })).toBeChecked();
  });

  it('"สั่งซ้ำ" brings a typed medicine back with its name, kind and strength', () => {
    const r = withDemoHistory(orderDemoRoot('normal'));
    const o3 = r.orders.find((o) => o.id === 'o3')!;
    const typed = { source: { kind: 'free' as const, name: 'ยาพิมพ์เองตัวอย่าง', medKind: 'tablet' as const, strength: { value: 5, unit: 'mg' as const } }, qtyOrdered: 2, sellUnit: 'กล่อง', qtyReceived: 2, leftover: null };
    const root = { ...r, orders: r.orders.map((o) => (o.id === 'o3' ? { ...o3, lines: [typed] } : o)) };
    window.location.hash = '#/n/order?demo=normal&screen=history';
    render(<OrderView root={root} today={DEMO_TODAY} demo />);
    fireEvent.click(within(card('12 ต.ค. 2569')).getByRole('button', { name: /สั่งซ้ำ/ }));
    go('#/n/order?demo=normal');
    expect(screen.getByRole('checkbox', { name: 'เลือกสั่ง ยาพิมพ์เองตัวอย่าง 5 mg' })).toBeChecked();
    expect(within(row('ยาพิมพ์เองตัวอย่าง')).getByText('สั่งซ้ำ')).toBeInTheDocument();
  });

  it('"สั่งซ้ำ" in a demo and in live saves nothing', () => {
    const store = liveStore();
    const save = vi.spyOn(storage, 'saveRoot');
    live(store);
    fireEvent.click(within(card('12 ต.ค. 2569')).getByRole('button', { name: /สั่งซ้ำ/ }));
    expect(save).not.toHaveBeenCalled();
  });

  it('the floating message in the history stays above the main menu (the lift is measured from the menu on top of the page, not from a bar)', () => {
    demo('normal', HIST);
    expect(document.documentElement.style.getPropertyValue('--toast-bottom')).not.toBe(''); // set from the dock, there is no bar
  });

  it('the disabled "บันทึกว่าสั่งแล้ว" button is faded like .copy / .line, and the bar sits in one box with the menu', () => {
    const css = readFileSync(resolve(__dirname, 'OrderMessage.module.css'), 'utf8');
    expect(css).toMatch(/\.call:disabled\s*\{[^}]*color-ink-muted/);
    const page = readFileSync(resolve(__dirname, 'OrderV3.module.css'), 'utf8');
    expect(page).toMatch(/\.dock\s*\{[^}]*position:\s*sticky/);
    expect(page).not.toMatch(/bottom:\s*calc\(72px/);
  });
});
