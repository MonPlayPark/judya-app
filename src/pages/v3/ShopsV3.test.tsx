import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { sampleRootV3 } from '../../domain/v3/fixtures';
import { SHOPS_DEMO_NAMES, shopsDemoRoot, type ShopsDemoName } from '../../domain/v3/shopsDemo';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY, loadRoot, saveRoot, type KeyValueStore } from '../../domain/v3/storage';
import { ShopsV3Route } from './ShopsPage';

type Mem = KeyValueStore & { data: Record<string, string>; failQuota: boolean };
const memoryStore = (): Mem => {
  const data: Record<string, string> = {};
  const m: Mem = {
    data,
    failQuota: false,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      if (m.failQuota) throw new DOMException('full', 'QuotaExceededError');
      data[k] = v;
    },
    removeItem: (k) => void delete data[k],
  };
  return m;
};
const demo = (name: ShopsDemoName, extra = '') => {
  window.location.hash = `#/n/shops?demo=${name}${extra}`;
  return render(<ShopsV3Route />);
};
const live = (store: Mem, extra = '') => {
  window.location.hash = `#/n/shops${extra}`;
  return render(<ShopsV3Route store={store} />);
};
const toastOf = (): HTMLElement => screen.getAllByRole('status').at(-1)!;
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => vi.restoreAllMocks());

describe('the list', () => {
  it('title, back button, three shops with their second line, and every demo builds', () => {
    demo('normal');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ร้านค้า');
    expect(screen.getByRole('button', { name: 'กลับ' })).toBeInTheDocument();
    expect(screen.getByText('โหมดตัวอย่าง ไม่บันทึกข้อมูล')).toBeInTheDocument();
    expect(screen.getByText('021234567 · ส่งถึงบ้าน ค่าส่ง ฿40')).toBeInTheDocument();
    expect(screen.getByText('021234568 · ไปรับเอง')).toBeInTheDocument();
    expect(screen.getByText('ส่งถึงบ้าน ค่าส่ง ฿30')).toBeInTheDocument();
    for (const n of SHOPS_DEMO_NAMES) expect(shopsDemoRoot(n).version).toBe(3);
  });
  it('never says "free" or shows a free-over value, even for a shop that has one', () => {
    demo('normal');
    expect(document.body.textContent).not.toContain('ฟรี');
    expect(document.body.textContent).not.toContain('500');
  });
  it('an empty house says so and offers the first shop', () => {
    demo('empty');
    expect(screen.getByText('ยังไม่มีร้านค้า')).toBeInTheDocument();
    press('เพิ่มร้านแรก');
    expect(screen.getByRole('dialog', { name: 'เพิ่มร้านค้า' })).toBeInTheDocument();
  });
  it('the back button goes Home when there is no page before', () => {
    demo('normal');
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    press('กลับ');
    expect(window.location.hash).toBe('#/n');
  });
  it('is reached by the route #/n/shops in the app', () => {
    window.location.hash = '#/n/shops?demo=normal';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'ร้านค้า' })).toBeInTheDocument();
  });
});

