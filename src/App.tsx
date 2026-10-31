import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { BottomNav } from './components/BottomNav';
import { SaveErrorBar } from './components/SaveErrorBar';
import { UpdateBar } from './components/UpdateBar';
import { AddMedicineStep1, AddMedicineStep2, AddMedicineStep3 } from './pages/AddMedicine';
import { HomePage } from './pages/HomePage';
import { AddMedV3Route } from './pages/v3/AddMedPage';
import { DataV3Route } from './pages/v3/DataPage';
import { HomeV3Route } from './pages/v3/HomeV3Page';
import { RecoveryContext } from './components/v3/recovery';
import { MedDetailV3Route } from './pages/v3/MedDetailPage';
import { MedsListV3Route } from './pages/v3/MedsListPage';
import { MemberFormV3Route } from './pages/v3/MemberFormPage';
import { AddHousePage, EditHousePage } from './pages/HousePages';
import { MedDetailPage } from './pages/MedDetail';
import { MedsPage } from './pages/MedsPage';
import { MemberDetailPage } from './pages/MemberDetail';
import { EditMemberPage, NewMemberPage } from './pages/MemberForm';
import { MembersPage } from './pages/MembersPage';
import { NotFound } from './pages/NotFound';
import { OrderPage } from './pages/OrderPage';
import { ProblemPage } from './pages/ProblemPage';
import { SettingsPage } from './pages/SettingsPage';
import { SharePage } from './pages/SharePage';
import { TodayPage } from './pages/TodayPage';
import type { IsoDate } from './domain/calc';
import { useRoute } from './router';
import { DataProvider, useData } from './state/DataContext';
import { requestPersistence } from './state/persist';
import { DraftProvider } from './state/DraftContext';
import styles from './App.module.css';

/** `getToday` is only for tests: it replaces the real clock. */
export function App({ getToday }: { getToday?: () => IsoDate }) {
  const { path } = useRoute();
  const v3 = v3Screen(path, getToday);
  if (v3) return <V3Frame>{v3}</V3Frame>;
  return (
    <DataProvider getToday={getToday}>
      <DraftProvider>
        <Shell />
      </DraftProvider>
    </DataProvider>
  );
}

/** The v3 screens (all outside DataProvider on purpose, so they never open the v2 data `judya.v2`). M4 PR 7: `#/` is v3 Home too.
 * Returns null for a route that belongs to v2 (v2 Home is `#/old`). */
function v3Screen(path: string, getToday: (() => IsoDate) | undefined): ReactNode {
  if (path === '/' || path === '/n') return <HomeV3Route getToday={getToday} />;
  if (path === '/n/meds') return <MedsListV3Route getToday={getToday} />; // M4 PR 5a: same rule, read only
  if (path === '/n/members/new') return <MemberFormV3Route getToday={getToday} />; // M4 PR 6a: add member, same rule
  if (path === '/n/settings/data') return <DataV3Route getToday={getToday} />; // M4 PR 6c: data and backup, same rule (outside DataProvider)
  if (path === '/n/meds/new') return <AddMedV3Route getToday={getToday} />; // M4 PR 6b: add medicine, same rule; checked before V3_MED_PATH so "new" is not an id
  const v3Med = V3_MED_PATH.exec(path); // M4 PR 5b: medicine detail, same rule (outside DataProvider)
  if (v3Med?.[1]) return <MedDetailV3Route id={safeDecode(v3Med[1])} getToday={getToday} />;
  return null;
}

/** Around every v3 screen: the "new version" bar (the v2 shell has its own) and the way out of an unreadable-data screen:
 * after "start over" / "restore" the screen is built again (new key) and reads the data again. */
function V3Frame({ children }: { children: ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    void requestPersistence(); // M4 PR 7 fix: v3 pages have no DataProvider, which used to ask. Once per page load; failure is silent.
  }, []);
  return (
    <RecoveryContext.Provider value={() => setEpoch((n) => n + 1)}>
      <UpdateBar />
      <Fragment key={epoch}>{children}</Fragment>
    </RecoveryContext.Provider>
  );
}

function Shell() {
  const { state } = useData();
  const { path } = useRoute();
  if (state.kind === 'problem') {
    return (
      <div className={styles.shell}>
        <ProblemPage problem={state.problem} />
      </div>
    );
  }
  return (
    <div className={styles.shell}>
      <UpdateBar />
      <SaveErrorBar />
      <main className={styles.main}>
        <Screen path={path} />
      </main>
      <BottomNav />
    </div>
  );
}

const V3_MED_PATH = /^\/n\/meds\/([^/]+)$/;
const MED_PATH = /^\/meds\/([^/]+)$/;
const MEMBER_PATH = /^\/members\/([^/]+)$/;
const HOUSE_PATH = /^\/house\/([^/]+)$/;
const MEMBER_EDIT_PATH = /^\/members\/([^/]+)\/edit$/;
const MEMBER_SHARE_PATH = /^\/members\/([^/]+)\/share$/;

/** The screen for a route. `/meds/new...`, `/house/new` and `/members/new` are checked before `/meds/:id`, `/house/:id` and `/members/:id`
 * (`/members/:id/share` and `/members/:id/edit` have a second segment, so `/members/:id` never matches them),
 * so "new" is never read as an id. */
function Screen({ path }: { path: string }) {
  switch (path) {
    case '/old': // M4 PR 7: v2 Home moved here until v2 is removed (PR 7b); `#/` is v3 Home
      return <HomePage />;
    case '/today':
      return <TodayPage />;
    case '/meds':
      return <MedsPage />;
    case '/meds/new':
      return <AddMedicineStep1 />;
    case '/meds/new/schedule':
      return <AddMedicineStep2 />;
    case '/meds/new/stock':
      return <AddMedicineStep3 />;
    case '/house/new':
      return <AddHousePage />;
    case '/members':
      return <MembersPage />;
    case '/members/new':
      return <NewMemberPage />;
    case '/order':
      return <OrderPage />;
    case '/settings':
      return <SettingsPage />;
  }
  const med = MED_PATH.exec(path);
  if (med?.[1]) return <MedDetailPage id={safeDecode(med[1])} />;
  const house = HOUSE_PATH.exec(path);
  if (house?.[1]) return <EditHousePage id={safeDecode(house[1])} />;
  const member = MEMBER_PATH.exec(path);
  if (member?.[1]) return <MemberDetailPage id={safeDecode(member[1])} />;
  const edit = MEMBER_EDIT_PATH.exec(path);
  if (edit?.[1]) return <EditMemberPage id={safeDecode(edit[1])} />;
  const share = MEMBER_SHARE_PATH.exec(path);
  if (share?.[1]) return <SharePage id={safeDecode(share[1])} />;
  return <NotFound />;
}

const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // a broken % sequence: it simply will not match any medicine
  }
};
