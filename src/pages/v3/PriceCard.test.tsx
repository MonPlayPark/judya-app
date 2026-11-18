import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { medsDemoRoot } from '../../domain/v3/medsListDemo';
import { rootSchema } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { loadRoot, saveRoot, type KeyValueStore } from '../../domain/v3/storage';
import { MedDetailV3Route } from './MedDetailPage';
import { MedsListV3Route } from './MedsListPage';

const memoryStore = (): KeyValueStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const detail = (id: string, name: string) => {
  window.location.hash = `#/n/meds/${id}?demo=${name}`;
  return render(<MedDetailV3Route id={id} />);
};
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const dialog = () => screen.getByRole('dialog');

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('card on the medicine page', () => {
  it('sits after stock, before history; chip, help line, one row per real shop', () => {
    detail('a4', 'price');
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(heads.indexOf('ราคาตามร้าน')).toBe(heads.indexOf('ยาคงเหลือ') + 1);
    expect(heads.indexOf('ประวัติการใช้ยา')).toBe(heads.indexOf('ราคาตามร้าน') + 1);
    expect(screen.getByText('ไม่บังคับ')).toBeInTheDocument();
    expect(screen.getByText('ใส่เฉพาะร้านที่ซื้อบ่อย ใช้เทียบราคาตอนสั่งยา')).toBeInTheDocument();
    const a = screen.getByRole('button', { name: 'แก้ราคาที่ ร้านทดสอบ ก' });
    expect(a).toHaveTextContent('฿180 / กล่อง');
    expect(a).toHaveTextContent('≈ ฿6 ต่อเม็ด');
    expect(a).toHaveTextContent('อัปเดต 20 ต.ค. 2569');
    expect(screen.getByRole('button', { name: 'แก้ราคาที่ ร้านทดสอบ ข' })).toHaveTextContent('≈ ฿6.50 ต่อเม็ด');
    const c = screen.getByRole('button', { name: 'ใส่ราคาที่ ร้านทดสอบ ค' });
    expect(c).toHaveTextContent('ยังไม่มีราคา');
    expect(c).toHaveTextContent('ใส่ราคา');
  });
  it('cream: tube unit, no per-unit line', () => {
    detail('a9', 'price');
    const a = screen.getByRole('button', { name: 'แก้ราคาที่ ร้านทดสอบ ก' });
    expect(a).toHaveTextContent('฿45 / หลอด');
    expect(a).not.toHaveTextContent('≈');
  });
  it('no shops: help line and a link to the shops page', () => {
    detail('a4', 'normal');
    expect(screen.getByText('ใส่เฉพาะร้านที่ซื้อบ่อย ใช้เทียบราคาตอนสั่งยา')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เพิ่มร้าน' })).toHaveAttribute('href', '#/n/shops');
  });
  it('stopped medicine: no card', () => {
    detail('a7', 'stopped');
    expect(screen.queryByRole('heading', { name: 'ราคาตามร้าน' })).toBeNull();
  });
});

describe('price sheet', () => {
  it('new price: title, sub line, units, disabled save, no delete; hint follows the unit', () => {
    detail('a4', 'price');
    press('ใส่ราคาที่ ร้านทดสอบ ค');
    const d = dialog();
    expect(within(d).getByRole('heading', { name: 'ราคาที่ ร้านทดสอบ ค' })).toBeInTheDocument();
    expect(within(d).getByText('VitaminD · ใส่เมื่อรู้ราคา ไม่ใส่ก็ได้')).toBeInTheDocument();
    const units = within(within(d).getByRole('group', { name: 'หน่วยที่ร้านขาย' })).getAllByRole('button');
    expect(units.map((b) => b.textContent)).toEqual(['กล่อง', 'แผง', 'เม็ด']);
    expect(units[0]).toHaveAttribute('aria-pressed', 'true');
    expect(within(d).getByRole('button', { name: 'บันทึกราคา' })).toBeDisabled();
    expect(within(d).queryByRole('button', { name: 'ลบราคาร้านนี้' })).toBeNull();
    fireEvent.change(within(d).getByLabelText('ราคาเป็นบาท'), { target: { value: '300' } });
    expect(within(d).getByText('บาท / กล่อง')).toBeInTheDocument();
    expect(within(d).getByText('คิดเป็นประมาณ ฿10 ต่อเม็ด (ใช้เทียบกับร้านอื่น)')).toBeInTheDocument();
    fireEvent.click(within(d).getByRole('button', { name: 'แผง' }));
    expect(within(d).getByText('คิดเป็นประมาณ ฿30 ต่อเม็ด (ใช้เทียบกับร้านอื่น)')).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText('ราคาเป็นบาท'), { target: { value: '0' } });
    expect(within(d).getByRole('button', { name: 'บันทึกราคา' })).toBeDisabled();
  });
  it('demo save: row and toast change, nothing is stored', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    detail('a4', 'price');
    press('ใส่ราคาที่ ร้านทดสอบ ค');
    fireEvent.change(within(dialog()).getByLabelText('ราคาเป็นบาท'), { target: { value: '300' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'บันทึกราคา' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('บันทึกราคาที่ ร้านทดสอบ ค แล้ว')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'แก้ราคาที่ ร้านทดสอบ ค' })).toHaveTextContent('฿300 / กล่อง');
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
  it('existing price: values prefilled, delete removes it with a toast', () => {
    detail('a4', 'price');
    press('แก้ราคาที่ ร้านทดสอบ ข');
    const d = dialog();
    expect(within(d).getByLabelText('ราคาเป็นบาท')).toHaveValue('65');
    expect(within(d).getByRole('button', { name: 'แผง' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(d).getByRole('button', { name: 'ลบราคาร้านนี้' }));
    expect(screen.getByText('ลบราคาที่ ร้านทดสอบ ข แล้ว')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ใส่ราคาที่ ร้านทดสอบ ข' })).toBeInTheDocument();
  });
  it('cancel closes without changes; cream offers หลอด only', () => {
    detail('a9', 'price');
    press('ใส่ราคาที่ ร้านทดสอบ ข');
    expect(within(within(dialog()).getByRole('group', { name: 'หน่วยที่ร้านขาย' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['หลอด']);
    expect(within(dialog()).queryByText(/คิดเป็นประมาณ/)).toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('real data', () => {
  it('one saveRoot per save; the stored price is the one the order page reads', () => {
    const store = memoryStore();
    saveRoot(medsDemoRoot('price'), store);
    window.location.hash = '#/n/meds/a4';
    render(<MedDetailV3Route id="a4" store={store} getToday={() => '2026-10-28'} />);
    const spy = vi.spyOn(storage, 'saveRoot');
    press('ใส่ราคาที่ ร้านทดสอบ ค');
    fireEvent.change(within(dialog()).getByLabelText('ราคาเป็นบาท'), { target: { value: '95' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'แผง' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'บันทึกราคา' }));
    expect(spy).toHaveBeenCalledTimes(1);
    const r = loadRoot(store);
    if (r.status !== 'ok') throw new Error('not saved');
    expect(rootSchema.safeParse(r.root).success).toBe(true);
    expect(r.root.prices.find((p) => p.shopId === 's3')).toMatchObject({ item: { kind: 'med', medicationId: 'm4' }, price: 95, sellUnit: 'แผง', perSellUnit: 10, date: '2026-10-28' });
    expect(r.root.prices).toHaveLength(5);
  });
});

describe('house medicine', () => {
  it('card inside the info sheet: unit = stock unit, no per-unit line; save and back to the sheet', () => {
    window.location.hash = '#/n/meds?demo=price&tab=house&item=h5';
    render(<MedsListV3Route />);
    const row = screen.getByRole('button', { name: 'แก้ราคาที่ ร้านทดสอบ ก' });
    expect(row).toHaveTextContent('฿25 / แผง');
    expect(row).not.toHaveTextContent('≈');
    press('ใส่ราคาที่ ร้านทดสอบ ข');
    const d = dialog();
    expect(within(within(d).getByRole('group', { name: 'หน่วยที่ร้านขาย' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['แผง']);
    fireEvent.change(within(d).getByLabelText('ราคาเป็นบาท'), { target: { value: '30' } });
    fireEvent.click(within(d).getByRole('button', { name: 'บันทึกราคา' }));
    expect(screen.getByText('บันทึกราคาที่ ร้านทดสอบ ข แล้ว')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'แก้ราคาที่ ร้านทดสอบ ข' })).toHaveTextContent('฿30 / แผง');
  });
});
