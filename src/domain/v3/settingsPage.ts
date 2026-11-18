// Logic of the v3 settings pages (M4 PR 14): the chips, the five rows of the list and one change of one setting.
// Pure: no UI, no storage, no clock. A change is validated by rootSchema; the page saves the result with one saveRoot.
import type { IsoDate } from '../calc';
import { backupStatus } from './dataPage';
import { rootSchema, type Root, type Settings } from './schema';

export const EXPIRY_CHOICES: readonly number[] = [7, 15, 30, 60];
export const LOW_CHOICES: readonly number[] = [3, 7, 14, 30];
export const ORDER_CHOICES: readonly number[] = [14, 30, 60, 90];

type FontSizeName = Settings['fontSize'];
/** The three sizes, in the order shown. `fs` is the letter on <html data-fs> (src/prefs/fontSize.ts). */
export const FONT_CHOICES: readonly { value: FontSizeName; label: string; fs: 'n' | 'm' | 'l' }[] = [
  { value: 'normal', label: 'ปกติ', fs: 'n' },
  { value: 'medium', label: 'กลาง', fs: 'm' },
  { value: 'large', label: 'ใหญ่', fs: 'l' },
];

export const fsOf = (size: FontSizeName): 'n' | 'm' | 'l' => FONT_CHOICES.find((c) => c.value === size)?.fs ?? 'n';
export const fontLabel = (size: FontSizeName): string => FONT_CHOICES.find((c) => c.value === size)?.label ?? 'ปกติ';

/** The fixed chips; a stored value that is not one of them (a backup, an older app) is added in its place, so what is selected is always shown. */
export function choicesWith(fixed: readonly number[], stored: number): number[] {
  return fixed.includes(stored) ? [...fixed] : [...fixed, stored].sort((a, b) => a - b);
}

export type SettingsPatch = Partial<Pick<Settings, 'expiryWarnDays' | 'lowStockDays' | 'orderDays' | 'fontSize'>>;
export type UpdateSettingResult = { ok: true; root: Root } | { ok: false };

/** One changed setting on a copy of the root. Not valid for the schema = refused. */
export function updateSetting(root: Root, patch: SettingsPatch): UpdateSettingResult {
  const checked = rootSchema.safeParse({ ...root, settings: { ...root.settings, ...patch } });
  return checked.success ? { ok: true, root: checked.data } : { ok: false };
}

export type SettingsPath = 'font' | 'reminders' | 'order' | 'data' | 'about';
export interface ListRow {
  path: SettingsPath;
  title: string;
  sub: string;
}

/** The five rows of the list, with the live second line of each. */
export function listRows(root: Root, today: IsoDate, version: string): ListRow[] {
  const s = root.settings;
  return [
    { path: 'font', title: 'ขนาดตัวอักษร', sub: fontLabel(s.fontSize) },
    { path: 'reminders', title: 'การเตือน', sub: `ใกล้หมดอายุ ${s.expiryWarnDays} วัน · ใกล้หมด ${s.lowStockDays} วัน` },
    { path: 'order', title: 'การสั่งยาและร้านค้า', sub: `สั่งให้พอ ${s.orderDays} วัน · ${root.shops.length} ร้าน` },
    { path: 'data', title: 'ข้อมูลและสำรอง', sub: backupStatus(root, today).text },
    { path: 'about', title: 'เกี่ยวกับ JudYa', sub: `เวอร์ชัน ${version}` },
  ];
}

export const STANDARD_TEMPLATE_TEXT = 'ใช้ข้อความมาตรฐาน';
export const orderTemplateText = (template: string): string => (template.trim() === '' ? STANDARD_TEMPLATE_TEXT : template);
