import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { sampleRootV3 } from '../../domain/v3/fixtures';
import { removeMember } from '../../domain/v3/memberEdit';
import { rootSchema, type Root } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY } from '../../domain/v3/storage';

const open = (hash: string) => {
  window.location.hash = hash;
  return render(<App getToday={() => '2026-11-17'} />);
};
// Pages read localStorage, so tests seed it.
const openLive = (hash: string, root: Root = sampleRootV3()) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  return open(hash);
};

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-17T03:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('members list (#/n/members)', () => {
  it('header, one card per active member as a link, sub line, chip for self-managed, FAB, nav tab current', () => {
    openLive('#/n/members');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สมาชิก');
    const card = screen.getByRole('link', { name: /สมาชิก ข/ });
    expect(card).toHaveAttribute('href', '#/n/members/p2');
    expect(within(card).getByText('อายุ 69 ปี · ยา 2 รายการ')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /สมาชิก จ/ })).getByText('ยา 0 รายการ')).toBeInTheDocument();
    expect(screen.getAllByText('จัดยาทานเอง')).toHaveLength(1); // p1 only
    expect(within(screen.getByRole('link', { name: /สมาชิก ก/ })).getByText('จัดยาทานเอง')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เพิ่มสมาชิก' })).toHaveAttribute('href', '#/n/members/new');
    const nav = screen.getByRole('navigation', { name: 'เมนูหลัก' });
    const tab = within(nav).getByRole('link', { name: 'สมาชิก' });
    expect(tab).toHaveAttribute('href', '#/n/members');
    expect(tab).toHaveAttribute('aria-current', 'page');
  });

  it('no removed section when nobody was taken out', () => {
    openLive('#/n/members');
    expect(screen.queryByText(/สมาชิกที่นำออก/)).toBeNull();
  });

  it('removed section is folded, opens with the date, and "นำกลับ" restores with one save and a message', () => {
    const root = removeMember(sampleRootV3(), 'p5', '2026-10-03T03:00:00.000Z');
    openLive('#/n/members', root);
    const fold = screen.getByRole('button', { name: /สมาชิกที่นำออก \(1\)/ });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('นำออกเมื่อ 3 ต.ค. 69')).toBeNull();
    fireEvent.click(fold);
    expect(screen.getByText('นำออกเมื่อ 3 ต.ค. 69')).toBeInTheDocument();
    const save$ = vi.spyOn(storage, 'saveRoot');
    fireEvent.click(screen.getByRole('button', { name: 'นำกลับ สมาชิก จ' }));
    expect(save$).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('นำสมาชิก จกลับแล้ว');
    expect(screen.queryByText(/สมาชิกที่นำออก/)).toBeNull();
    expect(screen.getByRole('link', { name: /สมาชิก จ/ })).toBeInTheDocument();
    expect(rootSchema.safeParse(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')).success).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}').persons.find((p: { id: string }) => p.id === 'p5')).not.toHaveProperty('removedAt');
  });

  it('"นำกลับ" that would make two "ตัวฉัน" is blocked with a message and saves nothing', () => {
    let root = removeMember(sampleRootV3(), 'p1', '2026-10-03T03:00:00.000Z');
    root = { ...root, persons: root.persons.map((p) => (p.id === 'p2' ? { ...p, relation: 'ตัวฉัน' as const } : p)) };
    openLive('#/n/members?open=removed', root);
    const save$ = vi.spyOn(storage, 'saveRoot');
    fireEvent.click(screen.getByRole('button', { name: 'นำกลับ สมาชิก ก' }));
    expect(save$).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent("'ตัวฉัน'");
  });

  it('empty house: empty state with a button, no FAB, no removed section', () => {
    openLive('#/n/members', { ...sampleRootV3(), persons: [], assignments: [], medications: [], events: [], orders: [], prices: [], shops: [], houseItems: [] });
    expect(screen.getByRole('heading', { name: 'ยังไม่มีสมาชิก' })).toBeInTheDocument();
    expect(screen.getByText('เพิ่มคนที่คุณดูแลยาให้')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'เพิ่มสมาชิก' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '#/n/members/new');
  });

  it('a demo keeps ?demo= in its links and writes nothing', () => {
    const save$ = vi.spyOn(storage, 'saveRoot');
    const load$ = vi.spyOn(storage, 'loadRoot');
    open('#/n/members?demo=members&open=removed');
    expect(screen.getByRole('status')).toHaveTextContent('โหมดตัวอย่าง');
    expect(screen.getByRole('link', { name: /คุณพ่อ/ })).toHaveAttribute('href', '#/n/members/p1?demo=members');
    expect(screen.getByRole('link', { name: 'เพิ่มสมาชิก' })).toHaveAttribute('href', '#/n/members/new?demo=members');
    fireEvent.click(screen.getByRole('button', { name: /นำกลับ คุณยาย/ }));
    expect(save$).not.toHaveBeenCalled();
    expect(load$).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('one member (#/n/members/:id)', () => {
  it('header, info card, medicines card with links, allergy line, faded share, red remove', () => {
    openLive('#/n/members/p2');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สมาชิก ข');
    expect(screen.getByRole('link', { name: 'กลับไปหน้ารายชื่อสมาชิก' })).toHaveAttribute('href', '#/n/members');
    expect(screen.getByRole('link', { name: 'แก้ไข' })).toHaveAttribute('href', '#/n/members/p2/edit');
    expect(screen.getByRole('heading', { name: 'ข้อมูลสมาชิก' })).toBeInTheDocument();
    expect(screen.getByText('ปีเกิด')).toBeInTheDocument();
    expect(screen.getByText('พ.ศ. 2500 (อายุ 69 ปี)')).toBeInTheDocument();
    expect(screen.queryByText(/ประกัน/)).toBeNull(); // PR 10 owns coverage
    expect(screen.getByRole('heading', { name: /ยาที่ใช้อยู่ \(2 รายการ\)/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ยาตัวอย่าง B 20 mg/ })).toHaveAttribute('href', '#/n/meds/a2');
    expect(screen.getByRole('link', { name: 'ดูทั้งหมด' })).toHaveAttribute('href', '#/n/meds');
    expect(screen.getByText('ยืนยันแล้วว่าไม่มีประวัติแพ้ยา (บันทึก 28 ต.ค. 69)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'แชร์ให้แพทย์' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'นำสมาชิกออก' })).toBeInTheDocument();
  });

  it('no medicines: empty block, "เพิ่มยา" link with the person, no "ดูทั้งหมด"; unknown allergy line', () => {
    openLive('#/n/members/p5');
    expect(screen.getByRole('heading', { name: /ยาที่ใช้อยู่ \(0 รายการ\)/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'สมาชิก จยังไม่มียา' })).toBeInTheDocument();
    expect(screen.getByText('เพิ่มยาที่หมอสั่ง แล้วดูวันที่ยาพอใช้ได้ที่นี่')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เพิ่มยาให้สมาชิก จ' })).toHaveAttribute('href', '#/n/meds/new?person=p5');
    expect(screen.queryByRole('link', { name: 'ดูทั้งหมด' })).toBeNull();
    expect(screen.getByText('ยังไม่ได้ระบุ')).toBeInTheDocument();
    expect(screen.getByText('ยังไม่ได้บันทึกข้อมูลการแพ้ยา')).toBeInTheDocument();
  });

  it('unknown or removed member: a "not found" page with a way back', () => {
    openLive('#/n/members/nope');
    expect(screen.getByText('ไม่พบสมาชิกคนนี้')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'กลับไปรายชื่อสมาชิก' })).toHaveAttribute('href', '#/n/members');
  });

  it('remove: the sheet asks first; "ไม่นำออก" closes it and saves nothing', () => {
    openLive('#/n/members/p2');
    const save$ = vi.spyOn(storage, 'saveRoot');
    fireEvent.click(screen.getByRole('button', { name: 'นำสมาชิกออก' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('นำสมาชิก ขออกจากรายชื่อไหม')).toBeInTheDocument();
    expect(within(dialog).getByText('ยาของสมาชิก ขจะไม่ขึ้นในหน้าหลักและรายการยา นำกลับได้จากหน้ารายชื่อสมาชิก')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'ไม่นำออก' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(save$).not.toHaveBeenCalled();
  });

  it('remove: "นำออก" saves once (removedAt set, medicines kept), goes to the list and says so', () => {
    openLive('#/n/members/p2?sheet=remove');
    const save$ = vi.spyOn(storage, 'saveRoot');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'นำออก' }));
    expect(save$).toHaveBeenCalledTimes(1);
    const root = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Root;
    expect(root.persons.find((p) => p.id === 'p2')?.removedAt).toBeDefined();
    expect(root.assignments).toHaveLength(sampleRootV3().assignments.length);
    expect(window.location.hash).toBe('#/n/members');
  });

  it('remove in a demo saves nothing', () => {
    open('#/n/members/p1?demo=members&sheet=remove');
    const save$ = vi.spyOn(storage, 'saveRoot');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'นำออก' }));
    expect(save$).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.location.hash).toBe('#/n/members?demo=members');
  });
});

