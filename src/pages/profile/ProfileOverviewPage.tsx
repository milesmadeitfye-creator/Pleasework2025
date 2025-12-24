import { PageShell } from '../../components/layout/PageShell';
import { ProfileTabs } from '../../components/profile/ProfileTabs';
import ConnectedAccounts from '../../components/ConnectedAccounts';
import { GoalsAndBudget } from '../../components/profile/GoalsAndBudget';
import { useNavigate } from 'react-router-dom';

export default function ProfileOverviewPage() {
  const navigate = useNavigate();

  return (
    <PageShell title="Profile">
      <ProfileTabs />

      <div className="space-y-6">
        <GoalsAndBudget />
        <ConnectedAccounts onNavigateToBilling={() => navigate('/wallet')} />
      </div>
    </PageShell>
  );
}
