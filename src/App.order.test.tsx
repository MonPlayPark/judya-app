// Screen tests for step 3.3b-3: the order page #/order with the owner's examples A-H (today = Monday 19 Oct 2026). Made-up data only.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from './App';
import { assignment, dailyMeal, person, rootWith } from './domain/helpers.test-util';
import { exampleRoot, EXAMPLE_TODAY, NAME_X, NAME_Y, NAME_Z, PRICES, SHOPS } from './domain/orderExample.test-util';
import type { Price, Root, Shop } from './domain/schema';
import { PREV_KEY, saveRoot, STORAGE_KEY } from './domain/storage';

const open = (root: Root, hash = '#/order') => {
  expect(saveRoot(root).ok).toBe(true);
  window.location.hash = hash;
  return render(<App getToday={() => EXAMPLE_TODAY} />);
};
const click = (el: HTMLElement) => fireEvent.click(el);
const checkbox = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) });
const plus = (name: string) => screen.getByRole('button', { name: `เพิ่มจำนวน ${name}` });
const minus = (name: string) => screen.getByRole('button', { name: `ลดจำนวน ${name}` });
const lineOf = (name: string) => checkbox(name).closest('li') as HTMLElement;
const qtyOf = (name: string) => lineOf(name).querySelector('[aria-live]')?.textContent;
const shopRadio = (letter: string) => screen.getByRole('radio', { name: new RegExp(`ร้านทดสอบ ${letter}`) });
/** ['ก:650', ...] in the order shown. */
const totals = () =>
  screen
    .queryAllByRole('radio')
    .map((r) => /ร้านทดสอบ (\S)฿(\d+(?:\.\d+)?)/.exec(r.textContent ?? ''))
    .map((m) => `${m?.[1]}:${m?.[2]}`);
const message = () => screen.getByLabelText('ข้อความสั่งยา').textContent;
const lineLink = () => screen.getByRole('link', { name: 'เปิด LINE' });

const MESSAGE_A = [
  'สวัสดีค่ะ ร้านทดสอบ ก',
  'ขอสั่งยาตามรายการนี้',
  `1) ${NAME_X} x 2 กล่อง (120 เม็ด)`,
  `2) ${NAME_Y} x 2 ขวด`,
  'รบกวนแจ้งราคารวมและเวลารับยาด้วย ขอบคุณค่ะ',
].join('\n');

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
  window.location.hash = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
});

