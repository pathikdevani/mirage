import { Play } from 'lucide-react';
import { PageHeader } from '../../components/shell/PageHeader.js';
import { EmptyStub } from '../../components/shell/EmptyStub.js';

export function GeneratePage() {
  return (
    <>
      <PageHeader title="Generate" subtitle="Run a set and produce fake data." />
      <EmptyStub icon={Play} title="Generate runner coming soon" />
    </>
  );
}
