import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import styles from './Toast.module.css';

export const TOAST_MS = 3000;

/** The floating message at the bottom of the screen (black, white text). It is read out (role="status") and goes away
 * after 3 seconds. Drawn in <body>, so it needs no theme class. `text = null` shows nothing. */
export function Toast({ text }: { text: string | null }) {
  if (text === null) return null;
  return createPortal(
    <p className={styles.toast} role="status">
      {text}
    </p>,
    document.body,
  );
}

/** `[text, show]`: `show('...')` puts a message up for 3 seconds; a new one replaces the old one. */
export function useToast(): [string | null, (text: string) => void] {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = (t: string): void => {
    window.clearTimeout(timer.current);
    setText(t);
    timer.current = window.setTimeout(() => setText(null), TOAST_MS);
  };
  return [text, show];
}

/** Space kept between the floating message and the bar it floats above. */
export const TOAST_GAP = 12;

/** For a page with its own fixed bar at the bottom (M4 PR 11.3b-2b fix): keeps the floating message above that bar. It measures the bar's real
 * top edge (so it follows the font size and the safe area) and publishes it as `--toast-bottom` on <html>; Toast.module.css reads it, and
 * without it the message sits where it always did. The variable goes away when the page leaves. */
export function useToastAbove(bar: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const set = (): void => {
      const lift = root.clientHeight - el.getBoundingClientRect().top + TOAST_GAP;
      root.style.setProperty('--toast-bottom', `${Math.max(lift, 0)}px`);
    };
    set();
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set);
    watch?.observe(el);
    window.addEventListener('resize', set);
    return () => {
      watch?.disconnect();
      window.removeEventListener('resize', set);
      root.style.removeProperty('--toast-bottom');
    };
  }, [bar]);
}
