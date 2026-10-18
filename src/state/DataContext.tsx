// The ONE holder of the app data in React. Loads `judya.v2` once at start; every change goes through a
// function in domain/actions.ts and is saved with saveRoot. Screens never touch storage themselves.
// A change that cannot be saved is NOT shown as done: the screen keeps the old data and a "save failed" bar appears.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as actions from '../domain/actions';
import type { SettingsError, SettingsPatch } from '../domain/actions';
import * as medicine from '../domain/medicine';
import type {
  AddMedicineError,
  AddMedicineInput,
  AddPersonError,
  AddPersonInput,
  AdjustDoseError,
  EditMedicineError,
  EditMedicinePatch,
  EventReason,
  MedicineContext,
  ResumeMedicineError,
  StopMedicineError,
} from '../domain/medicine';
import type { Schedule } from '../domain/schema';
import { emptyRoot, type Root } from '../domain/schema';
import { loadRoot, restoreRoot, saveRoot, startFresh, type LoadResult, type SaveResult } from '../domain/storage';
import type { IsoDate } from '../domain/calc';
import { todayInBangkok } from '../domain/today';
import { requestPersistence } from './persist';

export type ProblemKind = 'corrupt' | 'wrong-version' | 'unavailable';
export type DataState = { kind: 'ready'; root: Root } | { kind: 'problem'; problem: ProblemKind };
export type SaveFailure = Extract<SaveResult, { ok: false }>['reason'];

/** Result of a change that can be refused. `save_failed` = the change was fine but could not be written to the phone;
 * then nothing changed, in memory or on disk, and the screen must not say it worked. */
export type ActionResult<Extra extends object, E extends string> = ({ ok: true } & Extra) | { ok: false; error: E | 'save_failed' };

export interface DataApi {
  state: DataState;
  /** Set while the last change could not be saved. */
  saveFailure: SaveFailure | null;
  retrySave: () => void;
  /** Load again (after a problem screen). */
  reload: () => void;
  /** Keep a copy of the unreadable data, then start with a blank house. */
  startOver: () => SaveResult;
  /** The clock of the app: today's date in Bangkok. Tests pass their own. */
  getToday: () => IsoDate;
  tickDose: (key: string) => void;
  untickDose: (key: string) => void;
  loadSample: () => void;
  clearSample: () => void;
  addPerson: (input: AddPersonInput) => ActionResult<{ personId: string }, AddPersonError>;
  addMedicine: (
    input: AddMedicineInput,
  ) => ActionResult<{ assignmentId: string; medicationId: string; reusedMedication: boolean }, AddMedicineError>;
  adjustDose: (
    assignmentId: string,
    input: { schedule: Schedule; reason: EventReason; note?: string },
  ) => ActionResult<object, AdjustDoseError>;
  stopMedicine: (assignmentId: string, input: { reason: EventReason; note?: string }) => ActionResult<object, StopMedicineError>;
  resumeMedicine: (assignmentId: string, input: { note?: string }) => ActionResult<object, ResumeMedicineError>;
  editMedicine: (assignmentId: string, patch: EditMedicinePatch) => ActionResult<{ sharedWith: number }, EditMedicineError>;
  /** Backup/restore (step 3.2d). Works also on the problem screen. Replaces all data with an already checked root; the old
   * text is kept in `judya.v2.prev`. On any failure nothing changes (memory and disk keep the current data). */
  replaceAll: (root: Root) => ActionResult<object, 'invalid_data'>;
  /** Records that a backup file was shared / downloaded at `nowIso` (the same time stamped into the file). */
  markBackedUp: (nowIso: string) => ActionResult<object, never>;
  /** The two warning thresholds (apply at once, no save button). A refused or unsaved value changes nothing. */
  setSettings: (patch: SettingsPatch) => ActionResult<object, SettingsError>;
}

const nowIso = (): string => new Date().toISOString();

/** Short random id (BRIEF section 2). */
const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14).padEnd(12, '0');

function toState(result: LoadResult): DataState {
  switch (result.status) {
    case 'ok':
      return { kind: 'ready', root: result.root };
    case 'empty':
      return { kind: 'ready', root: emptyRoot(nowIso()) }; // first launch: blank house, nothing written yet
    default:
      return { kind: 'problem', problem: result.status };
  }
}

const DataContext = createContext<DataApi | null>(null);

