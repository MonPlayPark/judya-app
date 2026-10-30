import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { medsDemoRoot } from '../../domain/v3/medsListDemo';
import { rootSchema } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY, saveRoot, loadRoot, type KeyValueStore } from '../../domain/v3/storage';
import { MedDetailV3Route } from './MedDetailPage';
import { MedsListV3Route } from './MedsListPage';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const demo = (id: string, name: string, extra = '') => {
  window.location.hash = `#/n/meds/${id}?demo=${name}${extra}`;
  return render(<MedDetailV3Route id={id} />);
};
const dialog = () => screen.getByRole('dialog');
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => vi.restoreAllMocks());

describe('normal medicine', () => {
  it('four cards, one page, no tabs, no bottom menu, no logo', () => {
    demo('a4', 'normal');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('รายละเอียดยา');
    for (const h of ['ข้อมูลยา', 'วิธีกิน', 'ยาคงเหลือ', 'ประวัติการใช้ยา']) expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByAltText('JudYa')).toBeNull();
  });
  it('back link, edit button (coming soon), owner, name, strength, status', () => {
    demo('a4', 'normal');
    expect(screen.getByRole('link', { name: 'กลับไปรายการยา' })).toHaveAttribute('href', '#/n/meds?demo=normal');
    expect(screen.getByRole('button', { name: 'แก้ไขยานี้' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขยานี้' }));
    expect(screen.getAllByRole('status').some((e) => e.textContent === 'เร็ว ๆ นี้')).toBe(true);
    expect(screen.getByText('ยาของ คุณพ่อ')).toBeInTheDocument();
    expect(screen.getByText('VitaminD')).toBeInTheDocument();
    expect(screen.getByText('1,000 IU')).toBeInTheDocument();
    expect(screen.getByText('กำลังใช้อยู่')).toBeInTheDocument();
  });
  it('dose rows, start line, stock numbers, expiry, history (3 + see all)', () => {
    demo('a4', 'normal');
    expect(screen.getByText('เช้า')).toBeInTheDocument();
    expect(screen.getAllByText('1 เม็ด · หลังอาหาร · ทุกวัน')).toHaveLength(2);
    expect(screen.getByText('เริ่มกินเมื่อ 1 มิ.ย. 2569')).toBeInTheDocument();
    expect(screen.getByText('53 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('1 กล่อง + 2 แผง + 3 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('ประมาณ 26 วัน')).toBeInTheDocument();
    expect(screen.getByText('เพียงพอ')).toBeInTheDocument();
    expect(screen.getByText('15 มี.ค. 2570')).toBeInTheDocument();
    expect(screen.getByText('กลับมากินใหม่')).toBeInTheDocument();
    expect(screen.queryByText('เริ่มกินยา')).toBeNull(); // the 4th is behind "ดูทั้งหมด"
    press('ดูทั้งหมด (4)');
    expect(within(dialog()).getByText('เริ่มกินยา')).toBeInTheDocument();
    expect(within(dialog()).getByText('มีเฉพาะเหตุการณ์ที่หมอสั่ง การแก้ข้อมูลที่ใส่ผิดและการเติมสต็อกไม่อยู่ในนี้')).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ปิด' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('only the active-medicine buttons: refill and stop; no resume', () => {
    demo('a4', 'normal');
    expect(screen.getByRole('button', { name: /เติมสต็อก/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /หยุดยานี้/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /กลับมากินใหม่/ })).toBeNull();
    expect(screen.queryByText('เปิดหลอดใหม่')).toBeNull();
  });
});

describe('cream', () => {
  it('spare tubes, no days, open a new tube straight away (no sheet)', () => {
    demo('a9', 'cream');
    expect(screen.getByText('สำรอง 2 หลอด')).toBeInTheDocument();
    expect(screen.getByText('กำลังใช้หลอดที่เปิดอยู่')).toBeInTheDocument();
    expect(screen.getByText('ไม่ตัดสต็อกอัตโนมัติ')).toBeInTheDocument();
    expect(screen.queryByText('พอใช้ได้อีก')).toBeNull();
    expect(screen.getByText('เริ่มใช้เมื่อ 1 มิ.ย. 2569')).toBeInTheDocument();
    press('เปิดหลอดใหม่');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('สำรอง 1 หลอด')).toBeInTheDocument();
    expect(screen.getByText('เปิดหลอดใหม่แล้ว สำรองเหลือ 1 หลอด')).toBeInTheDocument();
    press('เปิดหลอดใหม่');
    expect(screen.getByRole('button', { name: 'เปิดหลอดใหม่' })).toBeDisabled(); // no spare left
  });
  it('refill sheet has one box in หลอด and shows only the spare count', () => {
    demo('a9', 'cream', '&sheet=refill');
    const d = dialog();
    fireEvent.change(within(d).getByLabelText('จำนวน หลอด'), { target: { value: '1' } });
    expect(within(d).getByText('จำนวนหลอดสำรอง')).toBeInTheDocument();
    expect(within(d).getByText('2 หลอด → 3 หลอด')).toBeInTheDocument();
    expect(within(d).queryByText('พอใช้ประมาณ')).toBeNull();
  });
});

describe('not taken every day', () => {
  it('shows weeks', () => {
    demo('a10', 'notdaily');
    expect(screen.getByText(/^ประมาณ \d+ สัปดาห์$/)).toBeInTheDocument();
    expect(screen.getByText('1 เม็ด · หลังอาหาร · เฉพาะวันจันทร์ พุธ ศุกร์')).toBeInTheDocument();
  });
});

describe('stopped medicine', () => {
  it('stopped view: reason line, no stock chip, no days, no stock buttons, resume button', () => {
    demo('a7', 'stopped');
    expect(screen.getByText('หยุดแล้ว')).toBeInTheDocument();
    expect(screen.getByText('หยุดเมื่อ 3 ก.ย. 2569 · เหตุผล: แพ้ยา · อาการ: ผื่นคัน')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'วิธีกินก่อนหยุด' })).toBeInTheDocument();
    expect(screen.queryByText('พอใช้ได้อีก')).toBeNull();
    expect(screen.queryByText('เพียงพอ')).toBeNull();
    expect(screen.queryByRole('button', { name: /เติมสต็อก/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /หยุดยานี้/ })).toBeNull();
    expect(screen.getByText('วันหมดอายุ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /กลับมากินใหม่/ })).toBeEnabled();
  });
  it('resume: reason is required, อื่นๆ needs text, then the page becomes the active view', () => {
    demo('a7', 'stopped');
    press(/กลับมากินใหม่/);
    const d = dialog();
    expect(within(d).getByText('กลับมากินยานี้')).toBeInTheDocument();
    const confirm = within(d).getByRole('button', { name: 'ยืนยันกลับมากินยา' });
    expect(confirm).toBeDisabled();
    fireEvent.click(within(d).getByRole('button', { name: 'อื่นๆ' }));
    expect(confirm).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('พิมพ์เหตุผล'), { target: { value: 'หมอนัดใหม่' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(within(d).getByRole('button', { name: 'ซื้อยาได้แล้ว' }));
    expect(within(d).queryByLabelText('พิมพ์เหตุผล')).toBeNull();
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('กลับมากินยาแล้ว')).toBeInTheDocument();
    expect(screen.getByText('กำลังใช้อยู่')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /หยุดยานี้/ })).toBeInTheDocument();
    expect(screen.getByText('เหตุผล: ซื้อยาได้แล้ว')).toBeInTheDocument(); // in the history
  });
});

describe('stop sheet', () => {
  it('five reasons, confirm stays off until one is chosen; อื่นๆ needs text; symptom field for แพ้ยา', () => {
    demo('a1', 'normal', '&sheet=stop');
    const d = dialog();
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(within(d).getByText('เลือกเหตุผล ระบบจะบันทึกลงในประวัติการใช้ยา')).toBeInTheDocument();
    for (const r of ['หมอสั่งหยุด', 'แพ้ยา', 'ใช้ยาไม่ได้ / ผลข้างเคียง', 'ยาหมดไม่ซื้อต่อ', 'อื่นๆ']) {
      expect(within(d).getByRole('button', { name: r })).toHaveAttribute('aria-pressed', 'false');
    }
    const confirm = within(d).getByRole('button', { name: 'ยืนยันหยุดยา' });
    expect(confirm).toBeDisabled();
    fireEvent.click(within(d).getByRole('button', { name: 'แพ้ยา' }));
    expect(within(d).getByRole('button', { name: 'แพ้ยา' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(d).getByPlaceholderText('เช่น ผื่นคัน บวม คลื่นไส้ ใจสั่น')).toBeInTheDocument();
    expect(confirm).toBeEnabled(); // symptom is optional
    fireEvent.click(within(d).getByRole('button', { name: 'อื่นๆ' }));
    expect(within(d).queryByPlaceholderText('เช่น ผื่นคัน บวม คลื่นไส้ ใจสั่น')).toBeNull();
    expect(confirm).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('พิมพ์เหตุผล'), { target: { value: '   ' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('พิมพ์เหตุผล'), { target: { value: 'ย้ายบ้าน' } });
    expect(confirm).toBeEnabled();
  });
  it('cancel and the dark curtain close the sheet without changing anything', () => {
    demo('a1', 'normal', '&sheet=stop');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    press(/หยุดยานี้/);
    fireEvent.click(screen.getByTestId('sheet-curtain'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('กำลังใช้อยู่')).toBeInTheDocument();
  });
  it('confirm: toast, stopped view with the reason and symptom, history has the stop', () => {
    demo('a1', 'normal', '&sheet=stop');
    const d = dialog();
    fireEvent.click(within(d).getByRole('button', { name: 'แพ้ยา' }));
    fireEvent.change(within(d).getByPlaceholderText('เช่น ผื่นคัน บวม คลื่นไส้ ใจสั่น'), { target: { value: 'บวม' } });
    fireEvent.click(within(d).getByRole('button', { name: 'ยืนยันหยุดยา' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('หยุดยาแล้ว')).toBeInTheDocument();
    expect(screen.getByText('หยุดแล้ว')).toBeInTheDocument();
    expect(screen.getByText('หยุดเมื่อ 28 ต.ค. 2569 · เหตุผล: แพ้ยา · อาการ: บวม')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /กลับมากินใหม่/ })).toBeInTheDocument();
  });
});

describe('refill sheet', () => {
  it('save is off until a number is typed; typing shows the totals; save refills and says so', () => {
    demo('a4', 'normal', '&sheet=refill');
    const d = dialog();
    expect(within(d).getByText('VitaminD 1,000 IU · ใส่จำนวนที่ซื้อเพิ่ม')).toBeInTheDocument();
    const save = within(d).getByRole('button', { name: 'บันทึก' });
    expect(save).toBeDisabled();
    expect(within(d).queryByText('จำนวนรวม')).toBeNull();
    expect(within(d).getByLabelText('จำนวน กล่อง')).toBeInTheDocument();
    expect(within(d).getByLabelText('จำนวน แผง')).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText('จำนวน เม็ด'), { target: { value: 'abc' } });
    expect(within(d).getByRole('alert')).toHaveTextContent('ใส่ได้เฉพาะตัวเลข');
    expect(save).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('จำนวน เม็ด'), { target: { value: '30' } });
    expect(within(d).getByText('53 เม็ด → 83 เม็ด')).toBeInTheDocument();
    expect(within(d).getByText('26 วัน → 41 วัน')).toBeInTheDocument();
    expect(within(d).getByText('รวมกล่องเก่าที่ยังเหลือ ใช้วันหมดอายุที่ใกล้ที่สุด: 15 มี.ค. 2570')).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText('วันหมดอายุของกล่องใหม่'), { target: { value: '2027-01-10' } });
    expect(within(d).getByText('รวมกล่องเก่าที่ยังเหลือ ใช้วันหมดอายุที่ใกล้ที่สุด: 10 ม.ค. 2570')).toBeInTheDocument();
    fireEvent.click(within(d).getByRole('button', { name: 'ล้าง' }));
    expect(within(d).getByText('รวมกล่องเก่าที่ยังเหลือ ใช้วันหมดอายุที่ใกล้ที่สุด: 15 มี.ค. 2570')).toBeInTheDocument();
    fireEvent.click(save);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('เติมสต็อกแล้ว')).toBeInTheDocument();
    expect(screen.getByText('83 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('ประมาณ 41 วัน')).toBeInTheDocument();
    press('ดูทั้งหมด (4)');
    for (const li of within(dialog()).getAllByRole('listitem')) expect(li.textContent).not.toContain('เติม'); // no refill entry in the history
  });
  it('an item without an expiry says the new box date will be used', () => {
    demo('a1', 'normal', '&sheet=refill');
    const d = dialog();
    expect(within(d).getByText(/ยาตัวนี้ยังไม่มีวันหมดอายุ/)).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText('จำนวน เม็ด'), { target: { value: '5' } });
    fireEvent.change(within(d).getByLabelText('วันหมดอายุของกล่องใหม่'), { target: { value: '2027-02-01' } });
    expect(within(d).getByText('ยาตัวนี้ยังไม่มีวันหมดอายุ จะใช้วันที่ของกล่องใหม่: 1 ก.พ. 2570')).toBeInTheDocument();
  });
});

describe('not found', () => {
  it('a small page with a way back', () => {
    demo('nope', 'normal');
    expect(screen.getByText('ไม่พบยานี้')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'กลับไปรายการยา' })).toHaveAttribute('href', '#/n/meds?demo=normal');
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('live data: unknown id', () => {
    const store = memoryStore();
    saveRoot(medsDemoRoot('normal'), store);
    window.location.hash = '#/n/meds/zzz';
    render(<MedDetailV3Route id="zzz" store={store} getToday={() => '2026-10-28'} />);
    expect(screen.getByText('ไม่พบยานี้')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'กลับไปรายการยา' })).toHaveAttribute('href', '#/n/meds');
  });
});

