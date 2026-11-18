// The v3 settings pages (routes #/n/settings, /font, /reminders, /order, /about): own the data and the clock, hand them to the views.
// Normal mode reads and writes `judya.v3` through v3/storage.ts only (one saveRoot per change). Demo mode (?demo=...) works on a
// made-up house in memory and never calls storage in any form (not even a read). The data page (/data) is DataPage.
import { useState } from 'react';
import { useRoute } from '../../router';
import { isShopsDemoName, shopsDemoRoot } from '../../domain/v3/shopsDemo';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import type { Root } from '../../domain/v3/schema';
import { loadRoot, saveRoot } from '../../domain/v3/storage';
import { openRoot, saveErrorText, useBangkokToday, type HomePageProps, type Loaded } from './HomeV3Page';
import { demoRootOf } from './MemberFormPage';
import { ProblemV3 } from './ProblemV3';
import { AboutView, FontView, OrderSettingsView, RemindersView, SettingsListView, type SettingsViewProps } from './SettingsV3';

export type SettingsScreen = 'list' | 'font' | 'reminders' | 'order' | 'about';

const VIEWS: Record<SettingsScreen, (p: SettingsViewProps) => JSX.Element> = {
  list: SettingsListView,
  font: FontView,
  reminders: RemindersView,
  order: OrderSettingsView,
  about: AboutView,
};

/** The made-up house of a demo name: the Home / medicine-list demos, or (for the shop count) the shops demos. */
function demoOf(name: string | null): Root | null {
  const data = demoRootOf(name);
  if (data) return data;
  return isShopsDemoName(name) ? shopsDemoRoot(name) : null;
}

export function SettingsRoute({ screen, ...props }: HomePageProps & { screen: SettingsScreen }) {
  const { query } = useRoute();
  const demo = query.get('demo');
  const demoData = demoOf(demo);
  return demoData ? <DemoSettings key={`${demo}`} name={demo ?? ''} root={demoData} screen={screen} /> : <LiveSettings key="live" screen={screen} {...props} />;
}

function DemoSettings({ name, root, screen }: { name: string; root: Root; screen: SettingsScreen }) {
  const [data] = useState(root);
  const View = VIEWS[screen];
  return <View root={data} today={DEMO_TODAY} demo linkSuffix={`?demo=${name}`} />; // no persist: a demo saves nothing
}

function LiveSettings({ screen, getToday, store }: HomePageProps & { screen: SettingsScreen }) {
  const today = useBangkokToday(getToday);
  const [loaded] = useState<Loaded>(() => openRoot(store === undefined ? loadRoot() : loadRoot(store)));
  if (loaded.kind === 'problem') {
    return <ProblemV3 loaded={loaded} {...(store === undefined ? {} : { store })} />;
  }
  const persist: NonNullable<SettingsViewProps['persist']> = (root) => {
    const result = store === undefined ? saveRoot(root) : saveRoot(root, store);
    return result.ok ? { ok: true } : { ok: false, text: saveErrorText(result) };
  };
  const View = VIEWS[screen];
  return <View root={loaded.root} today={today} demo={false} persist={persist} linkSuffix="" />;
}
