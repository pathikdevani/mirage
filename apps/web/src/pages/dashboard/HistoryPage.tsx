import { History } from 'lucide-react';
import { PageHeader } from '../../components/shell/PageHeader.js';
import { EmptyStub } from '../../components/shell/EmptyStub.js';

export function HistoryPage() {
  return (
    <>
      <PageHeader title="Run history" subtitle="Past generation runs and their outputs." />
      <EmptyStub icon={History} title="Run history coming soon" />
    </>
  );
}
