// Screen tests for step 3.3a: house medicines (tab, add, edit, cut stock, delete / bring back), shops in Settings, and the
// home list. Made-up data only. The clock is injected (today = Monday 19 Oct 2026, expiryWarnDays 15).
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from './App';
import { loadSample } from './domain/actions';
import { NOW } from './domain/fixtures';
import { rootWith } from './domain/helpers.test-util';
import { emptyRoot, type HouseItem, type Price, type Root, type Shop } from './domain/schema';
import { PREV_KEY, saveRoot, STORAGE_KEY } from './domain/storage';

const TODAY = '2026-10-19';
const getToday = () => TODAY;

const stored = (): Root => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Root;
const seed = (root: Root) => expect(saveRoot(root).ok).toBe(true);
const nav = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
const open = (hash: string, root: Root = emptyRoot(NOW)) => {
  seed(root);
  window.location.hash = hash;
  return render(<App getToday={getToday} />);
};
const click = (el: HTMLElement) => fireEvent.click(el);
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const field = (label: string | RegExp) => screen.getByLabelText(label);
const h1 = () => screen.getByRole('heading', { level: 1 });

const para: HouseItem = { id: 'h1', name: 'ยาสามัญทดสอบ ก', stock: { qty: 10, unit: 'เม็ด' }, lowAt: 5, expiry: '2027-09-30' };
const eye: HouseItem = { id: 'h2', name: 'ยาสามัญทดสอบ ข' };
const withHouse = (...items: HouseItem[]): Root => rootWith({ houseItems: items });

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

describe('tab "ยาสามัญประจำบ้าน"', () => {
  it('the two tabs switch with the address; the house tab says it is empty', () => {
    open('#/meds');
    expect(button('ยาประจำตัว')).toHaveAttribute('aria-pressed', 'true');
    click(button('ยาสามัญประจำบ้าน'));
    expect(window.location.hash).toBe('#/meds?tab=house');
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange')); // jsdom sends it a moment later; send it now
    });
    expect(button('ยาสามัญประจำบ้าน')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('ยังไม่มียาสามัญในบ้าน')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เพิ่มยาสามัญประจำบ้าน' })).toHaveAttribute('href', '#/house/new');
  });

  it('shows each item with its words: ปกติ-type "สต๊อกพอ", ใกล้หมด, หมดแล้ว, ไม่ได้ใส่จำนวน, หมดอายุแล้ว', () => {
    const items: HouseItem[] = [
      { id: 'a', name: 'ยาสามัญ ปกติ', stock: { qty: 10, unit: 'เม็ด' }, lowAt: 5 },
      { id: 'b', name: 'ยาสามัญ ใกล้หมด', stock: { qty: 5, unit: 'เม็ด' }, lowAt: 5 },
      { id: 'c', name: 'ยาสามัญ หมด', stock: { qty: 0, unit: 'ขวด' }, lowAt: 5 },
      { id: 'd', name: 'ยาสามัญ ไม่นับ' },
      { id: 'e', name: 'ยาสามัญ หมดอายุ', expiry: '2026-10-18' },
      { id: 'f', name: 'ยาสามัญ ใกล้หมดอายุ', expiry: '2026-11-03' },
    ];
    open('#/meds?tab=house', withHouse(...items));
    const row = (name: string) => screen.getByRole('link', { name: new RegExp(name) });
    expect(within(row('ยาสามัญ ปกติ')).getByText('สต๊อกพอ')).toBeInTheDocument();
    expect(within(row('ยาสามัญ ใกล้หมด$|ยาสามัญ ใกล้หมด เหลือ')).getByText('ใกล้หมด')).toBeInTheDocument();
    expect(within(row('ยาสามัญ หมด เ|ยาสามัญ หมด$|ยาสามัญ หมดแล้ว|ยาสามัญ หมด หมดแล้ว')).getByText('หมดแล้ว')).toBeInTheDocument();
    expect(within(row('ยาสามัญ ไม่นับ')).getByText('ไม่ได้ใส่จำนวน')).toBeInTheDocument();
    expect(within(row('ยาสามัญ ไม่นับ')).getByText('ไม่นับสต๊อก')).toBeInTheDocument();
    expect(within(row('ยาสามัญ หมดอายุ')).getByText('หมดอายุแล้ว')).toBeInTheDocument();
    expect(within(row('ยาสามัญ ใกล้หมดอายุ')).getByText('ใกล้หมดอายุ')).toBeInTheDocument();
    expect(screen.getByText('ใช้ร่วมกันทุกคน · 6 รายการ')).toBeInTheDocument();
  });

  it('a row opens its edit page', () => {
    open('#/meds?tab=house', withHouse(para));
    expect(screen.getByRole('link', { name: /ยาสามัญทดสอบ ก/ })).toHaveAttribute('href', '#/house/h1');
  });

  it('the order button and price sections stay hidden (step 3.3b)', () => {
    open('#/meds?tab=house', withHouse(para));
    expect(screen.queryByText(/สั่งยา/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ราคาตามร้าน/)).not.toBeInTheDocument();
  });
});