describe('demo mode saves nothing', () => {
  it('no saveRoot, no localStorage call of any kind, even after stop, refill and open tube', () => {
    const calls = (['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const).map((m) => vi.spyOn(Storage.prototype, m));
    const save = vi.spyOn(storage, 'saveRoot');
    const load = vi.spyOn(storage, 'loadRoot');
    demo('a4', 'normal', '&sheet=refill');
    fireEvent.change(within(dialog()).getByLabelText('จำนวน เม็ด'), { target: { value: '5' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'บันทึก' }));
    press(/หยุดยานี้/);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'หมอสั่งหยุด' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ยืนยันหยุดยา' }));
    expect(screen.getByText('หยุดแล้ว')).toBeInTheDocument();
    for (const c of calls) expect(c).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByText('โหมดตัวอย่าง ไม่บันทึกข้อมูล')).toBeInTheDocument();
  });
  it('starts again from the starting values when opened again', () => {
    const first = demo('a1', 'normal', '&sheet=stop');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'หมอสั่งหยุด' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ยืนยันหยุดยา' }));
    first.unmount();
    demo('a1', 'normal');
    expect(screen.getByText('กำลังใช้อยู่')).toBeInTheDocument();
  });
});

describe('real data (judya.v3)', () => {
  const setup = () => {
    const store = memoryStore();
    saveRoot(medsDemoRoot('normal'), store);
    window.location.hash = '#/n/meds/a4';
    render(<MedDetailV3Route id="a4" store={store} getToday={() => '2026-10-28'} />);
    return store;
  };
  it('stop is saved; the stored data passes the schema, has the new event, stock untouched', () => {
    const store = setup();
    press(/หยุดยานี้/);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ยาหมดไม่ซื้อต่อ' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ยืนยันหยุดยา' }));
    const r = loadRoot(store);
    if (r.status !== 'ok') throw new Error('not saved');
    expect(rootSchema.safeParse(r.root).success).toBe(true);
    expect(r.root.assignments.find((a) => a.id === 'a4')?.status).toBe('stopped');
    expect(r.root.events.at(-1)).toMatchObject({ assignmentId: 'a4', type: 'stop', reason: 'ยาหมดไม่ซื้อต่อ', effectiveOn: '2026-10-28' });
    expect(r.root.assignments.find((a) => a.id === 'a4')?.stock).toEqual(medsDemoRoot('normal').assignments.find((a) => a.id === 'a4')?.stock);
  });
  it('refill is saved and writes no event', () => {
    const store = setup();
    press(/เติมสต็อก/);
    fireEvent.change(within(dialog()).getByLabelText('จำนวน เม็ด'), { target: { value: '30' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'บันทึก' }));
    const r = loadRoot(store);
    if (r.status !== 'ok') throw new Error('not saved');
    expect(r.root.events).toEqual(medsDemoRoot('normal').events);
    expect(r.root.assignments.find((a) => a.id === 'a4')?.stock).toMatchObject({ kind: 'count', countedOn: '2026-10-28' });
  });
  it('a failed save keeps the sheet open, shows a Thai message and does not change the screen', () => {
    setup();
    vi.spyOn(storage, 'saveRoot').mockReturnValue({ ok: false, reason: 'quota' });
    press(/หยุดยานี้/);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'หมอสั่งหยุด' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ยืนยันหยุดยา' }));
    expect(dialog()).toBeInTheDocument();
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
    expect(screen.getByText('กำลังใช้อยู่')).toBeInTheDocument();
    expect(screen.queryByText('หยุดยาแล้ว')).toBeNull();
  });
});

