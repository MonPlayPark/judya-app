// Screen tests for step 3.3b-2, parts B and C: order days and the order-message text in Settings, and the list of deleted
// house medicines. Made-up data only. Today = Monday 19 Oct 2026.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from './App';
import { DataProvider, useData } from './state/DataContext';
import { settingsErrorText } from './domain/errorText';
import { NOW } from './domain/fixtures';
import { assignment, dailyMeal, person, rootWith } from './domain/helpers.test-util';
import { DEFAULT_ORDER_TEMPLATE } from './domain/orderMessage';
import type { HouseItem, Price, Root } from './domain/schema';
import { PREV_KEY, saveRoot, STORAGE_KEY } from './domain/storage';

const TODAY = '2026-10-19';
const DEFAULT_PREVIEW = [
  'สวัสดีค่ะ ร้านตัวอย่าง',
  'ขอสั่งยาตามรายการนี้',
  '1) ยาตัวอย่าง เอ x 2 กล่อง (60 เม็ด)',
  '2) ยาสามัญตัวอย่าง x 1 ขวด',
  'รบกวนแจ้งราคารวมและเวลารับยาด้วย ขอบคุณค่ะ',
].join('\n');

const stored = (): Root => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Root;
const open = (hash: string, root: Root = rootWith({})) => {
  expect(saveRoot(root).ok).toBe(true);
  window.location.hash = hash;
  return render(<App getToday={() => TODAY} />);
};
const nav = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
const click = (el: HTMLElement) => fireEvent.click(el);
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const box = () => screen.getByLabelText('ข้อความ') as HTMLTextAreaElement;
const preview = () => screen.getByLabelText('ตัวอย่างข้อความ');
const orderDaysChip = (label: string) =>
  within(screen.getByRole('radiogroup', { name: 'เลือกจำนวนวัน · จำนวนวันที่สั่งยา' })).getByRole('radio', { name: label });

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

describe('order days (settings.orderDays, 7-90)', () => {
  it('shows 30 days by default, with the sentence about what it is used for and no save button of its own', () => {
    open('#/settings');
    const card = screen.getByRole('heading', { name: 'จำนวนวันที่สั่งยา' }).closest('section') as HTMLElement;
    expect(within(card).getByText('30')).toBeInTheDocument();
    expect(within(card).getByText(/ใช้คำนวณจำนวนยาที่ต้องสั่งในหน้าสั่งยา/)).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /บันทึก/ })).not.toBeInTheDocument();
    expect(orderDaysChip('30 วัน')).toHaveAttribute('aria-checked', 'true');
  });

  it('chips 7 and 90 and the − / + buttons change it at once and save it', () => {
    open('#/settings');
    click(orderDaysChip('7 วัน'));
    expect(stored().settings.orderDays).toBe(7);
    click(orderDaysChip('90 วัน'));
    expect(stored().settings.orderDays).toBe(90);
    click(button('ลด 1 วัน · จำนวนวันที่สั่งยา'));
    expect(stored().settings.orderDays).toBe(89);
    click(button('เพิ่ม 1 วัน · จำนวนวันที่สั่งยา'));
    expect(stored().settings.orderDays).toBe(90);
  });

  it('the − button stops at 7 and the + button at 90: the number cannot be pushed outside', () => {
    open('#/settings', rootWith({ settings: { expiryWarnDays: 15, lowStockDays: 7, orderDays: 7, orderTemplate: '' } }));
    expect(button('ลด 1 วัน · จำนวนวันที่สั่งยา')).toBeDisabled();
    click(orderDaysChip('90 วัน'));
    expect(button('เพิ่ม 1 วัน · จำนวนวันที่สั่งยา')).toBeDisabled();
    expect(stored().settings.orderDays).toBe(90);
  });

  it('a save that fails leaves the number as it was and says why', () => {
    open('#/settings');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    click(orderDaysChip('60 วัน'));
    expect(screen.getByText(settingsErrorText('save_failed'))).toBeInTheDocument();
    expect(orderDaysChip('30 วัน')).toHaveAttribute('aria-checked', 'true');
  });

  it('6 and 91 are refused with the text of invalid_order_days and nothing changes; 7 and 90 are taken', () => {
    expect(saveRoot(rootWith({})).ok).toBe(true);
    let api!: ReturnType<typeof useData>;
    const Probe = () => {
      api = useData();
      return null;
    };
    render(
      <DataProvider getToday={() => TODAY}>
        <Probe />
      </DataProvider>,
    );
    for (const bad of [6, 91]) {
      let res!: ReturnType<typeof api.setSettings>;
      act(() => {
        res = api.setSettings({ orderDays: bad });
      });
      expect(res).toEqual({ ok: false, error: 'invalid_order_days' });
      expect(settingsErrorText('invalid_order_days')).toBe('จำนวนวันที่สั่งต้องเป็นเลขเต็ม 7 ถึง 90 ค่าเดิมยังอยู่');
      expect(stored().settings.orderDays).toBe(30);
    }
    for (const good of [7, 90]) {
      act(() => {
        expect(api.setSettings({ orderDays: good })).toEqual({ ok: true });
      });
      expect(stored().settings.orderDays).toBe(good);
    }
  });
});

