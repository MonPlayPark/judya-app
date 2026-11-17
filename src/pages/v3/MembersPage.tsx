// The v3 members tab pages (routes #/n/members, #/n/members/:id, #/n/members/:id/edit): own the data and hand it to the views.
// Normal mode reads and writes `judya.v3` through v3/storage.ts only. Demo mode (?demo=...) works on a made-up house in memory
// and never calls storage in any form (not even a read). The same demo names as the add form (list demos and Home demos).
import { useState } from 'react';
import { useRoute } from '../../router';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import type { Root } from '../../domain/v3/schema';
import { loadRoot, saveRoot } from '../../domain/v3/storage';
import { openRoot, saveErrorText, type HomePageProps, type Loaded } from './HomeV3Page';
import { demoRootOf } from './MemberFormPage';
import { ProblemV3 } from './ProblemV3';
import { AllergyView } from './AllergyV3';
import { MemberDetailView, MemberEditView, MembersListView, type MembersViewProps } from './MembersV3';

type Screen = { kind: 'list'; open: boolean } | { kind: 'detail'; id: string; sheet: 'remove' | undefined } | { kind: 'edit'; id: string; sheet: 'avatars' | 'remove' | undefined }
  | { kind: 'allergy'; id: string; sheet: 'add' | 'confirm' | undefined; drug: string | undefined; symptom: string | undefined };

function Members({ screen, ...props }: HomePageProps & { screen: Screen }) {
  const { query } = useRoute();
  const demo = query.get('demo');
  const demoData = demoRootOf(demo);
  return demoData ? <DemoMembers key={demo} name={demo ?? ''} root={demoData} screen={screen} /> : <LiveMembers key="live" screen={screen} {...props} />;
}

const view = (screen: Screen, p: MembersViewProps) => {
  switch (screen.kind) {
    case 'list':
      return <MembersListView {...p} initialOpen={screen.open} />;
    case 'detail':
      return <MemberDetailView {...p} id={screen.id} initialSheet={screen.sheet} />;
    case 'edit':
      return <MemberEditView {...p} id={screen.id} initialSheet={screen.sheet} />;
    case 'allergy':
      return <AllergyView {...p} id={screen.id} initialSheet={screen.sheet} prefill={{ ...(screen.drug === undefined ? {} : { drug: screen.drug }), ...(screen.symptom === undefined ? {} : { symptom: screen.symptom }) }} />;
  }
};

function DemoMembers({ name, root, screen }: { name: string; root: Root; screen: Screen }) {
  const [data] = useState(root);
  return view(screen, { root: data, demo: true, linkSuffix: `?demo=${name}`, nowIso: () => `${DEMO_TODAY}T09:00:00+07:00` }); // no persist: a demo saves nothing
}

function LiveMembers({ screen, store }: HomePageProps & { screen: Screen }) {
  const [loaded] = useState<Loaded>(() => openRoot(store === undefined ? loadRoot() : loadRoot(store)));
  if (loaded.kind === 'problem') {
    return <ProblemV3 loaded={loaded} {...(store === undefined ? {} : { store })} />;
  }
  const persist: NonNullable<MembersViewProps['persist']> = (root) => {
    const result = store === undefined ? saveRoot(root) : saveRoot(root, store);
    return result.ok ? { ok: true } : { ok: false, text: saveErrorText(result) };
  };
  return view(screen, { root: loaded.root, demo: false, persist, nowIso: () => new Date().toISOString() });
}

/** `?open=removed` opens the folded "taken out" list; `?sheet=remove` (detail, edit) the question, `?sheet=avatars` (edit) the pictures: test links. */
export function MembersListRoute(props: HomePageProps) {
  const { query } = useRoute();
  return <Members screen={{ kind: 'list', open: query.get('open') === 'removed' }} {...props} />;
}

export function MemberDetailRoute({ id, ...props }: HomePageProps & { id: string }) {
  const { query } = useRoute();
  return <Members screen={{ kind: 'detail', id, sheet: query.get('sheet') === 'remove' ? 'remove' : undefined }} {...props} />;
}

export function MemberEditRoute({ id, ...props }: HomePageProps & { id: string }) {
  const { query } = useRoute();
  const sheet = query.get('sheet');
  return <Members screen={{ kind: 'edit', id, sheet: sheet === 'remove' || sheet === 'avatars' ? sheet : undefined }} {...props} />;
}

/** M4 PR 10. `?sheet=add|confirm` opens that sheet (test links, and the stop sheet's link: `&drug=` and `&symptom=` fill the add sheet). */
export function AllergyRoute({ id, ...props }: HomePageProps & { id: string }) {
  const { query } = useRoute();
  const sheet = query.get('sheet');
  return <Members screen={{ kind: 'allergy', id, sheet: sheet === 'add' || sheet === 'confirm' ? sheet : undefined, drug: query.get('drug') ?? undefined, symptom: query.get('symptom') ?? undefined }} {...props} />;
}
