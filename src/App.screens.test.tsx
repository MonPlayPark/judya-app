// Screen tests for step 3.2a-2: home screen and "ยาวันนี้". Made-up data only; the clock is injected.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { App } from './App';
import { dailyMeal, person, rootWith, TODAY } from './domain/helpers.test-util';
import { NOW } from './domain/fixtures';
import type { Assignment, HouseItem, Root, Schedule } from './domain/schema';
import { PREV_KEY, saveRoot, STORAGE_KEY } from './domain/storage';

const clock = { today: TODAY };
const getToday = () => clock.today;

const med = (id: string, name: string) => ({ id, name, unit: 'เม็ด' });
const asg = (id: string, personId: string, schedule: Schedule, over: Partial<Assignment> = {}): Assignment => ({
  id,
  medicationId: `m-${id}`,
  personId,
  schedule,
  stock: null,
  status: 'active',
  createdAt: NOW,
  ...over,
});
const twelveHours: Schedule = {
  kind: 'interval',
  everyHours: 12,
  firstTime: '08:00',
  pills: 1.5,
  course: { kind: 'days', days: 5, startDate: '2026-10-14' }, // today is day 3 of 5
};

/** Doses today, in screen order: morning(D) morning(A) noon(A) evening(A) bedtime(A) 08:00 20:00 = 7. */
function house(over: Partial<Root> = {}): Root {
  return rootWith({
    persons: [
      person({ id: 'pA', name: 'Test Person A', color: 'blue' }),
      person({ id: 'pB', name: 'Test Person B', color: 'green', selfManaged: true }),
      person({ id: 'pC', name: 'Test Person C', color: 'yellow', removedAt: NOW }),
      person({ id: 'pD', name: 'Test Person D', color: 'gray' }),
    ],
    medications: [
      med('m-a1', 'Med Morning Evening'),
      med('m-a2', 'Med Bedtime'),
      med('m-a3', 'Med Twelve Hours'),
      med('m-a4', 'Med Self Managed'),
      med('m-a5', 'Med Stopped'),
      med('m-a6', 'Med Removed Member'),
      med('m-a8', 'Med Noon'),
      med('m-a9', 'Med Person D'),
    ],
    assignments: [
      asg('a1', 'pA', dailyMeal({ morning: { pills: 1, meal: 'after' }, evening: { pills: 1, meal: 'after' } }), {
        stock: { qty: 90, countedOn: TODAY },
      }),
      asg('a2', 'pA', dailyMeal({ bedtime: { pills: 0.5 } })),
      asg('a3', 'pA', twelveHours),
      asg('a4', 'pB', dailyMeal({ morning: { pills: 1, meal: 'after' } }), { expiry: '2026-10-01' }),
      asg('a5', 'pA', dailyMeal({ morning: { pills: 1, meal: 'after' } }), { status: 'stopped', expiry: '2026-10-01' }),
      asg('a6', 'pC', dailyMeal({ morning: { pills: 1, meal: 'after' } }), { expiry: '2026-10-01' }),
      asg('a8', 'pA', dailyMeal({ noon: { pills: 2, meal: 'before' } })),
      asg('a9', 'pD', dailyMeal({ morning: { pills: 1, meal: 'with' } })),
    ],
    ...over,
  });
}

const seed = (root: Root) => expect(saveRoot(root).ok).toBe(true);
const open = (hash: string, root: Root = house()) => {
  seed(root);
  window.location.hash = hash;
  return render(<App getToday={getToday} />);
};
const stored = (): Root => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Root;
// DOM order on the today screen: 08:00, 20:00 (every-12-hours section), then morning D, morning A, noon, evening, bedtime.
const MORNING_A = 3;
const boxes = () => screen.queryAllByRole('checkbox');
const checked = () => boxes().map((b) => b.getAttribute('aria-checked') === 'true');
/** Text of an element including its child spans (the status word sits in its own nowrap span). */
const rowText = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === 'SPAN' && el.className.includes('rowSub') && el.textContent === text;
const comeBack = () => act(() => void document.dispatchEvent(new Event('visibilitychange')));

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
  clock.today = TODAY;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREV_KEY);
});