describe('the page and its list', () => {
  it('has the title "สั่งยา", a back button to home, and lists X (73 pills, both members) and Y (1 bottle), both ticked with a reason word', () => {
    open(exampleRoot());
    expect(screen.getByRole('heading', { level: 1, name: 'สั่งยา' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'กลับหน้าแรก' })).toHaveAttribute('href', '#/');
    expect(checkbox(NAME_X)).toHaveAttribute('aria-checked', 'true');
    expect(checkbox(NAME_Y)).toHaveAttribute('aria-checked', 'true');
    expect(qtyOf(NAME_X)).toBe('73 เม็ด');
    expect(qtyOf(NAME_Y)).toBe('1 ขวด');
    expect(within(lineOf(NAME_X)).getByText('ใกล้หมด')).toBeInTheDocument();
    expect(within(lineOf(NAME_Y)).getByText('ใกล้หมด')).toBeInTheDocument();
  });

  it('with the cheapest shop chosen, X shows "= 2 กล่อง" with the box size; no member name anywhere on the page', () => {
    open(exampleRoot());
    expect(within(lineOf(NAME_X)).getByText(/= 2 กล่อง \(กล่องละ 60 เม็ด\)/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('ชื่อสมาชิกทดสอบ');
  });
});

describe('example A: + on Y once (2 bottles), shipping included', () => {
  beforeEach(() => {
    open(exampleRoot());
    click(plus(NAME_Y));
  });

  it('totals ก 650, ง 650 (same total, by name), ค 810, ข 840; ก is chosen at the start and carries "ถูกที่สุด"', () => {
    expect(totals()).toEqual(['ก:650', 'ง:650', 'ค:810', 'ข:840']);
    expect(shopRadio('ก')).toHaveAttribute('aria-checked', 'true');
    expect(shopRadio('ง')).toHaveAttribute('aria-checked', 'false');
    expect(within(shopRadio('ก')).getByText('ถูกที่สุด')).toBeInTheDocument();
    expect(screen.getAllByText('ถูกที่สุด')).toHaveLength(1);
  });

  it('each shop says pick-up / delivery and the delivery fee in words; ข says "ซื้อเพิ่มอีก ฿200 ส่งฟรี"', () => {
    expect(within(shopRadio('ก')).getByText('รับเอง')).toBeInTheDocument();
    expect(within(shopRadio('ข')).getByText('ส่งถึงบ้าน')).toBeInTheDocument();
    expect(within(shopRadio('ข')).getByText('ค่าส่ง ฿40')).toBeInTheDocument();
    expect(within(shopRadio('ข')).getByText('ซื้อเพิ่มอีก ฿200 ส่งฟรี')).toBeInTheDocument();
    expect(within(shopRadio('ค')).getByText('ส่งฟรี')).toBeInTheDocument(); // 810 >= 700
    expect(within(shopRadio('ง')).getByText('ส่งฟรี')).toBeInTheDocument(); // 650 >= 650
    expect(within(shopRadio('ก')).queryByText(/ซื้อเพิ่มอีก/)).not.toBeInTheDocument();
  });

  it('shop จ is under "ร้านที่ยังไม่มีราคาครบ" with the medicine it lacks (Y) as a link to its page', () => {
    expect(screen.getByRole('heading', { name: 'ร้านที่ยังไม่มีราคาครบ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ร้านทดสอบ จ' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: `ใส่ราคา ${NAME_Y} ของ ร้านทดสอบ จ` });
    expect(link).toHaveAttribute('href', '#/house/hY');
    expect(screen.queryByRole('radio', { name: /ร้านทดสอบ จ/ })).not.toBeInTheDocument();
  });

  it('the message is exactly the owner text for shop ก, with no member name', () => {
    expect(message()).toBe(MESSAGE_A);
  });

  it('example H: the LINE link is "https://line.me/R/msg/text/?" + encodeURIComponent(message) exactly, opens in a new tab safely', () => {
    expect(lineLink()).toHaveAttribute('href', 'https://line.me/R/msg/text/?' + encodeURIComponent(MESSAGE_A));
    expect(lineLink()).toHaveAttribute('target', '_blank');
    expect(lineLink()).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('example H: the phone 081-234-5678 of shop ก gives tel:0812345678', () => {
    expect(screen.getByRole('link', { name: 'โทรหาร้าน' })).toHaveAttribute('href', 'tel:0812345678');
  });

  it('the message is shown only (no text box) and has a link to the settings', () => {
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'แก้ข้อความที่ตั้งค่า' })).toHaveAttribute('href', '#/settings');
  });
});

describe('example B: + and − on X with shop ก chosen (60 per box)', () => {
  it('+ -> 180 pills (3 boxes): ก 940, ง 940, ข 1520, ค 1560; − -> 120 (2 boxes, not 73): ก 650, ง 650, ข 1040, ค 1060; − -> 60; − again stays 60', () => {
    open(exampleRoot());
    click(plus(NAME_Y));
    click(plus(NAME_X));
    expect(qtyOf(NAME_X)).toBe('180 เม็ด');
    expect(within(lineOf(NAME_X)).getByText(/= 3 กล่อง/)).toBeInTheDocument();
    expect(totals()).toEqual(['ก:940', 'ง:940', 'ข:1520', 'ค:1560']);

    click(minus(NAME_X));
    expect(qtyOf(NAME_X)).toBe('120 เม็ด');
    expect(totals()).toEqual(['ก:650', 'ง:650', 'ข:1040', 'ค:1060']);

    click(minus(NAME_X));
    expect(qtyOf(NAME_X)).toBe('60 เม็ด');
    click(minus(NAME_X));
    expect(qtyOf(NAME_X)).toBe('60 เม็ด');
    expect(minus(NAME_X)).toBeDisabled();
  });
});

describe('example C: Y not ticked, shop จ joins the comparison; the shipping switch', () => {
  beforeEach(() => {
    open(exampleRoot());
    click(checkbox(NAME_Y));
  });

  it('with shipping: ก 580, ง 630 (ซื้อเพิ่มอีก ฿70), ค 750, ข 760 (ซื้อเพิ่มอีก ฿280), จ 800; nothing is missing any more', () => {
    expect(checkbox(NAME_Y)).toHaveAttribute('aria-checked', 'false');
    expect(totals()).toEqual(['ก:580', 'ง:630', 'ค:750', 'ข:760', 'จ:800']);
    expect(within(shopRadio('ง')).getByText('ซื้อเพิ่มอีก ฿70 ส่งฟรี')).toBeInTheDocument();
    expect(within(shopRadio('ข')).getByText('ซื้อเพิ่มอีก ฿280 ส่งฟรี')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ร้านที่ยังไม่มีราคาครบ' })).not.toBeInTheDocument();
    expect(message()).toBe(
      ['สวัสดีค่ะ ร้านทดสอบ ก', 'ขอสั่งยาตามรายการนี้', `1) ${NAME_X} x 2 กล่อง (120 เม็ด)`, 'รบกวนแจ้งราคารวมและเวลารับยาด้วย ขอบคุณค่ะ'].join('\n'),
    );
  });

  it('shipping switch off: ก 580, ง 580, ข 720, ค 750, จ 800, and "ซื้อเพิ่มอีก" stays as before', () => {
    const sw = screen.getByRole('switch', { name: /รวมค่าส่ง/ });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    click(sw);
    expect(screen.getByRole('switch', { name: /รวมค่าส่ง/ })).toHaveAttribute('aria-checked', 'false');
    expect(totals()).toEqual(['ก:580', 'ง:580', 'ข:720', 'ค:750', 'จ:800']);
    expect(within(shopRadio('ง')).getByText('ซื้อเพิ่มอีก ฿70 ส่งฟรี')).toBeInTheDocument();
    expect(within(shopRadio('ข')).getByText('ซื้อเพิ่มอีก ฿280 ส่งฟรี')).toBeInTheDocument();
    click(screen.getByRole('switch', { name: /รวมค่าส่ง/ }));
    expect(totals()).toEqual(['ก:580', 'ง:630', 'ค:750', 'ข:760', 'จ:800']);
  });
});

describe('example D: choosing a shop that is not the cheapest', () => {
  it('shop ค chosen: + on X steps by 30 (73 -> 3 boxes = 90 -> + -> 120); the message names shop ค', () => {
    open(exampleRoot());
    click(shopRadio('ค'));
    expect(shopRadio('ค')).toHaveAttribute('aria-checked', 'true');
    expect(shopRadio('ก')).toHaveAttribute('aria-checked', 'false');
    expect(within(lineOf(NAME_X)).getByText(/= 3 กล่อง \(กล่องละ 30 เม็ด\)/)).toBeInTheDocument();
    click(plus(NAME_X));
    expect(qtyOf(NAME_X)).toBe('120 เม็ด');
    expect(message()?.split('\n')[0]).toBe('สวัสดีค่ะ ร้านทดสอบ ค');
    expect(message()).toContain(`1) ${NAME_X} x 4 กล่อง (120 เม็ด)`);
  });

  it('a chosen shop that drops out of the list (it lacks a price after another tick) goes back to the cheapest', () => {
    open(exampleRoot());
    click(checkbox(NAME_Y)); // now shop จ is compared
    click(shopRadio('จ'));
    expect(shopRadio('จ')).toHaveAttribute('aria-checked', 'true');
    click(checkbox(NAME_Y)); // จ has no price for Y: it leaves the list
    expect(screen.queryByRole('radio', { name: /ร้านทดสอบ จ/ })).not.toBeInTheDocument();
    expect(shopRadio('ก')).toHaveAttribute('aria-checked', 'true');
    expect(message()?.split('\n')[0]).toBe('สวัสดีค่ะ ร้านทดสอบ ก');
  });
});

describe('example E: shops exist but none has every price', () => {
  beforeEach(() => open(exampleRoot({ prices: [] })));

  it('steps by 1 pill: 73 + -> 74, − -> 73; no "= N กล่อง" line', () => {
    click(plus(NAME_X));
    expect(qtyOf(NAME_X)).toBe('74 เม็ด');
    click(minus(NAME_X));
    expect(qtyOf(NAME_X)).toBe('73 เม็ด');
    expect(within(lineOf(NAME_X)).queryByText(/= /)).not.toBeInTheDocument();
  });

  it('explains it, lists every shop under "ร้านที่ยังไม่มีราคาครบ", shows the message for "ร้านยา" with plain amounts, no call button', () => {
    expect(screen.getByText(/ยังไม่มีร้านที่มีราคาครบ/)).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'ร้านที่ยังไม่มีราคาครบ' })).toBeInTheDocument();
    for (const letter of ['ก', 'ข', 'ค', 'ง', 'จ']) expect(screen.getByRole('heading', { name: `ร้านทดสอบ ${letter}` })).toBeInTheDocument();
    expect(message()).toBe(
      ['สวัสดีค่ะ ร้านยา', 'ขอสั่งยาตามรายการนี้', `1) ${NAME_X} x 73 เม็ด`, `2) ${NAME_Y} x 1 ขวด`, 'รบกวนแจ้งราคารวมและเวลารับยาด้วย ขอบคุณค่ะ'].join('\n'),
    );
    expect(message()).not.toContain('(');
    expect(screen.queryByRole('link', { name: 'โทรหาร้าน' })).not.toBeInTheDocument();
  });

  it('a medicine link goes to a medicine page of a member who uses it (a1)', () => {
    expect(screen.getAllByRole('link', { name: `ใส่ราคา ${NAME_X} ของ ร้านทดสอบ ก` })[0]).toHaveAttribute('href', '#/meds/a1');
  });
});