describe('order message text', () => {
  it('first time (nothing saved): the box shows the default text and storage still holds an empty string', () => {
    open('#/settings');
    expect(box().value).toBe(DEFAULT_ORDER_TEMPLATE);
    expect(stored().settings.orderTemplate).toBe('');
  });

  it('explains {ร้าน}, {รายการ} and that no member name is in the text', () => {
    open('#/settings');
    const card = screen.getByRole('heading', { name: 'ข้อความสั่งยาไปร้าน' }).closest('section') as HTMLElement;
    expect(within(card).getByText(/\{ร้าน\} = ชื่อร้านที่เลือก/)).toBeInTheDocument();
    expect(within(card).getByText(/\{รายการ\} = รายการยาที่สั่ง/)).toBeInTheDocument();
    expect(within(card).getByText(/ในข้อความไม่มีชื่อสมาชิก/)).toBeInTheDocument();
  });

  it('shows what is really used when a text is saved', () => {
    open('#/settings', rootWith({ settings: { expiryWarnDays: 15, lowStockDays: 7, orderDays: 30, orderTemplate: 'ขอสั่งยา\n{รายการ}' } }));
    expect(box().value).toBe('ขอสั่งยา\n{รายการ}');
  });

  it('the preview of the default text is exactly the five lines of the example', () => {
    open('#/settings');
    expect(preview().textContent).toBe(DEFAULT_PREVIEW);
  });

  it('the preview follows the box while typing, and nothing is saved until the button is pressed', () => {
    open('#/settings');
    type(box(), '{ร้าน} ขอสั่งยา\n{รายการ}\nขอบคุณค่ะ');
    expect(preview().textContent).toBe(
      'ร้านตัวอย่าง ขอสั่งยา\n1) ยาตัวอย่าง เอ x 2 กล่อง (60 เม็ด)\n2) ยาสามัญตัวอย่าง x 1 ขวด\nขอบคุณค่ะ',
    );
    expect(stored().settings.orderTemplate).toBe('');
    expect(screen.queryByText('บันทึกแล้ว')).not.toBeInTheDocument();
  });

  it('typing a text and pressing "บันทึกข้อความ" stores it exactly as typed and says "บันทึกแล้ว"', () => {
    open('#/settings');
    const text = '{ร้าน} ขอสั่งยา\n{รายการ}\nขอบคุณค่ะ';
    type(box(), text);
    click(button('บันทึกข้อความ'));
    expect(stored().settings.orderTemplate).toBe(text);
    expect(screen.getByText('บันทึกแล้ว')).toBeInTheDocument();
    type(box(), text + '!'); // a new edit takes the note away until it is saved again
    expect(screen.queryByText('บันทึกแล้ว')).not.toBeInTheDocument();
  });

  it('nothing is trimmed: spaces and a final line break are kept', () => {
    open('#/settings');
    const text = '  {ร้าน}  \n{รายการ}  \n';
    type(box(), text);
    click(button('บันทึกข้อความ'));
    expect(stored().settings.orderTemplate).toBe(text);
  });

  it('"ใช้ข้อความตั้งต้น" puts the default into the box; saving it stores an empty string', () => {
    open('#/settings', rootWith({ settings: { expiryWarnDays: 15, lowStockDays: 7, orderDays: 30, orderTemplate: 'อะไรสักอย่าง {รายการ}' } }));
    click(button('ใช้ข้อความตั้งต้น'));
    expect(box().value).toBe(DEFAULT_ORDER_TEMPLATE);
    expect(stored().settings.orderTemplate).toBe('อะไรสักอย่าง {รายการ}'); // not saved yet
    click(button('บันทึกข้อความ'));
    expect(stored().settings.orderTemplate).toBe('');
    expect(screen.getByText('บันทึกแล้ว')).toBeInTheDocument();
  });

  it('a text equal to the default letter for letter is stored as an empty string; one letter different is kept', () => {
    open('#/settings', rootWith({ settings: { expiryWarnDays: 15, lowStockDays: 7, orderDays: 30, orderTemplate: 'x {รายการ}' } }));
    type(box(), DEFAULT_ORDER_TEMPLATE);
    click(button('บันทึกข้อความ'));
    expect(stored().settings.orderTemplate).toBe('');
    type(box(), DEFAULT_ORDER_TEMPLATE + ' ');
    click(button('บันทึกข้อความ'));
    expect(stored().settings.orderTemplate).toBe(DEFAULT_ORDER_TEMPLATE + ' ');
  });

  it('an emptied box saved: stored as an empty string and the box shows the default text again', () => {
    open('#/settings', rootWith({ settings: { expiryWarnDays: 15, lowStockDays: 7, orderDays: 30, orderTemplate: 'x {รายการ}' } }));
    type(box(), '');
    expect(preview().textContent).toBe(DEFAULT_PREVIEW); // an empty text means the default text
    click(button('บันทึกข้อความ'));
    expect(stored().settings.orderTemplate).toBe('');
    expect(box().value).toBe(DEFAULT_ORDER_TEMPLATE);
  });

  it('a text without {รายการ} gets a warning and the preview puts the list at the end', () => {
    open('#/settings');
    type(box(), 'สั่งยาค่ะ {ร้าน}');
    expect(screen.getByText(/ในข้อความไม่มี \{รายการ\}/)).toBeInTheDocument();
    expect(preview().textContent).toBe('สั่งยาค่ะ ร้านตัวอย่าง\n1) ยาตัวอย่าง เอ x 2 กล่อง (60 เม็ด)\n2) ยาสามัญตัวอย่าง x 1 ขวด');
    type(box(), '{รายการ}');
    expect(screen.queryByText(/ในข้อความไม่มี \{รายการ\}/)).not.toBeInTheDocument();
  });

  it('the buttons put {ร้าน} / {รายการ} where the cursor is', () => {
    open('#/settings');
    type(box(), 'ab');
    box().setSelectionRange(1, 1);
    click(button('ใส่ {ร้าน}'));
    expect(box().value).toBe('a{ร้าน}b');
    box().setSelectionRange(0, 1); // a selected letter is replaced
    click(button('ใส่ {รายการ}'));
    expect(box().value).toBe('{รายการ}{ร้าน}b');
  });

  it('a save that fails shows the reason, no "บันทึกแล้ว", and the stored text is unchanged', () => {
    open('#/settings');
    type(box(), 'ข้อความใหม่ {รายการ}');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    click(button('บันทึกข้อความ'));
    expect(screen.getByText(settingsErrorText('save_failed'))).toBeInTheDocument();
    expect(screen.queryByText('บันทึกแล้ว')).not.toBeInTheDocument();
    expect(stored().settings.orderTemplate).toBe('');
  });

  it('the preview never holds a member name even when the house has members', () => {
    open(
      '#/settings',
      rootWith({
        persons: [person({ id: 'p1', name: 'Test Person Zed' })],
        medications: [{ id: 'm1', name: 'ยาตัวอย่าง เอ', unit: 'เม็ด' }],
        assignments: [assignment({ id: 'a1', schedule: dailyMeal({ morning: { pills: 1, meal: 'after' } }) })],
      }),
    );
    expect(preview().textContent).not.toContain('Test Person Zed');
  });
});