describe('today screen', () => {
  it('lists today in order, grouped by time of day and meal, with amounts and the words จัดแล้ว / ยังไม่จัด', () => {
    open('#/today');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ยาวันนี้');
    expect(screen.getByText('ศุกร์ 16 ต.ค. 2569')).toBeInTheDocument();
    expect(screen.getByText('จัดแล้ว 0 จาก 7')).toBeInTheDocument();
    expect(screen.getByText('เหลืออีก 7')).toBeInTheDocument();

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'ยาที่กินทุก ๆ ชั่วโมง',
      'เช้า',
      'กลางวัน',
      'เย็น',
      'ก่อนนอน',
    ]);
    expect(screen.getByText('พร้อมอาหาร')).toBeInTheDocument();
    expect(screen.getAllByText('หลังอาหาร')).toHaveLength(2);
    expect(screen.getByText('ก่อนอาหาร')).toBeInTheDocument();
    expect(screen.getByText(rowText('Test Person D · 1 เม็ด · ยังไม่จัด'))).toBeInTheDocument();
    expect(screen.getByText(rowText('Test Person A · 2 เม็ด · ยังไม่จัด'))).toBeInTheDocument();
    expect(screen.getByText(rowText('Test Person A · ½ เม็ด · ยังไม่จัด'))).toBeInTheDocument(); // bedtime, no meal label of its own
    expect(boxes()).toHaveLength(7);
  });

  it('the every-X-hours medicine has its own section with course day, next time and one row per time', () => {
    open('#/today');
    expect(screen.getByText('Test Person A · 1½ เม็ด · ทุก 12 ชม.')).toBeInTheDocument();
    expect(screen.getByText('วันที่ 3 จาก 5')).toBeInTheDocument();
    expect(screen.getByText('ครั้งต่อไป 08:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /^08:00/ }));
    expect(screen.getByText('ครั้งต่อไป 20:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /^20:00/ }));
    expect(screen.getByText('ครบวันนี้')).toBeInTheDocument();
    expect(screen.queryByText(/ครั้งต่อไป/)).not.toBeInTheDocument();
  });

  it('left out: self-managed member, stopped medicine, removed member (and the note says who is not included)', () => {
    open('#/today');
    for (const name of ['Med Self Managed', 'Med Stopped', 'Med Removed Member']) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
    expect(screen.getByText('ไม่รวม Test Person B เพราะจัดยาเอง')).toBeInTheDocument();
  });

  it('a tick is saved through the actions and is still there after a reload', () => {
    const first = open('#/today');
    fireEvent.click(boxes()[MORNING_A] as HTMLElement); // morning, Test Person A
    expect(checked()).toEqual([false, false, false, true, false, false, false]);
    expect(screen.getByText('จัดแล้ว 1 จาก 7')).toBeInTheDocument();
    expect(stored().prepLog[TODAY]).toEqual({ 'a1:morning': true });

    first.unmount(); // "reload"
    render(<App getToday={getToday} />);
    expect(checked()).toEqual([false, false, false, true, false, false, false]);
    expect(screen.getByText(rowText('Test Person A · 1 เม็ด · จัดแล้ว'))).toBeInTheDocument();
  });

  it('taking the tick off works and is saved', () => {
    open('#/today');
    fireEvent.click(boxes()[MORNING_A] as HTMLElement);
    fireEvent.click(boxes()[MORNING_A] as HTMLElement);
    expect(checked().every((c) => !c)).toBe(true);
    expect(stored().prepLog[TODAY]).toBeUndefined();
  });

  it('ticking drops tick marks older than 14 days', () => {
    const root = house({ prepLog: { '2026-09-01': { 'a1:morning': true }, '2026-10-02': { 'a1:morning': true } } });
    open('#/today', root);
    fireEvent.click(boxes()[MORNING_A] as HTMLElement);
    expect(Object.keys(stored().prepLog).sort()).toEqual(['2026-10-02', TODAY]); // 14 days old stays, 45 days goes
  });

  it('a new day starts with no ticks (the app was left open over midnight)', () => {
    open('#/today');
    fireEvent.click(boxes()[MORNING_A] as HTMLElement);
    expect(screen.getByText('จัดแล้ว 1 จาก 7')).toBeInTheDocument();

    clock.today = '2026-10-17';
    comeBack();
    expect(screen.getByText('เสาร์ 17 ต.ค. 2569')).toBeInTheDocument();
    expect(screen.getByText('จัดแล้ว 0 จาก 7')).toBeInTheDocument();
    expect(checked().every((c) => !c)).toBe(true);
    expect(stored().prepLog[TODAY]).toEqual({ 'a1:morning': true }); // yesterday's record is kept
  });

  it('the screen also finds out about the new day by itself, every minute', () => {
    vi.useFakeTimers();
    open('#/today');
    clock.today = '2026-10-17';
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByText('เสาร์ 17 ต.ค. 2569')).toBeInTheDocument();
  });

  it('a tap that arrives after midnight, before the screen noticed, writes nothing to the old or the new day', () => {
    open('#/today');
    clock.today = '2026-10-17'; // midnight passed, no refresh yet
    fireEvent.click(boxes()[MORNING_A] as HTMLElement);
    expect(stored().prepLog).toEqual({});
    expect(screen.getByText('เสาร์ 17 ต.ค. 2569')).toBeInTheDocument(); // the screen caught up
    expect(checked().every((c) => !c)).toBe(true);
    fireEvent.click(boxes()[MORNING_A] as HTMLElement); // a fresh tap lands on the new day
    expect(Object.keys(stored().prepLog)).toEqual(['2026-10-17']);
  });

  it('filters by member; the filter is in the URL; chips only for members with doses today', () => {
    open('#/today');
    const group = screen.getByRole('group', { name: 'กรองตามสมาชิก' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['ทั้งหมด', 'Test Person A', 'Test Person D']);

    fireEvent.click(within(group).getByRole('button', { name: 'Test Person D' }));
    expect(window.location.hash).toBe('#/today?who=pD');
    act(() => void window.dispatchEvent(new HashChangeEvent('hashchange')));
    expect(boxes()).toHaveLength(1);
    expect(screen.getByText('จัดแล้ว 0 จาก 7')).toBeInTheDocument(); // progress is for everyone
    expect(within(group).getByRole('button', { name: 'Test Person D' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(group).getByRole('button', { name: 'ทั้งหมด' }));
    expect(window.location.hash).toBe('#/today');
  });

  it('an unknown ?who= shows everyone', () => {
    open('#/today?who=nobody');
    expect(boxes()).toHaveLength(7);
  });

  it('all prepared: ครบแล้ว', () => {
    const keys = ['a9:morning', 'a1:morning', 'a8:noon', 'a1:evening', 'a2:bedtime', 'a3:08:00', 'a3:20:00'];
    const root = house({ prepLog: { [TODAY]: Object.fromEntries(keys.map((k) => [k, true as const])) } });
    open('#/today', root);
    expect(screen.getByText('จัดแล้ว 7 จาก 7')).toBeInTheDocument();
    expect(screen.getByText('ครบแล้ว')).toBeInTheDocument();
    expect(screen.queryByText(/เหลืออีก/)).not.toBeInTheDocument();
  });

  it('nothing to prepare today: says so', () => {
    const root = house({ assignments: [house().assignments[3] as Assignment] }); // only the self-managed member
    open('#/today', root);
    expect(screen.getByText('วันนี้ไม่มียาที่ต้องจัด')).toBeInTheDocument();
    expect(boxes()).toHaveLength(0);
  });

  it('a save that fails is not shown as ticked', () => {
    open('#/today');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    fireEvent.click(boxes()[MORNING_A] as HTMLElement);
    expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้ ข้อมูลเดิมยังอยู่');
    expect(checked().every((c) => !c)).toBe(true);
    expect(screen.getByText('จัดแล้ว 0 จาก 7')).toBeInTheDocument();
  });

  it('the back link goes to the home screen', () => {
    open('#/today');
    expect(screen.getByRole('link', { name: 'กลับหน้าแรก' })).toHaveAttribute('href', '#/old');
  });
});

describe('home screen', () => {
  it('greeting with the date, and no bell', () => {
    open('#/old');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สวัสดีค่ะ');
    expect(screen.getByText('ศุกร์ 16 ต.ค. 2569')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /แจ้งเตือน/ })).not.toBeInTheDocument();
  });

  it('today card: progress, the first 3 not yet prepared, "ดูทั้งหมด (อีก N รายการ)", the whole card goes to #/today', () => {
    open('#/old');
    const card = screen.getByRole('link', { name: /ยาวันนี้/ });
    expect(card).toHaveAttribute('href', '#/today');
    expect(within(card).getByText('จัดแล้ว 0 จาก 7')).toBeInTheDocument();
    expect(within(card).getByText('Med Person D')).toBeInTheDocument();
    expect(within(card).getByText('Med Morning Evening')).toBeInTheDocument();
    expect(within(card).getByText('Med Noon')).toBeInTheDocument();
    expect(within(card).queryByText('Med Bedtime')).not.toBeInTheDocument();
    expect(within(card).getByText('ดูทั้งหมด (อีก 4 รายการ)')).toBeInTheDocument();
  });

  it('prepared doses are skipped in the preview and counted in the progress', () => {
    const root = house({ prepLog: { [TODAY]: { 'a9:morning': true, 'a1:morning': true } } });
    open('#/old', root);
    const card = screen.getByRole('link', { name: /ยาวันนี้/ });
    expect(within(card).getByText('จัดแล้ว 2 จาก 7')).toBeInTheDocument();
    expect(within(card).queryByText('Med Person D')).not.toBeInTheDocument();
    expect(within(card).getByText('Med Noon')).toBeInTheDocument();
    expect(within(card).getByText('Med Morning Evening')).toBeInTheDocument(); // the evening dose
    expect(within(card).getByText('Med Bedtime')).toBeInTheDocument();
    expect(within(card).getByText('ดูทั้งหมด (อีก 2 รายการ)')).toBeInTheDocument(); // 5 left, 3 shown
  });

  it('every-X-hours medicine in the preview shows its time and interval', () => {
    const root = house({
      assignments: [house().assignments[2] as Assignment],
    });
    open('#/old', root);
    expect(screen.getAllByText('Med Twelve Hours ทุก 12 ชม.')).toHaveLength(2);
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
  });

  it('everything prepared: ยาวันนี้ครบแล้ว', () => {
    const keys = ['a9:morning', 'a1:morning', 'a8:noon', 'a1:evening', 'a2:bedtime', 'a3:08:00', 'a3:20:00'];
    open('#/old', house({ prepLog: { [TODAY]: Object.fromEntries(keys.map((k) => [k, true as const])) } }));
    expect(screen.getByText('ยาวันนี้ครบแล้ว')).toBeInTheDocument();
    expect(screen.getByText('จัดครบ 7 จาก 7')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('เก่งมากค่ะ');
  });

  it('no medicine to prepare today: says so', () => {
    open('#/old', house({ assignments: [house().assignments[3] as Assignment] }));
    expect(screen.getByText('วันนี้ไม่มียาที่ต้องจัด')).toBeInTheDocument();
  });

  it('the home card follows a tick made on the today screen', () => {
    open('#/today');
    fireEvent.click(boxes()[MORNING_A] as HTMLElement);
    act(() => {
      window.location.hash = '#/old';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByText('จัดแล้ว 1 จาก 7')).toBeInTheDocument();
  });

  describe('medicines that need care', () => {
    const houseItems: HouseItem[] = [
      { id: 'h1', name: 'House Expired', expiry: '2026-09-30' },
      { id: 'h2', name: 'House Soon', expiry: '2026-10-24' },
      { id: 'h3', name: 'House Low', stock: { qty: 4, unit: 'เม็ด' }, lowAt: 10, expiry: '2027-12-31' },
      { id: 'h4', name: 'House Removed', expiry: '2026-09-30', removedAt: NOW },
    ];

    it('lists the three groups, with the owner name for members and the right-hand texts', () => {
      open('#/old', house({ houseItems }));
      expect(screen.getByRole('heading', { name: 'ยาที่ต้องดูแล' })).toBeInTheDocument();
      // round 9: one list sorted by urgency (expired first, then fewest days); no group banners
      expect(screen.getByRole('link', { name: 'ดูทั้งหมด 4' })).toHaveAttribute('href', '#/meds');

      // a member's medicine (self-managed counts) with the owner's name
      const selfRow = screen.getByText('Med Self Managed').closest('li') as HTMLElement;
      expect(selfRow).toHaveTextContent('Test Person B');
      expect(selfRow).toHaveTextContent('เลิกใช้');
      // house medicines
      expect(screen.getByText('House Expired').closest('li')).toHaveTextContent('เลิกใช้');
      expect(screen.getByText('House Soon').closest('li')).toHaveTextContent('หมดอายุใน8วัน');
      expect(screen.getByText('House Low').closest('li')).toHaveTextContent('เหลือ4เม็ด');
      const care = screen.getByRole('heading', { name: 'ยาที่ต้องดูแล' }).closest('section') as HTMLElement;
      const names = within(care).getAllByRole('listitem').map((li) => li.querySelector('a > div > div')?.textContent);
      expect(names.slice(0, 2).sort()).toEqual(['House Expired', 'Med Self Managed']); // expired come first
      expect(names.slice(2)).toEqual(['House Soon', 'House Low'].sort((a, b) => names.indexOf(a) - names.indexOf(b)));
      // left out: stopped medicine, removed member, removed house medicine
      for (const name of ['Med Stopped', 'Med Removed Member', 'House Removed']) {
        expect(screen.queryByText(name)).not.toBeInTheDocument();
      }
      // total = 4 medicines (Med Self Managed, House Expired, House Soon, House Low)
      expect(screen.getByRole('heading', { name: 'ยาที่ต้องดูแล' }).parentElement).toHaveTextContent('4');
    });

    it('the old note "เตือนก่อนหมดอายุ N วัน" is gone from home (not in round 9; the setting is on the settings page)', () => {
      open('#/old', house({ houseItems }));
      expect(screen.queryByText(/เตือนก่อนหมดอายุ/)).not.toBeInTheDocument();
    });

    it('nothing to care for: a message with a tick icon', () => {
      const root = house();
      root.assignments = root.assignments.map((a) => ({ ...a, expiry: undefined }));
      open('#/old', root);
      expect(screen.getByText('ตอนนี้ไม่มียาที่ต้องดูแล')).toBeInTheDocument();
      expect(screen.queryByText('หมดอายุแล้ว')).not.toBeInTheDocument();
    });
  });

  describe('members', () => {
    it('one card per member who is not removed, with count and an honest status', () => {
      const root = house();
      root.assignments = root.assignments.map((a) =>
        a.id === 'a1' ? { ...a, stock: { qty: 2, countedOn: TODAY } } : a,
      );
      open('#/old', root);
      const list = screen.getByRole('heading', { name: 'สมาชิกในบ้าน' }).closest('section') as HTMLElement;
      const rows = within(list).getAllByRole('listitem').map((li) => li.textContent);
      expect(rows).toEqual([
        'Test Person Aยา 4 รายการ', // Test Person A: 4 active (stopped one not counted); round 9 has no status chip
        'Test Person Bยา 1 รายการ · จัดยาเอง',
        'Test Person Dยา 1 รายการ',
      ]);
      expect(within(list).getAllByRole('link')).toHaveLength(3); // each row opens the member page (chevron)
    });

    it('enough stock, no medicine', () => {
      const root = house({
        persons: [person({ id: 'pA', name: 'Test Person A' }), person({ id: 'pD', name: 'Test Person D' })],
        assignments: [house().assignments[0] as Assignment],
      });
      open('#/old', root);
      const list = screen.getByRole('heading', { name: 'สมาชิกในบ้าน' }).closest('section') as HTMLElement;
      expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        'Test Person Aยา 1 รายการ',
        'Test Person Dยา 0 รายการ',
      ]);
    });
  });

  it('buttons for pages that are not built yet stay hidden ("เพิ่มยา" is now a real button, round 9)', () => {
    open('#/old');
    expect(screen.getByRole('link', { name: 'เพิ่มยา' })).toHaveAttribute('href', '#/meds/new');
    for (const name of [/เปลี่ยนเกณฑ์/, /เพิ่มสมาชิก/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'ดูทั้งหมด' })).not.toBeInTheDocument();
  });

  it('sample data: banner and the delete button; real data: no banner', () => {
    seed({ ...house(), meta: { createdAt: NOW, isSample: true } });
    window.location.hash = '#/old';
    const first = render(<App getToday={getToday} />);
    expect(screen.getByText('นี่คือข้อมูลตัวอย่าง')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ลบข้อมูลตัวอย่าง' })).toBeInTheDocument();
    first.unmount();

    seed(house());
    render(<App getToday={getToday} />);
    expect(screen.queryByText('นี่คือข้อมูลตัวอย่าง')).not.toBeInTheDocument();
  });

  it('a blank house shows the first-run card (round 9 screen 3)', () => {
    window.location.hash = '#/old';
    render(<App getToday={getToday} />);
    expect(screen.getByText('เริ่มที่ยาตัวแรก')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เพิ่มยาตัวแรก' })).toHaveAttribute('href', '#/meds/new');
    expect(screen.queryByText('ยาที่ต้องดูแล')).not.toBeInTheDocument();
  });
});
