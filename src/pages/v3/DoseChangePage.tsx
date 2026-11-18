// The v3 change-how-to-take page (route #/n/meds/:id/dose): owns the data, the clock and the way back.
// Normal mode reads and writes `judya.v3` through v3/storage.ts only. Demo mode (?demo=...) works on a made-up house in memory
// and never calls storage in any form (not even a read). After a save it goes back to the medicine page and says so once.
import { useState } from 'react';
import { useRoute } from '../../router';
import { setFlash } from '../../components/v3/flash';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { isMedsDemoName, medsDemoRoot, type MedsDemoName } from '../../domain/v3/medsListDemo';
import type { Root } from '../../domain/v3/schema';
import { loadRoot, saveRoot } from '../../domain/v3/storage';
import { openRoot, saveErrorText, useBangkokToday, type HomePageProps, type Loaded } from './HomeV3Page';
import { ProblemV3 } from './ProblemV3';
import { DoseChangeView, SAVED_TEXT, type DoseChangeViewProps } from './DoseChangeV3';

export function DoseChangeV3Route({ id, ...props }: HomePageProps & { id: string }) {
  const { query } = useRoute();
  const demo = query.get('demo');
  return isMedsDemoName(demo) ? <DemoDose key={`${demo}/${id}`} name={demo} id={id} /> : <LiveDose key={`live/${id}`} id={id} {...props} />;
}

const leave = (to: string): void => {
  setFlash(SAVED_TEXT);
  window.location.hash = to;
};

function DemoDose({ name, id }: { name: MedsDemoName; id: string }) {
  const [root] = useState<Root>(() => medsDemoRoot(name));
  const back = `#/n/meds/${encodeURIComponent(id)}?demo=${name}`;
  // no persist: a demo saves nothing
  return <DoseChangeView root={root} id={id} today={DEMO_TODAY} demo backHref={back} onSaved={() => leave(back)} nowIso={() => `${DEMO_TODAY}T09:00:00+07:00`} />;
}

function LiveDose({ id, getToday, store }: HomePageProps & { id: string }) {
  const today = useBangkokToday(getToday);
  const [loaded] = useState<Loaded>(() => openRoot(store === undefined ? loadRoot() : loadRoot(store)));
  if (loaded.kind === 'problem') {
    return <ProblemV3 loaded={loaded} {...(store === undefined ? {} : { store })} />;
  }
  const persist: NonNullable<DoseChangeViewProps['persist']> = (root) => {
    const result = store === undefined ? saveRoot(root) : saveRoot(root, store);
    return result.ok ? { ok: true } : { ok: false, text: saveErrorText(result) };
  };
  const back = `#/n/meds/${encodeURIComponent(id)}`;
  return <DoseChangeView root={loaded.root} id={id} today={today} demo={false} persist={persist} backHref={back} onSaved={() => leave(back)} nowIso={() => new Date().toISOString()} />;
}
