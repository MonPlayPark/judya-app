// The v3 edit-medicine page (routes #/n/meds/:id/edit and #/n/house/:id/edit): owns the data, the clock and the way back.
// Normal mode reads and writes `judya.v3` through v3/storage.ts only. Demo mode (?demo=...) works on a made-up house in memory
// and never calls storage in any form (not even a read). After a save it goes back to where it came from and says so once.
import { useState } from 'react';
import { useRoute } from '../../router';
import { setFlash } from '../../components/v3/flash';
import { DEMO_TODAY } from '../../domain/v3/homeDemo';
import { isMedsDemoName, medsDemoRoot, type MedsDemoName } from '../../domain/v3/medsListDemo';
import type { EditTarget } from '../../domain/v3/editMedicine';
import type { Root } from '../../domain/v3/schema';
import { loadRoot, saveRoot } from '../../domain/v3/storage';
import { openRoot, saveErrorText, useBangkokToday, type HomePageProps, type Loaded } from './HomeV3Page';
import { ProblemV3 } from './ProblemV3';
import { EditMedView, type EditMedViewProps } from './EditMedV3';

export const SAVED_TEXT = 'บันทึกการแก้ไขแล้ว';

/** Where the page goes back to, and after a save. Personal: the medicine's own page. House: the house list, sheet closed. */
function hrefs(target: EditTarget, suffix: string): { back: string } {
  if (target.type === 'house') return { back: `#/n/meds?tab=house${suffix.replace('?', '&')}` };
  return { back: `#/n/meds/${encodeURIComponent(target.assignmentId)}${suffix}` };
}

export function EditMedV3Route({ target, ...props }: HomePageProps & { target: EditTarget }) {
  const { query } = useRoute();
  const demo = query.get('demo');
  const key = target.type === 'house' ? target.houseItemId : target.assignmentId;
  return isMedsDemoName(demo) ? <DemoEdit key={`${demo}/${key}`} name={demo} target={target} /> : <LiveEdit key={`live/${key}`} target={target} {...props} />;
}

const leave = (to: string): void => {
  setFlash(SAVED_TEXT);
  window.location.hash = to;
};

function DemoEdit({ name, target }: { name: MedsDemoName; target: EditTarget }) {
  const [root] = useState<Root>(() => medsDemoRoot(name));
  const { back } = hrefs(target, `?demo=${name}`);
  // no persist: a demo saves nothing
  return <EditMedView root={root} target={target} today={DEMO_TODAY} demo backHref={back} onSaved={() => leave(back)} />;
}

function LiveEdit({ target, getToday, store }: HomePageProps & { target: EditTarget }) {
  const today = useBangkokToday(getToday);
  const [loaded] = useState<Loaded>(() => openRoot(store === undefined ? loadRoot() : loadRoot(store)));
  if (loaded.kind === 'problem') {
    return <ProblemV3 loaded={loaded} {...(store === undefined ? {} : { store })} />;
  }
  const persist: NonNullable<EditMedViewProps['persist']> = (root) => {
    const result = store === undefined ? saveRoot(root) : saveRoot(root, store);
    return result.ok ? { ok: true } : { ok: false, text: saveErrorText(result) };
  };
  const { back } = hrefs(target, '');
  return <EditMedView root={loaded.root} target={target} today={today} demo={false} persist={persist} backHref={back} onSaved={() => leave(back)} />;
}
