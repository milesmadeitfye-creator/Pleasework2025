import { useState } from 'react';
import { PageShell } from '../../components/layout/PageShell';
import { GoalCreativeUpload } from '../../components/ads/GoalCreativeUpload';
import { RunMyGoalsPanel } from '../../components/ads/RunMyGoalsPanel';
import { BulkCreativeTagging } from '../../components/ads/BulkCreativeTagging';
import { Target, Info, ExternalLink } from 'lucide-react';

export default function UseMyGoalsPage() {
  const [showInfo, setShowInfo] = useState(true);

  return (
    <PageShell title="Use My Goals">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-xl border border-ghoste-border bg-ghoste-card p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-ghoste-blue/20">
                <Target className="w-6 h-6 text-ghoste-blue" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-ghoste-white mb-1">
                  Use My Goals
                </h1>
                <p className="text-base text-ghoste-grey">
                  Upload creatives for your active goals, then run campaigns automatically
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="p-2 text-ghoste-grey hover:text-ghoste-white transition-colors"
            >
              <Info className="w-5 h-5" />
            </button>
          </div>

          {showInfo && (
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <h3 className="text-sm font-semibold text-blue-400 mb-2">
                How it works
              </h3>
              <ol className="space-y-2 text-sm text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold">1.</span>
                  <span>
                    <strong className="text-white">Set up goals:</strong> Go to{' '}
                    <a
                      href="/profile"
                      className="text-ghoste-blue hover:underline inline-flex items-center gap-1"
                    >
                      Profile <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    and turn on the goals you want to achieve (Streams, Followers, etc.)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold">2.</span>
                  <span>
                    <strong className="text-white">Upload creatives:</strong> Use the upload tool below to add images/videos for each goal
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold">3.</span>
                  <span>
                    <strong className="text-white">Run campaigns:</strong> Click "Run Now" and Ghoste will create Learning campaigns for each goal, using the creatives you uploaded
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold">4.</span>
                  <span>
                    <strong className="text-white">Auto-scaling:</strong> Ghoste tests creatives, detects winners, and scales budgets automatically based on your goals
                  </span>
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Upload Section */}
        <GoalCreativeUpload
          onUploadComplete={(id, url, goalKey) => {
            console.log('[UseMyGoalsPage] Creative uploaded:', { id, url, goalKey });
          }}
        />

        {/* Run Section */}
        <RunMyGoalsPanel />

        {/* Backfill Section */}
        <BulkCreativeTagging />

        {/* Info Footer */}
        <div className="rounded-xl border border-ghoste-border bg-ghoste-card p-6">
          <h3 className="text-sm font-semibold text-ghoste-white mb-3">
            What happens when you run?
          </h3>
          <div className="space-y-3 text-sm text-ghoste-grey">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-green-400 text-xs font-bold">✓</span>
              </div>
              <div>
                <p className="text-white font-medium mb-1">Learning Campaigns</p>
                <p>
                  For each active goal with creatives, Ghoste creates a "Learning" campaign using ABO (Ad Set Budget Optimization). Each creative gets its own ad set to test performance.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-400 text-xs font-bold">↑</span>
              </div>
              <div>
                <p className="text-white font-medium mb-1">Winner Detection</p>
                <p>
                  After minimum spend thresholds, Ghoste identifies top performers based on your goal's core signal (e.g., SmartLinkClicked for Streams, ProfileView for Followers).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-purple-400 text-xs font-bold">⚡</span>
              </div>
              <div>
                <p className="text-white font-medium mb-1">Auto-Scaling</p>
                <p>
                  Winners are promoted to "Scaling" campaigns with increased budgets. Losers are paused. Budgets adjust based on performance to maximize efficiency.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
