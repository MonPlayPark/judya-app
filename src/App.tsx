import { BottomNav, TABS } from './components/BottomNav';
import { SaveErrorBar } from './components/SaveErrorBar';
import { UpdateBar } from './components/UpdateBar';
import { BlankPage } from './pages/BlankPage';
import { HomePage } from './pages/HomePage';
import { NotFound } from './pages/NotFound';
import { ProblemPage } from './pages/ProblemPage';
import { useRoute } from './router';
import { DataProvider, useData } from './state/DataContext';
import styles from './App.module.css';

function Shell() {
  const { state } = useData();
  const { path } = useRoute();
  const tab = TABS.find((t) => t.path === path);

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
        {path === '/' ? <HomePage /> : tab ? <BlankPage title={tab.label} /> : <NotFound />}
      </main>
      <BottomNav />
    </div>
  );
}

export function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}
