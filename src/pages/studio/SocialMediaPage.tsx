import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import { EmailConfirmGate } from '../../components/EmailConfirmGate';
import SocialPoster from '../../components/SocialPoster';
import ComingSoonOverlay from '../../components/ui/ComingSoonOverlay';

export default function SocialMediaPage() {
  return (
    <PageShell title="Ghoste Studio" fullWidth>
      <div className="max-w-7xl mx-auto">
        <StudioTabs />
        <div className="relative">
          <ComingSoonOverlay
            title="Social Media is coming back soon"
            description="We're finishing configuration + approvals for the next beta. For now, the rest of Ghoste One is live."
          />
          <div className="opacity-20 select-none pointer-events-none">
            <EmailConfirmGate>
              <SocialPoster />
            </EmailConfirmGate>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
