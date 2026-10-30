// The v3 Home page (route #/n): owns the data and the clock, hands a ready-made model to HomeView.
// Normal mode reads and writes `judya.v3` through v3/storage.ts only. Demo mode (#/n?demo=...) works on a made-up
// house in memory and never calls storage in any form (not even a read).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRoute } from '../../router';
import { buildHome, bangkokToday, toggleDose } from '../../domain/v3/home';
import { DEMO_TODAY, demoRoot, isDemoName, type DemoName } from '../../domain/v3/homeDemo';
import { emptyRoot, type Root } from '../../domain/v3/schema';
import { loadRoot, saveRoot, type KeyValueStore, type LoadResult, type SaveResult } from '../../domain/v3/storage';
import { HomeView } from './HomeV3';
import '../../styles/v3theme.css';
import styles from './HomeV3.module.css';

export interface HomePageProps {
  /** Tests only: the Thai date of "now". */
  getToday?: () => string;
  /** Tests only: a store to use instead of localStorage. */
  store?: KeyValueStore | null;
}

/** Text for a tick that could not be saved. The tick is not shown as done (the old data is kept). */
export function saveErrorText(result: Extract<SaveResult, { ok: false }>): string {
  const lead = 'บันทึกไม่ได้ ข้อมูลเดิมยังอยู่';
  switch (result.reason) {
    case 'quota':
      return `${lead} พื้นที่เก็บข้อมูลในเครื่องเต็ม`;
    case 'unavailable':
      return `${lead} เบราว์เซอร์ไม่ให้เก็บข้อมูล`;
    case 'invalid':
    case 'verify-failed':
      return `${lead} ลองกดอีกครั้ง`;
  }
}

/** The page for #/n. `?demo=` picks a demo house; anything else (or nothing) is the real data. */
export function HomeV3Route(props: HomePageProps) {
  const { query } = useRoute();
  const demo = query.get('demo');
  return isDemoName(demo) ? <DemoHome key={demo} name={demo} /> : <LiveHome key="live" {...props} />;
}

/** Re-reads the Thai date when the app comes back to the front and once a minute (midnight changes the day). */
export function useBangkokToday(getToday: (() => string) | undefined): string {
  const read = useCallback(() => getToday?.() ?? bangkokToday(), [getToday]);
  const [today, setToday] = useState(read);
  useEffect(() => {
    const refresh = (): void => setToday(read());
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [read]);
  return today;
}

function DemoHome({ name }: { name: DemoName }) {
  const [root, setRoot] = useState<Root>(() => demoRoot(name));
  const [picked, setPicked] = useState<string | null>(null);
  const model = useMemo(() => buildHome(root, DEMO_TODAY, picked), [root, picked]);
  return (
    <HomeView
      model={model}
      demo
      saveError={null}
      onPick={setPicked}
      onToggle={(key) => setRoot((r) => toggleDose(r, DEMO_TODAY, key))} // in memory only
    />
  );
}

export type Loaded = { kind: 'ok'; root: Root } | { kind: 'problem'; text: string };

export function openRoot(result: LoadResult): Loaded {
  switch (result.status) {
    case 'ok':
      return { kind: 'ok', root: result.root };
    case 'empty':
      return { kind: 'ok', root: emptyRoot(new Date().toISOString()) }; // a new user: nothing is written until they do something
    case 'unavailable':
      return { kind: 'problem', text: 'เบราว์เซอร์ไม่ให้เก็บข้อมูลในเครื่อง จึงเปิดหน้านี้ไม่ได้' };
    case 'corrupt':
    case 'wrong-version':
      return { kind: 'problem', text: 'อ่านข้อมูลที่เก็บไว้ไม่ได้ ข้อมูลเดิมยังอยู่ ไม่ได้ถูกลบหรือเขียนทับ' };
  }
}

function LiveHome({ getToday, store }: HomePageProps) {
  const today = useBangkokToday(getToday);
  const [loaded] = useState<Loaded>(() => openRoot(store === undefined ? loadRoot() : loadRoot(store)));
  const [root, setRoot] = useState<Root | null>(loaded.kind === 'ok' ? loaded.root : null);
  const [picked, setPicked] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const model = useMemo(() => (root ? buildHome(root, today, picked) : null), [root, today, picked]);

  const onToggle = (key: string): void => {
    if (!root) return;
    const next = toggleDose(root, today, key);
    const result = store === undefined ? saveRoot(next) : saveRoot(next, store);
    if (result.ok) {
      setRoot(next);
      setSaveError(null);
    } else {
      setSaveError(saveErrorText(result)); // the screen keeps the old data
    }
  };

  if (loaded.kind === 'problem' || !model) {
    return (
      <div className={`v3theme ${styles.page}`}>
        <main className={styles.body}>
          <p className={styles.saveError} role="alert">
            {loaded.kind === 'problem' ? loaded.text : ''}
          </p>
        </main>
      </div>
    );
  }
  return <HomeView model={model} demo={false} saveError={saveError} onPick={setPicked} onToggle={onToggle} />;
}
