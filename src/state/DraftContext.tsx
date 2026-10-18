// The half-filled "add medicine" form (3 steps). It lives in memory only: nothing is written to the phone
// until the last step is saved, going back does not lose it, and a page refresh drops it (the steps then
// ask the person politely to start again).
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { defaultForm, type ScheduleForm } from '../domain/scheduleForm';

export interface Draft {
  name: string;
  personId: string | null;
  form: ScheduleForm;
  unit: string;
  qty: string;
  expiry: string;
}

/** What the "เพิ่มยาแล้ว" page shows after the last step was saved. */
export interface SavedMedicine {
  name: string;
  who: string;
  lines: string[];
}

export const emptyDraft = (): Draft => ({ name: '', personId: null, form: defaultForm(), unit: 'เม็ด', qty: '', expiry: '' });

/** A draft that has what steps 2 and 3 need: a name and an owner. */
export const hasStarted = (d: Draft): boolean => d.name.trim().length >= 2 && d.personId !== null;

interface DraftApi {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  /** Start from nothing (also forgets the "added" page). */
  reset: () => void;
  saved: SavedMedicine | null;
  /** The last step was saved: the draft is emptied and the "added" page is shown. */
  finish: (saved: SavedMedicine) => void;
  clearSaved: () => void;
}

const DraftContext = createContext<DraftApi | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saved, setSaved] = useState<SavedMedicine | null>(null);

  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const reset = useCallback(() => {
    setDraft(emptyDraft());
    setSaved(null);
  }, []);
  const finish = useCallback((s: SavedMedicine) => {
    setDraft(emptyDraft());
    setSaved(s);
  }, []);
  const clearSaved = useCallback(() => setSaved(null), []);

  const api = useMemo<DraftApi>(() => ({ draft, update, reset, saved, finish, clearSaved }), [draft, update, reset, saved, finish, clearSaved]);
  return <DraftContext.Provider value={api}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftApi {
  const api = useContext(DraftContext);
  if (!api) throw new Error('useDraft must be used inside <DraftProvider>');
  return api;
}