describe('route in App', () => {
  it('#/n/meds/:id is shown without opening v2 data', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    act(() => {
      window.location.hash = '#/n/meds/a4?demo=normal';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('รายละเอียดยา');
    expect(get).not.toHaveBeenCalled();
  });
});

describe('house medicine sheets on the list', () => {
  const list = (extra: string) => {
    window.location.hash = `#/n/meds?demo=normal${extra}`;
    return render(<MedsListV3Route />);
  };
  it('a row opens the sheet; close by button and by curtain', () => {
    list('&tab=house');
    fireEvent.click(screen.getByRole('button', { name: 'ผงเกลือแร่ ORS เปิดรายละเอียด' }));
    const d = dialog();
    expect(within(d).getByText('รายละเอียดยาสามัญ')).toBeInTheDocument();
    expect(within(d).getByText('ยาสามัญประจำบ้าน · ผงชงดื่ม')).toBeInTheDocument();
    expect(within(d).getByText('2 ซอง')).toBeInTheDocument();
    expect(within(d).getByText('ใกล้หมด')).toBeInTheDocument();
    expect(within(d).getByText('ยาสามัญไม่ตัดสต็อกอัตโนมัติ ถ้าใช้ไปแล้วให้แก้จำนวนที่เหลือในแก้ข้อมูลยา')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'แก้ข้อมูลยา' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(within(d).getByRole('button', { name: 'ปิด' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ผงเกลือแร่ ORS เปิดรายละเอียด' }));
    fireEvent.click(screen.getByTestId('sheet-curtain'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('an uncounted item has no refill button, only a note', () => {
    list('&tab=house&item=h4');
    const d = dialog();
    expect(within(d).getByText('ไม่ได้ใส่จำนวน')).toBeInTheDocument();
    expect(within(d).getByText('ยานี้ไม่ได้นับจำนวน')).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: 'เติมสต็อก' })).toBeNull();
  });
  it('refill: one box in the item unit; total before -> after; save closes with a message; nothing stored in a demo', () => {
    const calls = (['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const).map((m) => vi.spyOn(Storage.prototype, m));
    const save = vi.spyOn(storage, 'saveRoot');
    list('&tab=house&item=h3');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'เติมสต็อก' }));
    const d = dialog();
    const saveButton = within(d).getByRole('button', { name: 'บันทึก' });
    expect(saveButton).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('จำนวน ซอง'), { target: { value: '3' } });
    expect(within(d).getByText('2 ซอง → 5 ซอง')).toBeInTheDocument();
    fireEvent.click(saveButton);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('เติมสต็อกแล้ว')).toBeInTheDocument();
    expect(screen.getByText('เหลือ 5 ซอง')).toBeInTheDocument();
    for (const c of calls) expect(c).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it('real data: refill is saved with no event', () => {
    const store = memoryStore();
    saveRoot(medsDemoRoot('normal'), store);
    window.location.hash = '#/n/meds?tab=house&item=h3&sheet=refill';
    render(<MedsListV3Route store={store} getToday={() => '2026-10-28'} />);
    fireEvent.change(within(dialog()).getByLabelText('จำนวน ซอง'), { target: { value: '4' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'บันทึก' }));
    const r = loadRoot(store);
    if (r.status !== 'ok') throw new Error('not saved');
    expect(r.root.houseItems.find((h) => h.id === 'h3')?.stock).toEqual({ qty: 6, unit: 'ซอง' });
    expect(r.root.events).toEqual(medsDemoRoot('normal').events);
    expect(store.data[STORAGE_KEY]).toBeDefined();
  });
  it('deleted rows and member heads stay not pressable', () => {
    list('&tab=house&open=deleted');
    expect(screen.getByText('ยาหม่อง').closest('a,button')).toBeNull();
  });
});
