// Screen tests for step 3.4: `#/members/:id/share`. The picture maker is replaced (jsdom has no canvas); its real drawing is checked in a
// real browser (see HANDOFF). Made-up data only: the owner's example house, today = 2026-10-20.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));
vi.mock('./components/summaryImage', () => ({ renderSummaryImages: vi.fn() }));

import { App } from './App';
import { renderSummaryImages, type ImageResult } from './components/summaryImage';
import { doctorSummary, summaryText } from './domain/doctorSummary';
import { house, TODAY } from './domain/doctorExample.test-util';
import { person, rootWith } from './domain/helpers.test-util';
import { type Root } from './domain/schema';
import { PREV_KEY, saveRoot, STORAGE_KEY } from './domain/storage';

const getToday = () => TODAY;
const render2 = vi.mocked(renderSummaryImages);
const pngs = (n: number): ImageResult => ({ ok: true, pages: Array.from({ length: n }, (_, i) => new Blob([`png${i}`], { type: 'image/png' })) });

const seed = (root: Root) => expect(saveRoot(root).ok).toBe(true);
const open = (hash: string, root: Root = house()) => {
  seed(root);
  window.location.hash = hash;
  return render(<App getToday={getToday} />);
};
const text = (): string => {
  const s = doctorSummary(house(), 'pA', TODAY);
  if (!s) throw new Error('summary');
  return summaryText(s);
};
const box = () => screen.getByRole('textbox', { name: 'ข้อความ' }) as HTMLTextAreaElement;
const ready = async () => screen.findAllByRole('img');

let urlN = 0;
let revoke: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
  window.location.hash = '';
  urlN = 0;
  revoke = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => `blob:test-${++urlN}`), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true });
  render2.mockReset();
  render2.mockResolvedValue(pngs(2));
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ['clipboard', 'share', 'canShare']) Reflect.deleteProperty(navigator, k);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
});

const setNav = (name: 'share' | 'canShare' | 'clipboard', value: unknown) => Object.defineProperty(navigator, name, { value, configurable: true });

