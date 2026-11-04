import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { DEMO_RECIPIENT, orderDemoRoot, withDemoShops, withDemoWaitingOrder } from '../../domain/v3/orderDemo';
import { withRecipient } from '../../domain/v3/recipient';
import { rootSchema, type Root } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY, type KeyValueStore } from '../../domain/v3/storage';
import { OrderView } from './OrderV3';
import { OrderV3Route } from './OrderPage';

const memoryStore = (): KeyValueStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const baseRoot = (): Root => withRecipient(withDemoShops(orderDemoRoot('normal')), DEMO_RECIPIENT);
const live = (store: KeyValueStore, query: string, root: Root = baseRoot()) => {
  storage.saveRoot(root, store);
  window.location.hash = `#/n/order${query ? `?${query}` : ''}`;
  return render(<OrderV3Route getToday={() => DEMO_TODAY} store={store} />);
};
const demoPage = (query: string) => {
  window.location.hash = `#/n/order?demo=normal&${query}`;
  return render(<OrderV3Route />);
};
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const inSheet = () => within(screen.getByRole('dialog', { name: 'สั่งแล้วใช่ไหม' }));
const stored = (store: { data: Record<string, string> }): Root => JSON.parse(store.data[STORAGE_KEY]!) as Root;
const M8_BOX = 'ราคาต่อ หลอด ของ Hydrocortisone 1% (บาท)';

beforeEach(() => {
  window.location.hash = '';
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => {}) }, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe('when the sheet opens', () => {
  it('after the text is copied and a shop is chosen', async () => {
    demoPage('shops=three&shop=s1&recipient=full');
    press('คัดลอกข้อความ');
    expect(await screen.findByRole('dialog', { name: 'สั่งแล้วใช่ไหม' })).toBeInTheDocument();
  });
  it('after LINE is opened and a shop is chosen', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    demoPage('shops=three&shop=s2&recipient=full');
    press('เปิด LINE');
    expect(await screen.findByRole('dialog', { name: 'สั่งแล้วใช่ไหม' })).toBeInTheDocument();
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('when "บันทึกว่าสั่งแล้ว" is pressed (a real button: not faded, no "เร็ว ๆ นี้")', () => {
    demoPage('shops=three&shop=s1&recipient=full');
    const book = screen.getByRole('button', { name: 'บันทึกว่าสั่งแล้ว' });
    expect(book).toBeEnabled();
    expect(book).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByText('เร็ว ๆ นี้')).toBeNull();
    fireEvent.click(book);
    expect(screen.getByRole('dialog', { name: 'สั่งแล้วใช่ไหม' })).toBeInTheDocument();
  });
  it('not when no shop is chosen: copy and LINE still work as before, the book button is not there', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    demoPage('shops=three&recipient=full');
    expect(screen.queryByRole('button', { name: 'บันทึกว่าสั่งแล้ว' })).toBeNull();
    press('คัดลอกข้อความ');
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1));
    press('เปิด LINE');
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('not when the copy failed', async () => {
    demoPage('shops=three&shop=s1&recipient=full');
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('no'));
    press('คัดลอกข้อความ');
    await screen.findByText(/คัดลอกไม่ได้/);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('the message still has no member name, price or shop name', () => {
    demoPage('shops=three&shop=s1&recipient=full');
    const text = screen.getByLabelText('ตัวอย่างข้อความ').textContent ?? '';
    expect(text).not.toMatch(/ร้านทดสอบ|฿|สมาชิก/);
  });
});

