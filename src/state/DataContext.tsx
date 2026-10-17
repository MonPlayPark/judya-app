// The ONE holder of the app data in React. Loads `judya.v2` once at start; every change goes through a
// function in domain/actions.ts and is saved with saveRoot. Screens never touch storage themselves.
// A change that cannot be saved is NOT shown as done: the screen keeps the old data and a "save failed" bar appears.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as actions from '../domain/actions';
import { emptyRoot, type Root } from '../domain/schema';
import { loadRoot, saveRoot, startFresh, type LoadResult, type SaveResult } from '../domain/storage';
import type { IsoDate } from '../domain/calc';
import { todayInBangkok } from '../domain/today';
import { requestPersistence } from './persist';

export type ProblemKind = 'corrupt' | 'wrong-version' | 'unavailable';
export type DataState = { kind: 'ready'; root: Root } | { kind: 'problem'; problem: ProblemKind };
export type SaveFailure = Extract<SaveResult, { ok: false }>['reason'];

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
}

const nowIso = (): string => new Date().toISOString();

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
    }),
    [state, saveFailure, apply, commit, getToday],
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
