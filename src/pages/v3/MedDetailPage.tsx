// The v3 medicine detail page (route #/n/meds/:id): owns the data and the clock, hands them to MedDetailView.
// Normal mode reads and writes `judya.v3` through v3/storage.ts only. Demo mode (?demo=...) works on a made-up house
// in memory and never calls storage in any form (not even a read), so a reload gives the starting values again.
import { useState } from 'react';
import { useRoute } from '../../router';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { isMedsDemoName, medsDemoRoot, type MedsDemoName } from '../../domain/v3/medsListDemo';
import type { Root } from '../../domain/v3/schema';
import { loadRoot, saveRoot } from '../../domain/v3/storage';
import { openRoot, saveErrorText, useBangkokToday, type HomePageProps, type Loaded } from './HomeV3Page';
import { ProblemV3 } from './ProblemV3';
import { MedDetailNotFound, MedDetailView, type DetailSheet, type MedDetailViewProps, type Persist } from './MedDetailV3';

const SHEETS: readonly string[] = ['refill', 'stop', 'resume', 'history'];
const isSheet = (v: string | null): v is DetailSheet => v !== null && SHEETS.includes(v);

export function MedDetailV3Route({ id, ...props }: HomePageProps & { id: string }) {
  const { query } = useRoute();
  const demo = query.get('demo');
  const sheet = query.get('sheet');
  const initialSheet = isSheet(sheet) ? sheet : undefined;
  return isMedsDemoName(demo) ? (
    <DemoDetail key={`${demo}/${id}`} name={demo} id={id} initialSheet={initialSheet} />
  ) : (
    <LiveDetail key={`live/${id}`} id={id} initialSheet={initialSheet} {...props} />
  );
}

const inMemory: Persist = () => ({ ok: true }); // demo: nothing is saved

function DemoDetail({ name, id, initialSheet }: { name: MedsDemoName; id: string; initialSheet: DetailSheet | undefined }) {
  const [root] = useState<Root>(() => medsDemoRoot(name));
  const props: MedDetailViewProps = {
    root, id, today: DEMO_TODAY, demo: true, persist: inMemory, listHref: `#/n/meds?demo=${name}`, initialSheet,
    nowIso: () => `${DEMO_TODAY}T09:00:00+07:00`,
  };
  return <MedDetailView {...props} />;
}

function LiveDetail({ id, initialSheet, getToday, store }: HomePageProps & { id: string; initialSheet: DetailSheet | undefined }) {
  const today = useBangkokToday(getToday);
  const [loaded] = useState<Loaded>(() => openRoot(store === undefined ? loadRoot() : loadRoot(store)));
  if (loaded.kind === 'problem') {
    return <ProblemV3 loaded={loaded} {...(store === undefined ? {} : { store })} />;
  }
  const persist: Persist = (root) => {
    const result = store === undefined ? saveRoot(root) : saveRoot(root, store);
    return result.ok ? { ok: true } : { ok: false, text: saveErrorText(result) };
  };
  if (!loaded.root.assignments.some((a) => a.id === id)) return <MedDetailNotFound listHref="#/n/meds" />;
  return <MedDetailView root={loaded.root} id={id} today={today} demo={false} persist={persist} listHref="#/n/meds" initialSheet={initialSheet} nowIso={() => new Date().toISOString()} />;
}