export function DataProvider({ children, getToday = todayInBangkok }: { children: ReactNode; getToday?: () => IsoDate }) {
  const [state, setState] = useState<DataState>(() => toState(loadRoot()));
  const [saveFailure, setSaveFailure] = useState<SaveFailure | null>(null);
  const stateRef = useRef(state);
  const pending = useRef<((root: Root) => Root) | null>(null);

  useEffect(() => {
    void requestPersistence();
  }, []);

  const commit = useCallback((next: DataState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const apply = useCallback(
    (change: (root: Root) => Root) => {
      const current = stateRef.current;
      if (current.kind !== 'ready') return;
      const next = change(current.root);
      if (next === current.root) return; // nothing changed, nothing to save
      const result = saveRoot(next);
      if (result.ok) {
        pending.current = null;
        setSaveFailure(null);
        commit({ kind: 'ready', root: next });
      } else {
        pending.current = change; // screen keeps the old data; the person can retry
        setSaveFailure(result.reason);
      }
    },
    [commit],
  );

  /** Runs one function of domain/medicine.ts on the current data and saves the result. Only a saved result is shown:
   * a refusal or a failed save leaves the data in memory exactly as it was (like tickDose). */
  const mutate = useCallback(
    <R extends { ok: true; root: Root }, E extends string>(
      change: (root: Root, ctx: MedicineContext) => R | { ok: false; error: E },
    ): Omit<R, 'root'> | { ok: false; error: E | 'save_failed' } => {
      const current = stateRef.current;
      if (current.kind !== 'ready') return { ok: false, error: 'save_failed' };
      const res = change(current.root, { today: getToday(), nowIso: nowIso(), newId });
      if (!res.ok) return res;
      const saved = saveRoot(res.root);
      if (!saved.ok) return { ok: false, error: 'save_failed' };
      pending.current = null;
      setSaveFailure(null);
      commit({ kind: 'ready', root: res.root });
      const { root: _root, ...rest } = res;
      return rest;
    },
    [commit, getToday],
  );

  const replaceAll = useCallback(
    (root: Root): ActionResult<object, 'invalid_data'> => {
      const result = restoreRoot(root);
      if (!result.ok) return { ok: false, error: result.reason === 'invalid' ? 'invalid_data' : 'save_failed' };
      pending.current = null;
      setSaveFailure(null);
      commit({ kind: 'ready', root });
      return { ok: true };
    },
    [commit],
  );

  const api = useMemo<DataApi>(
    () => ({
      state,
      saveFailure,
      retrySave: () => {
        if (pending.current) apply(pending.current);
      },
      reload: () => commit(toState(loadRoot())),
      startOver: () => {
        const result = startFresh(nowIso());
        if (result.ok) commit(toState(loadRoot()));
        return result;
      },
      getToday,
      tickDose: (key) => apply((r) => actions.tickDose(r, getToday(), key)),
      untickDose: (key) => apply((r) => actions.untickDose(r, getToday(), key)),
      loadSample: () => apply((r) => actions.loadSample(r, getToday(), nowIso())),
      clearSample: () => apply(actions.clearSample),
      addPerson: (input) => mutate((r, ctx) => medicine.addPerson(r, input, ctx)),
      addMedicine: (input) => {
        const wasEmpty = stateRef.current.kind === 'ready' && stateRef.current.root.assignments.length === 0;
        const res = mutate((r, ctx) => medicine.addMedicine(r, input, ctx));
        if (res.ok && wasEmpty) void requestPersistence(undefined, { again: true }); // BRIEF 3.2: ask again after the first medicine
        return res;
      },
      adjustDose: (id, input) => mutate((r, ctx) => medicine.adjustDose(r, id, input, ctx)),
      stopMedicine: (id, input) => mutate((r, ctx) => medicine.stopMedicine(r, id, input, ctx)),
      resumeMedicine: (id, input) => mutate((r, ctx) => medicine.resumeMedicine(r, id, input, ctx)),
      editMedicine: (id, patch) => mutate((r, ctx) => medicine.editMedicine(r, id, patch, ctx)),
      replaceAll,
      markBackedUp: (at) => mutate((r) => ({ ok: true as const, root: actions.markBackedUp(r, at) })),
      setSettings: (patch) => mutate((r) => actions.setSettings(r, patch)),
    }),
    [state, saveFailure, apply, commit, getToday, mutate, replaceAll],
  );

  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

export function useData(): DataApi {
  const api = useContext(DataContext);
  if (!api) throw new Error('useData must be used inside <DataProvider>');
  return api;
}

/** The loaded data. Only for screens shown when loading worked (the app shell guarantees it). */
export function useRoot(): Root {
  const { state } = useData();
  if (state.kind !== 'ready') throw new Error('useRoot: data is not loaded');
  return state.root;
}
