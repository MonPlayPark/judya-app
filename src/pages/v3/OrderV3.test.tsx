import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { sampleRootV3 } from '../../domain/v3/fixtures';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { ORDER_DEMO_NAMES, orderDemoRoot, type OrderDemoName } from '../../domain/v3/orderDemo';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY, type KeyValueStore } from '../../domain/v3/storage';
import { OrderV3Route } from './OrderPage';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const demo = (name: OrderDemoName, extra = '') => {
  window.location.hash = `#/n/order?demo=${name}${extra}`;
  return render(<OrderV3Route />);
};
/** The floating message is drawn in <body> after the page, so it is the last element with role status (the demo banner has the role too). */
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

  it('the history button and the main button are "coming soon": faded, they only show the floating message', () => {
    demo('normal');
    for (const name of ['ประวัติการสั่งซื้อ', 'ดูข้อความสั่งยา']) {
      const b = screen.getByRole('button', { name });
      expect(b).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(b);
      expect(toastOf()).toHaveTextContent('เร็ว ๆ นี้');
    }
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

describe('F. this page never writes storage', () => {
  const FILES = ['OrderPage.tsx', 'OrderV3.tsx', 'OrderSheets.tsx'];

  it('the three source files never mention a write (saveRoot, restoreRoot, startFresh, setItem, removeItem, localStorage)', () => {
    for (const f of FILES) {
      const code = readFileSync(resolve(__dirname, f), 'utf8').replace(/\/\/.*$/gm, '');
      for (const word of ['saveRoot', 'restoreRoot', 'startFresh', 'setItem', 'removeItem', 'localStorage', 'sessionStorage', 'indexedDB']) {
        expect(code, `${f} mentions ${word}`).not.toContain(word);
      }
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