describe('example F: stock already covers the target (need 0), no shops', () => {
  const root = (): Root =>
    rootWith({
      persons: [person({ id: 'p1' })],
      medications: [{ id: 'mA', name: NAME_X, unit: 'เม็ด' }],
      assignments: [
        assignment({ id: 'a1', medicationId: 'mA', schedule: dailyMeal({ morning: { pills: 1, meal: 'after' } }), stock: { qty: 10, countedOn: EXAMPLE_TODAY } }),
      ],
      settings: { expiryWarnDays: 15, lowStockDays: 14, orderDays: 7, orderTemplate: '' },
    });

  it('is listed, not ticked, the tick box cannot be pressed, and the sentence says why', () => {
    open(root());
    expect(qtyOf(NAME_X)).toBe('0 เม็ด');
    expect(checkbox(NAME_X)).toHaveAttribute('aria-checked', 'false');
    expect(checkbox(NAME_X)).toBeDisabled();
    expect(within(lineOf(NAME_X)).getByText('ของที่มีอยู่พอแล้ว จึงไม่ต้องสั่ง กด + ถ้าต้องการสั่งเพิ่ม')).toBeInTheDocument();
    expect(minus(NAME_X)).toBeDisabled();
    expect(screen.getByText('ติ๊กยาที่ต้องการสั่งก่อน')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'เทียบราคา' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ข้อความสั่งยา')).not.toBeInTheDocument();
  });

  it('+ gives 1 pill and the tick box can be pressed (starts unticked, the owner ticks it)', () => {
    open(root());
    click(plus(NAME_X));
    expect(qtyOf(NAME_X)).toBe('1 เม็ด');
    expect(checkbox(NAME_X)).toBeEnabled();
    expect(checkbox(NAME_X)).toHaveAttribute('aria-checked', 'false');
    expect(within(lineOf(NAME_X)).queryByText(/ของที่มีอยู่พอแล้ว/)).not.toBeInTheDocument();
    click(checkbox(NAME_X));
    expect(checkbox(NAME_X)).toHaveAttribute('aria-checked', 'true');
    expect(message()).toContain(`1) ${NAME_X} x 1 เม็ด`);
    expect(screen.getByText('ยังไม่มีร้านค้า')).toBeInTheDocument();
  });
});

describe('example G: a medicine with unknown stock', () => {
  const med = (id: string, name: string) => ({ id, name, unit: 'เม็ด' });
  const monWedFri = { kind: 'meal' as const, slots: { morning: { pills: 1, meal: 'after' as const } }, days: { kind: 'weekdays' as const, days: [1, 3, 5] } };
  const shop = (id: string, name: string): Shop => ({ id, name, delivery: { kind: 'pickup' } });
  const price = (shopId: string): Price => ({ id: `p-${shopId}`, shopId, item: { kind: 'med', medicationId: 'mZ' }, price: 100, sellUnit: 'กล่อง', perSellUnit: 10 });
  const root = (): Root =>
    rootWith({
      persons: [person({ id: 'p1' })],
      medications: [med('mZ', NAME_Z)],
      assignments: [assignment({ id: 'aZ', medicationId: 'mZ', schedule: monWedFri, stock: null })],
      shops: [shop('s1', 'ร้านทดสอบ ก'), shop('s2', 'ร้านทดสอบ ข')],
      prices: [price('s2')], // shop ก has no price for Z
    });

  it('13 pills, "ไม่ทราบสต๊อก", not ticked; once ticked it joins the comparison and the shop without its price moves to the missing list', () => {
    open(root());
    expect(qtyOf(NAME_Z)).toBe('13 เม็ด');
    expect(within(lineOf(NAME_Z)).getByText('ไม่ทราบสต๊อก')).toBeInTheDocument();
    expect(checkbox(NAME_Z)).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('ติ๊กยาที่ต้องการสั่งก่อน')).toBeInTheDocument();

    click(checkbox(NAME_Z));
    expect(totals()).toEqual(['ข:200']); // 13 pills / 10 per box = 2 boxes
    expect(screen.getByRole('link', { name: `ใส่ราคา ${NAME_Z} ของ ร้านทดสอบ ก` })).toHaveAttribute('href', '#/meds/aZ');
    expect(screen.getByRole('radio', { name: /ร้านทดสอบ ข/ })).toBeInTheDocument();
  });
});

