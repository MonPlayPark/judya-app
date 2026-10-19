// Screen tests for step 3.3b-2, part A: "ราคาตามร้าน" on the regular-medicine page (#/meds/:id) and the house-medicine page
// (#/house/:id). Made-up data only. Today = Monday 19 Oct 2026.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from './App';
import { NOW } from './domain/fixtures';
import { assignment, dailyMeal, person, rootWith } from './domain/helpers.test-util';
import { errorText } from './domain/errorText';
import type { HouseItem, Price, Root, Shop } from './domain/schema';
import { PREV_KEY, saveRoot, STORAGE_KEY } from './domain/storage';

const TODAY = '2026-10-19';
const morning = dailyMeal({ morning: { pills: 1, meal: 'after' } });

const stored = (): Root => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Root;
const open = (hash: string, root: Root) => {
  expect(saveRoot(root).ok).toBe(true);
  window.location.hash = hash;
  return render(<App getToday={() => TODAY} />);
};
const nav = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
const click = (el: HTMLElement) => fireEvent.click(el);
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
/** A box of the price form (the house page has a unit box of its own above, so look only inside the price card). */
const field = (label: string | RegExp) => within(section()).getByLabelText(label);
const dialog = () => within(screen.getByRole('dialog'));

const shopA: Shop = { id: 's1', name: 'ร้านทดสอบ ก', delivery: { kind: 'pickup' } };
const shopB: Shop = { id: 's2', name: 'ร้านทดสอบ ข', delivery: { kind: 'pickup' } };
const shopC: Shop = { id: 's3', name: 'ร้านทดสอบ ค', delivery: { kind: 'pickup' } };
const medPrice = (id: string, shopId: string, price: number, medicationId = 'm1'): Price => ({
  id,
  shopId,
  item: { kind: 'med', medicationId },
  price,
  sellUnit: 'กล่อง',
  perSellUnit: 60,
});
const housePrice = (id: string, shopId: string, price: number, houseItemId = 'h1'): Price => ({
  id,
  shopId,
  item: { kind: 'house', houseItemId },
  price,
  sellUnit: 'ขวด',
  perSellUnit: 1,
});
const oneMed = (over: Partial<Root> = {}): Root =>
  rootWith({
    persons: [person({ id: 'p1' })],
    medications: [{ id: 'm1', name: 'ยาตัวอย่าง เอ', unit: 'เม็ด' }],
    assignments: [assignment({ id: 'a1', medicationId: 'm1', personId: 'p1', schedule: morning })],
    shops: [shopA, shopB],
    ...over,
  });
const syrup: HouseItem = { id: 'h1', name: 'ยาสามัญทดสอบ ก', stock: { qty: 3, unit: 'ขวด' }, lowAt: 1 };
const oneHouse = (over: Partial<Root> = {}): Root => rootWith({ houseItems: [syrup], shops: [shopA, shopB], ...over });

/** The section's card, so words inside it do not mix with the rest of the page. */
const section = () => screen.getByRole('heading', { name: 'ราคาตามร้าน' }).closest('section') as HTMLElement;
const fillMed = (price: string, perSell: string, sellUnit?: string) => {
  type(field('ราคา (บาท)'), price);
  if (sellUnit) type(field('หรือพิมพ์หน่วยเอง'), sellUnit);
  type(field(/^1 .* มีกี่ เม็ด$/), perSell);
};

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
  window.location.hash = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
});

describe('regular medicine: price list (#/meds/:id)', () => {
  it('one row per shop: a price reads "฿290 ต่อ 1 กล่อง (60 เม็ด)", a shop without one says "ยังไม่ใส่ราคา" and "ใส่ราคา"', () => {
    open('#/meds/a1', oneMed({ prices: [medPrice('x1', 's1', 290)] }));
    const s = within(section());
    expect(s.getByText('ร้านทดสอบ ก')).toBeInTheDocument();
    expect(s.getByText('฿290 ต่อ 1 กล่อง (60 เม็ด)')).toBeInTheDocument();
    expect(s.getByRole('button', { name: 'แก้ไขราคา ร้านทดสอบ ก' })).toHaveTextContent('แก้ไข');
    expect(s.getByText('ร้านทดสอบ ข')).toBeInTheDocument();
    expect(s.getByText('ยังไม่ใส่ราคา')).toBeInTheDocument();
    expect(s.getByRole('button', { name: 'ใส่ราคา ร้านทดสอบ ข' })).toHaveTextContent('ใส่ราคา');
  });

  it('no shops at all: a sentence with a link to Settings', () => {
    open('#/meds/a1', oneMed({ shops: [] }));
    expect(within(section()).getByRole('link', { name: 'ยังไม่มีร้านค้า เพิ่มร้านในตั้งค่า' })).toHaveAttribute('href', '#/settings');
  });

  it('the price section is not shown while another form (adjust) is open', () => {
    open('#/meds/a1', oneMed());
    click(button(/ปรับโดส/));
    expect(screen.queryByRole('heading', { name: 'ราคาตามร้าน' })).not.toBeInTheDocument();
  });

  it('a price of 12.5 is shown as 12.5, not rounded to 13', () => {
    open('#/meds/a1', oneMed({ prices: [medPrice('x1', 's1', 12.5)] }));
    expect(within(section()).getByText('฿12.5 ต่อ 1 กล่อง (60 เม็ด)')).toBeInTheDocument();
  });
});

