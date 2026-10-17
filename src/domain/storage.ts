// localStorage access for JudYa (BRIEF 3.2). Two keys only: `judya.v2` and its safety copy `judya.v2.prev`
// (written only by startFresh, before the old text is replaced).
// This module never reads, writes, lists or deletes any other key (judya.v1 and medmate.v1 live on the
// same origin and belong to older apps).
//
// Saving = validate -> write -> read back -> validate; if anything goes wrong the previous value is put back.
import { emptyRoot, rootSchema, type Root } from './schema';

export const STORAGE_KEY = 'judya.v2';
export const PREV_KEY = 'judya.v2.prev';

/** The only part of the Storage API this module uses. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadResult =
  | { status: 'empty' } // nothing saved yet (first launch)
  | { status: 'ok'; root: Root }
  | { status: 'corrupt'; raw: string; reason: string } // not JSON, or fails the schema. NOT overwritten.
  | { status: 'wrong-version'; raw: string; foundVersion: unknown } // e.g. data from a newer app. NOT overwritten.
  | { status: 'unavailable' }; // storage blocked or missing

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'unavailable' | 'quota' | 'verify-failed'; detail?: string };

/** localStorage can throw just by being touched (blocked site data, private mode). */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadRoot(store: KeyValueStore | null = browserStore()): LoadResult {
  if (!store) return { status: 'unavailable' };
  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null) return { status: 'empty' };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { status: 'corrupt', raw, reason: e instanceof Error ? e.message : 'invalid JSON' };
  }

  const found = typeof json === 'object' && json !== null ? (json as Record<string, unknown>).version : undefined;
  if (found !== 2) return { status: 'wrong-version', raw, foundVersion: found };

  const parsed = rootSchema.safeParse(json);
  if (!parsed.success) return { status: 'corrupt', raw, reason: parsed.error.message };
  return { status: 'ok', root: parsed.data };
}

function restore(store: KeyValueStore, previous: string | null): void {
  try {
    if (previous === null) store.removeItem(STORAGE_KEY);
    else store.setItem(STORAGE_KEY, previous);
  } catch {
    // Nothing more can be done; the caller already reports the failure.
  }
}

const isQuotaError = (e: unknown): boolean =>
  e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');

export function saveRoot(root: Root, store: KeyValueStore | null = browserStore()): SaveResult {
  if (!store) return { ok: false, reason: 'unavailable' };

  const checked = rootSchema.safeParse(root);
  if (!checked.success) return { ok: false, reason: 'invalid', detail: checked.error.message };
  const serialized = JSON.stringify(checked.data);

  let previous: string | null;
  try {
    previous = store.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  try {
    store.setItem(STORAGE_KEY, serialized);
  } catch (e) {
    restore(store, previous);
    return { ok: false, reason: isQuotaError(e) ? 'quota' : 'unavailable', detail: e instanceof Error ? e.message : undefined };
  }

  // Read back and validate: what is on disk must be exactly what we meant to write.
  let back: string | null = null;
  try {
    back = store.getItem(STORAGE_KEY);
  } catch {
    // handled below
  }
  if (back !== serialized || !rootSchema.safeParse(safeParse(back)).success) {
    restore(store, previous);
    return { ok: false, reason: 'verify-failed' };
  }
  return { ok: true };
}

function safeParse(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** "Start over" for data that cannot be loaded (corrupt / other version): first copy the text now in `judya.v2`
 * to `judya.v2.prev`, and only if that worked replace `judya.v2` with a blank house. If either step fails the old
 * text is still in `judya.v2`. An older `judya.v2.prev` is overwritten. */
export function startFresh(nowIso: string, store: KeyValueStore | null = browserStore()): SaveResult {
  if (!store) return { ok: false, reason: 'unavailable' };
  let old: string | null;
  try {
    old = store.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (old !== null) {
    try {
      store.setItem(PREV_KEY, old);
      if (store.getItem(PREV_KEY) !== old) return { ok: false, reason: 'verify-failed', detail: 'safety copy' };
    } catch (e) {
      return { ok: false, reason: isQuotaError(e) ? 'quota' : 'unavailable', detail: 'safety copy' };
    }
  }
  return saveRoot(emptyRoot(nowIso), store);
}
