import { Box } from 'lucide-react';
import { PageHeader } from '../../components/shell/PageHeader.js';
import { EmptyStub } from '../../components/shell/EmptyStub.js';

export function SetsPage() {
  return (
    <>
      <PageHeader title="Sets" subtitle="Bundle schemas together for generation." />
      <EmptyStub icon={Box} title="Sets coming soon" />
    </>
  );
}
