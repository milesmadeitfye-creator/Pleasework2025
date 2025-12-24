import { GhosteAIChat } from './ghoste/GhosteAIChat';
import { ManagerMessagesFeed } from './wallet/ManagerMessagesFeed';
import { AIActionsPanel } from './ghoste/AIActionsPanel';
import { AISuggestionsPanel } from './ghoste/AISuggestionsPanel';
import { OperatorPanel } from './operator/OperatorPanel';
import { AdsDataStatus } from './manager/AdsDataStatus';
import { useAuth } from '../contexts/AuthContext';
import { useState } from 'react';

export default function GhosteAI() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'chat' | 'operator'>('chat');

  return (
    <div className="h-full w-full space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
            activeTab === 'chat'
              ? 'bg-white/10 text-white border-b-2 border-blue-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          AI Chat
        </button>
        <button
          onClick={() => setActiveTab('operator')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
            activeTab === 'operator'
              ? 'bg-white/10 text-white border-b-2 border-blue-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Operator (Autopilot)
        </button>
      </div>

      {/* Chat View */}
      {activeTab === 'chat' && (
        <>
          <GhosteAIChat />

          {/* Secondary content below chat */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - wider */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Suggestions Section */}
          {user && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="text-2xl">✨</div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">Today's AI Suggestions</h2>
                  <p className="text-sm text-slate-400">
                    Smart recommendations based on your activity and goals
                  </p>
                </div>
              </div>
              <AISuggestionsPanel userId={user.id} />
            </div>
          )}

          {/* Manager Updates Section */}
          {user && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="text-2xl">🤖</div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">Manager Updates</h2>
                  <p className="text-sm text-slate-400">
                    Proactive check-ins from your AI music manager
                  </p>
                </div>
              </div>
              <ManagerMessagesFeed userId={user.id} limit={10} />
            </div>
          )}
        </div>

        {/* Right column - narrower */}
        <div className="lg:col-span-1 space-y-6">
          {/* Data Status Panel */}
          {user && <AdsDataStatus userId={user.id} />}

          {/* AI Actions Section */}
          {user && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="text-2xl">⚡</div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">AI Proposed Actions</h2>
                  <p className="text-sm text-slate-400">
                    Review and approve AI-generated campaigns and optimizations
                  </p>
                </div>
              </div>
              <AIActionsPanel userId={user.id} />
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {/* Operator View */}
      {activeTab === 'operator' && (
        <div className="rounded-xl border border-white/10 bg-slate-950/80 p-6">
          <OperatorPanel />
        </div>
      )}
    </div>
  );
}