describe('regular medicine: put, change and delete a price', () => {
  it('put a price: 290 per กล่อง of 60 -> the row reads it, judya.v2 holds it, "บันทึกราคาของ … แล้ว"', () => {
    open('#/meds/a1', oneMed());
    click(within(section()).getByRole('button', { name: 'ใส่ราคา ร้านทดสอบ ก' }));
    expect(screen.getByRole('heading', { name: 'ราคาของ ร้านทดสอบ ก' })).toBeInTheDocument();
    expect(within(section()).getByRole('radio', { name: 'กล่อง' })).toHaveAttribute('aria-checked', 'true'); // the board starts on กล่อง
    expect(field(/^1 กล่อง มีกี่ เม็ด$/)).toBeInTheDocument(); // the question follows the sell unit
    fillMed('290', '60');
    click(button('บันทึกราคา'));
    const s = within(section());
    expect(s.getByText('฿290 ต่อ 1 กล่อง (60 เม็ด)')).toBeInTheDocument();
    expect(s.getByText('บันทึกราคาของ ร้านทดสอบ ก แล้ว')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ราคาของ ร้านทดสอบ ก' })).not.toBeInTheDocument(); // the form closed
    expect(stored().prices).toEqual([
      expect.objectContaining({ shopId: 's1', item: { kind: 'med', medicationId: 'm1' }, price: 290, sellUnit: 'กล่อง', perSellUnit: 60 }),
    ]);
  });

  it('12.5 is stored and shown as 12.5; a typed sell unit and a chip both work', () => {
    open('#/meds/a1', oneMed());
    click(button('ใส่ราคา ร้านทดสอบ ข'));
    click(within(section()).getByRole('radio', { name: 'แผง' }));
    expect(field('หรือพิมพ์หน่วยเอง')).toHaveValue('แผง');
    fillMed('12.5', '10');
    click(button('บันทึกราคา'));
    expect(within(section()).getByText('฿12.5 ต่อ 1 แผง (10 เม็ด)')).toBeInTheDocument();
    expect(stored().prices[0]).toMatchObject({ price: 12.5, sellUnit: 'แผง', perSellUnit: 10 });
    click(button('ใส่ราคา ร้านทดสอบ ก'));
    fillMed('5', '2', 'ถุง');
    click(button('บันทึกราคา'));
    expect(within(section()).getByText('฿5 ต่อ 1 ถุง (2 เม็ด)')).toBeInTheDocument();
  });

  it('price 0 is refused with the text of invalid_price, under the box; nothing is saved', () => {
    open('#/meds/a1', oneMed());
    click(button('ใส่ราคา ร้านทดสอบ ก'));
    fillMed('0', '60');
    click(button('บันทึกราคา'));
    const box = field('ราคา (บาท)');
    expect(screen.getByText(errorText('invalid_price'))).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(stored().prices ?? []).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'ราคาของ ร้านทดสอบ ก' })).toBeInTheDocument(); // the form stays open
    type(box, '1'); // typing in the box clears its message
    expect(screen.queryByText(errorText('invalid_price'))).not.toBeInTheDocument();
  });

  it('a regular medicine must say how many are in 1 sell unit: empty -> text of per_sell_unit_required', () => {
    open('#/meds/a1', oneMed());
    click(button('ใส่ราคา ร้านทดสอบ ก'));
    type(field('ราคา (บาท)'), '290');
    click(button('บันทึกราคา'));
    expect(screen.getByText(errorText('per_sell_unit_required'))).toBeInTheDocument();
    expect(stored().prices ?? []).toHaveLength(0);
    type(field(/^1 กล่อง มีกี่ เม็ด$/), '0'); // 0 is not a count either
    click(button('บันทึกราคา'));
    expect(screen.getByText(errorText('invalid_per_sell_unit'))).toBeInTheDocument();
  });

  it('an empty sell unit gives the text of invalid_sell_unit; all wrong boxes are told at once', () => {
    open('#/meds/a1', oneMed());
    click(button('ใส่ราคา ร้านทดสอบ ก'));
    type(field('หรือพิมพ์หน่วยเอง'), '');
    click(button('บันทึกราคา'));
    expect(screen.getByText(errorText('invalid_sell_unit'))).toBeInTheDocument();
    expect(screen.getByText(errorText('invalid_price'))).toBeInTheDocument();
    expect(screen.getByText(errorText('per_sell_unit_required'))).toBeInTheDocument();
    expect(stored().prices ?? []).toHaveLength(0);
  });

  it('change 290 -> 300 for the same shop: still one price for that shop, value 300, same id', () => {
    open('#/meds/a1', oneMed({ prices: [medPrice('x1', 's1', 290)] }));
    click(button('แก้ไขราคา ร้านทดสอบ ก'));
    expect(field('ราคา (บาท)')).toHaveValue(290);
    expect(field(/^1 กล่อง มีกี่ เม็ด$/)).toHaveValue(60);
    type(field('ราคา (บาท)'), '300');
    click(button('บันทึกราคา'));
    expect(within(section()).getByText('฿300 ต่อ 1 กล่อง (60 เม็ด)')).toBeInTheDocument();
    expect(stored().prices).toHaveLength(1);
    expect(stored().prices[0]).toMatchObject({ id: 'x1', shopId: 's1', price: 300 });
  });

  it('cancel changes nothing', () => {
    open('#/meds/a1', oneMed({ prices: [medPrice('x1', 's1', 290)] }));
    click(button('แก้ไขราคา ร้านทดสอบ ก'));
    type(field('ราคา (บาท)'), '999');
    click(button('ยกเลิก'));
    expect(screen.queryByRole('heading', { name: 'ราคาของ ร้านทดสอบ ก' })).not.toBeInTheDocument();
    expect(within(section()).getByText('฿290 ต่อ 1 กล่อง (60 เม็ด)')).toBeInTheDocument();
    expect(stored().prices[0]?.price).toBe(290);
  });

  it('delete a price: a box asks first; cancel keeps it; confirm removes only that price (shop and medicine stay)', () => {
    open('#/meds/a1', oneMed({ prices: [medPrice('x1', 's1', 290), medPrice('x2', 's2', 310)] }));
    click(button('แก้ไขราคา ร้านทดสอบ ก'));
    click(button('ลบราคานี้'));
    expect(screen.getByRole('dialog')).toHaveTextContent('ลบราคาของ ร้านทดสอบ ก?');
    click(dialog().getByRole('button', { name: 'ยกเลิก' }));
    expect(stored().prices).toHaveLength(2);
    click(button('ลบราคานี้'));
    click(screen.getByRole('button', { name: 'ลบราคา' }));
    const s = within(section());
    expect(s.getByText('ลบราคาของ ร้านทดสอบ ก แล้ว')).toBeInTheDocument();
    expect(s.getByText('ยังไม่ใส่ราคา')).toBeInTheDocument();
    expect(s.getByText('฿310 ต่อ 1 กล่อง (60 เม็ด)')).toBeInTheDocument();
    expect(stored().prices.map((p) => p.id)).toEqual(['x2']);
    expect(stored().shops).toHaveLength(2);
    expect(stored().medications).toHaveLength(1);
  });

  it('a price that cannot be saved: the Thai reason shows and no price appears', () => {
    open('#/meds/a1', oneMed());
    click(button('ใส่ราคา ร้านทดสอบ ก'));
    fillMed('290', '60');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    click(button('บันทึกราคา'));
    expect(screen.getByText(errorText('save_failed'))).toBeInTheDocument();
    expect(screen.queryByText(/฿290/)).not.toBeInTheDocument();
    expect(screen.queryByText(/บันทึกราคาของ/)).not.toBeInTheDocument();
  });
});

