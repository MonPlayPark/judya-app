// The v3 order draft page (route #/n/order, M4 PR 11.2): owns the data and the clock, hands them to OrderView.
// The only thing this page writes is the recipient (a setting), through saveRoot (M4 PR 11.3b-1); it never saves an order (step 11.3b-2 and
// later). Demo mode (#/n/order?demo=...) works on a made-up house in memory and does not call storage in any form (not even a read).
import { useState } from 'react';
import { useRoute } from '../../router';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { DEMO_RECIPIENT, isOrderDemoName, orderDemoRoot, type OrderDemoName } from '../../domain/v3/orderDemo';
import { loadRoot, saveRoot } from '../../domain/v3/storage';
import { openRoot, saveErrorText, useBangkokToday, type HomePageProps, type Loaded } from './HomeV3Page';
import { OrderView, type OrderViewProps } from './OrderV3';
import { ProblemV3 } from './ProblemV3';

/** Test links: `&sheet=add&tab=meds|new[&name=<typed name>]` opens the add sheet, `&sheet=unit[&item=<line key>]` the unit sheet. */
function initialFrom(query: URLSearchParams): OrderViewProps['initial'] {
  const sheet = query.get('sheet');
  const tab = query.get('tab');
  const name = query.get('name');
  const item = query.get('item');
  if (sheet === 'add') return { sheet: 'add', tab: tab === 'new' ? 'new' : 'meds', ...(name ? { name } : {}) };
  if (sheet === 'unit') return { sheet: 'unit', ...(item ? { item } : {}) };
  const mode = query.get('mode') === 'pickup' ? ({ mode: 'pickup' } as const) : {};
  if (sheet === 'recipient' || sheet === 'incomplete') return { sheet, ...mode };
  return mode;
}

export function OrderV3Route(props: HomePageProps) {
  const { query } = useRoute();
  const demo = query.get('demo');
  const initial = initialFrom(query);
  return isOrderDemoName(demo) ? <DemoOrder key={demo} name={demo} initial={initial} withRecipient={query.get('recipient') === 'full'} /> : <LiveOrder key="live" initial={initial} {...props} />;
}

function DemoOrder({ name, initial, withRecipient }: { name: OrderDemoName; initial: OrderViewProps['initial']; withRecipient: boolean }) {
  const [root] = useState(() => orderDemoRoot(name));
  return <OrderView root={root} today={DEMO_TODAY} demo initial={{ ...initial, ...(withRecipient ? { recipient: DEMO_RECIPIENT } : {}) }} />; // no persist: a demo saves nothing
}

function LiveOrder({ getToday, store, initial }: HomePageProps & { initial: OrderViewProps['initial'] }) {
  const today = useBangkokToday(getToday);
  const [loaded] = useState<Loaded>(() => openRoot(store === undefined ? loadRoot() : loadRoot(store)));
  if (loaded.kind === 'problem') {
    return <ProblemV3 loaded={loaded} {...(store === undefined ? {} : { store })} />;
  }
  const persist: NonNullable<OrderViewProps['persist']> = (root) => {
    const result = store === undefined ? saveRoot(root) : saveRoot(root, store);
    return result.ok ? { ok: true } : { ok: false, text: saveErrorText(result) };
  };
  return <OrderView root={loaded.root} today={today} demo={false} initial={initial} persist={persist} />;
}
