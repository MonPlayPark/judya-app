// Tiny hash router (BRIEF 3.1): GitHub Pages cannot rewrite every URL to one page, so routes live after '#'.
import { useSyncExternalStore } from 'react';

export interface Route {
  path: string; // '/', '/meds', ...
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathPart = '', queryPart = ''] = raw.split('?');
  const path = pathPart === '' ? '/' : pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return { path: trimmed || '/', query: new URLSearchParams(queryPart) };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const getHash = (): string => window.location.hash;

/** Current route; re-renders when the hash changes. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  return parseHash(hash);
}

export const href = (path: string): string => `#${path}`;
