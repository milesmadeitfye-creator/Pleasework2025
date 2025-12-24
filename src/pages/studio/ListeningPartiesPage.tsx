import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import { EmailConfirmGate } from '../../components/EmailConfirmGate';
import ListeningParties from '../../components/ListeningParties';

export default function ListeningPartiesPage() {
  return (
    <PageShell title="Ghoste Studio" fullWidth>
      <div className="max-w-7xl mx-auto">
        <StudioTabs />
        <EmailConfirmGate>
          <ListeningParties />
        </EmailConfirmGate>
      </div>
    </PageShell>
  );
}