describe('deleted house medicines', () => {
  const items: HouseItem[] = [
    { id: 'h1', name: 'ยาสามัญทดสอบ ก', stock: { qty: 3, unit: 'ขวด' }, lowAt: 1 },
    { id: 'h2', name: 'ยาสามัญทดสอบ ข' },
  ];
  const withHouse = (list: HouseItem[], prices: Price[] = []): Root =>
    rootWith({ houseItems: list, shops: [{ id: 's1', name: 'ร้านทดสอบ ก', delivery: { kind: 'pickup' } }], prices });
  const bar = (n: number) => screen.getByRole('button', { name: `ยาสามัญที่ลบแล้ว (${n})` });

  it('N = 0: no bar at all', () => {
    open('#/meds?tab=house', withHouse(items));
    expect(screen.queryByText(/ยาสามัญที่ลบแล้ว/)).not.toBeInTheDocument();
  });

  it('delete one: the bar "ยาสามัญที่ลบแล้ว (1)" appears closed; open it to see the name and "นำกลับ"', () => {
    open('#/house/h1', withHouse(items));
    click(button('ลบยานี้'));
    click(screen.getByRole('button', { name: 'ลบ' }));
    nav('#/meds?tab=house');
    expect(bar(1)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^นำกลับ/ })).not.toBeInTheDocument(); // folded
    expect(screen.queryByRole('link', { name: /ยาสามัญทดสอบ ก/ })).not.toBeInTheDocument(); // gone from the main list
    click(bar(1));
    expect(bar(1)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'นำกลับ ยาสามัญทดสอบ ก' })).toBeInTheDocument();
    expect(screen.getByText('ยาสามัญทดสอบ ก')).toBeInTheDocument();
  });

  it('"นำกลับ" puts it back in the main list at once, the bar goes, the numbers and the price are as before', () => {
    const price: Price = { id: 'y1', shopId: 's1', item: { kind: 'house', houseItemId: 'h1' }, price: 35, sellUnit: 'ขวด', perSellUnit: 1 };
    const gone = withHouse([{ ...items[0]!, removedAt: NOW }, items[1]!], [price]);
    open('#/meds?tab=house', gone);
    expect(screen.queryByRole('link', { name: /ยาสามัญทดสอบ ก/ })).not.toBeInTheDocument();
    click(bar(1));
    click(button('นำกลับ ยาสามัญทดสอบ ก'));
    expect(screen.queryByText(/ยาสามัญที่ลบแล้ว/)).not.toBeInTheDocument();
    const row = screen.getByRole('link', { name: /ยาสามัญทดสอบ ก/ });
    expect(within(row).getByText(/เหลือ 3 ขวด/)).toBeInTheDocument();
    expect(stored().houseItems[0]?.removedAt).toBeUndefined();
    expect(stored().houseItems[0]?.stock).toEqual({ qty: 3, unit: 'ขวด' });
    expect(stored().prices).toEqual([price]);
    nav('#/house/h1');
    expect(within(screen.getByRole('heading', { name: 'ราคาตามร้าน' }).closest('section') as HTMLElement).getByText('฿35 ต่อ 1 ขวด')).toBeInTheDocument();
  });

  it('two deleted: the count goes 2 -> 1 -> bar gone', () => {
    open('#/meds?tab=house', withHouse(items.map((i) => ({ ...i, removedAt: NOW }))));
    click(bar(2));
    expect(screen.getByText('ยาสามัญที่ลบแล้ว (2)')).toBeInTheDocument();
    click(button('นำกลับ ยาสามัญทดสอบ ก'));
    expect(bar(1)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'นำกลับ ยาสามัญทดสอบ ข' })).toBeInTheDocument(); // the bar stays open
    click(button('นำกลับ ยาสามัญทดสอบ ข'));
    expect(screen.queryByText(/ยาสามัญที่ลบแล้ว/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ยาสามัญทดสอบ ก/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ยาสามัญทดสอบ ข/ })).toBeInTheDocument();
  });

  it('a deleted medicine is not on the home screen', () => {
    open('#/', withHouse([{ ...items[0]!, stock: { qty: 0, unit: 'ขวด' }, lowAt: 1, removedAt: NOW }]));
    expect(screen.queryByText(/ยาสามัญทดสอบ ก/)).not.toBeInTheDocument();
  });

  it('a bring-back that cannot be saved shows the reason and the item stays deleted', () => {
    open('#/meds?tab=house', withHouse([{ ...items[0]!, removedAt: NOW }]));
    click(bar(1));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    click(button('นำกลับ ยาสามัญทดสอบ ก'));
    expect(screen.getByText(/บันทึกไม่ได้ ข้อมูลเดิมยังอยู่/)).toBeInTheDocument();
    expect(bar(1)).toBeInTheDocument();
  });
});

describe('still hidden: the order page and every "สั่งยา" button or link (step 3.3b-3)', () => {
  const root = (): Root =>
    rootWith({
      persons: [person({ id: 'p1' })],
      medications: [{ id: 'm1', name: 'ยาตัวอย่าง เอ', unit: 'เม็ด' }],
      assignments: [assignment({ id: 'a1', schedule: dailyMeal({ morning: { pills: 1, meal: 'after' } }), stock: { qty: 2, countedOn: TODAY } })],
      houseItems: [{ id: 'h1', name: 'ยาสามัญทดสอบ ก', stock: { qty: 0, unit: 'ขวด' }, lowAt: 1 }],
    });

  it.each(['#/', '#/meds', '#/meds?tab=house', '#/members/p1', '#/meds/a1', '#/house/h1', '#/settings'])('%s has no order link or button', (hash) => {
    open(hash, root());
    expect(document.querySelector('a[href="#/order"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /สั่งยา/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^สั่งยา/ })).not.toBeInTheDocument();
  });

  it('there is an order page: #/order opens it (step 3.3b-3)', () => {
    open('#/order', root());
    expect(screen.getByRole('heading', { level: 1, name: 'สั่งยา' })).toBeInTheDocument();
  });
});
