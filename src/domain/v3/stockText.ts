// Thai texts for "how long will it last". Pure; the unit (days or weeks) is chosen by the caller with `unitFor`.
import type { Schedule } from './schema';
import type { DaysLeft } from './stock';

/** Up to this many days the text is "ไม่ถึง 2 สัปดาห์"; more than this it is "ประมาณ N สัปดาห์". */
export const WEEKS_THRESHOLD_DAYS = 14;

export type LeftUnit = 'days' | 'weeks';

/** A medicine that is not taken every day: a meal schedule whose days rule is not 'daily'. (An interval schedule
 * is taken on every day of its course.) */
export const isNotDaily = (schedule: Schedule): boolean => schedule.kind === 'meal' && schedule.days.kind !== 'daily';

/** Weeks if any of the given schedules (e.g. before and after a dose change) is not taken every day, else days. */
export const unitFor = (...schedules: Schedule[]): LeftUnit => (schedules.some(isNotDaily) ? 'weeks' : 'days');

/** Days left as text. weeks: <= 14 days "ไม่ถึง 2 สัปดาห์", more "ประมาณ N สัปดาห์" (N = days / 7, nearest whole number).
 * days: "N วัน" ("ไม่พอสำหรับวันนี้" at 0, as in v2). */
export function formatDaysLeft(d: DaysLeft, unit: LeftUnit): string {
  switch (d.status) {
    case 'unknown':
      return 'ยังไม่ได้นับ';
    case 'enough':
      return 'พอใช้ตลอดคอร์ส';
    case 'tubes':
      return 'นับเป็นหลอด ไม่คำนวณวัน';
    case 'error':
      return 'ข้อมูลสต็อกไม่ตรงกับยา';
    case 'ok':
      if (unit === 'weeks') {
        return d.days <= WEEKS_THRESHOLD_DAYS ? 'ไม่ถึง 2 สัปดาห์' : `ประมาณ ${Math.round(d.days / 7)} สัปดาห์`;
      }
      return d.days === 0 ? 'ไม่พอสำหรับวันนี้' : `${d.days} วัน`;
  }
}

/** "before → after" in one unit for both sides. */
export const formatDaysLeftChange = (before: DaysLeft, after: DaysLeft, unit: LeftUnit): string =>
  `${formatDaysLeft(before, unit)} → ${formatDaysLeft(after, unit)}`;
