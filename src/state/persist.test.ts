import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistence, resetPersistenceAsked } from './persist';

const withStorage = (persist: () => Promise<boolean>, persisted = async () => false) =>
  Object.defineProperty(navigator, 'storage', { value: { persist, persisted }, configurable: true });

describe('requestPersistence', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'storage');
    resetPersistenceAsked();
  });

  it('does not ask again when already granted, and a refusal does not break the app', async () => {
    const persist = vi.fn(async () => true);
    withStorage(persist, async () => true);
    await requestPersistence();
    expect(persist).not.toHaveBeenCalled();

    resetPersistenceAsked();
    withStorage(async () => {
      throw new Error('refused');
    });
    await expect(requestPersistence()).resolves.toBe('denied'); // a refusal is just "no promise"
  });
});
