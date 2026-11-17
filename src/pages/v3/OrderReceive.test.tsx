// Receiving sheet on the order history (M4 PR 11.5b). Live pages use an in-memory store; the demo writes nothing.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { orderDemoRoot, withDemoHistory } from '../../domain/v3/orderDemo';
import type { Root } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { type KeyValueStore } from '../../domain/v3/storage';
import { OrderV3Route } from './OrderPage';

const memoryStore = (): KeyValueStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const baseRoot = (): Root => withDemoHistory(orderDemoRoot('normal'));
const liveWith = (root: Root, query = 'screen=history') => {
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
const card = (date: string): HTMLElement => screen.getByText(date).closest('li') as HTMLElement;
const toastOf = (): HTMLElement => screen.getAllByRole('status').at(-1)!;
const W = '28 ต.ค. 2569'; // o1, waiting: m1 x30, m2 x10
const P = '20 ต.ค. 2569'; // o2, partial: m1 10/10, m2 5/20, a typed line 0/2
const row = (name: string) => screen.getByRole('checkbox', { name: new RegExp(`เลือกสั่ง ${name}`) }).closest('li') as HTMLElement;
const sheet = () => within(screen.getByRole('dialog', { name: 'รับของ' }));
const openWaiting = () => fireEvent.click(within(card(W)).getByRole('button', { name: /รับของแล้ว/ }));

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the buttons on the cards', () => {
  it('"รับของแล้ว", "รับของที่เหลือ" and "ไม่รอแล้ว" are working buttons without the "เร็ว ๆ นี้" chip', () => {
    liveWith(baseRoot());
    for (const [date, name] of [[W, /รับของแล้ว/], [P, /รับของที่เหลือ/], [P, /ไม่รอแล้ว/]] as const) {
      const b = within(card(date)).getByRole('button', { name });
      expect(b).not.toHaveAttribute('aria-disabled');
      expect(b).not.toHaveTextContent('เร็ว ๆ นี้');
    }
  });
});

