import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import { EmailConfirmGate } from '../../components/EmailConfirmGate';
import { MusicVisualGenerator } from '../../components/studio/MusicVisualGenerator';

export default function MusicVisualsPage() {
  return (
    <PageShell title="Ghoste Studio" fullWidth>
      <div className="max-w-7xl mx-auto">
        <StudioTabs />
        <EmailConfirmGate>
          <MusicVisualGenerator />
        </EmailConfirmGate>
      </div>
    </PageShell>
  );
}
