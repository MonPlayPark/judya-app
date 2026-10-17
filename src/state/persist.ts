// Ask the browser not to clear our data (BRIEF 3.2). Once per page load, and not at all when already granted.
let asked = false;

export async function requestPersistence(storage: StorageManager | undefined = navigator.storage): Promise<void> {
  if (asked) return;
  asked = true;
  try {
    if (!storage?.persist) return;
    if (storage.persisted && (await storage.persisted())) return;
    await storage.persist();
  } catch {
    // Not supported or refused: the app works the same, just without the promise.
  }
}

/** Test helper: lets a test ask again. */
export const resetPersistenceAsked = (): void => {
  asked = false;
};
