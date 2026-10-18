// Ask the browser not to clear our data (BRIEF 3.2), and remember what it answered so Settings can show it.
// The app asks when it opens (once per page load, and not at all when already promised) and again after the first
// medicine is saved. The answer is the browser's, not ours: "granted" is a promise from the browser only.
import { useSyncExternalStore } from 'react';

/** unknown = not checked yet · granted = the browser promised · denied = it did not · unsupported = no such feature. */
export type PersistStatus = 'unknown' | 'granted' | 'denied' | 'unsupported';

let status: PersistStatus = 'unknown';
let asked = false;
const listeners = new Set<() => void>();

const setStatus = (next: PersistStatus): void => {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The storage manager of this browser, or undefined where there is none (reading `navigator.storage` never throws). */
const browserStorage = (): StorageManager | undefined => (typeof navigator === 'undefined' ? undefined : navigator.storage);

/** Reads the current answer without asking (used when Settings opens). */
export async function refreshPersistStatus(storage: StorageManager | undefined = browserStorage()): Promise<PersistStatus> {
  try {
    if (!storage?.persist || !storage.persisted) {
      setStatus('unsupported');
    } else {
      setStatus((await storage.persisted()) ? 'granted' : 'denied');
    }
  } catch {
    setStatus('unsupported');
  }
  return status;
}

/** Asks the browser to keep our data. Once per page load unless `again` is set (used after the first saved medicine);
 * never asks when the browser already promised. Any failure just means no promise. */
export async function requestPersistence(
  storage: StorageManager | undefined = browserStorage(),
  { again = false }: { again?: boolean } = {},
): Promise<PersistStatus> {
  if (asked && !again) return status;
  asked = true;
  try {
    if (!storage?.persist) {
      setStatus('unsupported');
      return status;
    }
    if (storage.persisted && (await storage.persisted())) {
      setStatus('granted');
      return status;
    }
    setStatus((await storage.persist()) ? 'granted' : 'denied');
  } catch {
    // Refused or not allowed here: the app works the same, just without the promise.
    setStatus('denied');
  }
  return status;
}

export const usePersistStatus = (): PersistStatus => useSyncExternalStore(subscribe, () => status, () => 'unknown');

/** Test helper: lets a test ask again and forgets the last answer. */
export const resetPersistenceAsked = (): void => {
  asked = false;
  status = 'unknown';
  listeners.forEach((l) => l());
};
