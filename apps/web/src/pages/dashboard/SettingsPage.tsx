import { Settings as SettingsIcon } from 'lucide-react';
import { PageHeader } from '../../components/shell/PageHeader.js';
import { EmptyStub } from '../../components/shell/EmptyStub.js';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Workspace preferences and integrations." />
      <EmptyStub icon={SettingsIcon} title="Settings coming soon" />
    </>
  );
}
