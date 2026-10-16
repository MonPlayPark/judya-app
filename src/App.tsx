import { BottomNav, TABS } from './components/BottomNav';
import { UpdateBar } from './components/UpdateBar';
import { BlankPage } from './pages/BlankPage';
import { NotFound } from './pages/NotFound';
import { useRoute } from './router';
import styles from './App.module.css';

export function App() {
  const { path } = useRoute();
  const tab = TABS.find((t) => t.path === path);
  return (
    <div className={styles.shell}>
      <UpdateBar />
      <main className={styles.main}>{tab ? <BlankPage title={tab.label} /> : <NotFound />}</main>
      <BottomNav />
    </div>
  );
}
