import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { setFlash, takeFlash } from '../../components/v3/flash';
import { medsDemoRoot } from '../../domain/v3/medsListDemo';
import { rootSchema } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY, loadRoot, saveRoot, type KeyValueStore } from '../../domain/v3/storage';
import type { EditTarget } from '../../domain/v3/editMedicine';
import { EditMedV3Route } from './EditMedPage';
import { MedDetailV3Route } from './MedDetailPage';
import { MedsListV3Route } from './MedsListPage';

const memoryStore = (): KeyValueStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const PERSONAL = (id: string): EditTarget => ({ type: 'personal', assignmentId: id });
const HOUSE = (id: string): EditTarget => ({ type: 'house', houseItemId: id });
const demo = (target: EditTarget, name = 'normal') => {
  window.location.hash = '#/x?demo=' + name;
  return render(<EditMedV3Route target={target} />);
};
const live = (target: EditTarget, mutate?: (r: ReturnType<typeof medsDemoRoot>) => void) => {
  const store = memoryStore();
  const root = medsDemoRoot('normal');
  mutate?.(root);
  saveRoot(root, store);
  window.location.hash = '#/x';
  render(<EditMedV3Route target={target} store={store} getToday={() => '2026-10-28'} />);
  return store;
};
const dialog = () => screen.getByRole('dialog');
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const saveButton = () => screen.getByRole('button', { name: /บันทึกการแก้ไข/ });
const stored = (store: ReturnType<typeof memoryStore>) => {
  const r = loadRoot(store);
  if (r.status !== 'ok') throw new Error('not readable');
  return r.root;
};

beforeEach(() => {
  window.location.hash = '';
  takeFlash();
});
afterEach(() => vi.restoreAllMocks());