describe('add a house medicine (#/house/new)', () => {
  it('adds it and it shows up in the tab; saved in judya.v2 with the typed values', () => {
    open('#/house/new');
    expect(h1()).toHaveTextContent('เพิ่มยาสามัญประจำบ้าน');
    expect(button('บันทึก')).toBeDisabled();
    expect(screen.getByText('พิมพ์ชื่อยาอย่างน้อย 2 ตัวอักษรเพื่อบันทึก')).toBeInTheDocument();
    type(field('ชื่อยา'), 'ยาสามัญทดสอบ ก');
    expect(button('บันทึก')).toBeEnabled();
    type(field(/^จำนวนคงเหลือ/), '10');
    click(screen.getByRole('radio', { name: 'ขวด' }));
    type(field(/^เตือนเมื่อเหลือไม่เกิน/), '5');
    type(field(/^วันหมดอายุ/), '2027-09-30');
    type(field(/^บันทึกเพิ่มเติม/), 'ตู้ชั้นล่าง');
    click(button('บันทึก'));

    expect(screen.getByText('เพิ่ม ยาสามัญทดสอบ ก แล้ว')).toBeInTheDocument();
    expect(field('ชื่อยา')).toHaveValue(''); // ready for the next one
    const saved = stored().houseItems;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'ยาสามัญทดสอบ ก', stock: { qty: 10, unit: 'ขวด' }, lowAt: 5, expiry: '2027-09-30', note: 'ตู้ชั้นล่าง' });

    nav('#/meds?tab=house');
    const row = screen.getByRole('link', { name: /ยาสามัญทดสอบ ก/ });
    expect(within(row).getByText('เหลือ 10 ขวด · เตือนเมื่อเหลือไม่เกิน 5 · หมดอายุ 30 ก.ย. 2570')).toBeInTheDocument();
    expect(within(row).getByText('สต๊อกพอ')).toBeInTheDocument();
  });

  it('a name only is enough: no stock = "ไม่นับสต๊อก"', () => {
    open('#/house/new');
    type(field('ชื่อยา'), 'ยาสามัญทดสอบ ข');
    click(button('บันทึก'));
    expect(stored().houseItems[0]).toMatchObject({ name: 'ยาสามัญทดสอบ ข' });
    expect(stored().houseItems[0]?.stock).toBeUndefined();
  });

  it('a warn level without a quantity cannot be saved, and the field says why', () => {
    open('#/house/new');
    type(field('ชื่อยา'), 'ยาสามัญทดสอบ ก');
    type(field(/^เตือนเมื่อเหลือไม่เกิน/), '5');
    expect(button('บันทึก')).toBeDisabled();
    expect(screen.getByText('ต้องใส่จำนวนคงเหลือก่อน จึงตั้งเตือนใกล้หมดได้')).toBeInTheDocument();
    expect(stored().houseItems ?? []).toEqual([]);
  });

  it('a quantity without a unit cannot be saved', () => {
    open('#/house/new');
    type(field('ชื่อยา'), 'ยาสามัญทดสอบ ก');
    type(field(/^จำนวนคงเหลือ/), '3');
    type(field('หรือพิมพ์หน่วยเอง'), '');
    expect(button('บันทึก')).toBeDisabled();
    expect(screen.getAllByText('เลือกหรือพิมพ์หน่วยนับของจำนวนคงเหลือ').length).toBeGreaterThan(0);
  });

  it('with sample data it asks to delete the sample first (nothing is cleared silently), then shows the form', () => {
    open('#/house/new', loadSample(emptyRoot(NOW), TODAY, NOW));
    expect(screen.getByRole('dialog')).toHaveTextContent('ต้องลบข้อมูลตัวอย่างก่อน');
    expect(stored().meta.isSample).toBe(true);
    click(button('ลบตัวอย่างแล้วเริ่ม'));
    expect(stored().meta.isSample).toBeUndefined();
    expect(field('ชื่อยา')).toBeInTheDocument();
  });
});

