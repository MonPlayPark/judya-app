// The v3 add-medicine page (route #/n/meds/new): owns the data and the way back, hands them to AddMedView.
// Normal mode reads and writes `judya.v3` through v3/storage.ts only. Demo mode (?demo=...) works on a made-up house in
// memory and never calls storage in any form (not even a read); it also takes the test helpers name / kind / step.
import { useState } from 'react';
import { useRoute } from '../../router';
import { DEMO_TODAY, demoRoot, isDemoName } from '../../domain/v3/homeDemo';
import { isMedsDemoName, medsDemoRoot, type MedsDemoName } from '../../domain/v3/medsListDemo';
import { MED_KINDS, type MedKind, type Root } from '../../domain/v3/schema';
import { loadRoot, saveRoot } from '../../domain/v3/storage';
import { openRoot, saveErrorText, useBangkokToday, type HomePageProps, type Loaded } from './HomeV3Page';
import { ProblemV3 } from './ProblemV3';
import { AddMedView, type AddMedViewProps } from './AddMedV3';

type Initial = NonNullable<AddMedViewProps['initial']>;

/** Back goes to the page before; with no page before (opened by a link) it goes to the medicine list. */
function goBack(fallback: string): void {
  if (window.history.length > 1) window.history.back();
  else window.location.hash = fallback;
}

/** The medicine list knows only its own demo names; a Home demo name is carried over to the nearest one. */
const HOME_TO_MEDS: Record<string, MedsDemoName> = { empty0: 'nomember', empty1: 'nomeds' };
const medsDemoOf = (demo: string): MedsDemoName => (isMedsDemoName(demo) ? demo : (HOME_TO_MEDS[demo] ?? 'normal'));

/** `type=house` and `person=<id>` work everywhere; `name`, `kind` and `step` only in a demo. */
function initialFrom(query: URLSearchParams, demo: boolean): Initial {
  const type = query.get('type');
  const person = query.get('person');
  const initial: Initial = { ...(type === 'house' || type === 'personal' ? { type } : {}), ...(person ? { person } : {}) };
  if (!demo) return initial;
  const name = query.get('name');
  const kind = query.get('kind');
  const step = Number(query.get('step'));
  return {
    ...initial,
    ...(name ? { name } : {}),
    ...(MED_KINDS.includes(kind as MedKind) ? { kind: kind as MedKind } : {}),
    ...(Number.isInteger(step) && step >= 1 && step <= 3 ? { step } : {}),
  };
}

export function AddMedV3Route(props: HomePageProps) {
  const { query } = useRoute();
  const demo = query.get('demo');
  const data: Root | null = isMedsDemoName(demo) ? medsDemoRoot(demo) : isDemoName(demo) ? demoRoot(demo) : null;
  const initial = initialFrom(query, data !== null);
  return data && demo ? <DemoAdd key={demo} name={demo} root={data} initial={initial} /> : <LiveAdd key="live" initial={initial} {...props} />;
}

const afterSave = (type: 'personal' | 'house', suffix: string): void => {
  const demo = suffix.replace('?', '');
  window.location.hash = type === 'house' ? `#/n/meds?tab=house${demo ? `&${demo}` : ''}` : `#/n/meds${suffix}`;
};

function DemoAdd({ name, root, initial }: { name: string; root: Root; initial: Initial }) {
  const medsSuffix = `?demo=${medsDemoOf(name)}`;
  // no persist: a demo saves nothing
  return <AddMedView root={root} today={DEMO_TODAY} demo linkSuffix={`?demo=${name}`} medsSuffix={medsSuffix} initial={initial} onBack={() => goBack(`#/n/meds${medsSuffix}`)} onSaved={(type) => afterSave(type, medsSuffix)} nowIso={() => `${DEMO_TODAY}T09:00:00+07:00`} />;
}

function LiveAdd({ getToday, store, initial }: HomePageProps & { initial: Initial }) {
  const today = useBangkokToday(getToday);
  const [loaded] = useState<Loaded>(() => openRoot(store === undefined ? loadRoot() : loadRoot(store)));
  if (loaded.kind === 'problem') {
    return <ProblemV3 loaded={loaded} {...(store === undefined ? {} : { store })} />;
  }
  const persist: NonNullable<AddMedViewProps['persist']> = (root) => {
    const result = store === undefined ? saveRoot(root) : saveRoot(root, store);
    return result.ok ? { ok: true } : { ok: false, text: saveErrorText(result) };
  };
  return <AddMedView root={loaded.root} today={today} demo={false} persist={persist} initial={initial} onBack={() => goBack('#/n/meds')} onSaved={(type) => afterSave(type, '')} />;
}
