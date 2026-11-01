// The v3 page "ข้อมูลและสำรองข้อมูล" (route #/n/settings/data): owns the data and the clock, hands them to DataView.
// Normal mode reads and writes `judya.v3` and `judya.v3.prev` through v3/storage.ts only. Demo mode (?demo=...) works on a
// made-up house in memory and never calls storage in any form (not even a read).
import { useEffect, useState } from 'react';
import { useRoute } from '../../router';
import { summarizeRoot } from '../../domain/v3/backup';
import { backupFileOf, isRestoreFailure, recordBackup, restoreFromBackup, type RestoreFailure } from '../../domain/v3/dataPage';
import { DEMO_TODAY, demoRoot, isDemoName } from '../../domain/v3/homeDemo';
import { isMedsDemoName, medsDemoRoot } from '../../domain/v3/medsListDemo';
import type { Root } from '../../domain/v3/schema';
import { loadRoot } from '../../domain/v3/storage';
import { handOffBackup } from '../../state/backupFile';
import { refreshPersistStatus, usePersistStatus } from '../../state/persist';
import { openRoot, useBangkokToday, type HomePageProps, type Loaded } from './HomeV3Page';
import { DataView, type BackupResult, type DataViewProps } from './DataV3';
import { ProblemV3 } from './ProblemV3';

/** A demo name of Home (normal, backup ...) or of the medicine list (nomeds ...); the same names are carried in links.
 * Home's names win where both have one ("normal"), because they carry a backup date. */
function demoRootOf(name: string | null): Root | null {
  if (isDemoName(name)) return demoRoot(name);
  if (isMedsDemoName(name)) return medsDemoRoot(name);
  return null;
}

/** Test link `&backup=old`: the demo house was last backed up 20 days before the demo date (shows the 14-day warning). */
const OLD_BACKUP = '2026-10-08T09:00:00+07:00';
const withOldBackup = (root: Root): Root => ({ ...root, meta: { ...root.meta, lastBackupAt: OLD_BACKUP } });

/** Back goes to the page before; with no page before (opened by a link) it goes to Home. */
function goBack(fallback: string): void {
  if (window.history.length > 1) window.history.back();
  else window.location.hash = fallback;
}

/** Reads the browser's answer about keeping our data when the page opens (it does not ask, and does not touch localStorage). */
function usePersistShown(): ReturnType<typeof usePersistStatus> {
  useEffect(() => {
    void refreshPersistStatus();
  }, []);
  return usePersistStatus();
}

export function DataV3Route(props: HomePageProps) {
  const { query } = useRoute();
  const demo = query.get('demo');
  const demoData = demoRootOf(demo);
  const error = query.get('error');
  return demoData ? (
    <DemoData key={demo} root={query.get('backup') === 'old' ? withOldBackup(demoData) : demoData} error={isRestoreFailure(error) ? error : undefined} confirm={query.get('sheet') === 'confirm'} homeHref={isDemoName(demo) ? `#/n?demo=${demo}` : '#/n'} />
  ) : (
    <LiveData key="live" {...props} />
  );
}

function DemoData({ root, error, confirm, homeHref }: { root: Root; error: RestoreFailure | undefined; confirm: boolean; homeHref: string }) {
  const persist = usePersistShown();
  // The confirm sheet of a test link shows a made-up file (the empty-medicines demo house) against the demo house.
  const file = medsDemoRoot('nomeds');
  const initial: DataViewProps['initial'] = { ...(error ? { error } : {}), ...(confirm ? { pending: { root: file, summary: summarizeRoot(file) } } : {}) };
  return <DataView root={root} today={DEMO_TODAY} demo persist={persist} onBack={() => goBack(homeHref)} initial={initial} />; // no onBackup / onRestore: a demo saves nothing
}

function LiveData({ getToday, store }: HomePageProps) {
  const today = useBangkokToday(getToday);
  const persist = usePersistShown();
  const [loaded] = useState<Loaded>(() => openRoot(store === undefined ? loadRoot() : loadRoot(store)));
  const [root, setRoot] = useState<Root | null>(loaded.kind === 'ok' ? loaded.root : null);

  if (loaded.kind === 'problem') return <ProblemV3 loaded={loaded} {...(store === undefined ? {} : { store })} />;
  if (root === null) return null; // not reachable: root is set whenever the data opened

  const onBackup = async (): Promise<BackupResult> => {
    const nowIso = new Date().toISOString();
    const file = backupFileOf(root, nowIso);
    const handOff = await handOffBackup(file.fileName, file.text);
    if (handOff === 'cancelled') return 'cancelled'; // nothing handed over: no date, no success
    const saved = recordBackup(root, nowIso, store);
    if (saved === null) return 'date_not_saved';
    setRoot(saved);
    return handOff;
  };

  const onRestore: NonNullable<DataViewProps['onRestore']> = (fileRoot) => {
    const outcome = restoreFromBackup(fileRoot, root, store);
    if (outcome.ok) setRoot(outcome.root);
    return outcome;
  };

  return <DataView root={root} today={today} demo={false} persist={persist} onBackup={onBackup} onRestore={onRestore} onBack={() => goBack('#/n')} />;
}
