// The v3 medicine list page (route #/n/meds): owns the data and the clock, hands them to MedsListView.
// Normal mode reads `judya.v3` (loadRoot) and saves only when a house medicine is refilled (PR 5b). Demo mode (#/n/meds?demo=...) works on a
// made-up house in memory and never calls storage in any form (not even a read).
import { useState } from 'react';
import { useRoute } from '../../router';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { isMedsDemoName, medsDemoRoot, type MedsDemoName } from '../../domain/v3/medsListDemo';
import { loadRoot, saveRoot } from '../../domain/v3/storage';
import { openRoot, saveErrorText, useBangkokToday, type HomePageProps, type Loaded } from './HomeV3Page';
import { ProblemV3 } from './ProblemV3';
import { MedsListView, type MedsListViewProps } from './MedsListV3';

/** `&tab=house` opens the house medicines, `&open=stopped|deleted` opens a folded section, `&item=<id>` opens the sheet of a
 * house medicine and `&item=<id>&sheet=refill` its refill sheet (test links). */
function initialFrom(query: URLSearchParams): MedsListViewProps['initial'] {
  const tab = query.get('tab');
  const open = query.get('open');
  const item = query.get('item');
  return {
    ...(tab === 'house' || tab === 'mine' ? { tab } : {}),
    ...(open === 'stopped' || open === 'deleted' ? { open } : {}),
    ...(item ? { item, ...(query.get('sheet') === 'refill' ? { sheet: 'refill' as const } : {}) } : {}),
  };
}

export function MedsListV3Route(props: HomePageProps) {
  const { query } = useRoute();
  const demo = query.get('demo');
  const initial = initialFrom(query);
  return isMedsDemoName(demo) ? <DemoMeds key={demo} name={demo} initial={initial} /> : <LiveMeds key="live" initial={initial} {...props} />;
}

function DemoMeds({ name, initial }: { name: MedsDemoName; initial: MedsListViewProps['initial'] }) {
  const [root] = useState(() => medsDemoRoot(name));
  return <MedsListView root={root} today={DEMO_TODAY} demo linkSuffix={`?demo=${name}`} initial={initial} />; // no persist: a demo saves nothing
}

function LiveMeds({ getToday, store, initial }: HomePageProps & { initial: MedsListViewProps['initial'] }) {
  const today = useBangkokToday(getToday);
  const [loaded] = useState<Loaded>(() => openRoot(store === undefined ? loadRoot() : loadRoot(store)));
  if (loaded.kind === 'problem') {
    return <ProblemV3 loaded={loaded} {...(store === undefined ? {} : { store })} />;
  }
  const persist: NonNullable<MedsListViewProps['persist']> = (root) => {
    const result = store === undefined ? saveRoot(root) : saveRoot(root, store);
    return result.ok ? { ok: true } : { ok: false, text: saveErrorText(result) };
  };
  return <MedsListView root={loaded.root} today={today} demo={false} persist={persist} initial={initial} />;
}
