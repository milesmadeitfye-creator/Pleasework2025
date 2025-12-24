import { PageShell } from '../../components/layout/PageShell';
import { ProfileTabs } from '../../components/profile/ProfileTabs';
import ConnectedAccounts from '../../components/ConnectedAccounts';
import { useNavigate } from 'react-router-dom';

export default function ConnectAccountsPage() {
  const navigate = useNavigate();

  return (
    <PageShell title="Profile">
      <ProfileTabs />
      <ConnectedAccounts onNavigateToBilling={() => navigate('/wallet')} />
    </PageShell>
  );
}
