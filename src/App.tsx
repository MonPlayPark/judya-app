import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { UpdateBar } from './components/UpdateBar';
import { AddMedV3Route } from './pages/v3/AddMedPage';
import { DataV3Route } from './pages/v3/DataPage';
import { HomeV3Route } from './pages/v3/HomeV3Page';
import { RecoveryContext } from './components/v3/recovery';
import { MedDetailV3Route } from './pages/v3/MedDetailPage';
import { MedsListV3Route } from './pages/v3/MedsListPage';
import { MemberFormV3Route } from './pages/v3/MemberFormPage';
import { OrderV3Route } from './pages/v3/OrderPage';
import type { IsoDate } from './domain/calc';
import { useRoute } from './router';
import { requestPersistence } from './state/persist';

/** `getToday` is only for tests: it replaces the real clock. */
export function App({ getToday }: { getToday?: () => IsoDate }) {
  const { path } = useRoute();
  return <V3Frame>{screen(path, getToday)}</V3Frame>;
}

/** The screen for a route. `/meds/new` is checked before `/meds/:id`, so "new" is never read as an id.
 * An unknown route (an old bookmark, a typo) opens Home. */
function screen(path: string, getToday: (() => IsoDate) | undefined): ReactNode {
  if (path === '/n/meds') return <MedsListV3Route getToday={getToday} />;
  if (path === '/n/order') return <OrderV3Route getToday={getToday} />; // test links only until step 11.6 puts a button on Home
  if (path === '/n/members/new') return <MemberFormV3Route getToday={getToday} />;
  if (path === '/n/settings/data') return <DataV3Route getToday={getToday} />;
  if (path === '/n/meds/new') return <AddMedV3Route getToday={getToday} />;
  const med = MED_PATH.exec(path);
  if (med?.[1]) return <MedDetailV3Route id={safeDecode(med[1])} getToday={getToday} />;
  return <HomeV3Route getToday={getToday} />; // '/', '/n' and anything unknown
}

/** Around every screen: the "new version" bar and the way out of an unreadable-data screen:
 * after "start over" / "restore" the screen is built again (new key) and reads the data again. */
function V3Frame({ children }: { children: ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    void requestPersistence(); // once per page load; failure is silent
  }, []);
  return (
    <RecoveryContext.Provider value={() => setEpoch((n) => n + 1)}>
      <UpdateBar />
      <Fragment key={epoch}>{children}</Fragment>
    </RecoveryContext.Provider>
  );
}

const MED_PATH = /^\/n\/meds\/([^/]+)$/;

const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // a broken % sequence: it simply will not match any medicine
  }
};
