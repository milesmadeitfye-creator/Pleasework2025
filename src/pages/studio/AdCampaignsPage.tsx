import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import { EmailConfirmGate } from '../../components/EmailConfirmGate';
import AdsManager from '../../components/AdsManagerEnhanced';

export default function AdCampaignsPage() {
  return (
    <PageShell title="Ghoste Studio" fullWidth>
      <div className="max-w-7xl mx-auto">
        <StudioTabs />
        <EmailConfirmGate>
          <AdsManager />
        </EmailConfirmGate>
      </div>
    </PageShell>
  );
}
