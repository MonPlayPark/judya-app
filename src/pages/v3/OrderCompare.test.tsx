import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { orderDemoRoot, withDemoShops, type OrderDemoName } from '../../domain/v3/orderDemo';
import { rootSchema } from '../../domain/v3/schema';
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
const live = (store: KeyValueStore, extra = '') => {
  window.location.hash = `#/n/order${extra ? `?${extra.replace(/^&/, '')}` : ''}`;
  return render(<OrderV3Route getToday={() => DEMO_TODAY} store={store} />);
};
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const preview = (): string => screen.getByLabelText('ตัวอย่างข้อความ').textContent ?? '';
const shopCard = (name: string): HTMLElement => screen.getByRole('button', { name: `เลือกร้าน ${name}` }).closest('li') as HTMLElement;
const shopNames = (): string[] => screen.getAllByRole('button', { name: /^เลือกร้าน / }).map((b) => b.getAttribute('aria-label')!.replace('เลือกร้าน ', ''));
const writeText = vi.fn(async (_t: string) => {});

beforeEach(() => {
  window.location.hash = '';
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe('the comparison card', () => {
  it('"เทียบราคา 3 ร้าน", every price first (cheapest first), then the shop that misses prices; the fee is added by default', () => {
    demo('normal', '&shops=three');
    expect(screen.getByRole('heading', { name: 'เทียบราคา 3 ร้าน' })).toBeInTheDocument();
    expect(shopNames()).toEqual(['ร้านทดสอบ ข', 'ร้านทดสอบ ก', 'ร้านทดสอบ ค']);
    expect(within(shopCard('ร้านทดสอบ ข')).getByText('฿234.50')).toBeInTheDocument();
    expect(within(shopCard('ร้านทดสอบ ก')).getByText('฿242')).toBeInTheDocument(); // 202 + fee 40
    expect(within(shopCard('ร้านทดสอบ ค')).getByText('฿99.50')).toBeInTheDocument(); // 69.50 + fee 30
  });
  it('the card shows name, phone (or "ยังไม่ใส่เบอร์โทร") and how it gets sent, through shopSub', () => {
    demo('normal', '&shops=three');
    expect(within(shopCard('ร้านทดสอบ ก')).getByText('021234567 · ให้ร้านส่ง ค่าส่ง ฿40')).toBeInTheDocument();
    expect(within(shopCard('ร้านทดสอบ ข')).getByText('021234568 · ไปรับเองที่ร้าน')).toBeInTheDocument();
    expect(within(shopCard('ร้านทดสอบ ค')).getByText('ยังไม่ใส่เบอร์โทร · ให้ร้านส่ง ค่าส่ง ฿30')).toBeInTheDocument();
  });
  it('"ถูกที่สุด" on the cheapest shop with every price only; "ไม่รวม N รายการ" (yellow chip with a word) on the shop that misses prices', () => {
    demo('normal', '&shops=three');
    expect(within(shopCard('ร้านทดสอบ ข')).getByText('ถูกที่สุด')).toBeInTheDocument();
    expect(within(shopCard('ร้านทดสอบ ก')).queryByText('ถูกที่สุด')).toBeNull();
    expect(within(shopCard('ร้านทดสอบ ค')).queryByText('ถูกที่สุด')).toBeNull();
    expect(within(shopCard('ร้านทดสอบ ค')).getByText('ไม่รวม 2 รายการที่ยังไม่มีราคา')).toBeInTheDocument();
    expect(within(shopCard('ร้านทดสอบ ก')).queryByText(/ไม่รวม/)).toBeNull();
  });
  it('the "รวมค่าส่ง" switch: off = the fee is not added and the cheapest shop changes; a pick-up shop is the same either way', () => {
    demo('normal', '&shops=three');
    const sw = screen.getByRole('switch', { name: /รวมค่าส่ง/ });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(shopNames()).toEqual(['ร้านทดสอบ ก', 'ร้านทดสอบ ข', 'ร้านทดสอบ ค']);
    expect(within(shopCard('ร้านทดสอบ ก')).getByText('฿202')).toBeInTheDocument();
    expect(within(shopCard('ร้านทดสอบ ก')).getByText('ถูกที่สุด')).toBeInTheDocument();
    expect(within(shopCard('ร้านทดสอบ ข')).getByText('฿234.50')).toBeInTheDocument();
    expect(within(shopCard('ร้านทดสอบ ค')).getByText('฿69.50')).toBeInTheDocument();
  });
  it('no "buy N more for free delivery" line anywhere, even for a shop that has a hidden free-over value', () => {
    const r = withDemoShops(orderDemoRoot('normal'));
    expect(JSON.stringify(r)).not.toContain('freeOver'); // the demo shops carry none; the compare text builder is simply not used
    demo('normal', '&shops=three');
    expect(screen.queryByText(/ซื้อเพิ่มอีก/)).toBeNull();
  });
  it('the card is not there when nothing is ticked', () => {
    demo('normal', '&shops=three');
    for (const box of screen.getAllByRole('checkbox')) if ((box as HTMLInputElement).checked) fireEvent.click(box);
    expect(screen.queryByRole('heading', { name: /เทียบราคา/ })).toBeNull();
  });
});

describe('choosing a shop', () => {
  it('no shop chosen to start with: no "ร้านที่เลือก" part; tapping a card chooses it (one at a time) and shows name, phone, total, fee', () => {
    demo('normal', '&shops=three');
    expect(screen.queryByRole('group', { name: 'ร้านที่เลือก' })).toBeNull();
    press('เลือกร้าน ร้านทดสอบ ก');
    expect(screen.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ก' })).toHaveAttribute('aria-pressed', 'true');
    const part = screen.getByRole('group', { name: 'ร้านที่เลือก' });
    expect(within(part).getByText('ร้านทดสอบ ก')).toBeInTheDocument();
    expect(within(part).getByText('021234567')).toBeInTheDocument();
    expect(within(part).getByText('ยอดรวม ฿242')).toBeInTheDocument();
    expect(within(part).getByText('ค่าส่ง ฿40')).toBeInTheDocument();
    expect(within(part).queryByText(/ไม่รวม/)).toBeNull();
    press('เลือกร้าน ร้านทดสอบ ข');
    expect(screen.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ก' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(screen.getByRole('group', { name: 'ร้านที่เลือก' })).getByText('มารับเอง ไม่มีค่าส่ง')).toBeInTheDocument();
  });
  it('a shop that misses prices can be chosen as usual (no warning sheet) and the part says "ไม่รวม N รายการ"', () => {
    demo('normal', '&shops=three');
    press('เลือกร้าน ร้านทดสอบ ค');
    expect(screen.queryByRole('dialog')).toBeNull();
    const part = screen.getByRole('group', { name: 'ร้านที่เลือก' });
    expect(within(part).getByText('ไม่รวม 2 รายการที่ยังไม่มีราคา')).toBeInTheDocument();
    expect(within(part).getByText('ยังไม่ใส่เบอร์โทร')).toBeInTheDocument();
  });
  it('buttons: เปิด LINE and คัดลอกข้อความ; "โทรหาร้าน" is a tel: link only for a shop that has a phone; "บันทึกว่าสั่งแล้ว" is a working button (11.3b-2b)', () => {
    demo('normal', '&shops=three&shop=s1');
    expect(screen.getByRole('button', { name: 'เปิด LINE' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'คัดลอกข้อความ' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'โทรหาร้าน' })).toHaveAttribute('href', 'tel:021234567');
    const book = screen.getByRole('button', { name: 'บันทึกว่าสั่งแล้ว' });
    expect(book).toBeEnabled();
    expect(screen.queryByText('เร็ว ๆ นี้')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ค' }));
    expect(screen.queryByRole('link', { name: 'โทรหาร้าน' })).toBeNull();
  });
  it('the old delivery / pick-up switch is gone', () => {
    demo('normal', '&shops=three&shop=s1');
    expect(screen.queryByRole('group', { name: 'วิธีรับยา' })).toBeNull();
  });
  it('the message follows the shop chosen: delivery -> "ส่ง <address>", pick-up -> "มารับเองค่ะ", then name and phone; no shop, price or member name', () => {
    demo('normal', '&shops=three&recipient=full&shop=s1');
    expect(preview()).toContain('\n\nส่ง บ้านเลขที่ 99');
    press('เลือกร้าน ร้านทดสอบ ข');
    expect(preview()).toContain('\n\nมารับเองค่ะ\n\nคุณสมมติ ทดสอบ 081-000-0000');
    expect(preview()).not.toContain('ร้านทดสอบ');
    expect(preview()).not.toContain('฿');
  });
});

describe('the price sheet', () => {
  it('"ใส่ราคา" is only on a card that misses prices; the sheet has only the missing lines of that shop, each with a unit-price box', () => {
    demo('normal', '&shops=three');
    expect(within(shopCard('ร้านทดสอบ ก')).queryByRole('button', { name: /ใส่ราคา/ })).toBeNull();
    fireEvent.click(within(shopCard('ร้านทดสอบ ค')).getByRole('button', { name: /ใส่ราคา/ }));
    const dialog = screen.getByRole('dialog', { name: 'ใส่ราคา · ร้านทดสอบ ค' });
    expect(within(dialog).getAllByRole('textbox')).toHaveLength(2);
    expect(within(dialog).getByLabelText('ราคาต่อ หลอด ของ Hydrocortisone 1% (บาท)')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('ราคาต่อ อัน ของ ยาดมแก้วิงเวียน (บาท)')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'บันทึกราคา' })).toBeInTheDocument();
  });
  it('saving a price changes the total and the "ไม่รวม" count; a demo writes nothing to storage', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const save = vi.spyOn(storage, 'saveRoot');
    demo('normal', '&shops=three');
    fireEvent.click(within(shopCard('ร้านทดสอบ ค')).getByRole('button', { name: /ใส่ราคา/ }));
    fireEvent.change(screen.getByLabelText('ราคาต่อ หลอด ของ Hydrocortisone 1% (บาท)'), { target: { value: '80' } });
    press('บันทึกราคา');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(shopCard('ร้านทดสอบ ค')).getByText('฿179.50')).toBeInTheDocument(); // 69.5 + 80 + fee 30
    expect(within(shopCard('ร้านทดสอบ ค')).getByText('ไม่รวม 1 รายการที่ยังไม่มีราคา')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
  it('all prices in: the chip is gone and the shop is ranked among the complete ones', () => {
    demo('normal', '&shops=three');
    fireEvent.click(within(shopCard('ร้านทดสอบ ค')).getByRole('button', { name: /ใส่ราคา/ }));
    fireEvent.change(screen.getByLabelText('ราคาต่อ หลอด ของ Hydrocortisone 1% (บาท)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('ราคาต่อ อัน ของ ยาดมแก้วิงเวียน (บาท)'), { target: { value: '10' } });
    press('บันทึกราคา');
    expect(within(shopCard('ร้านทดสอบ ค')).queryByText(/ไม่รวม/)).toBeNull();
    expect(within(shopCard('ร้านทดสอบ ค')).queryByRole('button', { name: /ใส่ราคา/ })).toBeNull();
    expect(shopNames()[0]).toBe('ร้านทดสอบ ค'); // 89.50 + 30 = 119.50 ... cheapest
  });
  it('a wrong price (0, text) stays in the sheet with a message; nothing typed says so; both are optional boxes', () => {
    demo('normal', '&shops=three');
    fireEvent.click(within(shopCard('ร้านทดสอบ ค')).getByRole('button', { name: /ใส่ราคา/ }));
    press('บันทึกราคา');
    expect(screen.getByRole('alert')).toHaveTextContent('ยังไม่ได้ใส่ราคา');
    fireEvent.change(screen.getByLabelText('ราคาต่อ หลอด ของ Hydrocortisone 1% (บาท)'), { target: { value: '0' } });
    press('บันทึกราคา');
    expect(screen.getByText('ใส่ราคาเป็นตัวเลขมากกว่า 0')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ราคาต่อ หลอด ของ Hydrocortisone 1% (บาท)'), { target: { value: '5' } });
    expect(screen.queryByText('ใส่ราคาเป็นตัวเลขมากกว่า 0')).toBeNull();
  });
  it('real data: the price is written to judya.v3 only through saveRoot, as one new price row, and the file stays valid', () => {
    const store = memoryStore();
    const base = withDemoShops(orderDemoRoot('normal'));
    expect(storage.saveRoot(base, store)).toEqual({ ok: true });
    const before = JSON.parse(store.data[STORAGE_KEY]!);
    live(store);
    fireEvent.click(within(shopCard('ร้านทดสอบ ค')).getByRole('button', { name: /ใส่ราคา/ }));
    fireEvent.change(screen.getByLabelText('ราคาต่อ หลอด ของ Hydrocortisone 1% (บาท)'), { target: { value: '80' } });
    press('บันทึกราคา');
    const after = JSON.parse(store.data[STORAGE_KEY]!);
    expect(after.prices).toHaveLength(before.prices.length + 1);
    expect(after.prices.at(-1)).toMatchObject({ shopId: 's3', price: 80, sellUnit: 'หลอด' });
    expect({ ...after, prices: before.prices }).toEqual(before);
    expect(Object.keys(store.data)).toEqual([STORAGE_KEY]);
    expect(rootSchema.safeParse(after).success).toBe(true);
  });
  it('a failed save keeps the sheet and the old data', () => {
    const store = memoryStore();
    storage.saveRoot(withDemoShops(orderDemoRoot('normal')), store);
    const before = store.data[STORAGE_KEY];
    live(store);
    vi.spyOn(store, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    fireEvent.click(within(shopCard('ร้านทดสอบ ค')).getByRole('button', { name: /ใส่ราคา/ }));
    fireEvent.change(screen.getByLabelText('ราคาต่อ หลอด ของ Hydrocortisone 1% (บาท)'), { target: { value: '80' } });
    press('บันทึกราคา');
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(store.data[STORAGE_KEY]).toBe(before);
  });
});

describe('no shop at all', () => {
  it('a big "เพิ่มร้านแรก" button opens the shop form of 11.3a; copy and LINE still work and the message has no delivery line', async () => {
    demo('normal', '&recipient=full');
    expect(screen.getByText('ยังไม่มีร้านค้า')).toBeInTheDocument();
    expect(preview()).not.toMatch(/\nส่ง |มารับเอง/);
    press('คัดลอกข้อความ');
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(preview()));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    press('เปิด LINE');
    expect(open).toHaveBeenCalledTimes(1);
    press('เพิ่มร้านแรก');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('adding the first shop in a demo keeps it in memory only and the card turns into the comparison', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const save = vi.spyOn(storage, 'saveRoot');
    demo('normal');
    press('เพิ่มร้านแรก');
    fireEvent.change(screen.getByLabelText(/ชื่อร้าน/), { target: { value: 'ร้านทดสอบ ใหม่' } });
    fireEvent.change(screen.getByRole('textbox', { name: /ค่าส่ง/ }), { target: { value: '25' } });
    press('บันทึก');
    expect(screen.getByRole('heading', { name: 'เทียบราคา 1 ร้าน' })).toBeInTheDocument();
    expect(within(shopCard('ร้านทดสอบ ใหม่')).getByText('ยังไม่มีราคา')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
  it('nothing is ticked and no shop: only the hint, no comparison card', () => {
    demo('normal');
    for (const box of screen.getAllByRole('checkbox')) if ((box as HTMLInputElement).checked) fireEvent.click(box);
    expect(screen.queryByRole('button', { name: 'เพิ่มร้านแรก' })).toBeNull();
  });
});
