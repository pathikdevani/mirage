import { Download } from 'lucide-react';
import { PageHeader } from '../../components/shell/PageHeader.js';
import { EmptyStub } from '../../components/shell/EmptyStub.js';

export function ConnectorsPage() {
  return (
    <>
      <PageHeader
        title="Connectors"
        subtitle="Push generated data to databases, APIs, and files."
      />
      <EmptyStub icon={Download} title="Connectors coming soon" />
    </>
  );
}
