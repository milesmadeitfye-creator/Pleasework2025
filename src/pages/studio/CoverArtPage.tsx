import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import { EmailConfirmGate } from '../../components/EmailConfirmGate';
import CoverArtGenerator from '../../components/CoverArtGenerator';
import { useAuth } from '../../contexts/AuthContext';

export default function CoverArtPage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <PageShell title="Ghoste Studio" fullWidth>
        <div className="max-w-7xl mx-auto">
          <StudioTabs />
          <div className="text-center py-20 text-white">
            <p>Please sign in to access Cover Art Generator</p>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Ghoste Studio" fullWidth>
      <div className="max-w-7xl mx-auto">
        <StudioTabs />
        <EmailConfirmGate>
          <CoverArtGenerator userId={user.id} />
        </EmailConfirmGate>
      </div>
    </PageShell>
  );
}
