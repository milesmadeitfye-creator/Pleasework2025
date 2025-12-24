import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import { EmailConfirmGate } from '../../components/EmailConfirmGate';
import UnifiedLinksManager from '../../components/UnifiedLinksManager';

export default function SmartLinksPage() {
  return (
    <PageShell title="Ghoste Studio" fullWidth>
      <div className="max-w-7xl mx-auto">
        <StudioTabs />
        <EmailConfirmGate>
          <UnifiedLinksManager />
        </EmailConfirmGate>
      </div>
    </PageShell>
  );
}
