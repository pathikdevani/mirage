import { Network } from 'lucide-react';
import { PageHeader } from '../../components/shell/PageHeader.js';
import { EmptyStub } from '../../components/shell/EmptyStub.js';

export function GraphPage() {
  return (
    <>
      <PageHeader
        title="Dependency graph"
        subtitle="Visualize references between schemas."
      />
      <EmptyStub icon={Network} title="Dependency graph coming soon" />
    </>
  );
}