describe('edit a member (#/n/members/:id/edit)', () => {
  it('title, prefilled fields, "นำสมาชิกออก" with its note; back goes to the detail page', () => {
    openLive('#/n/members/p2/edit');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('แก้ไขข้อมูลสมาชิก');
    expect(screen.getByLabelText('ชื่อที่เรียก')).toHaveValue('สมาชิก ข');
    expect(screen.getByLabelText('ปีเกิด (พ.ศ.)')).toHaveValue('2500');
    expect(screen.getByRole('button', { name: 'แม่' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'รูปที่ 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('switch', { name: 'จัดยาทานเอง' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('นำกลับได้จากหน้ารายชื่อสมาชิก')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'นำสมาชิกออก' })).toBeInTheDocument();
  });

  it('save: one saveRoot, only the changed person differs, detail page with "บันทึกแล้ว"', () => {
    openLive('#/n/members/p2/edit');
    const save$ = vi.spyOn(storage, 'saveRoot');
    fireEvent.change(screen.getByLabelText('ชื่อที่เรียก'), { target: { value: 'คุณแม่ใหม่' } });
    fireEvent.click(screen.getByRole('switch', { name: 'จัดยาทานเอง' }));
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
    expect(save$).toHaveBeenCalledTimes(1);
    const root = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Root;
    const was = sampleRootV3().persons[1]!;
    expect(root.persons.find((p) => p.id === 'p2')).toEqual({ ...was, name: 'คุณแม่ใหม่', selfManaged: true });
    expect(window.location.hash).toBe('#/n/members/p2');
  });

  it('the person is left out of the same-name warning and of the "ตัวฉัน" lock', () => {
    openLive('#/n/members/p1/edit'); // p1 is "ตัวฉัน"
    expect(screen.queryByText('มีสมาชิกชื่อนี้แล้ว')).toBeNull();
    expect(screen.getByRole('button', { name: 'ตัวฉัน' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('ชื่อที่เรียก'), { target: { value: 'สมาชิก ข' } });
    expect(screen.getByText('มีสมาชิกชื่อนี้แล้ว')).toBeInTheDocument();
  });

  it('"นำสมาชิกออก" on the edit page opens the same question; confirming goes to the list', () => {
    openLive('#/n/members/p2/edit');
    fireEvent.click(screen.getByRole('button', { name: 'นำสมาชิกออก' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'นำออก' }));
    expect(window.location.hash).toBe('#/n/members');
  });

  it('a demo saves nothing and goes back to the detail page of the demo', () => {
    const save$ = vi.spyOn(storage, 'saveRoot');
    open('#/n/members/p1/edit?demo=members');
    fireEvent.change(screen.getByLabelText('ชื่อที่เรียก'), { target: { value: 'ชื่อทดสอบ' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
    expect(save$).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/n/members/p1?demo=members');
  });

  it('unknown member: not found', () => {
    openLive('#/n/members/nope/edit');
    expect(screen.getByText('ไม่พบสมาชิกคนนี้')).toBeInTheDocument();
  });
});

describe('links into the tab', () => {
  it('Home "จัดการ" is a link to the list', () => {
    openLive('#/n');
    expect(screen.getByRole('link', { name: 'จัดการ' })).toHaveAttribute('href', '#/n/members');
  });
  it('the bottom tab "สมาชิก" is a link on the other pages too', () => {
    openLive('#/n/meds');
    expect(within(screen.getByRole('navigation', { name: 'เมนูหลัก' })).getByRole('link', { name: 'สมาชิก' })).toHaveAttribute('href', '#/n/members');
  });
});
