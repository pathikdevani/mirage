import { Database } from 'lucide-react';
import { PageHeader } from '../../components/shell/PageHeader.js';
import { EmptyStub } from '../../components/shell/EmptyStub.js';

export function SchemasPage() {
  return (
    <>
      <PageHeader title="Schemas" subtitle="Define the shape of your fake data." />
      <EmptyStub icon={Database} title="Schemas editor coming soon" />
    </>
  );
}
