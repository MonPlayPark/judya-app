// The receiving screen (M4 PR 11.5c, boards #67 / #75 / #72). Live pages use an in-memory store; the demo writes nothing.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { orderDemoRoot, withDemoHistory } from '../../domain/v3/orderDemo';
import type { Order, Price, Root } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { type KeyValueStore } from '../../domain/v3/storage';
import { OrderV3Route } from './OrderPage';

const memoryStore = (): KeyValueStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const baseRoot = (): Root => withDemoHistory(orderDemoRoot('normal'));
const RECV = 'screen=receive&order=o1';
const REST = 'screen=receive&order=o2';
const follow = (): void => {
  act(() => {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
};
const liveWith = (root: Root, query = RECV) => {
  const store = memoryStore();
  expect(storage.saveRoot(root, store)).toEqual({ ok: true });
  window.location.hash = `#/n/order?${query}`;
  render(<OrderV3Route getToday={() => DEMO_TODAY} store={store} />);
  return store;
};
const saved = (store: ReturnType<typeof memoryStore>): Root => {
  const res = storage.loadRoot(store);
  if (res.status !== 'ok') throw new Error('store not readable');
  return res.root;
};
const toastOf = (): HTMLElement => screen.getAllByRole('status').at(-1)!;
const cardOf = (name: string | RegExp): HTMLElement => screen.getByRole('heading', { level: 3, name }).closest('li') as HTMLElement;
const SIM = 'Simvastatin 20 mg';
const MET = 'Metformin 500 mg';
const TYPED = 'ยาพิมพ์เองตัวอย่าง';
const plus = (name: string) => screen.getByRole('button', { name: `เพิ่มจำนวนที่ได้ ${name}` });
const minus = (name: string) => screen.getByRole('button', { name: `ลดจำนวนที่ได้ ${name}` });
const confirm = () => screen.getByRole('button', { name: 'ยืนยันรับของ' });
const order = (r: Root, id: string): Order => r.orders.find((o) => o.id === id)!;
const withPrice = (r: Root, shopId: string, medicationId: string, price: number, sellUnit = 'เม็ด', date = '2026-10-01'): Root => ({
  ...r,
  prices: [...r.prices, { id: `px${r.prices.length}`, shopId, item: { kind: 'med', medicationId }, price, sellUnit, perSellUnit: 1, date } as Price],
});
/** o1 as 2 boxes of 30 for Simvastatin. */
const boxes = (r: Root): Root => {
  const o = order(r, 'o1');
  o.lines[0] = { ...o.lines[0]!, qtyOrdered: 2, sellUnit: 'กล่อง', perSellUnit: 30 };
  return r;
};
const personOf = (r: Root, medId: string) => r.persons.find((p) => p.id === r.assignments.find((a) => a.medicationId === medId)!.personId)!.name;

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('getting to the screen', () => {
  it('the card buttons "รับของแล้ว" / "รับของที่เหลือ" open the screen of that order (back goes to the history)', () => {
    liveWith(baseRoot(), 'screen=history');
    const waiting = screen.getByText('28 ต.ค. 2569').closest('li') as HTMLElement;
    fireEvent.click(within(waiting).getByRole('button', { name: /รับของแล้ว/ }));
    expect(window.location.hash).toBe('#/n/order?screen=receive&order=o1');
    follow();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('รับของแล้ว');
    expect(screen.getByRole('link', { name: 'กลับหน้าประวัติ' })).toHaveAttribute('href', '#/n/order?screen=history');
  });
  it('the partial card opens the rest screen', () => {
    liveWith(baseRoot(), 'screen=history');
    const partial = screen.getByText('20 ต.ค. 2569').closest('li') as HTMLElement;
    fireEvent.click(within(partial).getByRole('button', { name: /รับของที่เหลือ/ }));
    follow();
    expect(screen.getByText('รับของที่ยังค้างจากใบสั่งนี้')).toBeInTheDocument();
  });
  it('a screen of its own: title with the cart, no bottom menu', () => {
    liveWith(baseRoot());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('รับของแล้ว');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('an order that is closed or unknown opens the history instead', () => {
    liveWith(baseRoot(), 'screen=receive&order=o3');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ประวัติการสั่งยา');
  });
});

describe('summary card (board 3.1)', () => {
  it('normal: "สั่งจาก<shop>", date, phone, big sum, delivery line', () => {
    liveWith(withPrice(baseRoot(), 's1', 'm1', 2));
    expect(screen.getByText('สั่งจากร้านทดสอบ ก')).toBeInTheDocument();
    expect(screen.getByText('28 ต.ค. 2569')).toBeInTheDocument();
    expect(screen.getByText('021234567')).toBeInTheDocument();
    expect(screen.getByText('ยอดรวมที่จ่าย')).toBeInTheDocument();
    expect(screen.getByTestId('recv-sum')).toHaveTextContent('฿60'); // 30 x 2
    expect(screen.getByText('ส่งถึงบ้าน')).toBeInTheDocument();
  });
  it('a pick-up shop says "รับเองที่ร้าน"; rest mode names the leftover and the shop', () => {
    liveWith(baseRoot(), REST);
    expect(screen.getByText('รับของที่ยังค้างจากใบสั่งนี้')).toBeInTheDocument();
    expect(screen.getByText('ร้านทดสอบ ข')).toBeInTheDocument();
    expect(screen.getByText('20 ต.ค. 2569')).toBeInTheDocument();
    expect(screen.getByText('021234568')).toBeInTheDocument();
    expect(screen.getByText('รับเองที่ร้าน')).toBeInTheDocument();
  });
  it('the shop was deleted: no phone line, the order still opens', () => {
    const r = baseRoot();
    r.shops = r.shops.filter((s) => s.id !== 's1');
    liveWith(r);
    expect(screen.getByText('สั่งจากร้านทดสอบ ก')).toBeInTheDocument();
    expect(screen.queryByText('021234567')).toBeNull();
  });
  it('the sum is live (got x typed price); rest mode adds the old total', () => {
    liveWith(withPrice(baseRoot(), 's1', 'm1', 2));
    fireEvent.click(minus(SIM));
    expect(screen.getByTestId('recv-sum')).toHaveTextContent('฿58');
    fireEvent.change(within(cardOf(MET)).getByLabelText('ราคาต่อเม็ด (บาท)'), { target: { value: '1.5' } });
    expect(screen.getByTestId('recv-sum')).toHaveTextContent('฿73'); // 29 x 2 + 10 x 1.5
    cleanup();
    liveWith(baseRoot(), REST); // old total of o2 = 10 x 2.5 + 20 x 1.25 = 50
    expect(screen.getByTestId('recv-sum')).toHaveTextContent('฿50');
    fireEvent.change(within(cardOf(MET)).getByLabelText('ราคาต่อเม็ด (บาท)'), { target: { value: '2' } });
    expect(screen.getByTestId('recv-sum')).toHaveTextContent('฿80'); // 50 + 15 x 2
  });
});

describe('one card per line (board 3.3)', () => {
  it('h2 counts the rows; normal mode has all lines, rest mode only the lines still to come', () => {
    liveWith(baseRoot());
    expect(screen.getByRole('heading', { level: 2, name: 'รายการยา (2 รายการ)' })).toBeInTheDocument();
    cleanup();
    liveWith(baseRoot(), REST);
    expect(screen.getByRole('heading', { level: 2, name: 'รายการยา (2 รายการ)' })).toBeInTheDocument(); // Metformin 15 left + the typed one
    expect(screen.queryByRole('heading', { level: 3, name: SIM })).toBeNull(); // finished line: no card
  });
  it('"สั่งไว้ X" with the count in pills when the box size is known; "ยังค้างอยู่ X" in rest mode', () => {
    liveWith(boxes(baseRoot()));
    expect(within(cardOf(SIM)).getByText('สั่งไว้ 2 กล่อง (60 เม็ด)')).toBeInTheDocument();
    expect(within(cardOf(MET)).getByText('สั่งไว้ 10 เม็ด')).toBeInTheDocument(); // the unit is the pill: no bracket
    cleanup();
    liveWith(baseRoot(), REST);
    expect(within(cardOf(MET)).getByText('ยังค้างอยู่ 15 เม็ด')).toBeInTheDocument();
    expect(within(cardOf(TYPED)).getByText('ยังค้างอยู่ 2 กล่อง')).toBeInTheDocument();
  });
  it('chips: "อยู่ในรายการยา" for a medicine of the app, "ยาใหม่" for a typed one', () => {
    liveWith(baseRoot(), REST);
    expect(within(cardOf(MET)).getByText('อยู่ในรายการยา')).toBeInTheDocument();
    expect(within(cardOf(TYPED)).getByText('ยาใหม่')).toBeInTheDocument();
  });
  it('"ได้จริง" stepper starts at what is left, stops at 0, has no maximum; the stock line follows it', () => {
    liveWith(boxes(baseRoot()));
    const c = cardOf(SIM);
    expect(within(c).getByText('ได้จริง')).toBeInTheDocument();
    expect(within(c).getByRole('group', { name: `จำนวนที่ได้ ${SIM}` })).toHaveTextContent('2');
    expect(within(c).getByText('สต็อกจะเพิ่ม +60 เม็ด')).toBeInTheDocument();
    fireEvent.click(plus(SIM));
    fireEvent.click(plus(SIM));
    expect(within(c).getByRole('group', { name: `จำนวนที่ได้ ${SIM}` })).toHaveTextContent('4'); // above the 2 ordered
    expect(within(c).getByText('สต็อกจะเพิ่ม +120 เม็ด')).toBeInTheDocument();
    expect(within(c).queryByText(/ได้น้อยกว่าที่สั่ง/)).toBeNull();
    for (let i = 0; i < 6; i++) fireEvent.click(minus(SIM));
    expect(within(c).getByRole('group', { name: `จำนวนที่ได้ ${SIM}` })).toHaveTextContent('0');
    expect(minus(SIM)).toBeDisabled();
    expect(within(c).getByText('สต็อกจะเพิ่ม +0 เม็ด')).toBeInTheDocument();
  });
  it('price: label with the unit, placeholder, prefilled from the newest remembered price of THIS shop and unit; "รวมบรรทัดนี้" when above 0', () => {
    let r = withPrice(baseRoot(), 's1', 'm1', 1.5, 'เม็ด', '2026-09-01');
    r = withPrice(r, 's1', 'm1', 2.5, 'เม็ด', '2026-10-01');
    r = withPrice(r, 's2', 'm1', 9, 'เม็ด', '2026-10-20'); // another shop
    r = withPrice(r, 's1', 'm1', 70, 'กล่อง', '2026-10-25'); // another unit
    liveWith(r);
    const c = cardOf(SIM);
    const box = within(c).getByLabelText('ราคาต่อเม็ด (บาท)');
    expect(box).toHaveValue('2.5');
    expect(within(c).getByText('รวมบรรทัดนี้ ฿75')).toBeInTheDocument();
    fireEvent.click(minus(SIM));
    expect(within(c).getByText('รวมบรรทัดนี้ ฿72.50')).toBeInTheDocument();
    const other = within(cardOf(MET)).getByLabelText('ราคาต่อเม็ด (บาท)');
    expect(other).toHaveValue('');
    expect(other).toHaveAttribute('placeholder', 'ใส่ราคา');
    expect(within(cardOf(MET)).queryByText(/รวมบรรทัดนี้/)).toBeNull();
  });
  it('short box: appears below what is left, says how many are missing, pills "ยังรอ" (default) / "ไม่รับแล้ว"', () => {
    liveWith(baseRoot());
    const c = cardOf(MET);
    expect(within(c).queryByText(/ได้น้อยกว่าที่สั่ง/)).toBeNull();
    fireEvent.click(minus(MET));
    fireEvent.click(minus(MET));
    expect(within(c).getByText('ได้น้อยกว่าที่สั่ง ที่เหลืออีก 2 เม็ด')).toBeInTheDocument();
    const group = within(c).getByRole('group', { name: 'ที่เหลือจะทำอย่างไร' });
    const wait = within(group).getByRole('button', { name: 'ยังรอ' });
    const drop = within(group).getByRole('button', { name: 'ไม่รับแล้ว' });
    expect(wait).toHaveAttribute('aria-pressed', 'true');
    expect(drop).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(drop);
    expect(drop).toHaveAttribute('aria-pressed', 'true');
    expect(wait).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(plus(MET));
    fireEvent.click(plus(MET));
    expect(within(c).queryByRole('group', { name: 'ที่เหลือจะทำอย่างไร' })).toBeNull();
  });
  it('a line that does not change stock says so in grey (house without a count)', () => {
    const r = baseRoot();
    const h = r.houseItems.find((x) => !x.stock)!;
    order(r, 'o1').lines[0] = { source: { kind: 'house', houseItemId: h.id }, qtyOrdered: 2, sellUnit: 'ขวด', qtyReceived: 0, leftover: null };
    liveWith(r);
    const c = cardOf(h.name);
    expect(within(c).getByText('ไม่นับสต็อก ยานี้ไม่อัปเดตสต็อก')).toBeInTheDocument();
    expect(within(c).queryByText(/สต็อกจะเพิ่ม/)).toBeNull();
  });
  it('a house item with a count: the stock line is in its stock unit', () => {
    const r = baseRoot();
    order(r, 'o1').lines[0] = { source: { kind: 'house', houseItemId: 'h3' }, qtyOrdered: 4, sellUnit: 'ซอง', qtyReceived: 0, leftover: null };
    liveWith(r);
    expect(within(cardOf('ผงเกลือแร่ ORS')).getByText('สต็อกจะเพิ่ม +4 ซอง')).toBeInTheDocument();
  });
  it('typed line: new-medicine block (checked), no stock line, no expiry, but a price box', () => {
    liveWith(baseRoot(), REST);
    const c = cardOf(TYPED);
    const tick = within(c).getByRole('checkbox', { name: 'เพิ่มเข้ารายการยา' });
    expect(tick).toBeChecked();
    expect(within(c).getByText('แอพกรอกชื่อ ความแรง ชนิด ขนาดบรรจุ และจำนวนให้แล้ว เหลือแค่วิธีกิน')).toBeInTheDocument();
    expect(within(c).queryByText(/สต็อกจะเพิ่ม|ไม่นับสต็อก/)).toBeNull();
    expect(within(c).queryByLabelText(/วันหมดอายุ/)).toBeNull();
    expect(within(c).getByLabelText('ราคาต่อกล่อง (บาท)')).toHaveValue('');
    fireEvent.click(tick);
    expect(tick).not.toBeChecked();
  });
  it('expiry: a date field on every card of the app (optional)', () => {
    liveWith(baseRoot());
    const f = within(cardOf(SIM)).getByLabelText('วันหมดอายุของกล่องใหม่ (ไม่บังคับ)');
    expect(f).toHaveAttribute('type', 'date');
  });
  it('the receipt button is the faded "เร็ว ๆ นี้" one and does nothing', () => {
    const store = liveWith(baseRoot());
    const set = vi.spyOn(store, 'setItem');
    const b = screen.getByRole('button', { name: /อัปเดตราคาจากใบเสร็จ/ });
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveTextContent('เร็ว ๆ นี้');
    fireEvent.click(b);
    expect(set).not.toHaveBeenCalled();
  });
});

describe('notes above the bar', () => {
  it('a medicine never counted: starts counting from what arrives', () => {
    const r = baseRoot();
    r.assignments.find((a) => a.medicationId === 'm1')!.stock = null;
    liveWith(r);
    expect(screen.getByText(`ยาที่ยังไม่เคยนับ จะเริ่มนับจากของที่รับนี้ ไม่รวมที่มีอยู่เดิม: ${personOf(r, 'm1')}`)).toBeInTheDocument();
  });
  it('a stopped assignment is skipped', () => {
    const r = baseRoot();
    r.assignments.find((a) => a.medicationId === 'm1')!.status = 'stopped';
    liveWith(r);
    expect(screen.getByText(`ข้ามสต็อกของ ${personOf(r, 'm1')} เพราะหยุดยาหรือนำออกแล้ว`)).toBeInTheDocument();
    expect(within(cardOf(SIM)).getByText('ไม่นับสต็อก ยานี้ไม่อัปเดตสต็อก')).toBeInTheDocument();
  });
  it('not enough tubes for everyone', () => {
    const r = baseRoot();
    const a9 = r.assignments.find((a) => a.id === 'a9')!;
    const p2 = r.persons.find((p) => p.id !== a9.personId)!;
    r.assignments.push({ ...a9, id: 'a9b', personId: p2.id });
    r.events.push(...r.events.filter((e) => e.assignmentId === 'a9').map((e) => ({ ...e, id: `${e.id}b`, assignmentId: 'a9b' })));
    order(r, 'o1').lines[0] = { source: { kind: 'med', medicationId: 'm8', shares: [{ assignmentId: 'a9', qty: 1 }, { assignmentId: 'a9b', qty: 1 }] }, qtyOrdered: 1, sellUnit: 'หลอด', perSellUnit: 1, qtyReceived: 0, leftover: null };
    liveWith(r);
    expect(screen.getByText(/หลอดไม่พอทุกคน/)).toBeInTheDocument();
    expect(within(cardOf(/Hydrocortisone/)).getByText('สต็อกจะเพิ่ม +1 หลอด')).toBeInTheDocument();
  });
});

describe('confirming', () => {
  it('all as ordered: ONE write, stock up, order received, history with the pill "ทั้งหมด" and the toast', () => {
    const before = baseRoot();
    const store = liveWith(before);
    const save = vi.spyOn(storage, 'saveRoot');
    fireEvent.click(confirm());
    expect(save).toHaveBeenCalledTimes(1);
    const after = saved(store);
    expect(order(after, 'o1').status).toBe('received');
    const a = before.assignments.find((x) => x.medicationId === 'm1')!;
    expect(JSON.stringify(after.assignments.find((x) => x.id === a.id)!.stock)).not.toBe(JSON.stringify(a.stock));
    expect(window.location.hash).toBe('#/n/order?screen=history');
    follow();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ประวัติการสั่งยา');
    expect(screen.getByRole('button', { name: 'ทั้งหมด' })).toHaveAttribute('aria-pressed', 'true');
    expect(toastOf()).toHaveTextContent('บันทึกรับของแล้ว สต็อกอัปเดตแล้ว');
  });
  it('typed price and expiry are saved: line price, remembered price of the shop, expiry of the stock', () => {
    const store = liveWith(withPrice(baseRoot(), 's1', 'm1', 2, 'เม็ด', '2026-09-01'));
    fireEvent.change(within(cardOf(SIM)).getByLabelText('ราคาต่อเม็ด (บาท)'), { target: { value: '2.75' } });
    fireEvent.change(within(cardOf(SIM)).getByLabelText(/วันหมดอายุ/), { target: { value: '2027-01-15' } });
    fireEvent.click(confirm());
    const after = saved(store);
    expect(order(after, 'o1').lines[0]!.unitPrice).toBe(2.75);
    const p = after.prices.filter((x) => x.shopId === 's1' && x.item.kind === 'med' && x.item.medicationId === 'm1' && x.sellUnit === 'เม็ด');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ price: 2.75, date: DEMO_TODAY });
    const a = after.assignments.find((x) => x.medicationId === 'm1')!;
    expect(a.expiry).toBe('2027-01-15');
  });
  it('more than ordered: the line is complete and the stock adds what arrived', () => {
    const store = liveWith(baseRoot());
    for (let i = 0; i < 5; i++) fireEvent.click(plus(SIM));
    fireEvent.click(confirm());
    const o = order(saved(store), 'o1');
    expect(o.lines[0]).toMatchObject({ qtyReceived: 35, leftover: null });
    expect(o.status).toBe('received');
  });
  it('less than ordered and "ยังรอ": the order is partial, the line waits', () => {
    const store = liveWith(baseRoot());
    fireEvent.click(minus(SIM));
    fireEvent.click(confirm());
    const o = order(saved(store), 'o1');
    expect(o.status).toBe('partial');
    expect(o.lines[0]).toMatchObject({ qtyReceived: 29, leftover: 'waiting' });
  });
  it('less than ordered and "ไม่รับแล้ว": the rest is dropped, the order is received', () => {
    const store = liveWith(baseRoot());
    fireEvent.click(minus(SIM));
    fireEvent.click(within(cardOf(SIM)).getByRole('button', { name: 'ไม่รับแล้ว' }));
    fireEvent.click(confirm());
    const o = order(saved(store), 'o1');
    expect(o.status).toBe('received');
    expect(o.lines[0]).toMatchObject({ qtyReceived: 29, leftover: 'dropped' });
  });
  it('rest mode: only the leftover is added, round 1 is not added twice', () => {
    const before = baseRoot();
    const store = liveWith(before, REST);
    fireEvent.click(minus(TYPED));
    fireEvent.click(minus(TYPED));
    fireEvent.click(confirm());
    const o = order(saved(store), 'o2');
    expect(o.lines[1]).toMatchObject({ qtyReceived: 20 });
    expect(o.lines[2]).toMatchObject({ qtyReceived: 0 });
    expect(o.status).toBe('partial');
  });
  it('a failed write: old data stays, the screen stays with "บันทึกไม่สำเร็จ ลองอีกครั้ง"; pressing again works', () => {
    const store = liveWith(baseRoot());
    const before = JSON.stringify(saved(store));
    vi.spyOn(storage, 'saveRoot').mockReturnValueOnce({ ok: false, reason: 'quota' });
    fireEvent.click(confirm());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('รับของแล้ว');
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่สำเร็จ ลองอีกครั้ง');
    expect(JSON.stringify(saved(store))).toBe(before);
    fireEvent.click(confirm());
    expect(order(saved(store), 'o1').status).toBe('received');
    expect(window.location.hash).toBe('#/n/order?screen=history');
  });
  it('a domain error (the order unit differs from the stock unit of a house item) shows its text and saves nothing', () => {
    const r = baseRoot();
    const h = r.houseItems.find((x) => x.stock)!;
    order(r, 'o1').lines[0] = { source: { kind: 'house', houseItemId: h.id }, qtyOrdered: 2, sellUnit: `${h.stock!.unit}ไม่ตรง`, qtyReceived: 0, leftover: null };
    const store = liveWith(r);
    const set = vi.spyOn(store, 'setItem');
    fireEvent.click(confirm());
    expect(screen.getByRole('alert')).toHaveTextContent('หน่วยที่สั่งไม่ตรงกับหน่วยที่นับสต็อกของยาสามัญ');
    expect(set).not.toHaveBeenCalled();
  });
  it('a price that is not a number is marked, blocks the save and writes nothing', () => {
    const store = liveWith(baseRoot());
    const set = vi.spyOn(store, 'setItem');
    const box = within(cardOf(SIM)).getByLabelText('ราคาต่อเม็ด (บาท)');
    fireEvent.change(box, { target: { value: 'abc' } });
    expect(box).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(confirm());
    expect(screen.getByRole('alert')).toHaveTextContent('ราคาต้องเป็นตัวเลข');
    expect(set).not.toHaveBeenCalled();
  });
  it('the button is faded while every number is 0 and nothing is dropped', () => {
    liveWith(baseRoot());
    for (const n of [SIM, MET]) for (let i = 0; i < 31; i++) if (!minus(n).hasAttribute('disabled')) fireEvent.click(minus(n));
    expect(confirm()).toBeDisabled();
    fireEvent.click(within(cardOf(SIM)).getByRole('button', { name: 'ไม่รับแล้ว' }));
    expect(confirm()).toBeEnabled();
  });
  it('demo: works in memory and writes nothing to storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    window.location.hash = '#/n/order?demo=normal&orders=history&screen=receive&order=o1';
    render(<OrderV3Route />);
    fireEvent.click(confirm());
    expect(window.location.hash).toBe('#/n/order?demo=normal&orders=history&screen=history');
    follow();
    expect(toastOf()).toHaveTextContent('บันทึกรับของแล้ว สต็อกอัปเดตแล้ว');
    expect((screen.getByText('28 ต.ค. 2569').closest('li') as HTMLElement).textContent).toContain('รับแล้ว');
    expect(setItem).not.toHaveBeenCalled();
  });
  it('the order page loses the "สั่งแล้ว รอรับ" badge of the order that is closed now', () => {
    window.location.hash = '#/n/order?demo=normal&orders=history&screen=receive&order=o1';
    render(<OrderV3Route />);
    fireEvent.click(confirm());
    act(() => {
      window.location.hash = '#/n/order?demo=normal&orders=history';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    const row = screen.getByRole('checkbox', { name: /เลือกสั่ง Simvastatin/ }).closest('li') as HTMLElement;
    expect(within(row).queryByText('สั่งแล้ว รอรับ')).toBeNull();
  });
});

describe('typed medicines that arrived', () => {
  it('one ticked: goes straight to the add-medicine page, filled with name and kind (demo link keeps the demo)', () => {
    window.location.hash = `#/n/order?demo=normal&orders=history&${REST}`;
    render(<OrderV3Route />);
    fireEvent.click(confirm());
    expect(window.location.hash).toBe(`#/n/meds/new?demo=normal&name=${encodeURIComponent(TYPED)}&kind=tablet`);
  });
  it('the live link has no demo part', () => {
    liveWith(baseRoot(), REST);
    fireEvent.click(confirm());
    expect(window.location.hash).toBe(`#/n/meds/new?name=${encodeURIComponent(TYPED)}&kind=tablet`);
  });
  it('unticked: back to the history, nothing asked', () => {
    liveWith(baseRoot(), REST);
    fireEvent.click(within(cardOf(TYPED)).getByRole('checkbox', { name: 'เพิ่มเข้ารายการยา' }));
    fireEvent.click(confirm());
    expect(window.location.hash).toBe('#/n/order?screen=history');
    follow();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('0 arrived: not asked even when ticked', () => {
    liveWith(baseRoot(), REST);
    fireEvent.click(minus(TYPED));
    fireEvent.click(minus(TYPED));
    fireEvent.click(confirm());
    expect(window.location.hash).toBe('#/n/order?screen=history');
  });
  it('the strength of a typed medicine goes along', () => {
    const r = baseRoot();
    const line = order(r, 'o2').lines[2]!;
    line.source = { kind: 'free', name: TYPED, medKind: 'liquid', strength: { value: 125, unit: 'mg/5 ml' } };
    liveWith(r, REST);
    fireEvent.click(confirm());
    expect(window.location.hash).toBe(`#/n/meds/new?name=${encodeURIComponent(TYPED)}&kind=liquid&strength=125&unit=mg%2F5+ml`);
  });
  it('more than one ticked: history with the sheet "เพิ่มยาเข้ารายการไหม" listing them; "ไว้ทีหลัง" closes', () => {
    const r = baseRoot();
    order(r, 'o2').lines.push({ source: { kind: 'free', name: 'ยาพิมพ์เองตัวอย่าง สอง' }, qtyOrdered: 1, sellUnit: 'ขวด', qtyReceived: 0, leftover: null });
    liveWith(r, REST);
    fireEvent.click(confirm());
    expect(window.location.hash).toBe('#/n/order?screen=history');
    follow();
    const ask = within(screen.getByRole('dialog', { name: 'เพิ่มยาเข้ารายการไหม' }));
    expect(ask.getByText(TYPED)).toBeInTheDocument();
    expect(ask.getByRole('link', { name: `เพิ่ม ${TYPED}` })).toHaveAttribute('href', `#/n/meds/new?name=${encodeURIComponent(TYPED)}&kind=tablet`);
    expect(ask.getByRole('link', { name: 'เพิ่ม ยาพิมพ์เองตัวอย่าง สอง' })).toBeInTheDocument();
    fireEvent.click(ask.getByRole('button', { name: 'ไว้ทีหลัง' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('"ไม่รอแล้ว" on a partial card (board #72: no confirm sheet)', () => {
  const partialCard = () => screen.getByText('20 ต.ค. 2569').closest('li') as HTMLElement;
  it('one press: ONE write, order closed, toast, no dialog', () => {
    const store = liveWith(baseRoot(), 'screen=history');
    const save = vi.spyOn(storage, 'saveRoot');
    fireEvent.click(within(partialCard()).getByRole('button', { name: /ไม่รอแล้ว/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
    expect(order(saved(store), 'o2').status).toBe('received');
    expect(toastOf()).toHaveTextContent('ปิดใบสั่ง ไม่รอของที่เหลือแล้ว');
  });
  it('a failed write keeps the card and shows a message', () => {
    const store = liveWith(baseRoot(), 'screen=history');
    vi.spyOn(storage, 'saveRoot').mockReturnValueOnce({ ok: false, reason: 'quota' });
    fireEvent.click(within(partialCard()).getByRole('button', { name: /ไม่รอแล้ว/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่สำเร็จ ลองอีกครั้ง');
    expect(order(saved(store), 'o2').status).toBe('partial');
  });
});

describe('test links', () => {
  it('normal and rest demo links open the screen and write nothing', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    window.location.hash = '#/n/order?demo=normal&screen=receive&orders=history&order=o1';
    render(<OrderV3Route />);
    expect(screen.getByText('สั่งจากร้านทดสอบ ก')).toBeInTheDocument();
    cleanup();
    window.location.hash = '#/n/order?demo=normal&screen=receive&orders=history&order=o2';
    render(<OrderV3Route />);
    expect(screen.getByText('รับของที่ยังค้างจากใบสั่งนี้')).toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
  });
});
