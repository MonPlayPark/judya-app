import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));
vi.mock('../../domain/v3/orderMessage', async (orig) => ({ ...(await orig<typeof import('../../domain/v3/orderMessage')>()), lineLinkIsLong: vi.fn(() => false) }));

import { sampleRootV3 } from '../../domain/v3/fixtures';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { orderDemoRoot, DEMO_RECIPIENT, type OrderDemoName } from '../../domain/v3/orderDemo';
import * as message from '../../domain/v3/orderMessage';
import { recipientOf } from '../../domain/v3/recipient';
import { rootSchema } from '../../domain/v3/schema';
import * as storage from '../../domain/v3/storage';
import { STORAGE_KEY, type KeyValueStore } from '../../domain/v3/storage';
import { OrderV3Route } from './OrderPage';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
};
const demo = (name: OrderDemoName, extra = '') => {
  window.location.hash = `#/n/order?demo=${name}${extra}`;
  return render(<OrderV3Route />);
};
const live = (store: KeyValueStore, extra = '') => {
  window.location.hash = `#/n/order${extra ? `?${extra.replace(/^&/, '')}` : ''}`;
  return render(<OrderV3Route getToday={() => DEMO_TODAY} store={store} />);
};
const preview = (): string => screen.getByLabelText('ตัวอย่างข้อความ').textContent ?? '';
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const writeText = vi.fn(async (_t: string) => {});

beforeEach(() => {
  window.location.hash = '';
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe('the recipient bar and the switch', () => {
  it('empty: says that no recipient is entered; with a recipient: name and phone', () => {
    demo('normal');
    expect(screen.getByRole('button', { name: /ข้อมูลผู้รับ: ยังไม่ได้ใส่ข้อมูลผู้รับ/ })).toBeInTheDocument();
    expect(screen.getByText('ยังไม่ได้ใส่ข้อมูลผู้รับ')).toBeInTheDocument();
  });
  it('with a recipient (demo link) the bar shows name and phone', () => {
    demo('normal', '&recipient=full');
    expect(screen.getByText(`${DEMO_RECIPIENT.name} · ${DEMO_RECIPIENT.phone}`)).toBeInTheDocument();
  });
  it('delivery is the start; the switch gives the pick-up text; the message has the header and numbered lines', () => {
    demo('normal', '&recipient=full');
    expect(screen.getByRole('button', { name: 'ส่งถึงบ้าน' })).toHaveAttribute('aria-pressed', 'true');
    expect(preview().startsWith('สั่งยาค่ะ\n\n1) ')).toBe(true);
    expect(preview()).toContain(`ส่ง ${DEMO_RECIPIENT.address}`);
    press('มารับเอง');
    expect(screen.getByRole('button', { name: 'มารับเอง' })).toHaveAttribute('aria-pressed', 'true');
    expect(preview()).toContain('มารับเองค่ะ');
    expect(preview()).not.toContain(DEMO_RECIPIENT.address);
    expect(preview().endsWith(`${DEMO_RECIPIENT.name} ${DEMO_RECIPIENT.phone}`)).toBe(true);
  });
  it('unticking a line takes it out of the message; nothing ticked = buttons off and an empty box', () => {
    demo('normal');
    for (const box of screen.getAllByRole('checkbox')) if ((box as HTMLInputElement).checked) fireEvent.click(box);
    expect(preview()).toBe('ติ๊กยาที่ต้องการสั่ง แล้วข้อความจะขึ้นที่นี่');
    expect(screen.getByRole('button', { name: 'คัดลอกข้อความ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ส่งทาง LINE' })).toBeDisabled();
  });
  it('no member name reaches the message (made-up members of the demo house)', () => {
    demo('normal', '&recipient=full');
    for (const mode of ['ส่งถึงบ้าน', 'มารับเอง']) {
      press(mode);
      for (const p of orderDemoRoot('normal').persons) expect(preview()).not.toContain(p.name);
    }
  });
});

describe('the recipient sheet (demo: memory only)', () => {
  it('opens from the bar with three boxes; saving shows the new bar and the new message, and writes no storage', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const save = vi.spyOn(storage, 'saveRoot');
    demo('normal');
    press(/ข้อมูลผู้รับ:/);
    const dialog = screen.getByRole('dialog', { name: 'ข้อมูลผู้รับ' });
    expect(within(dialog).getByLabelText(/ที่อยู่/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('ชื่อผู้รับ')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('เบอร์โทร')).toBeInTheDocument();
    type(/ที่อยู่/, '  บ้านเลขที่ 1 ซอยตัวอย่าง  ');
    type('ชื่อผู้รับ', ' คุณสมมติ ');
    type('เบอร์โทร', '081-000-0000');
    press('บันทึก');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('คุณสมมติ · 081-000-0000')).toBeInTheDocument();
    expect(preview()).toContain('ส่ง บ้านเลขที่ 1 ซอยตัวอย่าง');
    expect(save).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
  it('too long or a wrong phone stays in the sheet with a message under the box', () => {
    demo('normal');
    press(/ข้อมูลผู้รับ:/);
    type(/ที่อยู่/, 'ก'.repeat(301));
    type('เบอร์โทร', '081-abc');
    press('บันทึก');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('ที่อยู่ยาวได้ไม่เกิน 300 ตัวอักษร')).toBeInTheDocument();
    expect(screen.getByText('เบอร์โทรใส่ได้เฉพาะตัวเลข เครื่องหมาย + - และเว้นวรรค')).toBeInTheDocument();
    type('เบอร์โทร', '081-000');
    expect(screen.queryByText(/เบอร์โทรใส่ได้เฉพาะ/)).toBeNull(); // typing clears that box's message
  });
});

describe('copy and LINE', () => {
  it('complete recipient: copy puts exactly the preview text on the clipboard', async () => {
    demo('normal', '&recipient=full');
    const text = preview();
    press('คัดลอกข้อความ');
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(text));
    expect(await screen.findByText('คัดลอกข้อความแล้ว')).toBeInTheDocument();
  });
  it('a clipboard that refuses: says so and does not pretend', async () => {
    writeText.mockRejectedValueOnce(new Error('no'));
    demo('normal', '&recipient=full');
    press('คัดลอกข้อความ');
    expect(await screen.findByText(/คัดลอกไม่ได้/)).toBeInTheDocument();
  });
  it('LINE opens line.me/R/msg/text/ with the text, line breaks as %0A, in a new tab without opener', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    demo('normal', '&recipient=full');
    const text = preview();
    press('ส่งทาง LINE');
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0]!;
    expect(String(url).startsWith('https://line.me/R/msg/text/?')).toBe(true);
    expect(String(url)).toContain('%0A%0A');
    expect(decodeURIComponent(String(url).slice('https://line.me/R/msg/text/?'.length))).toBe(text);
    expect(target).toBe('_blank');
    expect(features).toContain('noopener');
  });
  it('a long message: the warning shows (before pressing and as a toast), the LINE button is NOT disabled and still opens LINE', () => {
    vi.mocked(message.lineLinkIsLong).mockReturnValue(true);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    demo('normal', '&recipient=full');
    expect(screen.getByText('ข้อความยาว LINE อาจตัดท้าย แนะนำใช้คัดลอกข้อความ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ส่งทาง LINE' })).toBeEnabled();
    press('ส่งทาง LINE');
    expect(open).toHaveBeenCalledTimes(1);
    expect(String(open.mock.calls[0]![0]).startsWith('https://line.me/R/msg/text/?')).toBe(true);
    expect(screen.getAllByText('ข้อความยาว LINE อาจตัดท้าย แนะนำใช้คัดลอกข้อความ').length).toBeGreaterThan(1); // note + toast
    vi.mocked(message.lineLinkIsLong).mockReturnValue(false);
  });
  it('a short message shows no warning', () => {
    demo('normal', '&recipient=full');
    expect(screen.queryByText(/อาจตัดท้าย/)).toBeNull();
  });
});

