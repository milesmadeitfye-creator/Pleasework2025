import { useState } from 'react';
import { Mail, MessageSquare, Sparkles, Users, TrendingUp, Settings as SettingsIcon, AlertCircle, FileText, Send, ArrowRight } from 'lucide-react';
import Inbox from './Inbox';
import Automations from './Automations';
import Templates from './Templates';
import Broadcasts from './Broadcasts';
import Sequences from './Sequences';
import Audiences from './Audiences';
import FanPulse from '../../components/FanPulse';
import FanCommunication from '../../components/FanCommunication';

type Tab = 'inbox' | 'templates' | 'broadcasts' | 'sequences' | 'automations' | 'audiences' | 'pulse' | 'mailchimp';

export default function FanCommunicationHub() {
  const [activeTab, setActiveTab] = useState<Tab>('inbox');
  const automationsEnabled = import.meta.env.VITE_FAN_AUTOMATIONS_ENABLED === 'true';

  const tabs = [
    { id: 'inbox' as Tab, label: 'Inbox', icon: MessageSquare },
    { id: 'templates' as Tab, label: 'Templates', icon: FileText },
    { id: 'broadcasts' as Tab, label: 'Broadcasts', icon: Send },
    { id: 'sequences' as Tab, label: 'Sequences', icon: ArrowRight },
    { id: 'automations' as Tab, label: 'Automations', icon: Sparkles, beta: true },
    { id: 'audiences' as Tab, label: 'Audiences', icon: Users },
    { id: 'pulse' as Tab, label: 'Fan Pulse', icon: TrendingUp },
    { id: 'mailchimp' as Tab, label: 'Mailchimp', icon: SettingsIcon },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.beta && (
                <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">Beta</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Automations disabled banner */}
      {activeTab === 'automations' && !automationsEnabled && (
        <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-start gap-2 text-sm text-yellow-500">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-1">Automations Disabled</div>
              <p>
                Enable automations in your environment settings (<code>VITE_FAN_AUTOMATIONS_ENABLED=true</code>) to
                activate automations. You can still create and test them in draft mode.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {activeTab === 'inbox' && <Inbox />}
      {activeTab === 'templates' && <Templates />}
      {activeTab === 'broadcasts' && <Broadcasts />}
      {activeTab === 'sequences' && <Sequences />}
      {activeTab === 'automations' && <Automations />}
      {activeTab === 'audiences' && <Audiences />}
      {activeTab === 'pulse' && <FanPulse />}
      {activeTab === 'mailchimp' && <FanCommunication />}
    </div>
  );
}
