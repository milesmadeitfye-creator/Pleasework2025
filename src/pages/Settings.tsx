import { PageShell } from '../components/layout/PageShell';
import AccountSettings from '../components/AccountSettings';

export default function Settings() {
  return (
    <PageShell title="Settings">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-ghoste-text mb-2">Settings</h1>
          <p className="text-ghoste-text-muted">
            Manage your account settings, integrations, and preferences.
          </p>
        </div>

        <AccountSettings />
      </div>
    </PageShell>
  );
}