describe('one price for everyone who uses the medicine (Q6)', () => {
  const twoUsers = (over: Partial<Root> = {}): Root =>
    oneMed({
      persons: [person({ id: 'p1' }), person({ id: 'p2', name: 'Test Person B', color: 'green' })],
      assignments: [
        assignment({ id: 'a1', medicationId: 'm1', personId: 'p1', schedule: morning }),
        assignment({ id: 'a2', medicationId: 'm1', personId: 'p2', schedule: morning }),
      ],
      ...over,
    });
  const SHARED = /ราคานี้ใช้ร่วมกับทุกคนที่ใช้ยานี้/;

  it('used by 2 members -> "ราคานี้ใช้ร่วมกับทุกคนที่ใช้ยานี้ (2 คน)" under the heading, on both members\' pages', () => {
    open('#/meds/a1', twoUsers());
    expect(within(section()).getByText('ราคานี้ใช้ร่วมกับทุกคนที่ใช้ยานี้ (2 คน)')).toBeInTheDocument();
    nav('#/meds/a2');
    expect(within(section()).getByText('ราคานี้ใช้ร่วมกับทุกคนที่ใช้ยานี้ (2 คน)')).toBeInTheDocument();
  });

  it('a price put on one member\'s page shows on the other\'s', () => {
    open('#/meds/a1', twoUsers());
    click(button('ใส่ราคา ร้านทดสอบ ก'));
    fillMed('290', '60');
    click(button('บันทึกราคา'));
    nav('#/meds/a2');
    expect(within(section()).getByText('฿290 ต่อ 1 กล่อง (60 เม็ด)')).toBeInTheDocument();
    expect(stored().prices).toHaveLength(1);
  });

  it('used by 1 member -> no sentence', () => {
    open('#/meds/a1', oneMed());
    expect(screen.queryByText(SHARED)).not.toBeInTheDocument();
  });

  it('used by 2 but one member is taken out -> no sentence', () => {
    open('#/meds/a1', twoUsers({ persons: [person({ id: 'p1' }), person({ id: 'p2', name: 'Test Person B', removedAt: NOW })] }));
    expect(screen.queryByText(SHARED)).not.toBeInTheDocument();
  });

  it('used by 2 but one medicine is stopped -> no sentence', () => {
    open(
      '#/meds/a1',
      twoUsers({
        assignments: [
          assignment({ id: 'a1', medicationId: 'm1', personId: 'p1', schedule: morning }),
          assignment({ id: 'a2', medicationId: 'm1', personId: 'p2', schedule: morning, status: 'stopped' }),
        ],
      }),
    );
    expect(screen.queryByText(SHARED)).not.toBeInTheDocument();
  });

  it('3 members -> "(3 คน)"', () => {
    open(
      '#/meds/a1',
      twoUsers({
        persons: [person({ id: 'p1' }), person({ id: 'p2', name: 'B' }), person({ id: 'p3', name: 'C' })],
        assignments: ['p1', 'p2', 'p3'].map((p, i) => assignment({ id: `a${i + 1}`, medicationId: 'm1', personId: p, schedule: morning })),
      }),
    );
    expect(screen.getByText('ราคานี้ใช้ร่วมกับทุกคนที่ใช้ยานี้ (3 คน)')).toBeInTheDocument();
  });
});