describe('copy the message', () => {
  const clipboard = (writeText: (t: string) => Promise<void>) => Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

  it('"คัดลอกข้อความ" writes the shown text and says "คัดลอกแล้ว"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard(writeText);
    open(exampleRoot());
    click(plus(NAME_Y));
    click(screen.getByRole('button', { name: 'คัดลอกข้อความ' }));
    expect(await screen.findByText('คัดลอกแล้ว')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(MESSAGE_A);
  });

  it('a refused copy says to press and hold the text instead', async () => {
    clipboard(vi.fn().mockRejectedValue(new Error('denied')));
    open(exampleRoot());
    click(screen.getByRole('button', { name: 'คัดลอกข้อความ' }));
    expect(await screen.findByText('คัดลอกไม่ได้ ลองกดค้างที่ข้อความแล้วเลือกคัดลอกเอง')).toBeInTheDocument();
    expect(screen.queryByText('คัดลอกแล้ว')).not.toBeInTheDocument();
  });

  it('a browser without a clipboard says the same', async () => {
    open(exampleRoot());
    click(screen.getByRole('button', { name: 'คัดลอกข้อความ' }));
    expect(await screen.findByText('คัดลอกไม่ได้ ลองกดค้างที่ข้อความแล้วเลือกคัดลอกเอง')).toBeInTheDocument();
  });

  it('the "copied" note goes away when the message changes', async () => {
    clipboard(vi.fn().mockResolvedValue(undefined));
    open(exampleRoot());
    click(screen.getByRole('button', { name: 'คัดลอกข้อความ' }));
    await screen.findByText('คัดลอกแล้ว');
    click(plus(NAME_Y));
    await waitFor(() => expect(screen.queryByText('คัดลอกแล้ว')).not.toBeInTheDocument());
  });
});