describe('the sheet', () => {
  it('shows shop · count · total (the number of the comparison card); lines without a price get a box, typed medicines none', () => {
    demoPage('shops=three&shop=s3&recipient=full');
    const card = screen.getByRole('button', { name: 'เลือกร้าน ร้านทดสอบ ค' }).closest('li') as HTMLElement;
    const cardTotal = within(card).getByText(/^฿/).textContent;
    press('บันทึกว่าสั่งแล้ว');
    const sheet = inSheet();
    expect(sheet.getByText('ร้านทดสอบ ค')).toBeInTheDocument();
    expect(sheet.getByText('5 รายการ')).toBeInTheDocument();
    expect(sheet.getByText(`ยอดรวม ${cardTotal}`)).toBeInTheDocument();
    expect(sheet.getByText('ใส่ราคาที่ร้านคิด (ไม่บังคับ)')).toBeInTheDocument();
    expect(sheet.getByLabelText(M8_BOX)).toBeInTheDocument();
    expect(sheet.getByText('ราคาที่ใส่จะถูกจำของร้านนี้ ตรวจให้ถูกก่อนกด')).toBeInTheDocument();
    expect(sheet.getAllByRole('textbox')).toHaveLength(2);
  });
  it('a shop with every price: no price boxes', () => {
    demoPage('shops=three&shop=s1&recipient=full');
    press('บันทึกว่าสั่งแล้ว');
    expect(inSheet().queryByText('ใส่ราคาที่ร้านคิด (ไม่บังคับ)')).toBeNull();
    expect(inSheet().queryAllByRole('textbox')).toHaveLength(0);
  });
  it('a wrong price (0 or text) keeps the sheet open, says so under the box and writes nothing', () => {
    const store = memoryStore();
    live(store, 'shop=s3');
    const before = store.data[STORAGE_KEY];
    const set = vi.spyOn(store, 'setItem');
    press('บันทึกว่าสั่งแล้ว');
    for (const bad of ['0', '.']) {
      fireEvent.change(inSheet().getByLabelText(M8_BOX), { target: { value: bad } });
      fireEvent.click(inSheet().getByRole('button', { name: 'สั่งแล้ว' }));
      expect(inSheet().getByText('ใส่ราคาเป็นตัวเลขมากกว่า 0')).toBeInTheDocument();
    }
    expect(set).not.toHaveBeenCalled();
    expect(store.data[STORAGE_KEY]).toBe(before);
  });
  it('"สั่งแล้ว": the order and the typed price are written together in ONE write, the file stays valid, other keys untouched', () => {
    const store = memoryStore();
    live(store, 'shop=s3');
    const before = stored(store);
    const save = vi.spyOn(storage, 'saveRoot');
    const set = vi.spyOn(store, 'setItem');
    press('บันทึกว่าสั่งแล้ว');
    fireEvent.change(inSheet().getByLabelText(M8_BOX), { target: { value: '80' } });
    fireEvent.click(inSheet().getByRole('button', { name: 'สั่งแล้ว' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    const after = stored(store);
    expect(after.orders).toHaveLength(1);
    expect(after.orders[0]).toMatchObject({ shopId: 's3', shopName: 'ร้านทดสอบ ค', status: 'waiting', includeShipping: true, shippingFee: 30 });
    expect(after.prices).toHaveLength(before.prices.length + 1);
    expect(after.prices.at(-1)).toMatchObject({ shopId: 's3', price: 80, sellUnit: 'หลอด' });
    expect(after.orders[0]?.lines.find((l) => l.source.kind === 'med' && l.source.medicationId === 'm8')?.unitPrice).toBe(80);
    expect({ ...after, orders: [], prices: before.prices }).toEqual(before);
    expect(rootSchema.safeParse(after).success).toBe(true);
    expect(Object.keys(store.data)).toEqual([STORAGE_KEY]);
  });
  it('after saving: the sheet closes, the booked lines leave the list, the toast says so, and the page stays where it was', () => {
    const store = memoryStore();
    live(store, 'shop=s1');
    const total = screen.getAllByRole('checkbox').length;
    const unticked = screen.getAllByRole('checkbox').filter((b) => !(b as HTMLInputElement).checked).length;
    expect(unticked).toBeGreaterThan(0);
    press('บันทึกว่าสั่งแล้ว');
    fireEvent.click(inSheet().getByRole('button', { name: 'สั่งแล้ว' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('บันทึกใบสั่งแล้ว')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'สั่งซื้อยา' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/n/order?shop=s1');
    expect(screen.getAllByRole('checkbox')).toHaveLength(unticked);
    expect(unticked).toBeLessThan(total);
  });
  it('"ยังไม่ได้สั่ง" (and X): closes, writes nothing, drops what was typed in the price box', () => {
    const store = memoryStore();
    live(store, 'shop=s3');
    const before = store.data[STORAGE_KEY];
    const set = vi.spyOn(store, 'setItem');
    press('บันทึกว่าสั่งแล้ว');
    fireEvent.change(inSheet().getByLabelText(M8_BOX), { target: { value: '80' } });
    fireEvent.click(inSheet().getByRole('button', { name: 'ยังไม่ได้สั่ง' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    press('บันทึกว่าสั่งแล้ว');
    expect(inSheet().getByLabelText(M8_BOX)).toHaveValue('');
    fireEvent.click(inSheet().getByRole('button', { name: 'ปิด' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(set).not.toHaveBeenCalled();
    expect(store.data[STORAGE_KEY]).toBe(before);
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0); // the list is as it was
  });
  it('a failed write keeps the sheet and what was typed, shows the problem, and the old data stays', () => {
    const store = memoryStore();
    live(store, 'shop=s3');
    const before = store.data[STORAGE_KEY];
    vi.spyOn(store, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    press('บันทึกว่าสั่งแล้ว');
    fireEvent.change(inSheet().getByLabelText(M8_BOX), { target: { value: '80' } });
    fireEvent.click(inSheet().getByRole('button', { name: 'สั่งแล้ว' }));
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้');
    expect(inSheet().getByLabelText(M8_BOX)).toHaveValue('80');
    expect(store.data[STORAGE_KEY]).toBe(before);
    expect(screen.queryByText('บันทึกใบสั่งแล้ว')).toBeNull();
  });
});

describe('?demo', () => {
  it('writes nothing to storage in any form, and keeps the saved order in memory', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const save = vi.spyOn(storage, 'saveRoot');
    const seen: Root[] = [];
    render(<OrderView root={baseRoot()} today={DEMO_TODAY} demo initial={{ shop: 's3' }} onRoot={(r) => seen.push(r)} nowIso={() => `${DEMO_TODAY}T09:00:00+07:00`} />);
    press('บันทึกว่าสั่งแล้ว');
    fireEvent.change(inSheet().getByLabelText(M8_BOX), { target: { value: '80' } });
    fireEvent.click(inSheet().getByRole('button', { name: 'สั่งแล้ว' }));
    expect(screen.getByText('บันทึกใบสั่งแล้ว')).toBeInTheDocument();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.orders).toHaveLength(1);
    expect(seen[0]?.orders[0]).toMatchObject({ shopName: 'ร้านทดสอบ ค', createdAt: `${DEMO_TODAY}T09:00:00+07:00` });
    expect(rootSchema.safeParse(seen[0]).success).toBe(true);
    expect(set).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('the badge "สั่งแล้ว รอรับ"', () => {
  it('?demo&orders=waiting: the medicine starts unticked with the badge (icon + words); it can be ticked by hand', () => {
    demoPage('orders=waiting');
    const badge = screen.getByText('สั่งแล้ว รอรับ');
    const row = badge.closest('li') as HTMLElement;
    expect(badge.querySelector('svg')).not.toBeNull();
    const box = within(row).getByRole('checkbox');
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(screen.getAllByText('สั่งแล้ว รอรับ')).toHaveLength(1); // only that medicine
  });
  it('with no waiting order the page is as before (no badge, same ticks)', () => {
    demoPage('shops=three');
    expect(screen.queryByText('สั่งแล้ว รอรับ')).toBeNull();
    expect(screen.getAllByRole('checkbox').filter((b) => (b as HTMLInputElement).checked)).toHaveLength(5);
  });
  it('a partly received order whose rest was dropped shows no badge; a partly received one still waiting does', () => {
    const w = withDemoWaitingOrder(orderDemoRoot('normal'));
    const part = (leftover: 'waiting' | 'dropped'): Root => ({ ...w, orders: [{ ...w.orders[0]!, status: 'partial', lines: w.orders[0]!.lines.map((l) => ({ ...l, qtyReceived: 1, leftover })) }] });
    const a = render(<OrderView root={part('dropped')} today={DEMO_TODAY} demo />);
    expect(screen.queryByText('สั่งแล้ว รอรับ')).toBeNull();
    a.unmount();
    render(<OrderView root={part('waiting')} today={DEMO_TODAY} demo />);
    expect(screen.getAllByText('สั่งแล้ว รอรับ')).toHaveLength(1);
  });
  it('a medicine added by hand stays ticked and shows the badge too', () => {
    // m4 is not suggested (stock is enough); put it on a waiting order, then add it by hand from the sheet
    const w = withDemoWaitingOrder(orderDemoRoot('normal'));
    const base = orderDemoRoot('normal');
    const m4 = base.assignments.find((a) => a.id === 'a4')!;
    const root: Root = { ...w, orders: [{ ...w.orders[0]!, lines: [{ source: { kind: 'med', medicationId: 'm4', shares: [{ assignmentId: m4.id, qty: 7 }] }, qtyOrdered: 1, sellUnit: 'เม็ด', perSellUnit: 1, qtyReceived: 0, leftover: null }] }] };
    render(<OrderView root={root} today={DEMO_TODAY} demo initial={{ sheet: 'add', tab: 'meds' }} />);
    expect(screen.queryByText('สั่งแล้ว รอรับ')).toBeNull();
    const name = base.medications.find((m) => m.id === 'm4')!.name;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^เพิ่ม ${name}`) }));
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    const row = screen.getByText('สั่งแล้ว รอรับ').closest('li') as HTMLElement;
    expect(within(row).getByRole('checkbox')).toBeChecked();
  });
});
