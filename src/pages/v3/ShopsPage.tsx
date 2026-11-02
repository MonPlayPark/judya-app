// The v3 shops page (route #/n/shops, M4 PR 11.3a): owns the data and the way back, hands them to ShopsView.
// Normal mode reads and writes `judya.v3` through v3/storage.ts only (the first step that writes shops). Demo mode
// (?demo=normal|empty|long) works on a made-up house in memory and never calls storage in any form (not even a read).
import { useState } from 'react';
import { useRoute } from '../../router';
import { isShopsDemoName, shopsDemoRoot, type ShopsDemoName } from '../../domain/v3/shopsDemo';
import { loadRoot, saveRoot } from '../../domain/v3/storage';
import { openRoot, saveErrorText, type HomePageProps, type Loaded } from './HomeV3Page';
import { ProblemV3 } from './ProblemV3';
import { ShopsView, type ShopsViewProps } from './ShopsV3';

/** Back goes to the page before; with no page before (opened by a link) it goes to Home. */
function goBack(): void {
  if (window.history.length > 1) window.history.back();
  else window.location.hash = '#/n';
}

/** Test links: `&sheet=add` opens the add sheet, `&sheet=edit&item=<shop id>` the edit sheet. */
function initialFrom(query: URLSearchParams): ShopsViewProps['initial'] {
  const sheet = query.get('sheet');
  const item = query.get('item');
  if (sheet === 'add') return { sheet: 'add' };
  if (sheet === 'edit' && item) return { sheet: 'edit', item };
  return {};
}

export function ShopsV3Route(props: HomePageProps) {
  const { query } = useRoute();
  const demo = query.get('demo');
  const initial = initialFrom(query);
  return isShopsDemoName(demo) ? <DemoShops key={demo} name={demo} initial={initial} /> : <LiveShops key="live" initial={initial} {...props} />;
}

function DemoShops({ name, initial }: { name: ShopsDemoName; initial: ShopsViewProps['initial'] }) {
  const [root] = useState(() => shopsDemoRoot(name));
  return <ShopsView root={root} demo onBack={goBack} initial={initial} />; // no persist: a demo saves nothing
}

function LiveShops({ store, initial }: HomePageProps & { initial: ShopsViewProps['initial'] }) {
  const [loaded] = useState<Loaded>(() => openRoot(store === undefined ? loadRoot() : loadRoot(store)));
  if (loaded.kind === 'problem') {
    return <ProblemV3 loaded={loaded} {...(store === undefined ? {} : { store })} />;
  }
  const persist: NonNullable<ShopsViewProps['persist']> = (root) => {
    const result = store === undefined ? saveRoot(root) : saveRoot(root, store);
    return result.ok ? { ok: true } : { ok: false, text: saveErrorText(result) };
  };
  return <ShopsView root={loaded.root} demo={false} persist={persist} onBack={goBack} initial={initial} />;
}