describe('the phone button', () => {
  it('keeps "+" and takes out spaces and hyphens: +66 81-234-5678 -> tel:+66812345678', () => {
    const shops: Shop[] = SHOPS.map((s) => (s.id === 'sA' ? { ...s, phone: '+66 81-234-5678' } : s));
    open(exampleRoot({ shops }));
    expect(screen.getByRole('link', { name: 'โทรหาร้าน' })).toHaveAttribute('href', 'tel:+66812345678');
  });
  it('is not shown when the chosen shop has no phone; it follows the shop the owner picks', () => {
    open(exampleRoot());
    click(shopRadio('ข'));
    expect(screen.queryByRole('link', { name: 'โทรหาร้าน' })).not.toBeInTheDocument();
    click(shopRadio('ก'));
    expect(screen.getByRole('link', { name: 'โทรหาร้าน' })).toBeInTheDocument();
  });
});

describe('the three empty states and "nothing ticked"', () => {
  it('nothing to order at all: "ตอนนี้ยังไม่มียาที่ต้องสั่ง", no comparison, no message', () => {
    open(rootWith({ persons: [person({ id: 'p1' })] }));
    expect(screen.getByText('ตอนนี้ยังไม่มียาที่ต้องสั่ง')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'เทียบราคา' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ข้อความสั่งยา')).not.toBeInTheDocument();
    expect(screen.queryByText('ติ๊กยาที่ต้องการสั่งก่อน')).not.toBeInTheDocument();
  });

  it('no shops: "ยังไม่มีร้านค้า" with a link to the settings; the message still shows with "ร้านยา" and pill / unit amounts', () => {
    open(exampleRoot({ shops: [], prices: [] }));
    expect(screen.getByText('ยังไม่มีร้านค้า')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เพิ่มร้านค้าในตั้งค่า' })).toHaveAttribute('href', '#/settings');
    expect(message()).toContain('สวัสดีค่ะ ร้านยา');
    expect(message()).toContain(`1) ${NAME_X} x 73 เม็ด`);
    expect(message()).toContain(`2) ${NAME_Y} x 1 ขวด`);
    expect(screen.queryByRole('heading', { name: 'ร้านที่ยังไม่มีราคาครบ' })).not.toBeInTheDocument();
  });

  it('shops but none with every price: an explanation + the "ร้านที่ยังไม่มีราคาครบ" part + the message for "ร้านยา"', () => {
    const onlyX: Price[] = PRICES.filter((p) => p.item.kind === 'med' && p.shopId !== 'sA'); // no shop has a price for Y
    open(exampleRoot({ prices: onlyX }));
    expect(screen.getByText(/ยังไม่มีร้านที่มีราคาครบ/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ร้านที่ยังไม่มีราคาครบ' })).toBeInTheDocument();
    expect(message()?.split('\n')[0]).toBe('สวัสดีค่ะ ร้านยา');
  });

  it('nothing ticked: comparison and message are hidden and it says "ติ๊กยาที่ต้องการสั่งก่อน"', () => {
    open(exampleRoot());
    click(checkbox(NAME_X));
    click(checkbox(NAME_Y));
    expect(screen.getByText('ติ๊กยาที่ต้องการสั่งก่อน')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'เทียบราคา' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ร้านที่ยังไม่มีราคาครบ' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ข้อความสั่งยา')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'คัดลอกข้อความ' })).not.toBeInTheDocument();
  });

  it('the order template from the settings is used; a blank one means the default text', () => {
    open(exampleRoot({ settings: { expiryWarnDays: 15, lowStockDays: 7, orderDays: 30, orderTemplate: '{ร้าน} ขอสั่ง\n{รายการ}\nขอบคุณ' } }));
    expect(message()).toBe(['ร้านทดสอบ ก ขอสั่ง', `1) ${NAME_X} x 2 กล่อง (120 เม็ด)`, `2) ${NAME_Y} x 1 ขวด`, 'ขอบคุณ'].join('\n'));
  });
});

describe('the page writes nothing to storage', () => {
  it('ticks, + / −, choosing a shop, the switch and copying never call setItem / removeItem and leave judya.v2 as it was', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    open(exampleRoot());
    const keysBefore = Object.keys(localStorage).sort();
    const rootBefore = localStorage.getItem(STORAGE_KEY);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

    click(plus(NAME_Y));
    click(plus(NAME_X));
    click(minus(NAME_X));
    click(checkbox(NAME_Y));
    click(shopRadio('ค'));
    click(screen.getByRole('switch', { name: /รวมค่าส่ง/ }));
    click(screen.getByRole('button', { name: 'คัดลอกข้อความ' }));
    await screen.findByText('คัดลอกแล้ว');

    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(Object.keys(localStorage).sort()).toEqual(keysBefore);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(rootBefore);
  });

  it('leaving the page and coming back starts again from the list (73 pills, ticks as at the start)', () => {
    open(exampleRoot());
    click(plus(NAME_X));
    click(checkbox(NAME_Y));
    expect(qtyOf(NAME_X)).toBe('180 เม็ด');
    act(() => {
      window.location.hash = '#/';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    act(() => {
      window.location.hash = '#/order';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(qtyOf(NAME_X)).toBe('73 เม็ด');
    expect(checkbox(NAME_Y)).toHaveAttribute('aria-checked', 'true');
  });
});
