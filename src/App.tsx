import { BottomNav } from './components/BottomNav';
import { SaveErrorBar } from './components/SaveErrorBar';
import { UpdateBar } from './components/UpdateBar';
import { AddMedicineStep1, AddMedicineStep2, AddMedicineStep3 } from './pages/AddMedicine';
import { HomePage } from './pages/HomePage';
import { AddHousePage, EditHousePage } from './pages/HousePages';
import { MedDetailPage } from './pages/MedDetail';
import { MedsPage } from './pages/MedsPage';
import { MemberDetailPage } from './pages/MemberDetail';
import { EditMemberPage, NewMemberPage } from './pages/MemberForm';
import { MembersPage } from './pages/MembersPage';
import { NotFound } from './pages/NotFound';
import { ProblemPage } from './pages/ProblemPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';
import type { IsoDate } from './domain/calc';
import { useRoute } from './router';
import { DataProvider, useData } from './state/DataContext';
import { DraftProvider } from './state/DraftContext';
import styles from './App.module.css';

/** `getToday` is only for tests: it replaces the real clock. */
export function App({ getToday }: { getToday?: () => IsoDate }) {
  return (
    <DataProvider getToday={getToday}>
      <DraftProvider>
        <Shell />
      </DraftProvider>
    </DataProvider>
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

const MED_PATH = /^\/meds\/([^/]+)$/;
const MEMBER_PATH = /^\/members\/([^/]+)$/;
const HOUSE_PATH = /^\/house\/([^/]+)$/;
const MEMBER_EDIT_PATH = /^\/members\/([^/]+)\/edit$/;

/** The screen for a route. `/meds/new...`, `/house/new` and `/members/new` are checked before `/meds/:id`, `/house/:id` and `/members/:id`,
 * so "new" is never read as an id. */
function Screen({ path }: { path: string }) {
  switch (path) {
    case '/':
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
  return <NotFound />;
}

const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // a broken % sequence: it simply will not match any medicine
  }
};
