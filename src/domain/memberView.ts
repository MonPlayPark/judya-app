// What the members screens show (step 3.2c): the list cards, the removed list, the detail header. Pure: `today` is passed in.
// Nothing about doses or stock is calculated here; the numbers come from today.ts and care.ts, so the card and the
// "ยาวันนี้" screen of the same member always agree.
import type { IsoDate } from './calc';
import { memberStock, type MemberStock } from './care';
import { medsByMember, type MemberMeds } from './medView';
import type { Person, Root } from './schema';
import { todayDoses } from './today';

/** Names of the four profile colours (the colour is never the only sign). */
export const COLOR_LABEL: Record<Person['color'], string> = { blue: 'ฟ้า', green: 'เขียว', yellow: 'เหลือง', gray: 'เทา' };

export interface MemberSummary {
  person: Person;
  /** "ยา N รายการ": medicines that are not stopped. */
  medCount: number;
  /** "ทานวันนี้ N ครั้ง": the rows of this member in "ยาวันนี้" (0 for a member who sets out their own medicine). */
  doseCount: number;
  stock: MemberStock;
}

export function memberSummary(root: Root, person: Person, today: IsoDate): MemberSummary {
  return {
    person,
    medCount: root.assignments.filter((a) => a.personId === person.id && a.status === 'active').length,
    doseCount: todayDoses(root, today, person.id).length,
    stock: memberStock(root, person.id, today),
  };
}

/** A member who is still in the house (a removed member is not found). */
export const findMember = (root: Root, id: string): Person | undefined =>
  root.persons.find((p) => p.id === id && p.removedAt === undefined);

/** Every member in the house, in the order they were added. */
export const membersInHouse = (root: Root, today: IsoDate): MemberSummary[] =>
  root.persons.filter((p) => p.removedAt === undefined).map((p) => memberSummary(root, p, today));

/** Members taken out of the house (can be put back), in the order they were added. */
export const removedMembers = (root: Root): Person[] => root.persons.filter((p) => p.removedAt !== undefined);

/** Active and stopped medicines of one member who is still in the house. */
export const memberMeds = (root: Root, id: string): MemberMeds | undefined => medsByMember(root).find((m) => m.person.id === id);
