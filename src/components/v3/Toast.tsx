import { useEffect, useRef, useState } from 'react';
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
