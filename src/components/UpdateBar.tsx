import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import styles from './UpdateBar.module.css';

/**
 * "New version" bar (BRIEF 3.4). The app never reloads by itself, so nobody loses a half-filled form;
 * the page only reloads when the person taps the button.
 */
export function UpdateBar() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const doUpdate = registerSW({
      onNeedRefresh: () => setNeedRefresh(true),
    });
    setUpdate(() => doUpdate);
  }, []);

  if (!needRefresh) return null;
  return (
    <div className={styles.bar} role="status">
      <span>มีเวอร์ชันใหม่</span>
      <button type="button" className={styles.button} onClick={() => void update?.()}>
        โหลดใหม่
      </button>
    </div>
  );
}