describe('edit, cut stock, delete and bring back (#/house/:id)', () => {
  it('shows the saved values and the price section', () => {
    open('#/house/h1', withHouse(para));
    expect(h1()).toHaveTextContent('แก้ไขยาสามัญประจำบ้าน');
    expect(field('ชื่อยา')).toHaveValue('ยาสามัญทดสอบ ก');
    expect(field(/^จำนวนคงเหลือ/)).toHaveValue(10);
    expect(field(/^เตือนเมื่อเหลือไม่เกิน/)).toHaveValue(5);
    expect(field(/^วันหมดอายุ/)).toHaveValue('2027-09-30');
    expect(screen.getByRole('heading', { name: 'ราคาตามร้าน' })).toBeInTheDocument(); // opened in step 3.3b-2
  });

  it('editing saves the new values; a line "บันทึกแล้ว" appears', () => {
    open('#/house/h1', withHouse(para));
    type(field('ชื่อยา'), 'ยาสามัญทดสอบ ใหม่');
    type(field(/^จำนวนคงเหลือ/), '20');
    click(button('บันทึก'));
    expect(screen.getByText('บันทึกแล้ว')).toBeInTheDocument();
    expect(stored().houseItems[0]).toMatchObject({ id: 'h1', name: 'ยาสามัญทดสอบ ใหม่', stock: { qty: 20, unit: 'เม็ด' }, lowAt: 5 });
  });

  it('emptying the quantity box takes the stock away; the warn level must go with it', () => {
    open('#/house/h1', withHouse(para));
    type(field(/^จำนวนคงเหลือ/), '');
    expect(button('บันทึก')).toBeDisabled();
    type(field(/^เตือนเมื่อเหลือไม่เกิน/), '');
    click(button('บันทึก'));
    expect(stored().houseItems[0]?.stock).toBeUndefined();
    expect(stored().houseItems[0]?.lowAt).toBeUndefined();
  });

  it('cut 3 from 10 -> 7 left, saved at once, and the quantity box shows 7', () => {
    open('#/house/h1', withHouse(para));
    expect(screen.getByText('เหลือในแอปตอนนี้ 10 เม็ด')).toBeInTheDocument();
    click(button('เพิ่มจำนวนที่ใช้'));
    click(button('เพิ่มจำนวนที่ใช้'));
    click(button('ตัดออก 3 เม็ด'));
    expect(screen.getByText('ตัดออก 3 เม็ด แล้ว เหลือ 7 เม็ด')).toBeInTheDocument();
    expect(stored().houseItems[0]?.stock?.qty).toBe(7);
    expect(field(/^จำนวนคงเหลือ/)).toHaveValue(7);
  });

  it('cut more than is left (11 of 10): a warning and the quantity does not change, in the app and on disk', () => {
    open('#/house/h1', withHouse(para));
    for (let i = 0; i < 10; i += 1) click(button('เพิ่มจำนวนที่ใช้'));
    click(button('ตัดออก 11 เม็ด'));
    expect(screen.getByText(/ตัดไม่ได้ จะตัด 11 เม็ด แต่เหลือแค่ 10 เม็ด จำนวนยังเท่าเดิม/)).toBeInTheDocument();
    expect(stored().houseItems[0]?.stock?.qty).toBe(10);
    expect(field(/^จำนวนคงเหลือ/)).toHaveValue(10);
  });

  it('cut everything (10 of 10) -> 0 left, the page says หมดแล้ว, and nothing is left to cut', () => {
    open('#/house/h1', withHouse(para));
    for (let i = 0; i < 9; i += 1) click(button('เพิ่มจำนวนที่ใช้'));
    click(button('ตัดออก 10 เม็ด'));
    expect(stored().houseItems[0]?.stock?.qty).toBe(0);
    expect(screen.getByText('หมดแล้ว')).toBeInTheDocument();
    expect(screen.getByText('ไม่มีของเหลือให้ตัดแล้ว')).toBeInTheDocument();
    expect(button(/^ตัดออก/)).toBeDisabled();
  });

  it('an item without a count cannot be cut and says why', () => {
    open('#/house/h2', withHouse(eye));
    expect(button(/^ตัดออก/)).toBeDisabled();
    expect(screen.getByText('ใส่จำนวนคงเหลือก่อน จึงตัดจำนวนได้')).toBeInTheDocument();
  });

  it('the notices at the top: expired, low and soon', () => {
    open('#/house/h1', withHouse({ ...para, stock: { qty: 5, unit: 'เม็ด' }, expiry: '2026-10-18' }));
    expect(screen.getByText('หมดอายุแล้ว 1 วัน (18 ต.ค. 2569)')).toBeInTheDocument();
    expect(screen.getByText('ใกล้หมด เหลือ 5 เม็ด')).toBeInTheDocument();
  });

  it('delete asks first; cancel changes nothing; delete hides it (not erased) and "นำกลับ" brings it back', () => {
    open('#/house/h1', withHouse(para, eye));
    click(button('ลบยานี้'));
    expect(screen.getByRole('dialog')).toHaveTextContent('ลบ ยาสามัญทดสอบ ก ออกจากยาสามัญประจำบ้าน?');
    click(button('ยกเลิก'));
    expect(stored().houseItems.every((h) => h.removedAt === undefined)).toBe(true);

    click(button('ลบยานี้'));
    click(button('ลบ'));
    expect(screen.getByText('ลบ ยาสามัญทดสอบ ก แล้ว')).toBeInTheDocument();
    expect(stored().houseItems).toHaveLength(2); // kept, only hidden
    expect(stored().houseItems[0]?.removedAt).toBeTruthy();

    nav('#/meds?tab=house');
    expect(screen.queryByText('ยาสามัญทดสอบ ก')).not.toBeInTheDocument();
    expect(screen.getByText('ยาสามัญทดสอบ ข')).toBeInTheDocument();

    nav('#/house/h1'); // the link still works and offers "นำกลับ"
    click(button('นำกลับ'));
    expect(field('ชื่อยา')).toHaveValue('ยาสามัญทดสอบ ก');
    expect(stored().houseItems[0]).toEqual(para);
    nav('#/meds?tab=house');
    expect(screen.getByText('ยาสามัญทดสอบ ก')).toBeInTheDocument();
  });

  it('an unknown id is "ไม่พบยาสามัญตัวนี้"', () => {
    open('#/house/nope', withHouse(para));
    expect(screen.getByText(/ไม่พบยาสามัญตัวนี้/)).toBeInTheDocument();
  });

  it('a failed save keeps the old data and says so', () => {
    open('#/house/h1', withHouse(para));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    click(button('เพิ่มจำนวนที่ใช้'));
    click(button('ตัดออก 2 เม็ด'));
    expect(screen.getByText(/บันทึกไม่ได้ ข้อมูลเดิมยังอยู่/)).toBeInTheDocument();
    expect(field(/^จำนวนคงเหลือ/)).toHaveValue(10);
    vi.restoreAllMocks();
    expect(stored().houseItems[0]?.stock?.qty).toBe(10);
  });
});