describe('house medicine (#/house/:id)', () => {
  it('a price reads "฿35 ต่อ 1 ขวด" and the form has no "มีกี่" box', () => {
    open('#/house/h1', oneHouse());
    click(button('ใส่ราคา ร้านทดสอบ ก'));
    expect(screen.getByText('ราคานี้ต่อ 1 หน่วยที่ร้านขาย')).toBeInTheDocument();
    expect(screen.queryByLabelText(/มีกี่/)).not.toBeInTheDocument();
    type(field('ราคา (บาท)'), '35');
    click(within(section()).getByRole('radio', { name: 'ขวด' }));
    click(button('บันทึกราคา'));
    expect(within(section()).getByText('฿35 ต่อ 1 ขวด')).toBeInTheDocument();
    expect(stored().prices[0]).toMatchObject({ shopId: 's1', item: { kind: 'house', houseItemId: 'h1' }, price: 35, sellUnit: 'ขวด', perSellUnit: 1 });
    expect(screen.queryByText(/ราคานี้ใช้ร่วมกับ/)).not.toBeInTheDocument();
  });

  it('price 0 and an empty unit are refused with their texts', () => {
    open('#/house/h1', oneHouse());
    click(button('ใส่ราคา ร้านทดสอบ ก'));
    type(field('ราคา (บาท)'), '0');
    type(field('หรือพิมพ์หน่วยเอง'), ' ');
    click(button('บันทึกราคา'));
    expect(screen.getByText(errorText('invalid_price'))).toBeInTheDocument();
    expect(screen.getByText(errorText('invalid_sell_unit'))).toBeInTheDocument();
    expect(stored().prices ?? []).toHaveLength(0);
  });

  it('change 35 -> 40 keeps one row; delete asks first', () => {
    open('#/house/h1', oneHouse({ prices: [housePrice('y1', 's1', 35)] }));
    click(button('แก้ไขราคา ร้านทดสอบ ก'));
    type(field('ราคา (บาท)'), '40');
    click(button('บันทึกราคา'));
    expect(within(section()).getByText('฿40 ต่อ 1 ขวด')).toBeInTheDocument();
    expect(stored().prices).toHaveLength(1);
    click(button('แก้ไขราคา ร้านทดสอบ ก'));
    click(button('ลบราคานี้'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    click(screen.getByRole('button', { name: 'ลบราคา' }));
    expect(stored().prices).toHaveLength(0);
    expect(within(section()).getAllByText('ยังไม่ใส่ราคา')).toHaveLength(2);
  });

  it('a deleted house medicine shows no price section; its price comes back with it (bring back)', () => {
    open('#/house/h1', oneHouse({ prices: [housePrice('y1', 's1', 35)] }));
    click(screen.getByRole('button', { name: 'ลบยานี้' }));
    click(screen.getByRole('button', { name: 'ลบ' }));
    expect(screen.queryByRole('heading', { name: 'ราคาตามร้าน' })).not.toBeInTheDocument();
    expect(stored().prices).toHaveLength(1); // kept
    click(button('นำกลับ'));
    expect(within(section()).getByText('฿35 ต่อ 1 ขวด')).toBeInTheDocument();
  });

  it('no shops: the sentence with the link to Settings', () => {
    open('#/house/h1', oneHouse({ shops: [] }));
    expect(within(section()).getByRole('link', { name: /ยังไม่มีร้านค้า/ })).toHaveAttribute('href', '#/settings');
  });
});

describe('shops and prices together', () => {
  it('deleting a shop that has 3 prices removes them; the medicine page has no row for that shop', () => {
    const root = oneMed({
      shops: [shopA, shopB, shopC],
      houseItems: [syrup],
      prices: [medPrice('x1', 's1', 290), housePrice('y1', 's1', 35), medPrice('x2', 's1', 99, 'm2')],
      medications: [
        { id: 'm1', name: 'ยาตัวอย่าง เอ', unit: 'เม็ด' },
        { id: 'm2', name: 'ยาตัวอย่าง บี', unit: 'เม็ด' },
      ],
    });
    open('#/settings', root);
    click(button('แก้ไขร้าน ร้านทดสอบ ก'));
    click(button('ลบร้านนี้'));
    expect(screen.getByRole('dialog')).toHaveTextContent('(3 รายการ)');
    click(screen.getByRole('button', { name: 'ลบ' }));
    expect(stored().prices).toHaveLength(0);
    nav('#/meds/a1');
    const s = within(section());
    expect(s.queryByText('ร้านทดสอบ ก')).not.toBeInTheDocument();
    expect(s.getByText('ร้านทดสอบ ข')).toBeInTheDocument();
    expect(s.queryByText(/฿290/)).not.toBeInTheDocument();
    nav('#/house/h1');
    expect(within(section()).queryByText('ร้านทดสอบ ก')).not.toBeInTheDocument();
  });
});

describe('sample data (O5, O8)', () => {
  const sample = (prices: Price[] = []): Root => oneMed({ meta: { createdAt: NOW, isSample: true }, prices });

  it('a NEW price while the house is the sample asks to clear the sample first; nothing is saved', () => {
    open('#/meds/a1', sample());
    click(button('ใส่ราคา ร้านทดสอบ ก'));
    fillMed('290', '60');
    click(button('บันทึกราคา'));
    expect(screen.getByRole('dialog')).toHaveTextContent('ต้องลบข้อมูลตัวอย่างก่อน');
    expect(stored().prices ?? []).toHaveLength(0);
    expect(stored().meta.isSample).toBe(true);
    click(dialog().getByRole('button', { name: 'ยกเลิก' })); // cancel: still the sample, the form is still there
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stored().meta.isSample).toBe(true);
    expect(field('ราคา (บาท)')).toHaveValue(290);
  });

  it('agreeing clears the sample (it is not cleared silently)', () => {
    open('#/meds/a1', sample());
    click(button('ใส่ราคา ร้านทดสอบ ก'));
    fillMed('290', '60');
    click(button('บันทึกราคา'));
    click(screen.getByRole('button', { name: 'ลบตัวอย่างแล้วเริ่ม' }));
    expect(stored().meta.isSample).toBeUndefined();
    expect(stored().medications).toHaveLength(0);
  });

  it('changing a price that is already there works at once, without asking', () => {
    open('#/meds/a1', sample([medPrice('x1', 's1', 290)]));
    click(button('แก้ไขราคา ร้านทดสอบ ก'));
    type(field('ราคา (บาท)'), '300');
    click(button('บันทึกราคา'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stored().prices[0]?.price).toBe(300);
    expect(stored().meta.isSample).toBe(true);
  });
});