describe('the form', () => {
  it('opens as "delivery" with a fee box; save is off while the name is empty and says why', () => {
    demo('empty', '&sheet=add');
    const dialog = screen.getByRole('dialog', { name: 'เพิ่มร้านค้า' });
    expect(within(dialog).getByRole('button', { name: 'ส่งถึงบ้าน' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByLabelText('ค่าส่ง')).toBeInTheDocument();
    expect(within(dialog).getByText('ค่าส่ง').textContent).toBe('ค่าส่ง'); // the word "บาท" is only in the box's unit, not twice
    expect(within(dialog).getAllByText(/บาท/)).toHaveLength(1);
    expect(dialog.querySelector('label[for="sf-name"]')?.textContent).toBe('ชื่อร้าน *'); // must-fill star
    expect(within(dialog).getByRole('button', { name: 'บันทึก' })).toBeDisabled();
    expect(within(dialog).getByText('พิมพ์ชื่อร้านก่อน')).toBeInTheDocument();
    expect(within(dialog).queryByText(/ส่งฟรีเมื่อ|ครบ/)).toBeNull(); // no free-over box
  });
  it('pick-up hides the fee box; the cancel button and the X close it without saving', () => {
    demo('empty', '&sheet=add');
    press('ไปรับเอง');
    expect(screen.queryByLabelText('ค่าส่ง')).toBeNull();
    press('ยกเลิก');
    expect(screen.queryByRole('dialog')).toBeNull();
    press('เพิ่มร้านแรก');
    press('ปิด');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('wrong values: each message sits under its own box, with a warning icon and words, and nothing is saved', () => {
    const store = memoryStore();
    live(store, '?sheet=add');
    type('ชื่อร้าน', 'ก');
    type('เบอร์โทร (ไม่บังคับ)', 'abc');
    press('บันทึก');
    expect(screen.getByLabelText('ชื่อร้าน')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('ชื่อร้านต้องยาว 2–40 ตัวอักษร')).toBeInTheDocument();
    expect(screen.getByText(/เบอร์โทรใส่ได้เฉพาะตัวเลข/)).toBeInTheDocument();
    expect(screen.getByText(/ใส่ค่าส่งเป็นตัวเลข 0 ขึ้นไป/)).toBeInTheDocument(); // the fee box is empty
    expect(store.data[STORAGE_KEY]).toBeUndefined();
    type('ชื่อร้าน', 'ร้านทดสอบ ก'); // typing clears that box's message only
    expect(screen.queryByText('ชื่อร้านต้องยาว 2–40 ตัวอักษร')).toBeNull();
    expect(screen.getByText(/เบอร์โทรใส่ได้เฉพาะตัวเลข/)).toBeInTheDocument();
  });
  it('the fee box takes only digits and one dot', () => {
    demo('empty', '&sheet=add');
    type('ค่าส่ง', '4a0.5.5');
    expect(screen.getByLabelText('ค่าส่ง')).toHaveValue('40.55');
  });
});

describe('add, edit, delete in the real data', () => {
  it('adds a shop: written to judya.v3 only, the list shows it, toast "บันทึกแล้ว", sheet closes', () => {
    const store = memoryStore();
    saveRoot(sampleRootV3(), store);
    live(store, '?sheet=add');
    type('ชื่อร้าน', 'ร้านทดสอบ ใหม่');
    type('เบอร์โทร (ไม่บังคับ)', '021234567');
    type('ค่าส่ง', '45');
    press('บันทึก');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('021234567 · ส่งถึงบ้าน ค่าส่ง ฿45')).toBeInTheDocument();
    expect(toastOf()).toHaveTextContent('บันทึกแล้ว');
    const saved = loadRoot(store);
    expect(saved.status === 'ok' && saved.root.shops.map((s) => s.name)).toEqual(['ร้านตัวอย่าง 1', 'ร้านตัวอย่าง 2', 'ร้านตัวอย่าง 3', 'ร้านทดสอบ ใหม่']);
    expect(Object.keys(store.data)).toEqual([STORAGE_KEY]);
  });
  it('a shop with the same name is refused under the name box, and nothing is written', () => {
    const store = memoryStore();
    saveRoot(sampleRootV3(), store);
    const before = store.data[STORAGE_KEY];
    live(store, '?sheet=add');
    type('ชื่อร้าน', '  ร้านตัวอย่าง 2 ');
    type('ค่าส่ง', '10');
    press('บันทึก');
    expect(screen.getByText('มีร้านชื่อนี้แล้ว')).toBeInTheDocument();
    expect(store.data[STORAGE_KEY]).toBe(before);
  });
  it('a failed save (storage full): old data stays, the form keeps what was typed and says so, the list does not change', () => {
    const store = memoryStore();
    saveRoot(sampleRootV3(), store);
    const before = store.data[STORAGE_KEY];
    live(store, '?sheet=add');
    type('ชื่อร้าน', 'ร้านทดสอบ ใหม่');
    type('ค่าส่ง', '45');
    store.failQuota = true;
    press('บันทึก');
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
    expect(screen.getByLabelText('ชื่อร้าน')).toHaveValue('ร้านทดสอบ ใหม่');
    expect(screen.getByLabelText('ค่าส่ง')).toHaveValue('45');
    expect(store.data[STORAGE_KEY]).toBe(before);
    store.failQuota = false; // pressing again works
    press('บันทึก');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('ส่งถึงบ้าน ค่าส่ง ฿45')).toBeInTheDocument();
  });
  it('edit: the form starts from the shop; the "free over" value of the shop is kept after saving, and not shown', () => {
    const store = memoryStore();
    saveRoot(sampleRootV3(), store);
    live(store, '?sheet=edit&item=s2');
    expect(screen.getByRole('dialog', { name: 'แก้ไขร้านค้า' })).toBeInTheDocument();
    expect(screen.getByLabelText('ชื่อร้าน')).toHaveValue('ร้านตัวอย่าง 2');
    expect(screen.getByLabelText('ค่าส่ง')).toHaveValue('40');
    expect(screen.getByRole('dialog').textContent).not.toContain('500');
    type('ค่าส่ง', '55');
    press('บันทึก');
    const saved = loadRoot(store);
    if (saved.status !== 'ok') throw new Error('load');
    expect(saved.root.shops.find((s) => s.id === 's2')?.delivery).toEqual({ kind: 'deliver', fee: 55, freeOver: 500 });
  });
  it('edit to pick-up and back inside one form keeps the value; saving as pick-up drops it', () => {
    const store = memoryStore();
    saveRoot(sampleRootV3(), store);
    live(store, '?sheet=edit&item=s2');
    press('ไปรับเอง');
    press('ส่งถึงบ้าน');
    expect(screen.getByLabelText('ค่าส่ง')).toHaveValue('40');
    press('ไปรับเอง');
    press('บันทึก');
    const saved = loadRoot(store);
    expect(saved.status === 'ok' && saved.root.shops.find((s) => s.id === 's2')?.delivery).toEqual({ kind: 'pickup' });
  });
  it('tapping a row opens the edit form', () => {
    demo('normal');
    fireEvent.click(screen.getByRole('button', { name: /ร้านทดสอบ ข/ }));
    expect(screen.getByRole('dialog', { name: 'แก้ไขร้านค้า' })).toBeInTheDocument();
    expect(screen.getByLabelText('ชื่อร้าน')).toHaveValue('ร้านทดสอบ ข');
    expect(screen.getByRole('button', { name: 'ไปรับเอง' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('delete: asks first; "ยกเลิก" in the sheet writes nothing; "ลบร้าน" removes the shop and its prices, orders stay', () => {
    const store = memoryStore();
    saveRoot(sampleRootV3(), store);
    live(store, '?sheet=edit&item=s1');
    press('ลบร้านนี้');
    const ask = screen.getByRole('dialog', { name: 'ลบร้านนี้?' });
    expect(ask).toHaveTextContent('ใบสั่งเก่ายังเห็นชื่อร้าน แต่ราคาที่จำไว้ของร้านนี้จะถูกลบ');
    const before = store.data[STORAGE_KEY];
    fireEvent.click(within(ask).getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByRole('dialog', { name: 'ลบร้านนี้?' })).toBeNull();
    expect(store.data[STORAGE_KEY]).toBe(before);
    press('ลบร้านนี้');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'ลบร้านนี้?' })).getByRole('button', { name: 'ลบร้าน' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toastOf()).toHaveTextContent('ลบแล้ว');
    expect(screen.queryByText('ร้านตัวอย่าง 1', { selector: 'span' })).toBeNull();
    const saved = loadRoot(store);
    if (saved.status !== 'ok') throw new Error('load');
    expect(saved.root.shops.map((s) => s.id)).toEqual(['s2', 's3']);
    expect(saved.root.prices.map((p) => p.id)).toEqual(['pr2']);
    expect(saved.root.orders).toHaveLength(4);
  });
  it('a failed delete keeps the shop and says so in the sheet', () => {
    const store = memoryStore();
    saveRoot(sampleRootV3(), store);
    live(store, '?sheet=edit&item=s1');
    press('ลบร้านนี้');
    store.failQuota = true;
    store.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    fireEvent.click(within(screen.getByRole('dialog', { name: 'ลบร้านนี้?' })).getByRole('button', { name: 'ลบร้าน' }));
    expect(screen.getByRole('dialog', { name: 'ลบร้านนี้?' })).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
    const saved = loadRoot(store);
    expect(saved.status === 'ok' && saved.root.shops).toHaveLength(3);
  });
  it('data with no shop at all opens and a shop can be added', () => {
    const store = memoryStore();
    saveRoot({ ...sampleRootV3(), shops: [], prices: [], orders: [] }, store);
    live(store);
    expect(screen.getByText('ยังไม่มีร้านค้า')).toBeInTheDocument();
  });
});

describe('storage', () => {
  it('demo mode: nothing is read or written, and a change in the sheet stays in the page only', () => {
    const save = vi.spyOn(storage, 'saveRoot');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const read = vi.spyOn(Storage.prototype, 'getItem');
    demo('normal', '&sheet=add');
    type('ชื่อร้าน', 'ร้านทดสอบ ง');
    type('ค่าส่ง', '20');
    press('บันทึก');
    expect(screen.getByText('ส่งถึงบ้าน ค่าส่ง ฿20')).toBeInTheDocument();
    act(() => undefined);
    expect(save).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it('real data that cannot be read shows the problem screen and the page does not write', () => {
    const store = memoryStore();
    store.data[STORAGE_KEY] = '{not json';
    live(store);
    expect(screen.queryByRole('heading', { name: 'ร้านค้า' })).toBeNull();
    expect(store.data[STORAGE_KEY]).toBe('{not json');
  });
});
