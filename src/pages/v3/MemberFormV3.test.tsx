import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { maxBirthYearBE, rootSchema } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY, type KeyValueStore } from '../../domain/v3/storage';
import { sampleRootV3 } from '../../domain/v3/fixtures';
import { MemberFormV3Route } from './MemberFormPage';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const open = (query = '', store?: KeyValueStore) => {
  window.location.hash = `#/n/members/new${query}`;
  return render(<MemberFormV3Route store={store} />);
};
const typeName = (v: string) => fireEvent.change(screen.getByLabelText('ชื่อที่เรียก'), { target: { value: v } });
const typeYear = (v: string) => fireEvent.change(screen.getByLabelText('ปีเกิด (พ.ศ.)'), { target: { value: v } });
const chip = (name: string) => screen.getByRole('button', { name });
const save = () => screen.getByRole('button', { name: 'บันทึก' });
const fill = () => {
  typeName('คุณยาย');
  fireEvent.click(chip('ญาติ'));
};

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => vi.restoreAllMocks());

describe('layout of the page', () => {
  it('title, back button, three cards, no bottom menu', () => {
    open('?demo=nomember');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('เพิ่มสมาชิก');
    expect(screen.getByRole('button', { name: 'กลับ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'รูปโปรไฟล์' })).toBeInTheDocument();
    expect(screen.getByText('เลือกรูปให้สมาชิก · กด + เพื่อดูรูปทั้งหมด')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('เช่น คุณแม่')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('เช่น 2503')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'จัดยาทานเอง' })).toBeInTheDocument();
    expect(screen.getByText('สมาชิกคนนี้จัดและกินยาเอง')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText(/ประกัน|แพ้ยา/)).toBeNull(); // the insurance card is not built yet (PR 10)
  });
  it('back goes to the page before when there is one, else to Home', () => {
    open('?demo=nomember');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
    fireEvent.click(screen.getByRole('button', { name: 'กลับ' }));
    expect(back).toHaveBeenCalled();
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    fireEvent.click(screen.getByRole('button', { name: 'กลับ' }));
    expect(window.location.hash).toBe('#/n'); // 'nomember' is not a Home demo, so no ?demo=
    window.location.hash = '#/n/members/new?demo=empty0';
  });
  it('the way home keeps a Home demo name', () => {
    open('?demo=empty0');
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    fireEvent.click(screen.getByRole('button', { name: 'กลับ' }));
    expect(window.location.hash).toBe('#/n?demo=empty0');
  });
});

describe('the save button', () => {
  it('is really disabled until name and relation are given, and says why above the button', () => {
    open('?demo=nomember');
    expect(save()).toBeDisabled();
    expect(screen.getByText('พิมพ์ชื่อและเลือกความสัมพันธ์ก่อน')).toBeInTheDocument();
    typeName('คุณแม่');
    expect(save()).toBeDisabled();
    expect(screen.getByText('เลือกความสัมพันธ์ก่อน')).toBeInTheDocument();
    fireEvent.click(chip('แม่'));
    expect(save()).toBeEnabled();
    expect(screen.queryByText(/ก่อน$/)).toBeNull();
    typeName('   ');
    expect(save()).toBeDisabled();
    expect(screen.getByText('พิมพ์ชื่อก่อน')).toBeInTheDocument();
  });
  it('a wrong birth year blocks it too; empty is fine', () => {
    open('?demo=nomember');
    fill();
    typeYear('25');
    expect(save()).toBeDisabled();
    expect(screen.getByText('แก้ปีเกิดให้ถูกต้องก่อน')).toBeInTheDocument();
    typeYear('');
    expect(save()).toBeEnabled();
  });
});

describe('birth year', () => {
  it('shows the age, the optional note, or the error with an icon', () => {
    open('?demo=nomember');
    const note = () => document.getElementById('mf-year-note');
    expect(note()).toHaveTextContent('ใช้คำนวณอายุ ไม่บังคับ');
    typeYear('2503');
    expect(note()).toHaveTextContent(`อายุ ${maxBirthYearBE() - 2503} ปี`);
    typeYear('2399');
    expect(note()).toHaveTextContent(`ปีเกิดต้องเป็น พ.ศ. 4 หลัก ตั้งแต่ 2400 ถึง ${maxBirthYearBE()}`);
    expect(note()?.querySelector('svg')).not.toBeNull(); // not colour alone
    expect(screen.getByLabelText('ปีเกิด (พ.ศ.)')).toHaveAttribute('aria-invalid', 'true');
    typeYear(String(maxBirthYearBE() + 1));
    expect(note()).toHaveTextContent('ปีเกิดต้องเป็น');
    typeYear('2400');
    expect(note()).toHaveTextContent(`อายุ ${maxBirthYearBE() - 2400} ปี`);
  });
  it('keeps digits only, at most 4', () => {
    open('?demo=nomember');
    typeYear('25a0-3x9');
    expect(screen.getByLabelText('ปีเกิด (พ.ศ.)')).toHaveValue('2503');
    expect(screen.getByLabelText('ปีเกิด (พ.ศ.)')).toHaveAttribute('inputmode', 'numeric');
  });
});

describe('relation chips', () => {
  it('seven chips in order, one chosen at a time (aria-pressed)', () => {
    open('?demo=nomember');
    const group = screen.getByRole('group', { name: 'ความสัมพันธ์' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['ตัวฉัน', 'พ่อ', 'แม่', 'คู่สมรส', 'ลูก', 'ญาติ', 'อื่นๆ']);
    fireEvent.click(chip('พ่อ'));
    fireEvent.click(chip('ลูก'));
    expect(chip('พ่อ')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('ลูก')).toHaveAttribute('aria-pressed', 'true');
  });
  it('"ตัวฉัน" is faded and cannot be pressed when someone already has it', () => {
    const store = memoryStore({ [STORAGE_KEY]: JSON.stringify(sampleRootV3()) }); // p1 is "ตัวฉัน"
    open('', store);
    expect(chip('ตัวฉัน')).toBeDisabled();
    expect(screen.getByText("มี 'ตัวฉัน' แล้ว")).toBeInTheDocument();
    fireEvent.click(chip('ตัวฉัน'));
    expect(chip('ตัวฉัน')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('แม่')).toBeEnabled();
  });
  it('"ตัวฉัน" is free when nobody has it (no note)', () => {
    open('?demo=normal'); // the demo members are พ่อ and แม่
    expect(chip('ตัวฉัน')).toBeEnabled();
    expect(screen.queryByText("มี 'ตัวฉัน' แล้ว")).toBeNull();
  });
});

describe('self-managed switch', () => {
  const sw = () => screen.getByRole('switch', { name: 'จัดยาทานเอง' });
  it('starts off, shows the word, and follows the relation until it is touched', () => {
    open('?demo=nomember');
    expect(sw()).toHaveAttribute('aria-checked', 'false');
    expect(sw()).toHaveTextContent('ปิด');
    fireEvent.click(chip('ตัวฉัน'));
    expect(sw()).toHaveAttribute('aria-checked', 'true');
    expect(sw()).toHaveTextContent('เปิด');
    fireEvent.click(chip('แม่'));
    expect(sw()).toHaveAttribute('aria-checked', 'false');
  });
  it('once touched, it no longer follows the relation', () => {
    open('?demo=nomember');
    fireEvent.click(sw()); // on
    fireEvent.click(chip('ตัวฉัน'));
    fireEvent.click(chip('แม่'));
    expect(sw()).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw()); // off
    fireEvent.click(chip('ตัวฉัน'));
    expect(sw()).toHaveAttribute('aria-checked', 'false');
  });
});

describe('profile picture', () => {
  it('shows 4 pictures and a "+" button, the first one chosen with a tick', () => {
    open('?demo=nomember');
    const pics = screen.getAllByRole('button', { name: /^รูปที่ \d+$/ });
    expect(pics.map((p) => p.getAttribute('aria-label'))).toEqual(['รูปที่ 1', 'รูปที่ 2', 'รูปที่ 3', 'รูปที่ 4']);
    expect(pics[0]).toHaveAttribute('aria-pressed', 'true');
    expect(pics[0]?.querySelector('svg')).not.toBeNull();
    expect(pics[1]).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'ดูรูปทั้งหมด' })).toBeInTheDocument();
  });
  it('the sheet has all 12 pictures; pressing one chooses it and closes the sheet at once', () => {
    open('?demo=nomember');
    fireEvent.click(screen.getByRole('button', { name: 'ดูรูปทั้งหมด' }));
    const dialog = screen.getByRole('dialog', { name: 'เลือกรูปโปรไฟล์' });
    expect(within(dialog).getAllByRole('button')).toHaveLength(12);
    fireEvent.click(within(dialog).getByRole('button', { name: 'รูปที่ 9' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // picture 9 is not among the first four, so it takes the 4th place
    const pics = screen.getAllByRole('button', { name: /^รูปที่ \d+$/ });
    expect(pics.map((p) => p.getAttribute('aria-label'))).toEqual(['รูปที่ 1', 'รูปที่ 2', 'รูปที่ 3', 'รูปที่ 9']);
    expect(pics[3]).toHaveAttribute('aria-pressed', 'true');
    expect(pics[0]).toHaveAttribute('aria-pressed', 'false');
  });
  it('choosing one of the first four keeps the row as it is; the sheet closes with the curtain', () => {
    open('?demo=nomember&sheet=avatars');
    fireEvent.click(screen.getByTestId('sheet-curtain'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'รูปที่ 3' }));
    expect(screen.getAllByRole('button', { name: /^รูปที่ \d+$/ }).map((p) => p.getAttribute('aria-label'))).toEqual(['รูปที่ 1', 'รูปที่ 2', 'รูปที่ 3', 'รูปที่ 4']);
    expect(screen.getByRole('button', { name: 'รูปที่ 3' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('&sheet=avatars opens the sheet by link', () => {
    open('?demo=nomember&sheet=avatars');
    expect(screen.getByRole('dialog', { name: 'เลือกรูปโปรไฟล์' })).toBeInTheDocument();
  });
});

describe('duplicate name', () => {
  it('warns under the name box (with an icon) but still saves', () => {
    open('?demo=normal');
    typeName('คุณ พ่อ');
    fireEvent.click(chip('ญาติ'));
    const warn = screen.getByText('มีสมาชิกชื่อนี้แล้ว');
    expect(warn.querySelector('svg')).not.toBeNull();
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    expect(screen.getByRole('dialog', { name: 'เพิ่มสมาชิกแล้ว' })).toBeInTheDocument();
  });
});

describe('after saving (demo)', () => {
  const saveDemo = () => {
    open('?demo=nomember');
    typeName('คุณยาย');
    fireEvent.click(chip('ญาติ'));
    fireEvent.click(screen.getByRole('button', { name: 'รูปที่ 2' }));
    fireEvent.click(save());
  };
  it('the sheet shows the avatar, name and relation, and has three buttons', () => {
    saveDemo();
    const dialog = screen.getByRole('dialog', { name: 'เพิ่มสมาชิกแล้ว' });
    expect(within(dialog).getByText('คุณยาย')).toBeInTheDocument();
    expect(within(dialog).getByText('ญาติ')).toBeInTheDocument();
    expect(dialog.querySelector('img')).toHaveAttribute('src', expect.stringContaining('avatar-02'));
    expect(within(dialog).getByText('เพิ่มยาให้ คุณยาย').closest('button')).toHaveAttribute('aria-disabled', 'true'); // until PR 6b
    expect(within(dialog).getByRole('button', { name: 'เพิ่มสมาชิกอีกคน' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'กลับหน้าหลัก' })).toHaveAttribute('href', '#/n');
  });
  it('cannot be closed with the dark curtain or Esc', () => {
    saveDemo();
    fireEvent.click(screen.getByTestId('sheet-curtain'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'เพิ่มสมาชิกแล้ว' })).toBeInTheDocument();
  });
  it('"เพิ่มสมาชิกอีกคน" clears the form; the new member is known (a second "ตัวฉัน" is blocked)', () => {
    open('?demo=nomember');
    typeName('ฉันเอง');
    fireEvent.click(chip('ตัวฉัน'));
    fireEvent.click(save());
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มสมาชิกอีกคน' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('ชื่อที่เรียก')).toHaveValue('');
    expect(screen.getByLabelText('ปีเกิด (พ.ศ.)')).toHaveValue('');
    expect(chip('ตัวฉัน')).toBeDisabled();
    expect(chip('ตัวฉัน')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('switch', { name: 'จัดยาทานเอง' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getAllByRole('button', { name: /^รูปที่ 1$/ })[0]).toHaveAttribute('aria-pressed', 'true');
    expect(save()).toBeDisabled();
  });
  it('&sheet=done opens the sheet by link (made-up member, demo only)', () => {
    open('?demo=nomember&sheet=done');
    expect(screen.getByRole('dialog', { name: 'เพิ่มสมาชิกแล้ว' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'กลับหน้าหลัก' })).toBeInTheDocument();
  });
  it('a real (not demo) page ignores &sheet=done', () => {
    open('?sheet=done', memoryStore());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('demo mode touches no storage', () => {
  it('banner shown, no localStorage call of any kind, no loadRoot / saveRoot, even after saving', () => {
    const calls = (['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const).map((m) => vi.spyOn(Storage.prototype, m));
    const save$ = vi.spyOn(storage, 'saveRoot');
    const load$ = vi.spyOn(storage, 'loadRoot');
    open('?demo=normal');
    expect(screen.getByText('โหมดตัวอย่าง ไม่บันทึกข้อมูล')).toBeInTheDocument();
    typeName('คุณป้า');
    fireEvent.click(chip('ญาติ'));
    fireEvent.click(save());
    expect(screen.getByRole('dialog', { name: 'เพิ่มสมาชิกแล้ว' })).toBeInTheDocument();
    for (const c of calls) expect(c).not.toHaveBeenCalled();
    expect(save$).not.toHaveBeenCalled();
    expect(load$).not.toHaveBeenCalled();
  });
  it('the Home demos work too (empty0 = no member)', () => {
    open('?demo=empty0');
    expect(screen.getByText('โหมดตัวอย่าง ไม่บันทึกข้อมูล')).toBeInTheDocument();
    expect(chip('ตัวฉัน')).toBeEnabled();
  });
});

describe('real data', () => {
  it('a new user: starts from a blank house, saves a valid root in judya.v3 only, and shows the sheet', () => {
    const store = memoryStore();
    open('', store);
    expect(screen.queryByText('โหมดตัวอย่าง ไม่บันทึกข้อมูล')).toBeNull();
    expect(store.data).toEqual({}); // nothing is written until "บันทึก"
    typeName('  คุณแม่ ');
    fireEvent.click(chip('แม่'));
    typeYear('2503');
    fireEvent.click(save());
    expect(Object.keys(store.data)).toEqual([STORAGE_KEY]);
    const root = JSON.parse(store.data[STORAGE_KEY] ?? '{}');
    expect(rootSchema.safeParse(root).success).toBe(true);
    expect(root.persons).toHaveLength(1);
    expect(root.persons[0]).toMatchObject({ name: 'คุณแม่', relation: 'แม่', birthYearBE: 2503, avatar: 'avatar-01', color: 'blue', selfManaged: false, allergies: { status: 'unknown' } });
    expect(root.persons[0]).not.toHaveProperty('coverage');
    expect(screen.getByRole('dialog', { name: 'เพิ่มสมาชิกแล้ว' })).toBeInTheDocument();
  });
  it('adds to the members already there and picks the next colour', () => {
    const store = memoryStore({ [STORAGE_KEY]: JSON.stringify(sampleRootV3()) });
    const before = JSON.parse(store.data[STORAGE_KEY] ?? '{}').persons.length;
    open('', store);
    typeName('คนใหม่');
    fireEvent.click(chip('ลูก'));
    fireEvent.click(save());
    const persons = JSON.parse(store.data[STORAGE_KEY] ?? '{}').persons;
    expect(persons).toHaveLength(before + 1);
    expect(persons.at(-1)).toMatchObject({ name: 'คนใหม่', relation: 'ลูก', color: 'gray' }); // all four colours are used: start again by count (7 members -> 7 mod 4 = 3rd index)
  });
  it('a failed save shows a Thai message above the button, keeps the form and shows no sheet', () => {
    const store = memoryStore();
    store.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    open('', store);
    fill();
    typeYear('2510');
    fireEvent.click(save());
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่ พื้นที่เก็บข้อมูลในเครื่องเต็ม');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('ชื่อที่เรียก')).toHaveValue('คุณยาย');
    expect(screen.getByLabelText('ปีเกิด (พ.ศ.)')).toHaveValue('2510');
    expect(chip('ญาติ')).toHaveAttribute('aria-pressed', 'true');
    expect(save()).toBeEnabled();
  });
  it('data that cannot be read: a Thai message and no form', () => {
    open('', memoryStore({ [STORAGE_KEY]: '{not json' }));
    expect(screen.getByRole('alert')).toHaveTextContent('อ่านข้อมูลที่เก็บไว้ไม่ได้');
    expect(screen.queryByLabelText('ชื่อที่เรียก')).toBeNull();
  });
});

describe('route in the app', () => {
  it('#/n/members/new opens the page outside DataProvider: judya.v2 is never read or written', () => {
    const calls = (['getItem', 'setItem', 'removeItem'] as const).map((m) => vi.spyOn(Storage.prototype, m));
    window.location.hash = '#/n/members/new?demo=nomember';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('เพิ่มสมาชิก');
    for (const c of calls) expect(c).not.toHaveBeenCalled();
  });
  it('the real route reads only judya.v3', () => {
    const keys: string[] = [];
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => {
      keys.push(k);
      return null;
    });
    window.location.hash = '#/n/members/new';
    render(<App />);
    expect(keys).toContain(STORAGE_KEY);
    expect(keys.filter((k) => k.startsWith('judya.v2') || k === 'judya.v1' || k === 'medmate.v1')).toEqual([]);
    get.mockRestore();
  });
});