describe('shops in Settings', () => {
  const shopA: Shop = { id: 'sA', name: 'ร้านทดสอบ ก', delivery: { kind: 'pickup' } };
  const shopB: Shop = { id: 'sB', name: 'ร้านทดสอบ ข', phone: '081-234-5678', delivery: { kind: 'deliver', fee: 40, freeOver: 1000 } };
  const price = (id: string, shopId: string, houseItemId: string): Price => ({
    id,
    shopId,
    item: { kind: 'house', houseItemId },
    price: 35,
    sellUnit: 'แผง',
    perSellUnit: 1,
  });

  it('empty: says so and has the add button; the order-message card is there (step 3.3b-2)', () => {
    open('#/settings');
    expect(screen.getByText('ยังไม่มีร้านค้า')).toBeInTheDocument();
    expect(button('เพิ่มร้านค้า')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ข้อความสั่งยาไปร้าน' })).toBeInTheDocument();
  });

  it('add a shop that delivers: the form checks as you type, the list shows the words', () => {
    open('#/settings');
    click(button('เพิ่มร้านค้า'));
    expect(button('บันทึก')).toBeDisabled();
    expect(screen.getByText('พิมพ์ชื่อร้านอย่างน้อย 2 ตัวอักษร')).toBeInTheDocument();
    type(field('ชื่อร้าน'), ' ก ');
    expect(button('บันทึก')).toBeDisabled();
    type(field('ชื่อร้าน'), 'ร้านทดสอบ ข');
    expect(button('บันทึก')).toBeEnabled(); // pick-up needs nothing else
    type(field(/^เบอร์โทร/), '12');
    expect(button('บันทึก')).toBeDisabled();
    expect(screen.getByText(/เบอร์โทรใช้ได้แค่ตัวเลข/)).toBeInTheDocument();
    type(field(/^เบอร์โทร/), '081-234-5678');
    click(screen.getByRole('radio', { name: 'ให้ร้านส่ง' }));
    expect(button('บันทึก')).toBeDisabled(); // a fee is needed (0 = free)
    type(field(/^ค่าส่ง/), '40');
    type(field(/^ส่งฟรีเมื่อซื้อครบ/), '0');
    expect(button('บันทึก')).toBeDisabled();
    expect(screen.getByText('ยอดส่งฟรีต้องมากกว่า 0 หรือเว้นว่าง')).toBeInTheDocument();
    type(field(/^ส่งฟรีเมื่อซื้อครบ/), '1000');
    click(button('บันทึก'));

    expect(screen.getByText('บันทึกร้าน ร้านทดสอบ ข แล้ว')).toBeInTheDocument();
    expect(screen.getByText('081-234-5678 · ให้ร้านส่ง ค่าส่ง ฿40 · ซื้อครบ ฿1000 ส่งฟรี')).toBeInTheDocument();
    expect(stored().shops).toMatchObject([{ name: 'ร้านทดสอบ ข', phone: '081-234-5678', delivery: { kind: 'deliver', fee: 40, freeOver: 1000 } }]);
  });

  it('a delivery fee of 0 is free delivery and can be saved', () => {
    open('#/settings');
    click(button('เพิ่มร้านค้า'));
    type(field('ชื่อร้าน'), 'ร้านทดสอบ ก');
    click(screen.getByRole('radio', { name: 'ให้ร้านส่ง' }));
    type(field(/^ค่าส่ง/), '0');
    click(button('บันทึก'));
    expect(screen.getByText('ยังไม่ใส่เบอร์โทร · ให้ร้านส่ง ส่งฟรี')).toBeInTheDocument();
    expect(stored().shops[0]?.delivery).toEqual({ kind: 'deliver', fee: 0 });
  });

  it('edit a shop: the form is filled; saving changes it', () => {
    open('#/settings', rootWith({ shops: [shopB] }));
    click(button('แก้ไขร้าน ร้านทดสอบ ข'));
    expect(field('ชื่อร้าน')).toHaveValue('ร้านทดสอบ ข');
    expect(field(/^ค่าส่ง/)).toHaveValue(40);
    type(field('ชื่อร้าน'), 'ร้านทดสอบ ใหม่');
    click(screen.getByRole('radio', { name: 'ไปรับเองที่ร้าน' }));
    click(button('บันทึก'));
    expect(stored().shops[0]).toEqual({ id: 'sB', name: 'ร้านทดสอบ ใหม่', phone: '081-234-5678', delivery: { kind: 'pickup' } });
    expect(screen.getByText('081-234-5678 · ไปรับเองที่ร้าน')).toBeInTheDocument();
  });

  it('cancel closes the form and changes nothing', () => {
    open('#/settings', rootWith({ shops: [shopA] }));
    click(button('แก้ไขร้าน ร้านทดสอบ ก'));
    type(field('ชื่อร้าน'), 'ร้านทดสอบ แก้ไม่เซฟ');
    click(button('ยกเลิก'));
    expect(stored().shops[0]?.name).toBe('ร้านทดสอบ ก');
    expect(screen.queryByLabelText('ชื่อร้าน')).not.toBeInTheDocument();
  });

  it('delete asks first and says the prices of that shop go too; cancel keeps everything; delete removes only that shop and its prices', () => {
    const prices = [price('p1', 'sA', 'h1'), price('p2', 'sA', 'h2'), price('p3', 'sA', 'h1'), price('p4', 'sB', 'h1'), price('p5', 'sB', 'h2')];
    open('#/settings', rootWith({ houseItems: [para, eye], shops: [shopA, shopB], prices }));
    click(button('แก้ไขร้าน ร้านทดสอบ ก'));
    click(button('ลบร้านนี้'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('ลบ ร้านทดสอบ ก?');
    expect(dialog).toHaveTextContent('ราคาที่ใส่ไว้ของร้านนี้จะหายไปด้วย (3 รายการ)');
    click(within(dialog).getByRole('button', { name: 'ยกเลิก' }));
    expect(stored().shops).toHaveLength(2);
    expect(stored().prices).toHaveLength(5);

    click(button('ลบร้านนี้'));
    click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ลบ' }));
    expect(screen.getByText('ลบร้าน ร้านทดสอบ ก แล้ว')).toBeInTheDocument();
    expect(stored().shops.map((s) => s.id)).toEqual(['sB']);
    expect(stored().prices.map((p) => p.id)).toEqual(['p4', 'p5']);
    expect(stored().houseItems).toHaveLength(2);
  });

  it('with sample data, adding a shop asks to delete the sample first', () => {
    open('#/settings', loadSample(emptyRoot(NOW), TODAY, NOW));
    click(button('เพิ่มร้านค้า'));
    expect(screen.getByRole('dialog')).toHaveTextContent('ต้องลบข้อมูลตัวอย่างก่อน');
    expect(stored().meta.isSample).toBe(true);
    click(button('ลบตัวอย่างแล้วเริ่ม'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stored().meta.isSample).toBeUndefined();
    click(button('เพิ่มร้านค้า'));
    expect(field('ชื่อร้าน')).toBeInTheDocument();
  });
});

describe('home: ยาที่ต้องดูแล includes house medicines', () => {
  it('low, out and expired house medicines show with their words and open their edit page', () => {
    const items: HouseItem[] = [
      { id: 'a', name: 'ยาสามัญ ใกล้หมด', stock: { qty: 5, unit: 'เม็ด' }, lowAt: 5 },
      { id: 'b', name: 'ยาสามัญ หมดแล้ว', stock: { qty: 0, unit: 'ขวด' } },
      { id: 'c', name: 'ยาสามัญ หมดอายุ', expiry: '2026-10-18' },
      { id: 'd', name: 'ยาสามัญ สต๊อกพอ', stock: { qty: 50, unit: 'เม็ด' }, lowAt: 5 },
    ];
    open('#/', withHouse(...items));
    expect(screen.getByText('ถึงรอบซื้อเติมสต๊อก · 2 รายการ')).toBeInTheDocument();
    const low = screen.getByRole('link', { name: /ยาสามัญ ใกล้หมด/ });
    expect(low).toHaveAttribute('href', '#/house/a');
    expect(within(low).getByText('เหลือ 5 เม็ด')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /ยาสามัญ หมดแล้ว/ })).getByText('หมดแล้ว')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /ยาสามัญ หมดอายุ/ })).getByText('เกิน 1 วัน')).toBeInTheDocument();
    expect(screen.queryByText('ยาสามัญ สต๊อกพอ')).not.toBeInTheDocument();
  });

  it('cutting stock to the warn level makes it appear on home; deleting makes it disappear', () => {
    open('#/house/h1', withHouse(para));
    nav('#/');
    expect(screen.getByText('ตอนนี้ไม่มียาที่ต้องดูแล')).toBeInTheDocument();
    nav('#/house/h1');
    for (let i = 0; i < 4; i += 1) click(button('เพิ่มจำนวนที่ใช้'));
    click(button('ตัดออก 5 เม็ด')); // 10 -> 5 = the warn level
    nav('#/');
    expect(screen.getByRole('link', { name: /ยาสามัญทดสอบ ก/ })).toBeInTheDocument();
    nav('#/house/h1');
    click(button('ลบยานี้'));
    click(button('ลบ'));
    nav('#/');
    expect(screen.getByText('ตอนนี้ไม่มียาที่ต้องดูแล')).toBeInTheDocument();
  });
});

describe('storage keys', () => {
  it('everything above only ever writes judya.v2 (and judya.v2.prev is not touched)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    open('#/house/new');
    type(field('ชื่อยา'), 'ยาสามัญทดสอบ ก');
    click(button('บันทึก'));
    nav('#/settings');
    click(button('เพิ่มร้านค้า'));
    type(field('ชื่อร้าน'), 'ร้านทดสอบ ก');
    click(button('บันทึก'));
    const keys = new Set(setItem.mock.calls.map((c) => c[0]));
    expect([...keys]).toEqual([STORAGE_KEY]);
  });
});