describe('the receiving sheet', () => {
  it('title, sub line and one row per waiting line, each prefilled with what is left', () => {
    liveWith(baseRoot());
    openWaiting();
    expect(sheet().getByText('ร้านทดสอบ ก · 28 ต.ค. 2569 · 2 รายการ')).toBeInTheDocument();
    expect(sheet().getByText('สั่ง 30 เม็ด')).toBeInTheDocument();
    expect(sheet().getByText('สั่ง 10 เม็ด')).toBeInTheDocument();
    expect(sheet().getByRole('group', { name: 'จำนวนที่รับ Simvastatin 20 mg' })).toHaveTextContent('30');
    expect(sheet().queryByText('ยังรอส่วนที่เหลือ')).toBeNull();
    expect(sheet().getByRole('button', { name: 'บันทึกรับของ' })).toBeEnabled();
  });

  it('a partial order shows only the lines still waited for, with "รับแล้ว Y"', () => {
    liveWith(baseRoot());
    fireEvent.click(within(card(P)).getByRole('button', { name: /รับของที่เหลือ/ }));
    expect(screen.getByRole('dialog', { name: 'รับของ' })).toBeInTheDocument();
    expect(sheet().getByText('ร้านทดสอบ ข · 20 ต.ค. 2569 · 3 รายการ')).toBeInTheDocument();
    expect(sheet().getByText('สั่ง 20 เม็ด · รับแล้ว 5')).toBeInTheDocument();
    expect(sheet().getByText('สั่ง 2 กล่อง')).toBeInTheDocument();
    expect(sheet().getAllByRole('button', { name: /^ลดจำนวน/ })).toHaveLength(2); // the finished line has no row
    expect(sheet().getByRole('group', { name: /Metformin/ })).toHaveTextContent('15');
  });

  it('stepper: 44px steps, not below 0, not above what is left; pills show only when below what is left', () => {
    liveWith(baseRoot());
    openWaiting();
    const group = () => sheet().getByRole('group', { name: 'จำนวนที่รับ Metformin 500 mg' });
    fireEvent.click(sheet().getByRole('button', { name: 'เพิ่มจำนวน Metformin 500 mg' }));
    expect(group()).toHaveTextContent('10');
    fireEvent.click(sheet().getByRole('button', { name: 'ลดจำนวน Metformin 500 mg' }));
    expect(group()).toHaveTextContent('9');
    const yes = sheet().getByRole('button', { name: 'ยังรอส่วนที่เหลือ' });
    const no = sheet().getByRole('button', { name: 'ไม่รอแล้ว' });
    expect(yes).toHaveAttribute('aria-pressed', 'true');
    expect(no).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(no);
    expect(no).toHaveAttribute('aria-pressed', 'true');
    expect(yes).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(sheet().getByRole('button', { name: 'เพิ่มจำนวน Metformin 500 mg' }));
    expect(sheet().queryByRole('button', { name: 'ยังรอส่วนที่เหลือ' })).toBeNull();
    for (let i = 0; i < 15; i++) fireEvent.click(sheet().getByRole('button', { name: 'ลดจำนวน Metformin 500 mg' }));
    expect(group()).toHaveTextContent('0');
  });

  it('"บันทึกรับของ" is disabled when every number is 0 and no line is set to "ไม่รอแล้ว"; setting one to "ไม่รอแล้ว" enables it', () => {
    liveWith(baseRoot());
    openWaiting();
    for (const n of ['Simvastatin 20 mg', 'Metformin 500 mg']) for (let i = 0; i < 31; i++) fireEvent.click(sheet().getByRole('button', { name: `ลดจำนวน ${n}` }));
    expect(sheet().getByRole('button', { name: 'บันทึกรับของ' })).toBeDisabled();
    fireEvent.click(sheet().getAllByRole('button', { name: 'ไม่รอแล้ว' })[0]!);
    expect(sheet().getByRole('button', { name: 'บันทึกรับของ' })).toBeEnabled();
  });

  it('"ยกเลิก" closes the sheet and writes nothing', () => {
    const store = liveWith(baseRoot());
    const set = vi.spyOn(store, 'setItem');
    openWaiting();
    fireEvent.click(sheet().getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(set).not.toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('everything received: ONE write, stock goes up, order received, the sheet closes, the toast says so', () => {
    const before = baseRoot();
    const store = liveWith(before);
    const save = vi.spyOn(storage, 'saveRoot');
    openWaiting();
    fireEvent.click(sheet().getByRole('button', { name: 'บันทึกรับของ' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toastOf()).toHaveTextContent('บันทึกรับของแล้ว สต็อกอัปเดตแล้ว');
    const after = saved(store);
    expect(after.orders.find((o) => o.id === 'o1')?.status).toBe('received');
    const a = before.assignments.find((x) => x.medicationId === 'm1')!;
    const n = after.assignments.find((x) => x.id === a.id)!;
    expect(JSON.stringify(n.stock)).not.toBe(JSON.stringify(a.stock));
    expect(within(card(W)).getByText('รับแล้ว', { selector: 'span' })).toBeInTheDocument();
  });

  it('received less and still waiting: partial, toast "ยังรอ N รายการ"', () => {
    const store = liveWith(baseRoot());
    openWaiting();
    fireEvent.click(sheet().getByRole('button', { name: 'ลดจำนวน Simvastatin 20 mg' }));
    fireEvent.click(sheet().getByRole('button', { name: 'บันทึกรับของ' }));
    expect(toastOf()).toHaveTextContent('บันทึกรับของแล้ว ยังรอ 1 รายการ');
    const o = saved(store).orders.find((x) => x.id === 'o1')!;
    expect(o.status).toBe('partial');
    expect(o.lines[0]).toMatchObject({ qtyReceived: 29, leftover: 'waiting' });
  });

  it('a failed write: old data stays, the sheet stays with "บันทึกไม่สำเร็จ ลองอีกครั้ง"; pressing again works', () => {
    const store = liveWith(baseRoot());
    const before = JSON.stringify(saved(store));
    vi.spyOn(storage, 'saveRoot').mockReturnValueOnce({ ok: false, reason: 'quota' });
    openWaiting();
    fireEvent.click(sheet().getByRole('button', { name: 'บันทึกรับของ' }));
    expect(screen.getByRole('dialog', { name: 'รับของ' })).toBeInTheDocument();
    expect(sheet().getByRole('alert')).toHaveTextContent('บันทึกไม่สำเร็จ ลองอีกครั้ง');
    expect(JSON.stringify(saved(store))).toBe(before);
    fireEvent.click(sheet().getByRole('button', { name: 'บันทึกรับของ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(saved(store).orders.find((o) => o.id === 'o1')?.status).toBe('received');
  });

  it('a domain error (the order unit differs from the stock unit of a house item) shows its text and saves nothing', () => {
    const r = baseRoot();
    const h = r.houseItems.find((x) => x.stock);
    expect(h).toBeDefined();
    const o = r.orders.find((x) => x.id === 'o1')!;
    o.lines[0] = { source: { kind: 'house', houseItemId: h!.id }, qtyOrdered: 2, sellUnit: `${h!.stock!.unit}ไม่ตรง`, qtyReceived: 0, leftover: null };
    const store = liveWith(r);
    const set = vi.spyOn(store, 'setItem');
    openWaiting();
    fireEvent.click(sheet().getByRole('button', { name: 'บันทึกรับของ' }));
    expect(sheet().getByRole('alert')).toHaveTextContent('หน่วยที่สั่งไม่ตรงกับหน่วยที่นับสต็อกของยาสามัญ');
    expect(set).not.toHaveBeenCalled();
  });

  it('demo: saving works in memory and writes nothing to storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    window.location.hash = '#/n/order?demo=normal&orders=history&screen=history';
    render(<OrderV3Route />);
    openWaiting();
    fireEvent.click(sheet().getByRole('button', { name: 'บันทึกรับของ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toastOf()).toHaveTextContent('บันทึกรับของแล้ว');
    expect(within(card(W)).getByText('รับแล้ว', { selector: 'span' })).toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('the order page after receiving', () => {
  it('the "สั่งแล้ว รอรับ" badge is gone from the lines of the received order (clearOnOrder)', () => {
    window.location.hash = '#/n/order?demo=normal&orders=history';
    render(<OrderV3Route />);
    expect(within(row('Simvastatin')).getByText('สั่งแล้ว รอรับ')).toBeInTheDocument();
    const before = screen.getAllByText('สั่งแล้ว รอรับ').length;
    act(() => {
      window.location.hash = '#/n/order?demo=normal&orders=history&screen=history';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    openWaiting();
    fireEvent.click(sheet().getByRole('button', { name: 'บันทึกรับของ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      window.location.hash = '#/n/order?demo=normal&orders=history';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(within(row('Simvastatin')).queryByText('สั่งแล้ว รอรับ')).not.toBeInTheDocument();
    // the partial order o2 still waits for its second medicine, so only that badge may be left
    expect(screen.queryAllByText('สั่งแล้ว รอรับ').length).toBeLessThan(before);
  });
});

describe('notes in the sheet', () => {
  const personOf = (r: Root, medId: string) => r.persons.find((p) => p.id === r.assignments.find((a) => a.medicationId === medId)!.personId)!.name;

  it('a medicine never counted: starts counting from what arrives', () => {
    const r = baseRoot();
    r.assignments.find((a) => a.medicationId === 'm1')!.stock = null;
    liveWith(r);
    openWaiting();
    expect(sheet().getByText(`ยาที่ยังไม่เคยนับ จะเริ่มนับจากของที่รับนี้ ไม่รวมที่มีอยู่เดิม: ${personOf(r, 'm1')}`)).toBeInTheDocument();
  });

  it('a stopped assignment is skipped', () => {
    const r = baseRoot();
    r.assignments.find((a) => a.medicationId === 'm1')!.status = 'stopped';
    liveWith(r);
    openWaiting();
    expect(sheet().getByText(`ข้ามสต็อกของ ${personOf(r, 'm1')} เพราะหยุดยาหรือนำออกแล้ว`)).toBeInTheDocument();
  });

  it('typed lines: one grey line "ไม่อัปเดตสต็อก"', () => {
    liveWith(baseRoot());
    fireEvent.click(within(card(P)).getByRole('button', { name: /รับของที่เหลือ/ }));
    expect(sheet().getByText('ไม่อัปเดตสต็อก: ยาพิมพ์เองตัวอย่าง')).toBeInTheDocument();
  });

  it('notes follow the numbers: a line with 0 received adds no note', () => {
    liveWith(baseRoot());
    fireEvent.click(within(card(P)).getByRole('button', { name: /รับของที่เหลือ/ }));
    for (let i = 0; i < 3; i++) fireEvent.click(sheet().getByRole('button', { name: /^ลดจำนวน ยาพิมพ์เองตัวอย่าง/ }));
    expect(sheet().queryByText(/ไม่อัปเดตสต็อก/)).toBeNull();
  });
});

describe('typed medicines that arrived', () => {
  it('after saving, "เพิ่มยาเข้ารายการไหม" asks, one "เพิ่ม" link per name goes to the add page with the name; "ไว้ทีหลัง" closes', () => {
    liveWith(baseRoot());
    fireEvent.click(within(card(P)).getByRole('button', { name: /รับของที่เหลือ/ }));
    fireEvent.click(sheet().getByRole('button', { name: 'บันทึกรับของ' }));
    const ask = within(screen.getByRole('dialog', { name: 'เพิ่มยาเข้ารายการไหม' }));
    expect(ask.getByText('ยาที่พิมพ์เอง ยังไม่อยู่ในรายการยา เพิ่มเพื่อให้แอพนับสต็อกและเตือนได้')).toBeInTheDocument();
    expect(ask.getByText('ยาพิมพ์เองตัวอย่าง')).toBeInTheDocument();
    expect(ask.getByRole('link', { name: /^เพิ่ม/ })).toHaveAttribute('href', `#/n/meds/new?name=${encodeURIComponent('ยาพิมพ์เองตัวอย่าง')}`);
    fireEvent.click(ask.getByRole('button', { name: 'ไว้ทีหลัง' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('nothing typed arrived: no second sheet', () => {
    liveWith(baseRoot());
    openWaiting();
    fireEvent.click(sheet().getByRole('button', { name: 'บันทึกรับของ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('"ไม่รอแล้ว" on a partial card', () => {
  it('asks first; "รอต่อ" closes and writes nothing', () => {
    const store = liveWith(baseRoot());
    const set = vi.spyOn(store, 'setItem');
    fireEvent.click(within(card(P)).getByRole('button', { name: /ไม่รอแล้ว/ }));
    const ask = within(screen.getByRole('dialog', { name: 'ไม่รอของที่เหลือแล้วใช่ไหม' }));
    expect(ask.getByText('ร้านทดสอบ ข · 2 รายการที่ยังไม่มา')).toBeInTheDocument();
    fireEvent.click(ask.getByRole('button', { name: 'รอต่อ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(set).not.toHaveBeenCalled();
  });

  it('confirm: ONE write, order closed, toast "ปิดใบสั่งแล้ว"', () => {
    const store = liveWith(baseRoot());
    const save = vi.spyOn(storage, 'saveRoot');
    fireEvent.click(within(card(P)).getByRole('button', { name: /ไม่รอแล้ว/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ไม่รอแล้ว' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toastOf()).toHaveTextContent('ปิดใบสั่งแล้ว');
    expect(saved(store).orders.find((o) => o.id === 'o2')?.status).toBe('received');
  });

  it('a failed write keeps the sheet with a message', () => {
    liveWith(baseRoot());
    vi.spyOn(storage, 'saveRoot').mockReturnValueOnce({ ok: false, reason: 'quota' });
    fireEvent.click(within(card(P)).getByRole('button', { name: /ไม่รอแล้ว/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ไม่รอแล้ว' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('บันทึกไม่สำเร็จ ลองอีกครั้ง');
  });
});

describe('test link', () => {
  it('&sheet=receive opens the receiving sheet of the waiting order', () => {
    window.location.hash = '#/n/order?demo=normal&screen=history&orders=history&sheet=receive';
    render(<OrderV3Route />);
    expect(screen.getByRole('dialog', { name: 'รับของ' })).toBeInTheDocument();
    expect(sheet().getByText('ร้านทดสอบ ก · 28 ต.ค. 2569 · 2 รายการ')).toBeInTheDocument();
  });
});
