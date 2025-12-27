import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { RefreshCw } from 'lucide-react';

interface MailchimpList {
  id: string;
  list_id: string;
  name: string;
  stats: any;
}

interface MailchimpSettings {
  default_list_id: string | null;
  double_opt_in: boolean;
}

export function MailchimpListSelector() {
  const { user } = useAuth();
  const [lists, setLists] = useState<MailchimpList[]>([]);
  const [settings, setSettings] = useState<MailchimpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [updating, setUpdating] = useState(false);

  const fetchSettings = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data: session } = await supabase.auth.getSession();
      if (!session.data.session) return;

      const res = await fetch('/.netlify/functions/mailchimp-get-settings', {
        headers: {
          'Authorization': `Bearer ${session.data.session.access_token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setLists(data.lists || []);
        setSettings(data.settings || null);
      }
    } catch (err) {
      console.error('[MailchimpListSelector] Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncLists = async () => {
    if (!user) return;

    try {
      setSyncing(true);
      const { data: session } = await supabase.auth.getSession();
      if (!session.data.session) return;

      const res = await fetch('/.netlify/functions/mailchimp-sync-lists', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.data.session.access_token}`,
        },
      });

      if (res.ok) {
        await fetchSettings();
      } else {
        console.error('[MailchimpListSelector] Sync failed');
      }
    } catch (err) {
      console.error('[MailchimpListSelector] Error syncing lists:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleListChange = async (listId: string) => {
    if (!user) return;

    try {
      setUpdating(true);
      const { data: session } = await supabase.auth.getSession();
      if (!session.data.session) return;

      const res = await fetch('/.netlify/functions/mailchimp-update-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session.access_token}`,
        },
        body: JSON.stringify({
          default_list_id: listId,
          double_opt_in: settings?.double_opt_in || false,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
      } else {
        console.error('[MailchimpListSelector] Update failed');
      }
    } catch (err) {
      console.error('[MailchimpListSelector] Error updating settings:', err);
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [user]);

  if (loading) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-800">
        <p className="text-gray-400 text-sm">Loading Mailchimp settings...</p>
      </div>
    );
  }

  if (lists.length === 0) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <p className="text-gray-300 text-sm font-medium">Mailchimp Lists</p>
          <button
            onClick={handleSyncLists}
            disabled={syncing}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Lists'}
          </button>
        </div>
        <p className="text-gray-400 text-xs">
          No lists found. Click "Sync Lists" to fetch your Mailchimp audiences.
        </p>
      </div>
    );
  }

  const selectedList = lists.find(l => l.list_id === settings?.default_list_id);

  return (
    <div className="mt-4 pt-4 border-t border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-300 text-sm font-medium">Default Audience</p>
        <button
          onClick={handleSyncLists}
          disabled={syncing}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Refresh'}
        </button>
      </div>

      <select
        value={settings?.default_list_id || ''}
        onChange={(e) => handleListChange(e.target.value)}
        disabled={updating}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        <option value="">Select a list...</option>
        {lists.map((list) => (
          <option key={list.list_id} value={list.list_id}>
            {list.name} ({list.stats?.member_count || 0} contacts)
          </option>
        ))}
      </select>

      {selectedList && (
        <p className="text-gray-400 text-xs mt-2">
          Email captures will be added to: <span className="text-gray-300">{selectedList.name}</span>
        </p>
      )}
    </div>
  );
}
