import { PageHeader } from '../components/PageHeader';

/** Empty tab. The real screens arrive in step 3.2 (BRIEF section 1). */
export function BlankPage({ title }: { title: string }) {
  return <PageHeader title={title} />;
}
