import { BookOpen } from 'lucide-react';
import { PageHeader } from '../../components/shell/PageHeader.js';
import { EmptyStub } from '../../components/shell/EmptyStub.js';

export function FakersPage() {
  return (
    <>
      <PageHeader title="Faker reference" subtitle="Browse available faker functions." />
      <EmptyStub icon={BookOpen} title="Faker reference coming soon" />
    </>
  );
}
