import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { orderDemoRoot, withDemoShops } from '../../domain/v3/orderDemo';
import { rootSchema, type Root } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY, type KeyValueStore } from '../../domain/v3/storage';
import { OrderV3Route } from './OrderPage';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const live = (store: KeyValueStore, query: string, root: Root = withDemoShops(orderDemoRoot('normal'))) => {
  storage.saveRoot(root, store);
  window.location.hash = `#/n/order?${query}`;
  return render(<OrderV3Route getToday={() => DEMO_TODAY} store={store} />);
};
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const stored = (store: { data: Record<string, string> }): Root => JSON.parse(store.data[STORAGE_KEY]!) as Root;

beforeEach(() => {
  window.location.hash = '';
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => {}) }, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe('the "สั่งแล้วใช่ไหม" sheet', () => {
  it('opens from the button, shows the shop, the count and the total; closing writes nothing', () => {
    const store = memoryStore();
    live(store, 'shop=s1');
    const before = store.data[STORAGE_KEY];
    const set = vi.spyOn(store, 'setItem');
    press('บันทึกว่าสั่งแล้ว');
    const sheet = screen.getByRole('dialog', { name: 'สั่งแล้วใช่ไหม' });
    expect(within(sheet).getByText('ร้านทดสอบ ก')).toBeInTheDocument();
    expect(within(sheet).getByText(/^ยอดรวม ฿/)).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'ยังก่อน' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(set).not.toHaveBeenCalled();
    expect(store.data[STORAGE_KEY]).toBe(before);
  });
  it('after the text is copied the sheet opens by itself; a failed copy does not open it', async () => {
    const demoPage = () => {
      window.location.hash = '#/n/order?demo=normal&shops=three&shop=s1&recipient=full';
      return render(<OrderV3Route />);
    };
    const first = demoPage();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('no'));
    press('คัดลอกข้อความ');
    await screen.findByText(/คัดลอกไม่ได้/);
    expect(screen.queryByRole('dialog')).toBeNull();
    first.unmount();
    demoPage();
    press('คัดลอกข้อความ');
    expect(await screen.findByRole('dialog', { name: 'สั่งแล้วใช่ไหม' })).toBeInTheDocument();
  });
  it('"ใช่ สั่งแล้ว" writes ONE waiting order with one saveRoot; nothing else in the file changes; the lines show "รอรับของ" and start unticked', () => {
    const store = memoryStore();
    live(store, 'shop=s1');
    const before = stored(store);
    const save = vi.spyOn(storage, 'saveRoot');
    press('บันทึกว่าสั่งแล้ว');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ใช่ สั่งแล้ว' }));
    expect(save).toHaveBeenCalledTimes(1);
    const after = stored(store);
    expect(after.orders).toHaveLength(1);
    expect(after.orders[0]).toMatchObject({ shopId: 's1', shopName: 'ร้านทดสอบ ก', status: 'waiting', includeShipping: true, shippingFee: 40 });
    expect({ ...after, orders: [] }).toEqual(before);
    expect(rootSchema.safeParse(after).success).toBe(true);
    expect(Object.keys(store.data)).toEqual([STORAGE_KEY]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByText(/^รอรับของจาก ร้านทดสอบ ก/).length).toBeGreaterThan(0);
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked();
  });
  it('prices typed in the sheet and the order are saved together in the same single write; cancelling after typing saves neither', () => {
    const store = memoryStore();
    live(store, 'shop=s3');
    const before = stored(store);
    press('บันทึกว่าสั่งแล้ว');
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('ไม่รวม 2 รายการที่ยังไม่มีราคา')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'ใส่ราคา' }));
    fireEvent.change(screen.getByLabelText('ราคาต่อ หลอด ของ Hydrocortisone 1% (บาท)'), { target: { value: '80' } });
    press('บันทึกราคา');
    expect(stored(store)).toEqual(before); // typed in the sheet only, still not written
    const set = vi.spyOn(store, 'setItem');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ใช่ สั่งแล้ว' }));
    expect(set).toHaveBeenCalledTimes(1);
    const after = stored(store);
    expect(after.orders).toHaveLength(1);
    expect(after.prices).toHaveLength(before.prices.length + 1);
    expect(after.orders[0]?.lines.some((l) => l.unitPrice === 80)).toBe(true);
    expect(rootSchema.safeParse(after).success).toBe(true);
  });
  it('typed prices are dropped when the sheet is closed without confirming', () => {
    const store = memoryStore();
    live(store, 'shop=s3');
    const before = store.data[STORAGE_KEY];
    press('บันทึกว่าสั่งแล้ว');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ใส่ราคา' }));
    fireEvent.change(screen.getByLabelText('ราคาต่อ หลอด ของ Hydrocortisone 1% (บาท)'), { target: { value: '80' } });
    press('บันทึกราคา');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยังก่อน' }));
    expect(store.data[STORAGE_KEY]).toBe(before);
  });
  it('a failed save keeps the sheet, shows the problem and leaves the old data', () => {
    const store = memoryStore();
    live(store, 'shop=s1');
    const before = store.data[STORAGE_KEY];
    vi.spyOn(store, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    press('บันทึกว่าสั่งแล้ว');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ใช่ สั่งแล้ว' }));
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้');
    expect(screen.getByRole('dialog', { name: 'สั่งแล้วใช่ไหม' })).toBeInTheDocument();
    expect(store.data[STORAGE_KEY]).toBe(before);
  });
  it('a demo keeps the order in memory only: no storage call of any kind', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const save = vi.spyOn(storage, 'saveRoot');
    window.location.hash = '#/n/order?demo=normal&shops=three&shop=s1';
    render(<OrderV3Route />);
    press('บันทึกว่าสั่งแล้ว');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ใช่ สั่งแล้ว' }));
    expect(screen.getAllByText(/^รอรับของจาก ร้านทดสอบ ก/).length).toBeGreaterThan(0);
    expect(set).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('medicines already on an open order', () => {
  it('start unticked with the badge (icon + words); the owner can still tick one', () => {
    const store = memoryStore();
    const first = live(store, 'shop=s1');
    const orderedCount = screen.getAllByRole('checkbox').filter((b) => (b as HTMLInputElement).checked).length;
    press('บันทึกว่าสั่งแล้ว');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ใช่ สั่งแล้ว' }));
    first.unmount(); // a new visit on the saved data
    window.location.hash = '#/n/order';
    render(<OrderV3Route getToday={() => DEMO_TODAY} store={store} />);
    const boxes = screen.getAllByRole('checkbox');
    for (const b of boxes) expect(b).not.toBeChecked();
    expect(screen.getAllByText(/^รอรับของจาก ร้านทดสอบ ก อีก/)).toHaveLength(orderedCount);
    fireEvent.click(boxes[0]!);
    expect(boxes[0]).toBeChecked();
  });
});
