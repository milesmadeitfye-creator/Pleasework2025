import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import { EmailConfirmGate } from '../../components/EmailConfirmGate';
import SplitNegotiations from '../../components/SplitNegotiations';

export default function SplitsPage() {
  return (
    <PageShell title="Ghoste Studio" fullWidth>
      <div className="max-w-7xl mx-auto">
        <StudioTabs />
        <EmailConfirmGate>
          <SplitNegotiations />
        </EmailConfirmGate>
      </div>
    </PageShell>
  );
}
