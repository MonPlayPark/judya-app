import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { UpdateBar } from './components/UpdateBar';
import { AddMedV3Route } from './pages/v3/AddMedPage';
import { DoseChangeV3Route } from './pages/v3/DoseChangePage';
import { EditMedV3Route } from './pages/v3/EditMedPage';
import { DataV3Route } from './pages/v3/DataPage';
import { HomeV3Route } from './pages/v3/HomeV3Page';
import { RecoveryContext } from './components/v3/recovery';
import { MedDetailV3Route } from './pages/v3/MedDetailPage';
import { MedsListV3Route } from './pages/v3/MedsListPage';
import { MemberFormV3Route } from './pages/v3/MemberFormPage';
import { AllergyRoute, MemberDetailRoute, MemberEditRoute, MembersListRoute } from './pages/v3/MembersPage';
import { OrderV3Route } from './pages/v3/OrderPage';
import { SettingsRoute } from './pages/v3/SettingsPage';
import { ShopsV3Route } from './pages/v3/ShopsPage';
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
  if (path === '/n/shops') return <ShopsV3Route getToday={getToday} />; // M4 PR 14: reached from settings, order and shops
  if (path === '/n/members') return <MembersListRoute getToday={getToday} />; // M4 PR 9
  if (path === '/n/members/new') return <MemberFormV3Route getToday={getToday} />; // checked before `/n/members/:id`, so "new" is never read as an id
  const allergy = ALLERGY_PATH.exec(path);
  if (allergy?.[1]) return <AllergyRoute id={safeDecode(allergy[1])} getToday={getToday} />; // M4 PR 10
  const memberEdit = MEMBER_EDIT_PATH.exec(path);
  if (memberEdit?.[1]) return <MemberEditRoute id={safeDecode(memberEdit[1])} getToday={getToday} />;
  const member = MEMBER_PATH.exec(path);
  if (member?.[1]) return <MemberDetailRoute id={safeDecode(member[1])} getToday={getToday} />;
  if (path === '/n/settings/data') return <DataV3Route getToday={getToday} />;
  if (path === '/n/settings') return <SettingsRoute screen="list" getToday={getToday} />; // M4 PR 14: the 5 groups
  const settings = SETTINGS_PATH.exec(path);
  if (settings?.[1]) return <SettingsRoute screen={settings[1] as 'font' | 'reminders' | 'order' | 'about'} getToday={getToday} />;
  if (path === '/n/meds/new') return <AddMedV3Route getToday={getToday} />;
  const edit = EDIT_MED_PATH.exec(path);
  if (edit?.[1]) return <EditMedV3Route target={{ type: 'personal', assignmentId: safeDecode(edit[1]) }} getToday={getToday} />;
  const dose = DOSE_PATH.exec(path);
  if (dose?.[1]) return <DoseChangeV3Route id={safeDecode(dose[1])} getToday={getToday} />;
  const house = EDIT_HOUSE_PATH.exec(path);
  if (house?.[1]) return <EditMedV3Route target={{ type: 'house', houseItemId: safeDecode(house[1]) }} getToday={getToday} />;
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

const SETTINGS_PATH = /^\/n\/settings\/(font|reminders|order|about)$/; // M4 PR 14
const ALLERGY_PATH = /^\/n\/members\/([^/]+)\/allergy$/; // M4 PR 10
const MEMBER_PATH = /^\/n\/members\/([^/]+)$/; // M4 PR 9: one member
const MEMBER_EDIT_PATH = /^\/n\/members\/([^/]+)\/edit$/;
const MED_PATH = /^\/n\/meds\/([^/]+)$/;
const EDIT_MED_PATH = /^\/n\/meds\/([^/]+)\/edit$/; // M4 PR 8a: fix the data of a medicine
const DOSE_PATH = /^\/n\/meds\/([^/]+)\/dose$/; // M4 PR 8b: change how to take a medicine
const EDIT_HOUSE_PATH = /^\/n\/house\/([^/]+)\/edit$/; // the same for a house medicine

const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // a broken % sequence: it simply will not match any medicine
  }
};