describe('personal medicine (board #24)', () => {
  it('header, owner, the five cards, original values filled, nothing changed yet', () => {
    demo(PERSONAL('a4'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('แก้ข้อมูลยา');
    expect(screen.getByRole('link', { name: 'กลับ' })).toHaveAttribute('href', '#/n/meds/a4?demo=normal');
    for (const h of ['ข้อมูลยา', 'ซื้อมาเป็นอะไร *', 'ขนาดบรรจุ *', 'จำนวนที่มีตอนนี้ (ไม่บังคับ)', 'วันหมดอายุ (ไม่บังคับ)']) expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
    expect(screen.getByText('ยาของ คุณพ่อ')).toBeInTheDocument();
    expect(screen.getByText('เปลี่ยนเจ้าของไม่ได้ ถ้าใส่ผิดให้เพิ่มยาใหม่ให้ถูกคน')).toBeInTheDocument();
    expect(screen.getByLabelText(/^ชื่อยา/)).toHaveValue('VitaminD');
    expect(screen.getByLabelText('หน่วยความแรง')).toHaveValue('IU');
    expect(screen.getByText('1 กล่อง = 3 แผง = 30 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('ตอนนี้มีรวม 53 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('พอใช้ประมาณ 26 วัน')).toBeInTheDocument();
    expect(screen.getByText('ชนิดที่เลือกอยู่:', { exact: false })).toHaveTextContent('ยาเม็ด');
    expect(screen.queryByText('แก้แล้ว')).toBeNull();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('ยังไม่ได้แก้อะไร')).toBeInTheDocument();
    expect(screen.queryByText(/ยานี้ใช้ร่วมกับ/)).toBeNull();
  });

  it('a changed name shows "แก้แล้ว" and the save button works', () => {
    demo(PERSONAL('a4'));
    type(/^ชื่อยา/, 'Vitamin D3');
    expect(screen.getByText('แก้แล้ว')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('empty name: red text, grey button, "กรอกข้อมูลที่จำเป็นให้ครบก่อน"', () => {
    demo(PERSONAL('a4'));
    type(/^ชื่อยา/, '');
    expect(screen.getByText('ต้องกรอกช่องนี้')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('กรอกข้อมูลที่จำเป็นให้ครบก่อน')).toBeInTheDocument();
  });

  it('an empty required pack box: red box, amber sentence, grey button', () => {
    demo(PERSONAL('a4'));
    type('จำนวนแผงต่อกล่อง', '');
    expect(screen.getByText('ต้องกรอกช่องนี้')).toBeInTheDocument();
    expect(screen.getByText('ต้องกรอก “จำนวนแผงต่อกล่อง” ก่อนถึงจะบันทึกได้ แอพไม่เดาตัวเลขให้')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('same name on another medicine of the same person: yellow note, still saveable', () => {
    demo(PERSONAL('a4'));
    type(/^ชื่อยา/, 'simvastatin');
    expect(screen.getByText('มียาชื่อนี้ของ คุณพ่อ อยู่แล้ว')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('"ไม่นับสต็อก" shows the blue panel and hides pack and counts', () => {
    demo(PERSONAL('a4'));
    press('ไม่นับสต็อก');
    expect(screen.getByText('ไม่นับสต็อกก็ได้ แต่แอพจะไม่เตือนให้ซื้อเติม')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ขนาดบรรจุ *' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /จำนวนที่มีตอนนี้/ })).toBeNull();
  });
});

describe('save paths', () => {
  it('a typo fix saves at once (no confirm sheet), writes no event, goes back to the medicine with a message', () => {
    const store = live(PERSONAL('a4'));
    type(/^ชื่อยา/, 'Vitamin D3');
    press(/บันทึกการแก้ไข/);
    expect(screen.queryByRole('dialog')).toBeNull();
    const r = stored(store);
    expect(rootSchema.safeParse(r).success).toBe(true);
    expect(r.medications.find((m) => m.id === 'm4')?.name).toBe('Vitamin D3');
    expect(r.events).toEqual(medsDemoRoot('normal').events);
    expect(window.location.hash).toBe('#/n/meds/a4');
    expect(takeFlash()).toBe('บันทึกการแก้ไขแล้ว');
  });

  it('a pack change opens "ตรวจก่อนบันทึก" first (board #25); "กลับไปแก้" saves nothing; confirm saves', () => {
    const store = live(PERSONAL('a4'));
    const before = store.data[STORAGE_KEY];
    type('จำนวนเม็ดต่อแผง', '14');
    expect(screen.getByText('1 กล่อง = 3 แผง = 42 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('ตอนนี้มีรวม 73 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('พอใช้ประมาณ 36 วัน')).toBeInTheDocument();
    press(/บันทึกการแก้ไข/);
    const d = dialog();
    expect(within(d).getByRole('heading', { name: 'ตรวจก่อนบันทึก' })).toBeInTheDocument();
    expect(within(d).getByText('ขนาดบรรจุ')).toBeInTheDocument();
    expect(within(d).getByText('1 กล่อง = 3 แผง = 30 เม็ด', { exact: false })).toBeInTheDocument();
    expect(within(d).getByText('1 กล่อง = 3 แผง = 42 เม็ด', { exact: false })).toBeInTheDocument();
    expect(within(d).getByText('53 เม็ด', { exact: false })).toBeInTheDocument();
    expect(within(d).getByText('73 เม็ด', { exact: false })).toBeInTheDocument();
    expect(within(d).getByText('26 วัน', { exact: false })).toBeInTheDocument();
    expect(within(d).getByText('36 วัน', { exact: false })).toBeInTheDocument();
    expect(within(d).getByText('จำนวนวันที่เหลือและการเตือนซื้อยาจะคำนวณใหม่จากตัวเลขนี้ การแก้ไขนี้จะไม่ปรากฏในประวัติการใช้ยา')).toBeInTheDocument();
    fireEvent.click(within(d).getByRole('button', { name: 'กลับไปแก้' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.data[STORAGE_KEY]).toBe(before);
    press(/บันทึกการแก้ไข/);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ยืนยันและบันทึก' }));
    const r = stored(store);
    expect(r.medications.find((m) => m.id === 'm4')?.pack).toEqual({ type: 'box', strips: 3, perStrip: 14 });
    expect(r.assignments.find((a) => a.id === 'a4')?.stock).toEqual({ kind: 'count', strips: 5, loose: 3, countedOn: '2026-10-28' });
    expect(r.events).toEqual(medsDemoRoot('normal').events);
    expect(window.location.hash).toBe('#/n/meds/a4');
  });

  it('a demo saves nothing (not even a read of storage) and still goes back with the message', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    demo(PERSONAL('a4'));
    type(/^ชื่อยา/, 'Vitamin D3');
    press(/บันทึกการแก้ไข/);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/n/meds/a4?demo=normal');
    expect(takeFlash()).toBe('บันทึกการแก้ไขแล้ว');
  });

  it('a failed save keeps what was typed and shows a Thai message', () => {
    live(PERSONAL('a4'));
    vi.spyOn(storage, 'saveRoot').mockReturnValue({ ok: false, reason: 'quota' });
    type(/^ชื่อยา/, 'Vitamin D3');
    press(/บันทึกการแก้ไข/);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText(/^ชื่อยา/)).toHaveValue('Vitamin D3');
    expect(window.location.hash).toBe('#/x');
  });

  it('an unknown medicine says so', () => {
    demo(PERSONAL('zzz'));
    expect(screen.getByText('ไม่พบยานี้')).toBeInTheDocument();
  });
});

describe('kind change (board #27)', () => {
  it('same group (tablet -> capsule) applies at once', () => {
    demo(PERSONAL('a4'));
    press(/แคปซูล/);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('ชนิดที่เลือกอยู่:', { exact: false })).toHaveTextContent('แคปซูล');
  });

  it('cross group opens the warning; "ไม่เปลี่ยน" keeps everything; "เปลี่ยนชนิดยา" clears pack and counts', () => {
    demo(PERSONAL('a4'));
    press(/ผงชงดื่ม/);
    const d = dialog();
    expect(within(d).getByRole('heading', { name: 'เปลี่ยนชนิดยาเป็น ผงชงดื่ม?' })).toBeInTheDocument();
    expect(within(d).getByText('ต้องกรอกขนาดบรรจุและจำนวนที่มีใหม่ เพราะหน่วยไม่เหมือนเดิม')).toBeInTheDocument();
    expect(within(d).getByText('วิธีกินเดิมใช้หน่วยของเม็ด ถ้ายังไม่ปรับ ให้ไปที่ เปลี่ยนวิธีกิน (หมอสั่งใหม่)')).toBeInTheDocument();
    fireEvent.click(within(d).getByRole('button', { name: 'ไม่เปลี่ยน' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('ชนิดที่เลือกอยู่:', { exact: false })).toHaveTextContent('ยาเม็ด');
    press(/ผงชงดื่ม/);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'เปลี่ยนชนิดยา' }));
    expect(screen.getByText('ชนิดที่เลือกอยู่:', { exact: false })).toHaveTextContent('ผงชงดื่ม');
    expect(screen.getByLabelText('จำนวนซองต่อกล่อง')).toHaveValue('');
    expect(screen.getByText('ต้องกรอกช่องนี้')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('กรอกข้อมูลที่จำเป็นให้ครบก่อน')).toBeInTheDocument();
  });

  it('a medicine other people use cannot change group: only "ตกลง"', () => {
    demo(PERSONAL('a3'));
    press(/ผงชงดื่ม/);
    const d = dialog();
    expect(within(d).getByText('ยานี้มีคนอื่นใช้ด้วย เปลี่ยนชนิดข้ามกลุ่มไม่ได้ ถ้าใส่ผิดให้เพิ่มยาใหม่แทน')).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: 'เปลี่ยนชนิดยา' })).toBeNull();
    fireEvent.click(within(d).getByRole('button', { name: 'ตกลง' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('ชนิดที่เลือกอยู่:', { exact: false })).toHaveTextContent('ยาเม็ด');
  });

  it('a dose that does not fit the new kind is said, and saving stays off', () => {
    demo(PERSONAL('a4'));
    press(/ยาน้ำ/);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'เปลี่ยนชนิดยา' }));
    expect(screen.getByText('วิธีกินเดิมใช้หน่วยของชนิดเดิม ต้องปรับวิธีกินก่อนถึงจะเปลี่ยนเป็นชนิดนี้ได้')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });
});

describe('a medicine other people use (rule a, b)', () => {
  it('the pack and stock notes name the people', () => {
    demo(PERSONAL('a3'));
    expect(screen.getByText('จำนวนที่มีและวันหมดอายุ แก้เฉพาะของ คุณพ่อ')).toBeInTheDocument();
    press('แผง');
    expect(screen.getByText('ยานี้ใช้ร่วมกับ คุณแม่ ชื่อ ชนิด ความแรง และขนาดบรรจุจะเปลี่ยนของทุกคน')).toBeInTheDocument();
  });
});

describe('house medicine (board #26)', () => {
  it('badge instead of owner, no pack card, no days line, back goes to the house list', () => {
    demo(HOUSE('h5'));
    expect(screen.getByText('ยาสามัญประจำบ้าน')).toBeInTheDocument();
    expect(screen.queryByText(/ยาของ/)).toBeNull();
    expect(screen.queryByRole('heading', { name: /ขนาดบรรจุ/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'กลับ' })).toHaveAttribute('href', '#/n/meds?tab=house&demo=normal');
    expect(screen.getByLabelText('จำนวน แผง')).toHaveValue('4');
    expect(screen.getByText('ตอนนี้มีรวม 4 แผง')).toBeInTheDocument();
    expect(screen.queryByText(/พอใช้/)).toBeNull();
    expect(screen.getByText('ยาสามัญแอพไม่ตัดสต็อกให้ ปรับจำนวนเองได้ที่หน้ายา')).toBeInTheDocument();
    expect(screen.getByText('ยังไม่ได้แก้อะไร')).toBeInTheDocument();
  });

  it('a new number asks to confirm, saves to the house list with the message', () => {
    const store = live(HOUSE('h5'));
    type('จำนวน แผง', '6');
    press(/บันทึกการแก้ไข/);
    const d = dialog();
    expect(within(d).getByText('แอพจะเตือนให้ซื้อเติมจากตัวเลขใหม่ การแก้ไขนี้จะไม่ปรากฏในประวัติการใช้ยา')).toBeInTheDocument();
    expect(within(d).getByText('4 แผง', { exact: false })).toBeInTheDocument();
    expect(within(d).getByText('6 แผง', { exact: false })).toBeInTheDocument();
    fireEvent.click(within(d).getByRole('button', { name: 'ยืนยันและบันทึก' }));
    expect(stored(store).houseItems.find((h) => h.id === 'h5')?.stock).toEqual({ qty: 6, unit: 'แผง' });
    expect(window.location.hash).toBe('#/n/meds?tab=house');
    expect(takeFlash()).toBe('บันทึกการแก้ไขแล้ว');
  });

  it('a house medicine can change group at once (nobody else uses it)', () => {
    demo(HOUSE('h5'));
    press(/ยาน้ำ/);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'เปลี่ยนชนิดยา' }));
    expect(within(document.body).queryByText(/วิธีกินเดิม/)).toBeNull();
    expect(screen.getByLabelText('จำนวน มล.')).toHaveValue('');
  });
});

describe('the message after saving', () => {
  it('the medicine page says it once; the house list does the same with its sheet closed', () => {
    setFlash('บันทึกการแก้ไขแล้ว');
    window.location.hash = '#/n/meds/a4?demo=normal';
    const first = render(<MedDetailV3Route id="a4" />);
    expect(screen.getByText('บันทึกการแก้ไขแล้ว')).toBeInTheDocument();
    first.unmount();
    setFlash('บันทึกการแก้ไขแล้ว');
    window.location.hash = '#/n/meds?demo=normal&tab=house';
    render(<MedsListV3Route />);
    expect(screen.getByText('บันทึกการแก้ไขแล้ว')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('S4 allergy warning on the name (M4 PR 10)', () => {
  it('shows the warning when the owner has a listed drug that matches the name, follows the typed name, never blocks saving', () => {
    let target = '';
    let drug = '';
    live(PERSONAL('a1'), (r) => {
      const a = r.assignments.find((x) => x.id === 'a1')!;
      drug = r.medications.find((m) => m.id === a.medicationId)!.name;
      target = a.personId;
      r.persons = r.persons.map((p) => (p.id === target ? { ...p, allergies: { status: 'listed', items: [{ drug, reaction: 'ผื่นตัวอย่าง' }] } } : p));
    });
    expect(screen.getByText(`ระวัง: ${drug} มีบันทึกแพ้ยา ${drug} (ผื่นตัวอย่าง) ตรวจกับแพทย์หรือเภสัชกรก่อน`)).toBeInTheDocument();
    type(/ชื่อยา/, 'ชื่อที่ไม่เกี่ยวข้องเลย');
    expect(screen.queryByText(/ระวัง:/)).toBeNull();
    type(/ชื่อยา/, drug + ' ใหม่');
    expect(screen.getByText(/ระวัง:/)).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });
});
