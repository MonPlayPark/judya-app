// Suggestions for the medicine-name field (step 3.2b-2). The field takes any "source": a function from the typed
// text to a list. Today the only source is the names already used in this house; a ready-made medicine list can be
// plugged in later without touching the field (no medicine names are bundled: the list has not been checked by a pharmacist).
import type { Root } from './schema';

export interface Suggestion {
  label: string;
  /** second line, e.g. the unit */
  sub?: string;
  /** word in the pill on the right */
  kind: string;
}

export type SuggestionSource = (query: string) => Suggestion[];

export const MIN_QUERY = 2;
const MAX_ROWS = 6;

/** Same normalisation as findMedicationByName: spaces at both ends and letter case do not matter. */
const norm = (s: string): string => s.trim().toLowerCase();

/** Names of medicines already in the house that contain the typed text (at least 2 characters). */
export const houseSuggestions =
  (root: Root): SuggestionSource =>
  (query) => {
    const q = norm(query);
    if (q.length < MIN_QUERY) return [];
    return root.medications
      .filter((m) => norm(m.name).includes(q))
      .sort((a, b) => Number(norm(b.name).startsWith(q)) - Number(norm(a.name).startsWith(q)) || a.name.localeCompare(b.name, 'th'))
      .slice(0, MAX_ROWS)
      .map((m) => {
        const users = root.assignments.filter((a) => a.medicationId === m.id).length;
        return { label: m.name, sub: `หน่วย ${m.unit} · ใช้อยู่ ${users} คน`, kind: 'เคยเพิ่มแล้ว' };
      });
  };
