// The v3 add-member page (route #/n/members/new): owns the data and the way back, hands them to MemberFormView.
// Normal mode reads and writes `judya.v3` through v3/storage.ts only (a new user starts from the same blank house as Home).
// Demo mode (?demo=...) works on a made-up house in memory and never calls storage in any form (not even a read).
import { useState } from 'react';
import { useRoute } from '../../router';
import { demoRoot, isDemoName } from '../../domain/v3/homeDemo';
import { isMedsDemoName, medsDemoRoot } from '../../domain/v3/medsListDemo';
import type { Root } from '../../domain/v3/schema';
import { loadRoot, saveRoot } from '../../domain/v3/storage';
import { openRoot, saveErrorText, type HomePageProps, type Loaded } from './HomeV3Page';
import { MemberFormView, type MemberFormViewProps } from './MemberFormV3';
import homeStyles from './HomeV3.module.css';

const SHEETS: readonly string[] = ['avatars', 'done'];

/** A demo name of the list page (normal, nomember ...) or of Home (empty0 ...); the same names are carried in links. */
function demoRootOf(name: string | null): Root | null {
  if (isMedsDemoName(name)) return medsDemoRoot(name);
  if (isDemoName(name)) return demoRoot(name);
  return null;
}

/** Back goes to the page before; with no page before (opened by a link) it goes to Home. */
function goBack(fallback: string): void {
  if (window.history.length > 1) window.history.back();
  else window.location.hash = fallback;
}

export function MemberFormV3Route(props: HomePageProps) {
  const { query } = useRoute();
  const demo = query.get('demo');
  const sheet = query.get('sheet');
  const initialSheet = sheet !== null && SHEETS.includes(sheet) ? (sheet as 'avatars' | 'done') : undefined;
  const demoData = demoRootOf(demo);
  return demoData ? <DemoMember key={demo} name={demo ?? ''} root={demoData} initialSheet={initialSheet} /> : <LiveMember key="live" initialSheet={initialSheet} {...props} />;
}

/** Home knows only its own demo names; for any other one the way home is the real Home. */
const homeLink = (demo: string | null): string => (isDemoName(demo) ? `#/n?demo=${demo}` : '#/n');

function DemoMember({ name, root, initialSheet }: { name: string; root: Root; initialSheet: MemberFormViewProps['initialSheet'] }) {
  const home = homeLink(name);
  return <MemberFormView root={root} demo linkSuffix={`?demo=${name}`} homeHref={home} onBack={() => goBack(home)} initialSheet={initialSheet} />; // no persist: a demo saves nothing
}

function LiveMember({ initialSheet, store }: HomePageProps & { initialSheet: MemberFormViewProps['initialSheet'] }) {
  const [loaded] = useState<Loaded>(() => openRoot(store === undefined ? loadRoot() : loadRoot(store)));
  if (loaded.kind === 'problem') {
    return (
      <div className={`v3theme ${homeStyles.page}`}>
        <main className={homeStyles.body}>
          <p className={homeStyles.saveError} role="alert">
            {loaded.text}
          </p>
        </main>
      </div>
    );
  }
  const persist: NonNullable<MemberFormViewProps['persist']> = (root) => {
    const result = store === undefined ? saveRoot(root) : saveRoot(root, store);
    return result.ok ? { ok: true } : { ok: false, text: saveErrorText(result) };
  };
  return <MemberFormView root={loaded.root} demo={false} persist={persist} homeHref="#/n" onBack={() => goBack('#/n')} initialSheet={initialSheet === 'done' ? undefined : initialSheet} />;
}
