import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import { EmailConfirmGate } from '../../components/EmailConfirmGate';
import FanCommunicationHub from '../FanCommunication';

export default function FanCommunicationPage() {
  return (
    <PageShell title="Ghoste Studio" fullWidth>
      <div className="max-w-7xl mx-auto">
        <StudioTabs />
        <EmailConfirmGate>
          <FanCommunicationHub />
        </EmailConfirmGate>
      </div>
    </PageShell>
  );
}