describe('recipient not complete when copy / LINE is pressed', () => {
  it('delivery needs address, name and phone: the sheet opens and says what is missing', () => {
    demo('normal', '&recipient=full');
    press(/ข้อมูลผู้รับ:/);
    type(/ที่อยู่/, '');
    press('บันทึก');
    press('คัดลอกข้อความ');
    const dialog = screen.getByRole('dialog', { name: 'ข้อมูลผู้รับยังไม่ครบ' });
    expect(within(dialog).getByText('ยังไม่ได้ใส่: ที่อยู่')).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });
  it('pick-up needs only name and phone: no sheet when the address is missing', async () => {
    demo('normal');
    press(/ข้อมูลผู้รับ:/);
    type('ชื่อผู้รับ', 'คุณสมมติ');
    type('เบอร์โทร', '081-000-0000');
    press('บันทึก');
    press('มารับเอง');
    press('คัดลอกข้อความ');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(writeText).toHaveBeenCalled());
  });
  it('"ส่งโดยไม่ใส่ผู้รับ" (all boxes emptied) sends the message without any recipient line and saves nothing', async () => {
    const save = vi.spyOn(storage, 'saveRoot');
    demo('normal', '&recipient=full');
    press(/ข้อมูลผู้รับ:/);
    type('เบอร์โทร', '');
    press('บันทึก');
    press('คัดลอกข้อความ');
    type(/ที่อยู่/, '');
    type('ชื่อผู้รับ', '');
    press('ส่งโดยไม่ใส่ผู้รับ');
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const sent = writeText.mock.calls[0]![0];
    expect(sent).not.toContain(DEMO_RECIPIENT.name);
    expect(sent).not.toContain(DEMO_RECIPIENT.address);
    expect(sent.endsWith('\n\n1) ')).toBe(false);
    expect(sent.startsWith('สั่งยาค่ะ\n\n1) ')).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
  it('partly typed: the skip button reads "ส่งเท่าที่กรอกไว้" and sends only what is typed (missing parts left out), saving nothing', async () => {
    const save = vi.spyOn(storage, 'saveRoot');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    demo('normal');
    press('คัดลอกข้อความ');
    expect(screen.getByRole('button', { name: 'ส่งโดยไม่ใส่ผู้รับ' })).toBeInTheDocument(); // all boxes empty
    type('ชื่อผู้รับ', 'คุณสมมติ');
    expect(screen.queryByRole('button', { name: 'ส่งโดยไม่ใส่ผู้รับ' })).toBeNull();
    press('ส่งเท่าที่กรอกไว้');
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const sent = writeText.mock.calls[0]![0];
    expect(sent.endsWith('\n\nคุณสมมติ')).toBe(true);
    expect(sent).not.toContain('ส่ง บ้าน'); // no address typed: no "ส่ง" line
    expect(save).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(screen.getByText('ยังไม่ได้ใส่ข้อมูลผู้รับ')).toBeInTheDocument(); // the bar still shows nothing saved
  });
  it('the skip button with a wrong value in a box stays in the sheet with the message', () => {
    demo('normal');
    press('คัดลอกข้อความ');
    type('เบอร์โทร', 'abc');
    press('ส่งเท่าที่กรอกไว้');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });
  it('"บันทึกแล้วส่ง" with a bad phone does neither (stays in the sheet)', () => {
    demo('normal');
    press('คัดลอกข้อความ');
    type('เบอร์โทร', 'abc');
    press('บันทึกแล้วส่ง');
    expect(screen.getByRole('dialog', { name: 'ข้อมูลผู้รับยังไม่ครบ' })).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });
  it('the cancel button closes the sheet and sends nothing', () => {
    demo('normal');
    press('ส่งทาง LINE');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    press('ยกเลิก');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('real data: the recipient is saved through saveRoot, nothing else is', () => {
  const start = () => {
    const store = memoryStore();
    expect(storage.saveRoot(sampleRootV3(), store)).toEqual({ ok: true });
    return store;
  };

  it('"บันทึกแล้วส่ง" writes the three settings to judya.v3 and then copies the new text', async () => {
    const store = start();
    const before = JSON.parse(store.data[STORAGE_KEY]!);
    live(store);
    press('คัดลอกข้อความ');
    type(/ที่อยู่/, ' บ้านเลขที่ 99 ซอยตัวอย่าง ');
    type('ชื่อผู้รับ', 'คุณสมมติ');
    type('เบอร์โทร', '081-000-0000');
    press('บันทึกแล้วส่ง');
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]![0]).toContain('ส่ง บ้านเลขที่ 99 ซอยตัวอย่าง\n\nคุณสมมติ 081-000-0000');
    const after = JSON.parse(store.data[STORAGE_KEY]!);
    expect(after.settings).toEqual({ ...before.settings, recipientAddress: 'บ้านเลขที่ 99 ซอยตัวอย่าง', recipientName: 'คุณสมมติ', recipientPhone: '081-000-0000' });
    expect({ ...after, settings: before.settings }).toEqual(before); // every table, orders included, is as it was
    expect(after.orders).toEqual(before.orders);
    expect(Object.keys(store.data)).toEqual([STORAGE_KEY]);
    expect(rootSchema.safeParse(after).success).toBe(true);
    expect(recipientOf(after)).toEqual({ address: 'บ้านเลขที่ 99 ซอยตัวอย่าง', name: 'คุณสมมติ', phone: '081-000-0000' });
  });

  it('the saved recipient is there after the page is opened again', () => {
    const store = start();
    const first = live(store);
    press(/ข้อมูลผู้รับ:/);
    type('ชื่อผู้รับ', 'คุณสมมติ');
    press('บันทึก');
    first.unmount();
    live(store);
    expect(screen.getByText('คุณสมมติ')).toBeInTheDocument();
  });

  it('pressing copy / LINE, switching the mode and looking at the preview write nothing', async () => {
    const store = start();
    const before = JSON.stringify(store.data);
    vi.spyOn(window, 'open').mockReturnValue(null);
    live(store);
    press('มารับเอง');
    press('คัดลอกข้อความ');
    press('ส่งโดยไม่ใส่ผู้รับ');
    await act(async () => {});
    press('ส่งถึงบ้าน');
    press('ส่งทาง LINE');
    type('ชื่อผู้รับ', 'คุณสมมติ');
    press('ส่งเท่าที่กรอกไว้');
    await act(async () => {});
    expect(JSON.stringify(store.data)).toBe(before);
  });

  it('a save that fails: the message is shown, the bar stays empty, nothing is copied, the old data stays', async () => {
    const store = start();
    const before = store.data[STORAGE_KEY];
    live(store);
    vi.spyOn(store, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    press('คัดลอกข้อความ');
    type('ชื่อผู้รับ', 'คุณสมมติ');
    press('บันทึกแล้วส่ง');
    expect(await screen.findByRole('alert')).toHaveTextContent('บันทึกไม่ได้');
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(store.data[STORAGE_KEY]).toBe(before);
  });
});
