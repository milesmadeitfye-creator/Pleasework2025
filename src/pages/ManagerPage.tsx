import { PageShell } from '../components/layout/PageShell';
import { EmailConfirmGate } from '../components/EmailConfirmGate';
import GhosteAI from '../components/GhosteAI';

export default function ManagerPage() {
  return (
    <PageShell title="My Manager" fullWidth>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-ghoste-white mb-2">My Manager</h2>
          <p className="text-sm text-ghoste-grey">
            Your AI-powered manager to help you navigate the music industry, plan campaigns, and grow your career.
          </p>
        </div>
        <EmailConfirmGate>
          <GhosteAI />
        </EmailConfirmGate>
      </div>
    </PageShell>
  );
}
