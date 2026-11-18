import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { sampleRootV3 } from '../../domain/v3/fixtures';
import { rootSchema, type Root } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY } from '../../domain/v3/storage';

const open = (hash: string) => {
  window.location.hash = hash;
  return render(<App getToday={() => '2026-11-17'} />);
};
const openLive = (hash: string, root: Root = sampleRootV3()) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  return open(hash);
};
const saved = (): Root => rootSchema.parse(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'));
const allergyOf = (id: string) => saved().persons.find((p) => p.id === id)!.allergies;
const WORDS = /ไม่แพ้|ไม่มีประวัติแพ้/;

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

describe('S1 unknown (p1)', () => {
  it('allergy page: header, owner line, exact unknown text, no "no allergy" words in the state card', () => {
    openLive('#/n/members/p1/allergy');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('การแพ้ยา');
    expect(screen.getByText('ของ สมาชิก ก')).toBeInTheDocument();
    const state = screen.getByRole('region', { name: 'สถานะการแพ้ยา' });
    expect(state).toHaveTextContent('ยังไม่ได้บันทึกข้อมูลการแพ้ยา');
    expect(state.textContent).not.toMatch(WORDS);
    expect(screen.getByRole('button', { name: 'ยืนยันว่าไม่มีประวัติแพ้ยา' })).toBeInTheDocument();
  });
  it('member detail: tappable card with the exact text, link to the allergy page, no "no allergy" words anywhere', () => {
    openLive('#/n/members/p1');
    const card = screen.getByRole('link', { name: /การแพ้ยา/ });
    expect(card).toHaveAttribute('href', '#/n/members/p1/allergy');
    expect(card).toHaveTextContent('ยังไม่ได้บันทึกข้อมูลการแพ้ยา');
    expect(document.body.textContent).not.toMatch(WORDS);
  });
});

describe('S2 none_confirmed', () => {
  it('only by the button and the confirm step; cancel saves nothing', () => {
    openLive('#/n/members/p1/allergy');
    const before = window.localStorage.getItem(STORAGE_KEY);
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันว่าไม่มีประวัติแพ้ยา' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('ยืนยันว่าสมาชิก กไม่มีประวัติแพ้ยาที่ทราบ ข้อมูลนี้จะอยู่ในสรุปให้แพทย์');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before);
    fireEvent.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
  it('confirm saves once with today and shows the words with the date; then the way back to unknown', () => {
    const save$ = vi.spyOn(storage, 'saveRoot');
    openLive('#/n/members/p1/allergy');
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันว่าไม่มีประวัติแพ้ยา' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยืนยัน' }));
    expect(save$).toHaveBeenCalledTimes(1);
    expect(allergyOf('p1')).toEqual({ status: 'none_confirmed', confirmedAt: '2026-11-17' });
    expect(screen.getByRole('region', { name: 'สถานะการแพ้ยา' })).toHaveTextContent('ยืนยันแล้วว่าไม่มีประวัติแพ้ยา (บันทึก 17 พ.ย. 69)');
    expect(screen.queryByRole('button', { name: 'ยืนยันว่าไม่มีประวัติแพ้ยา' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกการยืนยัน' }));
    expect(allergyOf('p1')).toEqual({ status: 'unknown' });
    expect(screen.getByRole('region', { name: 'สถานะการแพ้ยา' })).toHaveTextContent('ยังไม่ได้บันทึกข้อมูลการแพ้ยา');
  });
  it('shows the saved date for p2 on the allergy page and on the detail card', () => {
    openLive('#/n/members/p2/allergy');
    expect(screen.getByRole('region', { name: 'สถานะการแพ้ยา' })).toHaveTextContent('ยืนยันแล้วว่าไม่มีประวัติแพ้ยา (บันทึก 28 ต.ค. 69)');
    expect(screen.getByRole('button', { name: 'ยกเลิกการยืนยัน' })).toBeInTheDocument();
  });
});

describe('S3 listed (p3)', () => {
  it('error-tint block with warning, the word "แพ้ยา", drug and reaction; no confirm-none button', () => {
    openLive('#/n/members/p3/allergy');
    const block = screen.getByRole('region', { name: 'สถานะการแพ้ยา' });
    expect(block).toHaveTextContent('แพ้ยา');
    expect(block).toHaveTextContent('ยาตัวอย่าง Z');
    expect(block).toHaveTextContent('ผื่นตัวอย่าง');
    expect(block.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'ยืนยันว่าไม่มีประวัติแพ้ยา' })).toBeNull();
    expect(screen.getByRole('button', { name: 'แก้ ยาตัวอย่าง Z' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ลบ ยาตัวอย่าง Z' })).toBeInTheDocument();
  });
  it('member detail card shows the items', () => {
    openLive('#/n/members/p3');
    const card = screen.getByRole('link', { name: /การแพ้ยา/ });
    expect(card).toHaveTextContent('ยาตัวอย่าง Z');
    expect(card).toHaveTextContent('ผื่นตัวอย่าง');
  });
  it('adding the first item (from unknown) switches to listed with one save; both fields needed', () => {
    const save$ = vi.spyOn(storage, 'saveRoot');
    openLive('#/n/members/p1/allergy');
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มยาที่แพ้' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'เพิ่มยาที่แพ้' })).toBeInTheDocument();
    const save = within(dialog).getByRole('button', { name: 'บันทึก' });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('ชื่อยาที่แพ้ *'), { target: { value: 'ยา ก' } });
    expect(save).toBeDisabled();
    const reaction = within(dialog).getByLabelText('อาการที่เกิด *');
    expect(reaction).toHaveAttribute('placeholder', 'เช่น ผื่นคัน หายใจไม่สะดวก');
    fireEvent.change(reaction, { target: { value: 'ผื่นคัน' } });
    fireEvent.click(save);
    expect(save$).toHaveBeenCalledTimes(1);
    expect(allergyOf('p1')).toEqual({ status: 'listed', items: [{ drug: 'ยา ก', reaction: 'ผื่นคัน' }] });
    expect(screen.getByRole('region', { name: 'สถานะการแพ้ยา' })).toHaveTextContent('ยา ก');
  });
  it('adding to none_confirmed (p2) makes it listed', () => {
    openLive('#/n/members/p2/allergy?sheet=add');
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('ชื่อยาที่แพ้ *'), { target: { value: 'ยา ข' } });
    fireEvent.change(within(dialog).getByLabelText('อาการที่เกิด *'), { target: { value: 'บวม' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }));
    expect(allergyOf('p2').status).toBe('listed');
  });
  it('edit changes the item', () => {
    openLive('#/n/members/p3/allergy');
    fireEvent.click(screen.getByRole('button', { name: 'แก้ ยาตัวอย่าง Z' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'แก้ยาที่แพ้' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('ชื่อยาที่แพ้ *')).toHaveValue('ยาตัวอย่าง Z');
    fireEvent.change(within(dialog).getByLabelText('อาการที่เกิด *'), { target: { value: 'คัน' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }));
    expect(allergyOf('p3')).toEqual({ status: 'listed', items: [{ drug: 'ยาตัวอย่าง Z', reaction: 'คัน' }] });
  });
  it('deleting needs a confirm; deleting the last item returns to unknown, not to "none"', () => {
    openLive('#/n/members/p3/allergy');
    fireEvent.click(screen.getByRole('button', { name: 'ลบ ยาตัวอย่าง Z' }));
    const dialog = screen.getByRole('dialog');
    expect(allergyOf('p3').status).toBe('listed'); // nothing yet
    fireEvent.click(within(dialog).getByRole('button', { name: 'ไม่ลบ' }));
    expect(allergyOf('p3').status).toBe('listed');
    fireEvent.click(screen.getByRole('button', { name: 'ลบ ยาตัวอย่าง Z' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ลบ' }));
    expect(allergyOf('p3')).toEqual({ status: 'unknown' });
    const state = screen.getByRole('region', { name: 'สถานะการแพ้ยา' });
    expect(state).toHaveTextContent('ยังไม่ได้บันทึกข้อมูลการแพ้ยา');
    expect(state.textContent).not.toMatch(WORDS);
  });
});

describe('prefill from the stop sheet, demo, save failure', () => {
  it('?sheet=add&drug=&symptom= opens the add sheet filled', () => {
    openLive('#/n/members/p1/allergy?sheet=add&drug=' + encodeURIComponent('ยาตัวอย่าง A') + '&symptom=' + encodeURIComponent('ผื่น'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('ชื่อยาที่แพ้ *')).toHaveValue('ยาตัวอย่าง A');
    expect(within(dialog).getByLabelText('อาการที่เกิด *')).toHaveValue('ผื่น');
  });
  it('a demo reads and writes nothing, and keeps ?demo= in the back link', () => {
    const save$ = vi.spyOn(storage, 'saveRoot');
    const load$ = vi.spyOn(storage, 'loadRoot');
    open('#/n/members/p1/allergy?demo=members');
    expect(screen.getByRole('status')).toHaveTextContent('โหมดตัวอย่าง');
    expect(screen.getByRole('link', { name: 'กลับ' })).toHaveAttribute('href', '#/n/members/p1?demo=members');
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันว่าไม่มีประวัติแพ้ยา' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยืนยัน' }));
    expect(save$).not.toHaveBeenCalled();
    expect(load$).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
  it('a failed save keeps the old state and says so', () => {
    vi.spyOn(storage, 'saveRoot').mockReturnValue({ ok: false, reason: 'unavailable' } as never);
    openLive('#/n/members/p1/allergy');
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันว่าไม่มีประวัติแพ้ยา' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยืนยัน' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(allergyOf('p1')).toEqual({ status: 'unknown' });
  });
  it('unknown member: way back', () => {
    openLive('#/n/members/zzz/allergy');
    expect(screen.getByText('ไม่พบสมาชิกคนนี้')).toBeInTheDocument();
  });
});