describe('share page (#/members/:id/share)', () => {
  it('shows the title, the warning, the pictures with a short alt, and the text of the owner example', async () => {
    open('#/members/pA/share');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('แชร์ให้แพทย์');
    expect(screen.getByText('ภาพนี้มีชื่อและรายการยาของสมาชิก ตรวจดูก่อนส่ง และส่งให้เฉพาะแพทย์หรือเภสัชกรที่ดูแลเท่านั้น')).toBeInTheDocument();
    const imgs = await ready();
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute('alt', 'ภาพสรุปยาของ สมาชิกทดสอบ ก หน้า 1 จาก 2');
    expect(imgs[1]).toHaveAttribute('alt', 'ภาพสรุปยาของ สมาชิกทดสอบ ก หน้า 2 จาก 2');
    expect(box().value).toBe(text());
    expect(box()).toHaveAttribute('readonly');
    expect(box().value).toContain('การแพ้ยา: แอพนี้ยังไม่มีข้อมูลการแพ้ยา — โปรดสอบถามผู้ป่วยหรือญาติ');
    expect(box().value).not.toContain('สมาชิกทดสอบ ข');
  });

  it('says "กำลังสร้างภาพ…" while the pictures are made, not a blank page', async () => {
    let done: (r: ImageResult) => void = () => {};
    render2.mockReturnValue(new Promise((r) => (done = r)));
    open('#/members/pA/share');
    expect(screen.getByText('กำลังสร้างภาพ…')).toBeInTheDocument();
    expect(box().value).toBe(text());
    expect(screen.queryByRole('button', { name: 'แชร์ภาพ' })).not.toBeInTheDocument();
    await act(async () => done(pngs(1)));
    expect(await ready()).toHaveLength(1);
    expect(screen.queryByText('กำลังสร้างภาพ…')).not.toBeInTheDocument();
  });

  it('the back button goes to the member page', () => {
    open('#/members/pA/share');
    const links = screen.getAllByRole('link', { name: 'กลับหน้าสมาชิก' });
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l).toHaveAttribute('href', '#/members/pA');
  });

  it('copy writes exactly the text on screen and says "คัดลอกแล้ว"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNav('clipboard', { writeText });
    open('#/members/pA/share');
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'คัดลอกข้อความ' }));
    await screen.findByText('คัดลอกแล้ว');
    expect(writeText).toHaveBeenCalledWith(box().value);
    expect(writeText).toHaveBeenCalledWith(text());
  });

  it('a refused copy says how to copy by hand', async () => {
    setNav('clipboard', { writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    open('#/members/pA/share');
    fireEvent.click(screen.getByRole('button', { name: 'คัดลอกข้อความ' }));
    expect(await screen.findByText('คัดลอกไม่ได้ ลองกดค้างที่ข้อความแล้วเลือกคัดลอกเอง')).toBeInTheDocument();
  });

  it('the LINE link carries the text and opens safely in a new tab', async () => {
    open('#/members/pA/share');
    await ready();
    const a = screen.getByRole('link', { name: 'เปิด LINE' });
    expect(a).toHaveAttribute('href', 'https://line.me/R/msg/text/?' + encodeURIComponent(box().value));
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('can share files: navigator.share gets every PNG page and the text', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNav('canShare', vi.fn(() => true));
    setNav('share', share);
    open('#/members/pA/share');
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'แชร์ภาพ' }));
    expect(await screen.findByText('แชร์ภาพแล้ว')).toBeInTheDocument();
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0]?.[0] as { files: File[]; text: string };
    expect(arg.files.map((f) => f.name)).toEqual(['judya-summary-2026-10-20-1.png', 'judya-summary-2026-10-20-2.png']);
    expect(arg.files.every((f) => f.type === 'image/png')).toBe(true);
    expect(arg.files.some((f) => f.name.includes('สมาชิก'))).toBe(false);
    expect(arg.text).toBe(text());
  });

  it('cannot share files: downloads each picture and says to open LINE', async () => {
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    open('#/members/pA/share');
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'แชร์ภาพ' }));
    expect(await screen.findByText('บันทึกภาพไว้แล้ว เปิด LINE แล้วเลือกรูปจากเครื่อง', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(names).toEqual(['judya-summary-2026-10-20-1.png', 'judya-summary-2026-10-20-2.png']);
  });

  it('closing the share sheet is not an error: no download, no alert', async () => {
    setNav('canShare', vi.fn(() => true));
    setNav('share', vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    open('#/members/pA/share');
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'แชร์ภาพ' }));
    expect(await screen.findByText('ยกเลิกการแชร์แล้ว')).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('another share failure falls back to the download', async () => {
    setNav('canShare', vi.fn(() => true));
    setNav('share', vi.fn().mockRejectedValue(new Error('boom')));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render2.mockResolvedValue(pngs(1));
    open('#/members/pA/share');
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'แชร์ภาพ' }));
    await screen.findByText('บันทึกภาพไว้แล้ว เปิด LINE แล้วเลือกรูปจากเครื่อง');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it.each<[string, ImageResult | Error]>([
    ['no canvas', { ok: false, reason: 'no_canvas' }],
    ['font not loaded', { ok: false, reason: 'font' }],
    ['the maker throws', new Error('boom')],
  ])('pictures cannot be made (%s): a sentence explains, the text and its buttons still work, no share button', async (_name, result) => {
    if (result instanceof Error) render2.mockRejectedValue(result);
    else render2.mockResolvedValue(result);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNav('clipboard', { writeText });
    open('#/members/pA/share');
    expect(await screen.findByText(/ใช้ข้อความด้านล่างคัดลอกไปส่งแทนได้/)).toBeInTheDocument();
    expect(screen.queryByText('กำลังสร้างภาพ…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'แชร์ภาพ' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(box().value).toBe(text());
    fireEvent.click(screen.getByRole('button', { name: 'คัดลอกข้อความ' }));
    await screen.findByText('คัดลอกแล้ว');
    expect(screen.getByRole('link', { name: 'เปิด LINE' })).toBeInTheDocument();
  });

  it('a member with no medicine at all: "ยังไม่มียาให้สรุป", no pictures made, no share / copy / LINE', () => {
    const root = rootWith({ persons: [person({ id: 'pE', name: 'สมาชิกทดสอบ ว่าง' })] });
    open('#/members/pE/share', root);
    expect(screen.getByText('ยังไม่มียาให้สรุป')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'เปิด LINE' })).not.toBeInTheDocument();
    expect(render2).not.toHaveBeenCalled();
  });

  it('only stopped medicines still make a summary', async () => {
    const root = house();
    root.assignments = root.assignments.filter((a) => a.personId !== 'pA' || a.status === 'stopped');
    open('#/members/pA/share', root);
    await ready();
    expect(box().value).toContain('ยังไม่มียาที่ใช้อยู่');
  });

  it('a removed member and an unknown id give a polite "ไม่พบสมาชิก" with a way back', () => {
    for (const id of ['pR', 'zzz']) {
      const { unmount } = open(`#/members/${id}/share`);
      expect(screen.getByText(/ไม่พบสมาชิก/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'กลับสมาชิกในบ้าน' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'แชร์ภาพ' })).not.toBeInTheDocument();
      unmount();
    }
    expect(render2).not.toHaveBeenCalled();
  });

  it('the member page has the link "แชร์ให้แพทย์" to that member', () => {
    open('#/members/pA');
    expect(screen.getByRole('link', { name: 'แชร์ให้แพทย์' })).toHaveAttribute('href', '#/members/pA/share');
  });

  it('opening, sharing and copying never call setItem / removeItem and leave judya.v2 as it was', async () => {
    setNav('clipboard', { writeText: vi.fn().mockResolvedValue(undefined) });
    setNav('canShare', vi.fn(() => true));
    setNav('share', vi.fn().mockResolvedValue(undefined));
    seed(house());
    const before = localStorage.getItem(STORAGE_KEY);
    const keys = Object.keys(localStorage).sort();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    window.location.hash = '#/members/pA/share';
    render(<App getToday={getToday} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'แชร์ภาพ' }));
    await screen.findByText('แชร์ภาพแล้ว');
    fireEvent.click(screen.getByRole('button', { name: 'คัดลอกข้อความ' }));
    await screen.findByText('คัดลอกแล้ว');
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(Object.keys(localStorage).sort()).toEqual(keys);
  });

  it('sends nothing over the network', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    open('#/members/pA/share');
    await ready();
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('releases the picture addresses when the page is left', async () => {
    const { unmount } = open('#/members/pA/share');
    await ready();
    expect(revoke).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(revoke.mock.calls.map((c) => c[0]).sort()).toEqual(['blob:test-1', 'blob:test-2']));
  });
});
