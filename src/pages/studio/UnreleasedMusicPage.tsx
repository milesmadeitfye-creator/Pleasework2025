import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import UnreleasedMusic from '../../components/UnreleasedMusic';

export default function UnreleasedMusicPage() {
  return (
    <PageShell
      title="Unreleased Music"
      subtitle="Upload demos, unreleased tracks, and works-in-progress. Share privately or publicly."
    >
      <StudioTabs />
      <UnreleasedMusic />
    </PageShell>
  );
}
