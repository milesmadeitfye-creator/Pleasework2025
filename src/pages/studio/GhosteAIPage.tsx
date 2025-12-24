import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import { EmailConfirmGate } from '../../components/EmailConfirmGate';
import GhosteAI from '../../components/GhosteAI';

export default function GhosteAIPage() {
  return (
    <PageShell title="Ghoste Studio" fullWidth>
      <div className="max-w-7xl mx-auto">
        <StudioTabs />
        <EmailConfirmGate>
          <GhosteAI />
        </EmailConfirmGate>
      </div>
    </PageShell>
  );
}
