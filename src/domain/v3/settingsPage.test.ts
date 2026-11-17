import { describe, expect, it } from 'vitest';
import { blankRootV3 } from './fixtures';
import {
  EXPIRY_CHOICES,
  FONT_CHOICES,
  LOW_CHOICES,
  ORDER_CHOICES,
  choicesWith,
  fsOf,
  listRows,
  orderTemplateText,
  updateSetting,
} from './settingsPage';

describe('updateSetting', () => {
  it('changes one setting and nothing else', () => {
    const root = blankRootV3();
    const r = updateSetting(root, { expiryWarnDays: 30 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.root.settings).toEqual({ ...root.settings, expiryWarnDays: 30 });
    expect({ ...r.root, settings: root.settings }).toEqual(root);
  });
  it('refuses a value the schema refuses', () => {
    expect(updateSetting(blankRootV3(), { orderDays: 3 }).ok).toBe(false);
    expect(updateSetting(blankRootV3(), { lowStockDays: 0 }).ok).toBe(false);
  });
  it('every chip value is valid', () => {
    for (const n of EXPIRY_CHOICES) expect(updateSetting(blankRootV3(), { expiryWarnDays: n }).ok).toBe(true);
    for (const n of LOW_CHOICES) expect(updateSetting(blankRootV3(), { lowStockDays: n }).ok).toBe(true);
    for (const n of ORDER_CHOICES) expect(updateSetting(blankRootV3(), { orderDays: n }).ok).toBe(true);
    for (const f of FONT_CHOICES) expect(updateSetting(blankRootV3(), { fontSize: f.value }).ok).toBe(true);
  });
});

describe('choices', () => {
  it('lists the fixed chips; a stored value that is not one of them is added in order', () => {
    expect(choicesWith(EXPIRY_CHOICES, 15)).toEqual([7, 15, 30, 60]);
    expect(choicesWith(EXPIRY_CHOICES, 45)).toEqual([7, 15, 30, 45, 60]);
    expect(choicesWith(LOW_CHOICES, 1.5)).toEqual([1.5, 3, 7, 14, 30]);
  });
  it('maps the stored size to the data-fs letter', () => {
    expect([fsOf('normal'), fsOf('medium'), fsOf('large')]).toEqual(['n', 'm', 'l']);
  });
});

describe('listRows', () => {
  it('builds the five rows with their live sub lines', () => {
    const rows = listRows(blankRootV3(), '2026-10-30', '0.1.0');
    expect(rows.map((r) => r.title)).toEqual(['ขนาดตัวอักษร', 'การเตือน', 'การสั่งยาและร้านค้า', 'ข้อมูลและสำรอง', 'เกี่ยวกับ JudYa']);
    expect(rows.map((r) => r.path)).toEqual(['font', 'reminders', 'order', 'data', 'about']);
    expect(rows.map((r) => r.sub)).toEqual(['ปกติ', 'ใกล้หมดอายุ 15 วัน · ใกล้หมด 14 วัน', 'สั่งให้พอ 30 วัน · 0 ร้าน', 'ยังไม่เคยสำรอง', 'เวอร์ชัน 0.1.0']);
  });
  it('shows the last backup date and the chosen size', () => {
    const root = blankRootV3();
    const r = { ...root, meta: { ...root.meta, lastBackupAt: '2026-10-20T09:00:00+07:00' }, settings: { ...root.settings, fontSize: 'large' as const } };
    const rows = listRows(r, '2026-10-30', '0.1.0');
    expect(rows[0]?.sub).toBe('ใหญ่');
    expect(rows[3]?.sub).toBe('สำรองล่าสุด 20 ต.ค. 2569');
  });
});

describe('orderTemplateText', () => {
  it('standard text when empty', () => {
    expect(orderTemplateText('')).toBe('ใช้ข้อความมาตรฐาน');
    expect(orderTemplateText('  ')).toBe('ใช้ข้อความมาตรฐาน');
    expect(orderTemplateText('สั่ง {รายการ}')).toBe('สั่ง {รายการ}');
  });
});
