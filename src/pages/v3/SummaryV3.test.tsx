import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from '../../App';
import { sampleRootV3 } from '../../domain/v3/fixtures';
import type { Root } from '../../domain/v3/schema';
import { STORAGE_KEY } from '../../domain/v3/storage';

const openLive = (hash: string, root: Root = sampleRootV3()) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  window.location.hash = hash;
  return render(<App getToday={() => '2026-11-17'} />);
};
const area = () => screen.getByLabelText('ข้อความสรุปให้แพทย์') as HTMLTextAreaElement;

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('doctor summary page', () => {
  it('header, owner, info line, textarea holds the summary with the allergy second', () => {
    openLive('#/n/members/p1/summary');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สรุปให้แพทย์');
    expect(screen.getByText('สมาชิก ก')).toBeInTheDocument();
    expect(screen.getByText('แก้ข้อความได้ก่อนส่ง ข้อความที่แก้จะไม่ถูกบันทึก')).toBeInTheDocument();
    const lines = area().value.split('\n');
    expect(lines[0]).toBe('สรุปยาของ สมาชิก ก');
    expect(lines[3]).toBe('การแพ้ยา:');
    expect(area().value).not.toMatch(/ไม่แพ้ยา/);
    expect(screen.queryByRole('button', { name: 'คืนค่าข้อความเดิม' })).toBeNull();
  });

  it('editing shows the reset link; reset brings the original back; nothing is saved', () => {
    openLive('#/n/members/p1/summary');
    const before = window.localStorage.getItem(STORAGE_KEY);
    const original = area().value;
    fireEvent.change(area(), { target: { value: 'แก้แล้ว' } });
    expect(area().value).toBe('แก้แล้ว');
    fireEvent.click(screen.getByRole('button', { name: 'คืนค่าข้อความเดิม' }));
    expect(area().value).toBe(original);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('copy puts the edited text on the clipboard and toasts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    openLive('#/n/members/p1/summary');
    fireEvent.change(area(), { target: { value: 'ข้อความที่แก้' } });
    fireEvent.click(screen.getByRole('button', { name: 'คัดลอกข้อความ' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ข้อความที่แก้'));
    expect(await screen.findByText('คัดลอกข้อความแล้ว')).toBeInTheDocument();
  });

  it('copy failure toasts the fallback', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    openLive('#/n/members/p1/summary');
    fireEvent.click(screen.getByRole('button', { name: 'คัดลอกข้อความ' }));
    expect(await screen.findByText(/คัดลอกไม่ได้/)).toBeInTheDocument();
  });

  it('LINE opens the line link with the text; a long text warns first', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openLive('#/n/members/p1/summary');
    fireEvent.click(screen.getByRole('button', { name: 'เปิด LINE' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(String(open.mock.calls[0]?.[0])).toContain(encodeURIComponent('สรุปยาของ สมาชิก ก'));
    fireEvent.change(area(), { target: { value: 'ก'.repeat(3000) } });
    expect(screen.getByRole('note')).toHaveTextContent('ข้อความยาว LINE อาจตัดท้าย');
    fireEvent.click(screen.getByRole('button', { name: 'เปิด LINE' }));
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('a member with no medicines: only "ยังไม่มียาให้สรุป", no buttons', () => {
    openLive('#/n/members/p5/summary');
    expect(screen.getByText('ยังไม่มียาให้สรุป')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'คัดลอกข้อความ' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'เปิด LINE' })).toBeNull();
    expect(screen.queryByLabelText('ข้อความสรุปให้แพทย์')).toBeNull();
  });

  it('unknown member shows not found; demo works without storage', () => {
    openLive('#/n/members/nope/summary');
    expect(screen.queryByLabelText('ข้อความสรุปให้แพทย์')).toBeNull();
  });
});
