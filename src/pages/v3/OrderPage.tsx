// The v3 order draft page (route #/n/order, M4 PR 11.2): owns the data and the clock, hands them to OrderView.
// The only things this page writes are the recipient (a setting), shops and remembered prices, through saveRoot (M4 PR 11.3b-1, 11.3b-2a); it
// never saves an order (step 11.3b-2b and later). Demo mode (#/n/order?demo=...) works on a made-up house in memory and does not call storage in any form (not even a read).
import { useState } from 'react';
import { useRoute } from '../../router';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { DEMO_RECIPIENT, isOrderDemoName, orderDemoRoot, withDemoShops, type OrderDemoName } from '../../domain/v3/orderDemo';
import { loadRoot, saveRoot } from '../../domain/v3/storage';
import { openRoot, saveErrorText, useBangkokToday, type HomePageProps, type Loaded } from './HomeV3Page';
import { OrderView, type OrderViewProps } from './OrderV3';
import { ProblemV3 } from './ProblemV3';

/** Test links: `&sheet=add&tab=meds|new[&name=<typed name>]` opens the add sheet, `&sheet=unit[&item=<line key>]` the unit sheet,
 * `&shops=three` (demo) gives three made-up shops, `&shop=<id>` starts with that shop chosen, `&sheet=prices&shop=<id>` opens its price sheet,
 * `&sheet=shop` the new-shop form, `&shipping=off` the switch off. */
function initialFrom(query: URLSearchParams): OrderViewProps['initial'] {
  const sheet = query.get('sheet');
  const tab = query.get('tab');
  const name = query.get('name');
  const item = query.get('item');
  if (sheet === 'add') return { sheet: 'add', tab: tab === 'new' ? 'new' : 'meds', ...(name ? { name } : {}) };
  if (sheet === 'unit') return { sheet: 'unit', ...(item ? { item } : {}) };
  const shop = query.get('shop');
  const extra = { ...(shop ? { shop } : {}), ...(query.get('shipping') === 'off' ? { noShipping: true } : {}) };
  if (sheet === 'recipient' || sheet === 'incomplete') return { sheet, ...extra };
  if (sheet === 'shop') return { sheet, ...extra };
  if (sheet === 'prices') return { sheet, ...extra };
  return extra;
}

export function OrderV3Route(props: HomePageProps) {
  const { query } = useRoute();
  const demo = query.get('demo');
  const initial = initialFrom(query);
  return isOrderDemoName(demo) ? <DemoOrder key={demo} name={demo} initial={initial} withRecipient={query.get('recipient') === 'full'} withShops={query.get('shops') === 'three'} /> : <LiveOrder key="live" initial={initial} {...props} />;
}

function DemoOrder({ name, initial, withRecipient, withShops }: { name: OrderDemoName; initial: OrderViewProps['initial']; withRecipient: boolean; withShops: boolean }) {
  const [root] = useState(() => (withShops ? withDemoShops(orderDemoRoot(name)) : orderDemoRoot(name)));
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
