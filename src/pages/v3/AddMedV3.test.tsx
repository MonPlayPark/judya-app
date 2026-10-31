import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { sampleRootV3 } from '../../domain/v3/fixtures';
import { rootSchema, type Root } from '../../domain/v3/schema';
import { STORAGE_KEY, type KeyValueStore } from '../../domain/v3/storage';
import { AddMedV3Route } from './AddMedPage';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const open = (query = '', store?: KeyValueStore) => {
  window.location.hash = `#/n/meds/new${query}`;
  return render(<AddMedV3Route store={store} getToday={() => '2026-10-28'} />);
};
const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const typeName = (v: string) => fireEvent.change(screen.getByLabelText('ชื่อยา'), { target: { value: v } });
const next = () => fireEvent.click(btn('ถัดไป'));
const mainButton = () => document.querySelector<HTMLButtonElement>('button[class*="primary"]') as HTMLButtonElement;
const saved = (store: { data: Record<string, string> }): Root => JSON.parse(store.data[STORAGE_KEY] ?? '{}');
const liveStore = () => memoryStore({ [STORAGE_KEY]: JSON.stringify(sampleRootV3()) });

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => vi.restoreAllMocks());

describe('layout', () => {
  it('title, back, step names with no tick, no bottom menu', () => {
    open('?demo=normal');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('เพิ่มยา');
    expect(btn('กลับ')).toBeInTheDocument();
    const steps = within(screen.getByRole('list', { name: 'ขั้นที่ 1 จาก 3' })).getAllByRole('listitem');
    expect(steps.map((s) => s.textContent)).toEqual(['1ข้อมูลยา', '2วิธีกิน', '3จำนวนที่มี']);
    expect(steps[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByText('โหมดตัวอย่าง ไม่บันทึกข้อมูล')).toBeInTheDocument();
  });
  it('the house type has 2 steps and the type switch keeps the typed name', () => {
    open('?demo=normal');
    typeName('ยาทดสอบ');
    fireEvent.click(btn(/ยาสามัญประจำบ้าน/));
    expect(screen.getByRole('list', { name: 'ขั้นที่ 1 จาก 2' })).toBeInTheDocument();
    expect(screen.getByLabelText('ชื่อยา')).toHaveValue('ยาทดสอบ');
    fireEvent.click(btn(/ยาเฉพาะบุคคล/));
    expect(screen.getByRole('list', { name: 'ขั้นที่ 1 จาก 3' })).toBeInTheDocument();
  });
  it('?type=house starts as the house type', () => {
    open('?demo=normal&type=house');
    expect(btn(/ยาสามัญประจำบ้าน/)).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('step 1 reasons', () => {
  it('says why the button is grey, one reason at a time', () => {
    open('?demo=normal');
    expect(mainButton()).toBeDisabled();
    expect(screen.getByText('ใส่ชื่อยาก่อน แล้วค่อยกดถัดไป')).toBeInTheDocument();
    typeName('ยาใหม่ทดสอบ');
    expect(screen.getByText('เลือกว่ายานี้ของใคร แล้วค่อยกดถัดไป')).toBeInTheDocument();
    fireEvent.click(btn(/คุณแม่/));
    expect(mainButton()).toBeEnabled();
  });
  it('seven kind tiles with the chosen one pressed; strength unit follows liquid', () => {
    open('?demo=normal');
    typeName('ยาใหม่ทดสอบ');
    const tiles = ['ยาเม็ด', 'แคปซูล', 'ยาน้ำ', 'ครีม', 'ผงชงดื่ม', 'ยาหยอด', 'อื่นๆ'];
    for (const t of tiles) expect(btn(new RegExp(`^${t}$`))).toBeInTheDocument();
    expect(btn(/^ยาเม็ด$/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('หน่วยความแรง')).toHaveValue('mg');
    fireEvent.click(btn(/^ยาน้ำ$/));
    expect(screen.getByLabelText('หน่วยความแรง')).toHaveValue('mg/5 ml');
  });
  it('a bad strength stops the button', () => {
    open('?demo=normal&person=p2');
    typeName('ยาใหม่ทดสอบ');
    fireEvent.change(screen.getByLabelText('ความแรง (ไม่บังคับ)'), { target: { value: 'abc' } });
    expect(mainButton()).toBeDisabled();
  });
  it('suggestions show the "มีในบ้านแล้ว" tag, a tap fills the name and closes the list', () => {
    open('?demo=normal');
    typeName('met');
    const list = screen.getByRole('list', { name: 'ชื่อที่แนะนำ' });
    expect(within(list).getByText('มีในบ้านแล้ว')).toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: /Metformin/ }));
    expect(screen.getByLabelText('ชื่อยา')).toHaveValue('Metformin');
    expect(screen.queryByRole('list', { name: 'ชื่อที่แนะนำ' })).toBeNull();
  });
  it('no members and the personal type: the member list is empty with a link to add one', () => {
    open('?demo=nomember');
    expect(screen.getByRole('link', { name: /เพิ่มสมาชิก/ })).toHaveAttribute('href', '#/n/members/new?demo=nomember');
  });
});

describe('a medicine that is already in the house', () => {
  it('shows the card, greys the members who use it and offers "เพิ่มให้ … ด้วย"', () => {
    open('?demo=normal&name=Metformin');
    expect(screen.getByText(/Metformin 500 mg มีในบ้านแล้ว · คุณพ่อ ใช้อยู่/)).toBeInTheDocument();
    expect(screen.queryByText('ชนิดยา')).toBeNull(); // kind and strength are hidden
    expect(btn(/คุณพ่อ/)).toBeDisabled();
    expect(screen.getByText('ใช้อยู่แล้ว')).toBeInTheDocument();
    expect(mainButton()).toBeDisabled();
    fireEvent.click(btn(/คุณแม่/));
    expect(mainButton()).toHaveTextContent('เพิ่มให้คุณแม่ด้วย');
  });
  it('"ไม่ใช่ตัวเดียวกัน?" gives the normal form back', () => {
    open('?demo=normal&name=Metformin');
    fireEvent.click(btn('ไม่ใช่ตัวเดียวกัน? เพิ่มเป็นยาใหม่'));
    expect(screen.getByText('ชนิดยา')).toBeInTheDocument();
    expect(btn(/คุณพ่อ/)).toBeEnabled();
  });
  it('goes to the schedule step and keeps the pack of the old medicine (no pack boxes asked)', () => {
    open('?demo=normal&name=VitaminD');
    fireEvent.click(btn(/คุณแม่/));
    fireEvent.click(mainButton());
    expect(screen.getByRole('list', { name: 'ขั้นที่ 2 จาก 3' })).toBeInTheDocument();
    next();
    expect(screen.getByText('บรรจุเดิมของยานี้: 1 กล่อง = 3 แผง = 30 เม็ด')).toBeInTheDocument();
    expect(screen.queryByText('ขนาดบรรจุ')).toBeNull();
    expect(screen.queryByText('ซื้อมาเป็นอะไร')).toBeNull();
  });
  it('everyone already uses it: grey button with a sentence', () => {
    const store = liveStore();
    // sample p1..p7: m1 is used by p1 only; make every member use it
    const root = sampleRootV3();
    const a1 = root.assignments.find((a) => a.id === 'a1');
    if (!a1) throw new Error('fixture');
    const extra = root.persons.filter((p) => p.id !== 'p1').map((p, i) => ({ ...a1, id: `x${i}`, personId: p.id }));
    store.setItem(STORAGE_KEY, JSON.stringify({ ...root, assignments: [...root.assignments, ...extra] }));
    open('', store);
    typeName('ยาตัวอย่าง A');
    expect(screen.getByText('ทุกคนในบ้านใช้ยานี้อยู่แล้ว ไม่มีใครให้เพิ่มอีก')).toBeInTheDocument();
    expect(mainButton()).toBeDisabled();
  });
  it('a member called ตัวฉัน reads "เพิ่มให้ฉันด้วย"', () => {
    open('', liveStore());
    typeName('ยาตัวอย่าง B'); // used by p2
    fireEvent.click(btn(/สมาชิก ก/));
    expect(mainButton()).toHaveTextContent('เพิ่มให้ฉันด้วย');
  });
});

describe('house medicine with the same name', () => {
  it('shows two buttons and stays grey until one is chosen', () => {
    open('?demo=normal&type=house&name=ยาธาตุน้ำขาว');
    expect(screen.getByText('มียานี้ในบ้านแล้ว')).toBeInTheDocument();
    expect(mainButton()).toBeDisabled();
    expect(screen.getByText('เลือกก่อนว่าจะดูยาเดิม หรือเพิ่มเป็นรายการใหม่')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ดูยาเดิม' })).toHaveAttribute('href', '#/n/meds?tab=house&item=h2&demo=normal');
    fireEvent.click(btn('เพิ่มเป็นรายการใหม่'));
    expect(mainButton()).toBeEnabled();
  });
  it('a personal medicine of the same name does not count as a duplicate', () => {
    open('?demo=normal&type=house&name=Metformin');
    expect(screen.queryByText('มียานี้ในบ้านแล้ว')).toBeNull();
    expect(mainButton()).toBeEnabled();
  });
});

describe('step 2: how to take it', () => {
  const goStep2 = (query = '') => {
    open(`?demo=normal&person=p2&name=ยาใหม่ทดสอบ${query}`);
    next();
  };
  it('meal by default: four period chips, the last one cannot be taken off, bedtime has no meal choice', () => {
    goStep2();
    for (const p of ['เช้า', 'กลางวัน', 'เย็น', 'ก่อนนอน']) expect(btn(new RegExp(`^${p}$`))).toBeInTheDocument();
    expect(btn(/^เช้า$/)).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn(/^เช้า$/));
    expect(btn(/^เช้า$/)).toHaveAttribute('aria-pressed', 'true'); // the last one stays
    fireEvent.click(btn(/^ก่อนนอน$/));
    expect(screen.getByRole('group', { name: 'ก่อนหรือหลังอาหาร ช่วงเช้า' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'ก่อนหรือหลังอาหาร ช่วงก่อนนอน' })).toBeNull();
    expect(screen.getByRole('region', { name: 'ช่วงก่อนนอน' })).toBeInTheDocument();
    expect(btn('หลังอาหาร', )).toHaveAttribute('aria-pressed', 'true');
  });
  it('weekdays need one day, with the reason', () => {
    goStep2();
    fireEvent.click(btn('เลือกวัน'));
    expect(mainButton()).toBeDisabled();
    expect(screen.getByText('เลือกอย่างน้อย 1 วัน')).toBeInTheDocument();
    fireEvent.click(btn('อา'));
    expect(mainButton()).toBeEnabled();
  });
  it('the tablet stepper moves by half a pill between 0.5 and 4', () => {
    goStep2();
    const group = screen.getByRole('group', { name: 'ครั้งละ เช้า' });
    expect(within(group).getByText('1 เม็ด')).toBeInTheDocument();
    fireEvent.click(btn('ลด เช้า'));
    expect(within(group).getByText('½ เม็ด')).toBeInTheDocument();
    expect(btn('ลด เช้า')).toBeDisabled();
    for (let i = 0; i < 7; i++) fireEvent.click(btn('เพิ่ม เช้า'));
    expect(within(group).getByText('4 เม็ด')).toBeInTheDocument();
    expect(btn('เพิ่ม เช้า')).toBeDisabled();
    expect(screen.getByText('เพิ่ม/ลดทีละครึ่งเม็ด')).toBeInTheDocument();
    expect(screen.queryByText(/แผง/)).toBeNull();
  });
  it('a liquid steps by 2.5 ml, has the spoon buttons and warns over 30 ml', () => {
    goStep2('&kind=liquid');
    const group = screen.getByRole('group', { name: 'ครั้งละ เช้า' });
    expect(within(group).getByText('5 มล.')).toBeInTheDocument();
    fireEvent.click(btn('เพิ่ม เช้า'));
    expect(within(group).getByText('7.5 มล.')).toBeInTheDocument();
    expect(screen.getByText('กดทีละ 2.5 มล.')).toBeInTheDocument();
    fireEvent.click(btn('1 ช้อนโต๊ะ = 15 มล.'));
    expect(within(group).getByText('15 มล.')).toBeInTheDocument();
    expect(screen.queryByText('มากกว่าปกติ ตรวจฉลากยาอีกครั้ง')).toBeNull();
    for (let i = 0; i < 7; i++) fireEvent.click(btn('เพิ่ม เช้า'));
    expect(within(group).getByText('32.5 มล.')).toBeInTheDocument();
    expect(screen.getByText('มากกว่าปกติ ตรวจฉลากยาอีกครั้ง')).toBeInTheDocument();
  });
  it('a cream has no dose size and no meal choice, only the reminder sentence', () => {
    goStep2('&kind=cream');
    expect(screen.getByText('ตั้งเวลาเตือนได้ แต่ไม่ตัดสต็อกให้เอง')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /ครั้งละ/ })).toBeNull();
    expect(screen.queryByText('หลังอาหาร')).toBeNull();
  });
  it('every N hours: five choices, start time and a course of days', () => {
    goStep2();
    fireEvent.click(btn('ทุกกี่ชั่วโมง'));
    for (const h of ['4 ชม.', '6 ชม.', '8 ชม.', '12 ชม.', '24 ชม.']) expect(btn(h)).toBeInTheDocument();
    expect(btn('12 ชม.')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('เริ่มครั้งแรกกี่โมง')).toHaveValue('08:00');
    expect(screen.queryByRole('button', { name: 'วันเว้นวัน' })).toBeNull();
    fireEvent.click(btn('กินกี่วัน'));
    expect(mainButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('จำนวนวันที่กิน'), { target: { value: '7' } });
    expect(mainButton()).toBeEnabled();
    expect(screen.getByText(/ทุก 12 ชั่วโมง · ครั้งละ 1 เม็ด · กิน 7 วัน/)).toBeInTheDocument();
  });
  it('the summary uses periods, not clock times', () => {
    goStep2();
    fireEvent.click(btn(/^เย็น$/));
    expect(screen.getByText('เช้า/เย็น · หลังอาหาร · ครั้งละ 1 เม็ด · ทุกวัน')).toBeInTheDocument();
  });
  it('back keeps the typed values', () => {
    goStep2();
    fireEvent.click(btn(/^เย็น$/));
    fireEvent.click(btn('ย้อนกลับ'));
    expect(screen.getByLabelText('ชื่อยา')).toHaveValue('ยาใหม่ทดสอบ');
    next();
    expect(btn(/^เย็น$/)).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('step 3: how much is there', () => {
  const goStep3 = (query = '') => {
    open(`?demo=normal&person=p2&name=ยาใหม่ทดสอบ${query}`);
    next();
    next();
  };
  it('a box is the default for pills: missing pack sizes turn red, the button is grey and says so', () => {
    goStep3();
    expect(btn(/^กล่อง$/)).toHaveAttribute('aria-pressed', 'true');
    expect(mainButton()).toBeDisabled();
    expect(screen.getAllByText('ต้องกรอกช่องนี้').length).toBe(2);
    expect(screen.getByText('ต้องกรอก “จำนวนแผงต่อกล่อง” ก่อนถึงจะบันทึกได้ แอพไม่เดาตัวเลขให้')).toBeInTheDocument();
    expect(screen.getByLabelText('จำนวนแผงต่อกล่อง')).toHaveAttribute('aria-invalid', 'true');
  });
  it('filling the pack shows the green line, the total and the days left', () => {
    goStep3();
    fireEvent.change(screen.getByLabelText('จำนวนแผงต่อกล่อง'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('จำนวนเม็ดต่อแผง'), { target: { value: '10' } });
    expect(screen.getByText('1 กล่อง = 3 แผง = 30 เม็ด')).toBeInTheDocument();
    expect(mainButton()).toBeEnabled();
    expect(screen.queryByText(/ตอนนี้มีรวม/)).toBeNull(); // nothing typed yet = not counted
    fireEvent.change(screen.getByLabelText('จำนวน กล่อง'), { target: { value: '1' } });
    expect(screen.getByText(/ตอนนี้มีรวม 30 เม็ด/)).toBeInTheDocument();
    expect(screen.getByText(/พอใช้ประมาณ 30 วัน/)).toBeInTheDocument();
  });
  it('"ไม่นับสต็อก" needs no pack and says there will be no refill reminder', () => {
    goStep3();
    fireEvent.click(btn('ไม่นับสต็อก'));
    expect(mainButton()).toBeEnabled();
    expect(screen.getByText('ไม่นับสต็อกก็ได้ แต่แอพจะไม่เตือนให้ซื้อเติม')).toBeInTheDocument();
  });
  it('the bottle choice asks for pills per bottle and counts full bottles', () => {
    goStep3();
    fireEvent.click(btn('ขวด/กระปุก'));
    expect(screen.getByLabelText('จำนวนเม็ดต่อขวด')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('จำนวนเม็ดต่อขวด'), { target: { value: '100' } });
    expect(screen.getByText('1 ขวด = 100 เม็ด')).toBeInTheDocument();
    expect(screen.getByText('ที่เหลือในขวดที่เปิดแล้ว')).toBeInTheDocument();
  });
  it('a liquid in bottles; a cream counted by the tube with the blue explanation', () => {
    goStep3('&kind=liquid');
    expect(screen.getByLabelText('ปริมาณต่อขวด')).toBeInTheDocument();
    expect(screen.getByText('ที่ยังไม่เปิด')).toBeInTheDocument();
  });
  it('cream: tubes, the open-new-tube explanation, and the question "นับเป็นอะไร"', () => {
    goStep3('&kind=cream');
    expect(screen.getByText('นับเป็นอะไร')).toBeInTheDocument();
    expect(screen.getByText(/กด “เปิดหลอดใหม่” เองที่หน้ารายละเอียดยา/)).toBeInTheDocument();
    expect(mainButton()).toBeEnabled();
  });
  it('the expiry hint uses the warning days from the settings', () => {
    goStep3();
    expect(screen.getByText('ใส่แล้วแอพจะเตือนก่อนหมดอายุ 15 วัน')).toBeInTheDocument();
  });
  it('a liquid over 30 ml asks for a confirmation before it saves', () => {
    open('?demo=normal&person=p2&name=ยาน้ำทดสอบ&kind=liquid');
    next();
    for (let i = 0; i < 11; i++) fireEvent.click(btn('เพิ่ม เช้า')); // 5 -> 32.5
    next();
    fireEvent.click(btn('ไม่นับสต็อก'));
    fireEvent.click(btn('บันทึกยา'));
    const sheet = screen.getByRole('dialog', { name: 'ยืนยันขนาดยา' });
    expect(window.location.hash).toContain('/n/meds/new');
    fireEvent.click(within(sheet).getByRole('button', { name: 'กลับไปแก้' }));
    expect(screen.getByRole('list', { name: 'ขั้นที่ 2 จาก 3' })).toBeInTheDocument();
    next();
    fireEvent.click(btn('บันทึกยา'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'ยืนยันขนาดยา' })).getByRole('button', { name: 'ถูกต้อง บันทึกเลย' }));
    expect(window.location.hash).toBe('#/n/meds?demo=normal');
  });
});

describe('the house flow', () => {
  it('two steps; the last one has no days-left line and no schedule', () => {
    open('?demo=normal&type=house&name=ยาสามัญใหม่');
    next();
    expect(screen.getByRole('list', { name: 'ขั้นที่ 2 จาก 2' })).toBeInTheDocument();
    expect(screen.getByText('ยาสามัญประจำบ้าน', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('ยาสามัญไม่มีวิธีกิน จึงไม่ตัดสต็อกอัตโนมัติ')).toBeInTheDocument();
    fireEvent.click(btn('ไม่นับสต็อก'));
    fireEvent.click(btn('บันทึกยา'));
    expect(window.location.hash).toBe('#/n/meds?tab=house&demo=normal');
  });
});

describe('demo mode never touches storage', () => {
  it('saves nothing and reads nothing', () => {
    const calls = (['getItem', 'setItem', 'removeItem'] as const).map((m) => vi.spyOn(Storage.prototype, m));
    window.location.hash = '#/n/meds/new?demo=normal&person=p2&name=ยาใหม่ทดสอบ&step=3&kind=other';
    render(<App />);
    fireEvent.click(btn('ไม่นับสต็อก'));
    fireEvent.click(btn('บันทึกยา'));
    expect(window.location.hash).toBe('#/n/meds?demo=normal');
    for (const c of calls) expect(c).not.toHaveBeenCalled();
  });
  it('name / kind / step are only read in a demo', () => {
    open('?name=ยาลับ&kind=liquid&step=3', liveStore());
    expect(screen.getByLabelText('ชื่อยา')).toHaveValue('');
    expect(screen.getByRole('list', { name: 'ขั้นที่ 1 จาก 3' })).toBeInTheDocument();
  });
  it('a Home demo name goes on to the nearest list demo', () => {
    open('?demo=empty1&type=house&name=ยาสามัญใหม่');
    next();
    fireEvent.click(btn('ไม่นับสต็อก'));
    fireEvent.click(btn('บันทึกยา'));
    expect(window.location.hash).toBe('#/n/meds?tab=house&demo=nomeds');
  });
});

describe('real data', () => {
  it('saves a personal medicine in judya.v3 only: medication, assignment and a start event', () => {
    const store = liveStore();
    const before = saved(store);
    open('?person=p2', store);
    typeName('ยาใหม่ทดสอบ');
    fireEvent.click(mainButton());
    fireEvent.click(btn(/^เย็น$/));
    fireEvent.click(btn('เพิ่ม เช้า'));
    next();
    fireEvent.click(btn('ไม่นับสต็อก'));
    fireEvent.click(btn('บันทึกยา'));
    expect(Object.keys(store.data)).toEqual([STORAGE_KEY]);
    const root = saved(store);
    expect(rootSchema.safeParse(root).success).toBe(true);
    expect(root.medications).toHaveLength(before.medications.length + 1);
    expect(root.assignments).toHaveLength(before.assignments.length + 1);
    expect(root.events).toHaveLength(before.events.length + 1);
    expect(root.events.at(-1)).toMatchObject({ type: 'start', effectiveOn: '2026-10-28' });
    expect(root.assignments.at(-1)).toMatchObject({ personId: 'p2', status: 'active', stock: null });
    expect(window.location.hash).toBe('#/n/meds');
  });
  it('saves a house medicine with its total and goes to the house tab', () => {
    const store = liveStore();
    open('?type=house', store);
    typeName('ยาสามัญใหม่');
    fireEvent.change(screen.getByLabelText('ความแรง (ไม่บังคับ)'), { target: { value: '500' } });
    next();
    fireEvent.click(btn('แผง'));
    fireEvent.change(screen.getByLabelText('จำนวนเม็ดต่อแผง'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('จำนวน แผง'), { target: { value: '2' } });
    fireEvent.click(btn('บันทึกยา'));
    const root = saved(store);
    expect(rootSchema.safeParse(root).success).toBe(true);
    expect(root.houseItems.at(-1)).toMatchObject({ name: 'ยาสามัญใหม่', kind: 'tablet', strength: { value: 500, unit: 'mg' }, stock: { qty: 20, unit: 'เม็ด' } });
    expect(root.houseItems.at(-1)).not.toHaveProperty('lowAt');
    expect(window.location.hash).toBe('#/n/meds?tab=house');
  });
  it('"เพิ่มให้ … ด้วย" gives the new person their own stock on the same Medication', () => {
    const store = liveStore();
    open('?person=p3', store);
    typeName('ยาตัวอย่าง A');
    fireEvent.click(mainButton());
    next();
    fireEvent.change(screen.getByLabelText('จำนวน แผง'), { target: { value: '1' } });
    fireEvent.click(btn('บันทึกยา'));
    const root = saved(store);
    const base = sampleRootV3();
    expect(root.medications).toHaveLength(base.medications.length);
    expect(root.assignments.at(-1)).toMatchObject({ personId: 'p3', medicationId: 'm1', stock: { kind: 'count', strips: 1, loose: 0 } });
    expect(root.assignments.find((a) => a.id === 'a1')?.stock).toMatchObject({ strips: 2, loose: 3 });
  });
  it('a failed save shows the message above the button and keeps what was typed', () => {
    const store = liveStore();
    store.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    open('?type=house', store);
    typeName('ยาสามัญใหม่');
    next();
    fireEvent.click(btn('ไม่นับสต็อก'));
    fireEvent.click(btn('บันทึกยา'));
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้');
    expect(btn('บันทึกยา')).toBeEnabled();
    fireEvent.click(btn('ย้อนกลับ'));
    expect(screen.getByLabelText('ชื่อยา')).toHaveValue('ยาสามัญใหม่');
  });
  it('data that cannot be read: a Thai message and no form', () => {
    open('', memoryStore({ [STORAGE_KEY]: '{not json' }));
    expect(screen.getByRole('alert')).toHaveTextContent('อ่านข้อมูลที่เก็บไว้ไม่ได้');
    expect(screen.queryByLabelText('ชื่อยา')).toBeNull();
  });
});

describe('route in the app', () => {
  it('#/n/meds/new is the add page (not a medicine called "new") and judya.v2 is never touched', () => {
    const keys: string[] = [];
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => {
      keys.push(k);
      return null;
    });
    window.location.hash = '#/n/meds/new';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('เพิ่มยา');
    expect(keys).toContain(STORAGE_KEY);
    expect(keys.filter((k) => k.startsWith('judya.v2') || k === 'judya.v1' || k === 'medmate.v1')).toEqual([]);
  });
  it('back goes to the page before when there is one, else to the list', () => {
    open('?demo=normal');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
    fireEvent.click(btn('กลับ'));
    expect(back).toHaveBeenCalled();
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    fireEvent.click(btn('กลับ'));
    expect(window.location.hash).toBe('#/n/meds?demo=normal');
  });
});
