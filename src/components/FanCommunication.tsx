/**
 * Fan Communication Mailchimp UI entrypoint
 * File: src/components/FanCommunication.tsx
 *
 * Displays fan contacts, Mailchimp connection status, and sync/import actions
 */
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Mail, MessageSquare, Users, Send, Trash2, Settings, RefreshCw, Check, AlertCircle, Download, Sparkles, TrendingUp } from 'lucide-react';
import { getMailchimpConnectionForUser, MailchimpConnection } from '../lib/integrations/mailchimp';
import { EMAIL_TEMPLATES, SMS_TEMPLATES } from '../lib/messageTemplates';
import { useToast } from './Toast';
import { ProGate } from './ProGate';
import { useSpendCredits } from '../features/wallet/useSpendCredits';
import { CreditCostBadge } from '../features/wallet/CreditCostBadge';
import { sendSms } from '../features/sms/sendSms';
import { EmailDesignRequest, EmailDesignResponse, fallbackPlainHtmlFromBody } from '../lib/email/aiEmailDesigner';
import FanPulse from './FanPulse';

interface FanContact {
  id: string;
  owner_id: string;
  email: string | null;
  phone_e164: string | null;
  phone?: string | null;
  name: string | null;
  source: string | null;
  email_capture_link_id: string | null;
  consent_email: boolean;
  consent_sms: boolean;
  subscribed?: boolean;
  meta: any;
  mailchimp_id?: string;
  mailchimp_status?: string | null;
  mailchimp_error?: string | null;
  mailchimp_synced_at?: string | null;
  mailchimp_member_id?: string | null;
  synced_to_mailchimp?: boolean;
  created_at: string;
}

interface Message {
  id: string;
  type: 'email' | 'sms';
  channel?: string | null;
  subject: string | null;
  content: string;
  recipient_count: number;
  mailchimp_campaign_id?: string | null;
  mailchimp_list_id?: string | null;
  status?: string | null;
  emails_sent?: number;
  open_rate?: number;
  click_rate?: number;
  last_synced_at?: string | null;
  sent_at: string | null;
  created_at: string;
}


export default function FanCommunication() {
  const { user } = useAuth();
  const { spendForFeature, isSpending } = useSpendCredits();
  const [view, setView] = useState<'contacts' | 'messages' | 'pulse' | 'settings'>('contacts');
  const [contacts, setContacts] = useState<FanContact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mailchimpConnection, setMailchimpConnection] = useState<MailchimpConnection | null>(null);
  const [mailchimpSenderEmail, setMailchimpSenderEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncingStats, setSyncingStats] = useState<Record<string, boolean>>({});
  const { showToast } = useToast();

  const [showListModal, setShowListModal] = useState(false);
  const [modalAction, setModalAction] = useState<'sync' | 'import'>('sync');
  const [lists, setLists] = useState<{ id: string; name: string; member_count: number; }[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [savingList, setSavingList] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState<string>('');
  const [selectedSmsTemplateId, setSelectedSmsTemplateId] = useState<string>('');

  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    tags: '',
  });

  const [messageForm, setMessageForm] = useState({
    type: 'email' as 'email' | 'sms',
    subject: '',
    content: '',
  });

  const [emailDesigner, setEmailDesigner] = useState({
    previewText: '',
    html: '',
    campaignGoal: 'generic' as 'new_release' | 'tour' | 'newsletter' | 'announcement' | 'winback' | 'generic',
    tone: 'hype' as 'hype' | 'chill' | 'emotional' | 'informative' | 'urgent',
    spotifyUrl: '',
    appleUrl: '',
    youtubeUrl: '',
    presaveUrl: '',
    websiteUrl: '',
  });

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [settingsForm, setSettingsForm] = useState({
    api_key: '',
    server_prefix: '',
    audience_id: '',
  });

  useEffect(() => {
    if (user) {
      fetchContacts();
      fetchMessages();
      fetchMailchimpConfig();
    }
  }, [user]);

  // Debug log to verify mailchimp_status is loaded
  useEffect(() => {
    if (contacts.length > 0) {
      console.log('[FanContacts] Sample contact with mailchimp_status:', {
        total: contacts.length,
        sample: contacts[0],
        syncedCount: contacts.filter(c => c.mailchimp_status === 'synced').length,
        pendingCount: contacts.filter(c => c.mailchimp_status !== 'synced').length,
      });
    }
  }, [contacts]);

  // Handle OAuth callback redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mailchimpStatus = params.get('mailchimp');
    const reason = params.get('reason');

    if (mailchimpStatus === 'connected') {
      console.log('[Mailchimp] OAuth connection successful, refreshing config');
      // Refresh the Mailchimp config to show connected state
      if (user) {
        fetchMailchimpConfig();
      }
      // Clean up URL params
      window.history.replaceState({}, '', window.location.pathname);
    } else if (mailchimpStatus === 'error') {
      console.error('[Mailchimp] OAuth connection failed:', reason);
      alert(`Failed to connect Mailchimp: ${reason || 'Unknown error'}`);
      // Clean up URL params
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [user]);

  const fetchContacts = async () => {
    setLoading(true);

    // Query by both owner_id and user_id to catch all contacts
    const { data, error } = await supabase
      .from('fan_contacts')
      .select(`
        *,
        latest_event:fan_contact_events(event_type, link_slug, link_type, created_at)
      `)
      .or(`owner_id.eq.${user?.id},user_id.eq.${user?.id}`)
      .order('created_at', { ascending: false });

    if (!error && data) {
      console.log('[FanContacts] Loaded contacts', data.length);
      setContacts(data);
    } else if (error) {
      console.error('[FanContacts] Error loading contacts:', error);
    }
    setLoading(false);
  };

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('fan_messages')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setMessages(data);

      // Auto-sync stats for campaigns that haven't been synced in the last 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const needsSync = data.filter(
        (msg: Message) =>
          msg.channel === 'mailchimp_email' &&
          msg.mailchimp_campaign_id &&
          (!msg.last_synced_at || msg.last_synced_at < tenMinutesAgo)
      );

      // Sync stats in background for campaigns that need it
      needsSync.forEach((msg: Message) => {
        if (msg.mailchimp_campaign_id) {
          syncCampaignStats(msg.mailchimp_campaign_id, true);
        }
      });
    }
  };

  const syncCampaignStats = async (campaignId: string, silent = false) => {
    if (syncingStats[campaignId]) return;

    setSyncingStats((prev) => ({ ...prev, [campaignId]: true }));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        if (!silent) showToast('Not authenticated', 'error');
        return;
      }

      const response = await fetch('/.netlify/functions/mailchimp-sync-campaign-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ campaign_id: campaignId }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('Stats sync failed:', result);
        if (!silent) {
          showToast(result.message || 'Failed to sync stats', 'error');
        }
        return;
      }

      if (!silent && result.message?.includes('not available yet')) {
        showToast('Stats not ready yet. Try again in a few minutes.', 'warning');
      } else if (!silent) {
        showToast('Stats synced successfully', 'success');
      }

      // Refresh messages to show updated stats
      fetchMessages();
    } catch (err: any) {
      console.error('Stats sync error:', err);
      if (!silent) {
        showToast('Failed to sync stats', 'error');
      }
    } finally {
      setSyncingStats((prev) => ({ ...prev, [campaignId]: false }));
    }
  };

  /**
   * Source of Truth for Mailchimp Connection:
   * - Table: mailchimp_connections
   * - Key: user_id (unique constraint)
   * - Connected when: access_token exists
   * - Set by: mailchimp-oauth-callback.ts after successful OAuth flow
   */
  const fetchMailchimpConfig = async () => {
    if (!user?.id) return;

    console.log('[Mailchimp] Fetching Mailchimp connection for user:', user.id.substring(0, 8) + '...');
    const { connection, error } = await getMailchimpConnectionForUser(supabase, user.id);

    if (error) {
      console.error('[Mailchimp] Error fetching connection:', error);
      setMailchimpConnection(null);
      return;
    }

    if (connection) {
      console.log('[Mailchimp] Found existing connection:', {
        hasAccessToken: !!connection.access_token,
        dataCenter: connection.data_center,
        apiEndpoint: connection.api_endpoint,
      });
      setMailchimpConnection(connection);
      fetchMailchimpSenderEmail();
    } else {
      console.log('[Mailchimp] No existing connection found');
      setMailchimpConnection(null);
      setMailchimpSenderEmail(null);
    }
  };

  const fetchMailchimpSenderEmail = async () => {
    if (!user?.id) return;

    try {
      const { data: listSettings } = await supabase
        .from('mailchimp_lists')
        .select('from_email, from_name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (listSettings?.from_email) {
        console.log('[Mailchimp] Found sender email:', listSettings.from_email);
        setMailchimpSenderEmail(listSettings.from_email);
      } else {
        console.log('[Mailchimp] No sender email found in mailchimp_lists');
        setMailchimpSenderEmail(null);
      }
    } catch (err) {
      console.error('[Mailchimp] Error fetching sender email:', err);
      setMailchimpSenderEmail(null);
    }
  };

  const connectMailchimp = () => {
    if (!user?.id) return;
    console.log('[Mailchimp] Starting OAuth flow for user:', user.id.substring(0, 8) + '...');
    const popup = window.open(
      `/.netlify/functions/mailchimp-oauth-start?user_id=${encodeURIComponent(user.id)}`,
      'Mailchimp OAuth',
      'width=600,height=700'
    );
    if (!popup) {
      alert('Please allow popups for this site to connect Mailchimp');
    }
  };

  const disconnectMailchimp = async () => {
    if (!user?.id || !confirm('Are you sure you want to disconnect Mailchimp?')) return;

    try {
      const { error } = await supabase
        .from('user_integrations')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'mailchimp');

      if (!error) {
        setMailchimpConnection(null);
        alert('Mailchimp disconnected successfully!');
      } else {
        console.error('[Mailchimp] Error disconnecting:', error);
        alert('Failed to disconnect Mailchimp');
      }
    } catch (err) {
      console.error('[Mailchimp] Disconnect error:', err);
      alert('Failed to disconnect Mailchimp');
    }
  };

  const handleSaveMailchimpSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    alert('Manual API configuration is no longer supported. Please use "Sign in with Mailchimp" to connect via OAuth.');
    setShowSettingsModal(false);
  };

  const syncToMailchimp = async () => {
    if (!mailchimpConnection) {
      showToast('Please connect Mailchimp first', 'error');
      return;
    }

    setSyncing(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        showToast('Not authenticated', 'error');
        setSyncing(false);
        return;
      }

      const response = await fetch('/.netlify/functions/mailchimp-sync-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        console.error('Mailchimp sync failed:', result);
        const errorMessage = result.message || result.error || 'Mailchimp sync failed. Please try again.';
        showToast(errorMessage, 'error');
        return;
      }

      const newSynced = result.newSynced ?? 0;
      const alreadySynced = result.alreadySynced ?? 0;
      const failed = result.failed ?? 0;

      await fetchContacts();

      const parts: string[] = [];

      if (newSynced > 0) {
        parts.push(`${newSynced} new fan${newSynced === 1 ? '' : 's'} added`);
      }
      if (alreadySynced > 0) {
        parts.push(`${alreadySynced} already on your Mailchimp list`);
      }
      if (failed > 0) {
        parts.push(`${failed} failed`);
      }

      const message = parts.length > 0 ? parts.join(', ') + '.' : 'No new fans to sync.';

      showToast(message, failed > 0 ? 'warning' : 'success');
    } catch (err: any) {
      console.error('[Mailchimp Sync Error]:', err);
      showToast('Mailchimp sync failed. Please try again.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const importFromMailchimp = async () => {
    if (!mailchimpConnection) {
      showToast('Please connect Mailchimp first', 'error');
      return;
    }

    setImporting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        showToast('Not authenticated', 'error');
        setImporting(false);
        return;
      }

      const response = await fetch('/.netlify/functions/mailchimp-import-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        console.error('Mailchimp import failed:', result);
        const errorMessage = result.message || result.error || 'Mailchimp import failed. Please try again.';
        showToast(errorMessage, 'error');
        return;
      }

      const imported = result.imported ?? 0;
      const updated = result.updated ?? 0;
      const skipped = result.skipped ?? 0;

      await fetchContacts();

      const parts: string[] = [];
      if (imported > 0)
        parts.push(`${imported} new fan${imported === 1 ? '' : 's'} imported`);
      if (updated > 0)
        parts.push(`${updated} existing fan${updated === 1 ? '' : 's'} updated`);
      if (skipped > 0)
        parts.push(`${skipped} skipped`);

      const message = parts.length > 0 ? parts.join(', ') + '.' : 'No contacts found to import.';

      showToast(message, 'success');
    } catch (err: any) {
      console.error('[Mailchimp Import Error]:', err);
      showToast('Mailchimp import failed. Please try again.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleDesignWithGhosteAI = async () => {
    setAiLoading(true);
    setAiError(null);

    try {
      const payload: EmailDesignRequest = {
        userId: user?.id ?? 'unknown',
        artistName: user?.user_metadata?.full_name || 'Artist',
        campaignGoal: emailDesigner.campaignGoal,
        tone: emailDesigner.tone,
        audienceDescription: 'music fans',
        campaignTitleHint: messageForm.subject || 'New Campaign',
        mainMessageNotes: messageForm.content,

        links: {
          spotify: emailDesigner.spotifyUrl || undefined,
          apple: emailDesigner.appleUrl || undefined,
          youtube: emailDesigner.youtubeUrl || undefined,
          presave: emailDesigner.presaveUrl || undefined,
          website: emailDesigner.websiteUrl || undefined,
        },

        brand: {
          primaryColor: '#3b82f6',
          secondaryColor: '#1e293b',
          backgroundColor: '#020617',
          accentColor: '#8b5cf6',
          textColor: '#e5e7eb',
        },
      };

      // Call Supabase Edge Function for AI email design
      const { data: aiData, error: aiError } = await supabase.functions.invoke('ghoste-ai', {
        body: {
          user_id: user?.id,
          task: 'email_draft',
          payload: {
            subject: payload.subject,
            content: payload.content,
            style: payload.design,
          },
        },
      });

      if (aiError || !aiData) {
        throw new Error(aiError?.message || 'Ghoste AI email design failed');
      }

      const data: EmailDesignResponse = aiData.result;

      setMessageForm({
        ...messageForm,
        subject: data.subject,
        content: data.previewText || data.subject,
      });

      setEmailDesigner({
        ...emailDesigner,
        previewText: data.previewText,
        html: data.html,
      });

      showToast('Email designed by Ghoste AI!', 'success');
    } catch (err: any) {
      console.error('Design with Ghoste AI error', err);
      setAiError(err?.message ?? 'Something went wrong while designing the email.');
      showToast(err?.message ?? 'Failed to design email', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const sendViaMailchimp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!mailchimpConnection) {
      alert('Please connect Mailchimp to send campaigns');
      return;
    }

    if (!messageForm.subject.trim() || !messageForm.content.trim()) {
      alert('Subject and message are required.');
      return;
    }

    setSending(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        alert('Not authenticated');
        setSending(false);
        return;
      }

      // Use Ghoste AI-generated HTML if available, otherwise fallback to simple HTML
      const htmlContent = emailDesigner.html || fallbackPlainHtmlFromBody(messageForm.content);

      const response = await fetch('/.netlify/functions/mailchimp-send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: messageForm.subject,
          html: htmlContent,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || result.error || 'Failed to send Mailchimp message');
      }

      // The message is now persisted by the backend function
      // Refresh messages to show the new campaign
      await fetchMessages();
      setMessageForm({ type: 'email', subject: '', content: '' });
      setEmailDesigner({
        previewText: '',
        html: '',
        campaignGoal: 'generic',
        tone: 'hype',
        spotifyUrl: '',
        appleUrl: '',
        youtubeUrl: '',
        presaveUrl: '',
        websiteUrl: '',
      });
      setShowMessageModal(false);
      showToast('Campaign sent via Mailchimp to your audience!', 'success');
    } catch (err: any) {
      console.error('[Mailchimp Send Error]:', err);
      const errorMessage = err.message || 'Failed to send message. Please try again.';

      if (errorMessage.includes('sender email') || errorMessage.includes('verify') || errorMessage.includes('From email')) {
        showToast(errorMessage, 'error');
      } else {
        showToast(errorMessage, 'error');
      }
    } finally {
      setSending(false);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data, error } = await supabase.from('fan_contacts').insert([
      {
        owner_id: user?.id,
        user_id: user?.id,
        name: contactForm.name,
        email: contactForm.email || null,
        phone_e164: contactForm.phone || null,
        meta: {
          tags: contactForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
        },
        consent_email: true,
        source: 'manual',
        mailchimp_status: mailchimpConnection ? 'pending' : null,
      },
    ]).select().single();

    if (!error) {
      fetchContacts();
      setContactForm({ name: '', email: '', phone: '', tags: '' });
      setShowContactModal(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (messageForm.type === 'email' && mailchimpConnection) {
      await sendViaMailchimp(e);
      return;
    }

    const subscribedContacts = contacts.filter((c) => c.subscribed);

    // Handle SMS with Twilio and credit spending
    if (messageForm.type === 'sms') {
      const smsContacts = subscribedContacts.filter((c) => c.phone_e164 || c.phone);
      if (smsContacts.length === 0) {
        showToast('No contacts with phone numbers', 'error');
        return;
      }

      if (!messageForm.content.trim()) {
        showToast('Message content required', 'error');
        return;
      }

      try {
        // Spend credits BEFORE sending
        await spendForFeature('fan_broadcast_sms');

        setSending(true);

        // Get phone numbers
        const toNumbers = smsContacts.map((c) => c.phone_e164 || c.phone).filter(Boolean) as string[];

        // Send via Twilio
        const result = await sendSms({
          toNumbers,
          message: messageForm.content,
        });

        // Log to database
        await supabase.from('fan_messages').insert([
          {
            user_id: user?.id,
            type: 'sms',
            subject: null,
            content: messageForm.content,
            recipient_count: result.summary.sent,
            sent_at: new Date().toISOString(),
          },
        ]);

        await fetchMessages();
        setMessageForm({ type: 'email', subject: '', content: '' });
        setShowMessageModal(false);

        if (result.summary.failed > 0) {
          showToast(
            `SMS sent to ${result.summary.sent} of ${result.summary.total} contacts`,
            'warning'
          );
        } else {
          showToast(`SMS sent to ${result.summary.sent} fans!`, 'success');
        }
      } catch (err: any) {
        const msg = err?.message || String(err);

        if (msg.includes('PRO_REQUIRED')) {
          showToast('Ghoste Pro required', 'error');
        } else if (msg.includes('INSUFFICIENT')) {
          showToast('Not enough Manager credits. Top up your wallet to send SMS.', 'error');
        } else {
          showToast('Failed to send SMS: ' + msg, 'error');
        }
      } finally {
        setSending(false);
      }
      return;
    }

    // Handle email (existing logic)
    const recipientCount = subscribedContacts.filter((c) => c.email).length;

    const { error } = await supabase.from('fan_messages').insert([
      {
        user_id: user?.id,
        type: messageForm.type,
        subject: messageForm.type === 'email' ? messageForm.subject : null,
        content: messageForm.content,
        recipient_count: recipientCount,
        sent_at: new Date().toISOString(),
      },
    ]);

    if (!error) {
      fetchMessages();
      setMessageForm({ type: 'email', subject: '', content: '' });
      setShowMessageModal(false);
      alert(`Message sent to ${recipientCount} fans!`);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      await supabase.from('fan_contacts').delete().eq('id', id);
      fetchContacts();
    }
  };

  // Calculate synced/pending counts from mailchimp_status in database
  const syncedCount = contacts.filter(c => c.mailchimp_status === 'synced').length;
  const pendingCount = contacts.filter(c => c.mailchimp_status !== 'synced').length;

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  return (
    <ProGate feature="Fan Communication" action="send messages to" fullPage>
      <div>
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setView('contacts')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              view === 'contacts'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <Users className="w-5 h-5 inline mr-2" />
            Contacts ({contacts.length})
          </button>
          <button
            onClick={() => setView('messages')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              view === 'messages'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <Mail className="w-5 h-5 inline mr-2" />
            Messages ({messages.length})
          </button>
          <button
            onClick={() => setView('pulse')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              view === 'pulse'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-5 h-5 inline mr-2" />
            Fan Pulse
          </button>
          <button
            onClick={() => setView('settings')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              view === 'settings'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <Settings className="w-5 h-5 inline mr-2" />
            Mailchimp
          </button>
        </div>
        {view !== 'pulse' && (
          <button
            onClick={() => (view === 'contacts' ? setShowContactModal(true) : view === 'messages' ? setShowMessageModal(true) : setShowSettingsModal(true))}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            {view === 'contacts' ? 'Add Contact' : view === 'messages' ? 'Send Message' : 'Configure'}
          </button>
        )}
      </div>

      {mailchimpConnection && view === 'contacts' && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-green-400" />
            <div>
              <div className="font-semibold text-green-400">Mailchimp Connected</div>
              <div className="text-sm text-gray-400">
                {syncedCount} synced • {pendingCount} pending
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={importFromMailchimp}
              disabled={importing}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Download className={`w-4 h-4 ${importing ? 'animate-pulse' : ''}`} />
              {importing ? 'Importing...' : 'Import from Mailchimp'}
            </button>
            {pendingCount > 0 && (
              <button
                onClick={syncToMailchimp}
                disabled={syncing}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync to Mailchimp'}
              </button>
            )}
          </div>
        </div>
      )}

      {view === 'contacts' ? (
        <div>
          {contacts.length === 0 ? (
            <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
              <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-400 mb-2">No fans yet</h3>
              <p className="text-gray-500 mb-4">Share your email capture or presave links to start building your list</p>
              <p className="text-gray-600 text-sm">Contacts will appear here when fans sign up through your links</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="bg-gray-900 rounded-lg border border-gray-800 p-4 hover:border-blue-500/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold">{contact.name || 'Unnamed Contact'}</h3>
                        {contact.source && (
                          <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                            {contact.source === 'email_capture'
                              ? 'Email Capture'
                              : contact.source === 'presave'
                              ? 'Presave'
                              : contact.source === 'meta'
                              ? 'Meta'
                              : contact.source}
                          </span>
                        )}
                        {contact.synced_to_mailchimp && (
                          <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Synced
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-400 space-y-1">
                        {contact.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            {contact.email}
                          </div>
                        )}
                        {(contact.phone_e164 || (contact as any).phone) && (
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" />
                            {contact.phone_e164 || (contact as any).phone}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-2">
                          Joined {new Date(contact.created_at).toLocaleDateString()}
                        </div>
                        {(contact as any).latest_event && (contact as any).latest_event.length > 0 && (
                          <div className="text-xs text-gray-500">
                            Last activity: {(contact as any).latest_event[0].event_type.replace('_', ' ')}
                            {(contact as any).latest_event[0].link_slug && ` (${(contact as any).latest_event[0].link_slug})`}
                          </div>
                        )}
                      </div>
                      {contact.meta?.tags && contact.meta.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {contact.meta.tags.map((tag: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteContact(contact.id)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : view === 'messages' ? (
        <div>
          {messages.length === 0 ? (
            <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
              <Mail className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-400 mb-2">No messages sent yet</h3>
              <p className="text-gray-500 mb-4">Send your first message to your fans</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {messages.map((message) => {
                const isMailchimp = message.channel === 'mailchimp_email' || message.type === 'email';
                const hasStats = message.emails_sent !== undefined && message.emails_sent > 0;
                const canSync = isMailchimp && message.mailchimp_campaign_id;
                const isSyncing = message.mailchimp_campaign_id ? syncingStats[message.mailchimp_campaign_id] : false;

                return (
                  <div
                    key={message.id}
                    className="bg-gray-900 rounded-lg border border-gray-800 p-4 hover:border-blue-500/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isMailchimp ? (
                          <Mail className="w-5 h-5 text-blue-400" />
                        ) : (
                          <MessageSquare className="w-5 h-5 text-green-400" />
                        )}
                        <div>
                          <div className="font-semibold">
                            {message.subject || `${(message.type || message.channel || 'Message').toUpperCase()}`}
                          </div>
                          <div className="text-xs text-gray-500">
                            {isMailchimp ? 'Email via Mailchimp' : message.channel || message.type}
                            {message.status && message.status !== 'sent' && (
                              <span className="ml-2 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px]">
                                {message.status}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {canSync && (
                        <button
                          onClick={() => syncCampaignStats(message.mailchimp_campaign_id!)}
                          disabled={isSyncing}
                          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
                          title="Refresh stats"
                        >
                          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>

                    <p className="text-sm text-gray-400 line-clamp-2 mb-3">{message.content}</p>

                    {/* Stats Section */}
                    {isMailchimp && (
                      <div className="flex items-center gap-4 text-xs text-gray-500 py-2 px-3 bg-gray-950/50 rounded-lg">
                        {hasStats ? (
                          <>
                            <div className="flex items-center gap-1">
                              <Send className="w-3 h-3" />
                              <span className="font-medium text-gray-400">{message.emails_sent?.toLocaleString()}</span>
                              <span>sent</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              <span className="font-medium text-blue-400">{message.open_rate?.toFixed(1)}%</span>
                              <span>opens</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-green-400">{message.click_rate?.toFixed(1)}%</span>
                              <span>clicks</span>
                            </div>
                            {message.last_synced_at && (
                              <div className="ml-auto text-[10px]">
                                Updated {new Date(message.last_synced_at).toLocaleTimeString()}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            {isSyncing ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Syncing stats...</span>
                              </>
                            ) : canSync ? (
                              <>
                                <AlertCircle className="w-3 h-3 text-yellow-500" />
                                <span>Stats not available yet</span>
                              </>
                            ) : (
                              <span>No stats tracking for this campaign</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="text-xs text-gray-500 mt-2">
                      {new Date(message.sent_at || message.created_at).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : view === 'pulse' ? (
        <FanPulse />
      ) : (
        <div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-2xl">
            <h3 className="text-xl font-semibold mb-4">Mailchimp Integration</h3>

            {mailchimpConnection ? (
              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Check className="w-6 h-6 text-green-400" />
                    <div>
                      <div className="font-semibold text-green-400">Connected to Mailchimp</div>
                      <div className="text-sm text-gray-400">Your account is linked and active</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {mailchimpConnection.data_center && (
                    <div className="bg-black rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-1">Data Center</div>
                      <div className="font-semibold">{mailchimpConnection.data_center}</div>
                    </div>
                  )}

                  {mailchimpConnection.api_endpoint && (
                    <div className="bg-black rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-1">API Endpoint</div>
                      <div className="font-mono text-sm text-xs break-all">{mailchimpConnection.api_endpoint}</div>
                    </div>
                  )}

                  <div className="bg-black rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Connected On</div>
                    <div className="text-sm">{new Date(mailchimpConnection.created_at).toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-blue-400">{syncedCount}</div>
                    <div className="text-sm text-gray-400">Synced Contacts</div>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-purple-400">{messages.length}</div>
                    <div className="text-sm text-gray-400">Campaigns Sent</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={disconnectMailchimp}
                    className="w-full px-4 py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium rounded-lg transition-colors"
                  >
                    Disconnect Mailchimp
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-300">
                    <div className="font-semibold text-yellow-400 mb-1">Mailchimp Not Connected</div>
                    <p>Connect your Mailchimp account to sync contacts and send professional email campaigns.</p>
                  </div>
                </div>

                <div className="space-y-3 text-sm text-gray-400">
                  <p className="font-semibold text-white">Benefits of connecting:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>Automatically sync your fan contacts</li>
                    <li>Send professional email campaigns</li>
                    <li>Track email open and click rates</li>
                    <li>Manage audience segments and tags</li>
                  </ul>
                </div>

                <button
                  onClick={connectMailchimp}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Mail className="w-5 h-5" />
                  Sign in with Mailchimp
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showContactModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6">Add Contact</h2>
            <form onSubmit={handleAddContact} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={contactForm.tags}
                  onChange={(e) => setContactForm({ ...contactForm, tags: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="vip, newsletter, concert"
                />
              </div>
              {mailchimpConnection && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-400">
                  <Check className="w-4 h-4 inline mr-2" />
                  Will be automatically synced to Mailchimp
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Add Contact
                </button>
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMessageModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-6xl my-8">
            <h2 className="text-2xl font-bold mb-6">Send Message</h2>

            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left: Form */}
              <div className="flex-1">
                <form onSubmit={handleSendMessage} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="email"
                      checked={messageForm.type === 'email'}
                      onChange={(e) =>
                        setMessageForm({ ...messageForm, type: e.target.value as 'email' | 'sms' })
                      }
                      className="text-blue-600"
                    />
                    <span>Email {mailchimpConnection && '(via Mailchimp)'}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="sms"
                      checked={messageForm.type === 'sms'}
                      onChange={(e) =>
                        setMessageForm({ ...messageForm, type: e.target.value as 'email' | 'sms' })
                      }
                      className="text-blue-600"
                    />
                    <span>SMS</span>
                  </label>
                </div>

                {messageForm.type === 'email' && mailchimpConnection && (
                  <div className="mt-2">
                    {mailchimpSenderEmail ? (
                      <div className="text-xs text-gray-400">
                        From: <span className="font-medium text-gray-200">{mailchimpSenderEmail}</span> <span className="text-gray-500">(via Mailchimp)</span>
                      </div>
                    ) : (
                      <div className="text-xs text-yellow-500 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        No sender email found. Please verify your From email in Mailchimp settings.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {messageForm.type === 'email' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Email Template</label>
                    <select
                      value={selectedEmailTemplateId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedEmailTemplateId(id);

                        if (!id) return;
                        const tmpl = EMAIL_TEMPLATES.find((t) => t.id === id);
                        if (!tmpl) return;

                        setMessageForm({
                          ...messageForm,
                          subject: tmpl.subject,
                          content: tmpl.html.trim(),
                        });
                      }}
                      className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Choose template…</option>
                      {EMAIL_TEMPLATES.map((tmpl) => (
                        <option key={tmpl.id} value={tmpl.id}>
                          {tmpl.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Subject</label>
                    <input
                      type="text"
                      value={messageForm.subject}
                      onChange={(e) => setMessageForm({ ...messageForm, subject: e.target.value })}
                      className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  {/* Ghoste AI Email Designer Section */}
                  <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-400" />
                        <h3 className="font-semibold text-purple-300">Ghoste AI Email Designer</h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Campaign Goal</label>
                        <select
                          value={emailDesigner.campaignGoal}
                          onChange={(e) => setEmailDesigner({ ...emailDesigner, campaignGoal: e.target.value as any })}
                          className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="generic">Generic</option>
                          <option value="new_release">New Release</option>
                          <option value="tour">Tour</option>
                          <option value="newsletter">Newsletter</option>
                          <option value="announcement">Announcement</option>
                          <option value="winback">Winback</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Tone</label>
                        <select
                          value={emailDesigner.tone}
                          onChange={(e) => setEmailDesigner({ ...emailDesigner, tone: e.target.value as any })}
                          className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="hype">Hype</option>
                          <option value="chill">Chill</option>
                          <option value="emotional">Emotional</option>
                          <option value="informative">Informative</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="url"
                        placeholder="Spotify URL (optional)"
                        value={emailDesigner.spotifyUrl}
                        onChange={(e) => setEmailDesigner({ ...emailDesigner, spotifyUrl: e.target.value })}
                        className="px-3 py-2 bg-black/50 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <input
                        type="url"
                        placeholder="Apple Music URL (optional)"
                        value={emailDesigner.appleUrl}
                        onChange={(e) => setEmailDesigner({ ...emailDesigner, appleUrl: e.target.value })}
                        className="px-3 py-2 bg-black/50 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleDesignWithGhosteAI}
                      disabled={aiLoading}
                      className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {aiLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Designing...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Design with Ghoste AI</span>
                        </>
                      )}
                    </button>

                    {aiError && (
                      <div className="text-xs text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {aiError}
                      </div>
                    )}

                    {emailDesigner.html && (
                      <div className="text-xs text-green-400 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Email designed! Preview on the right →
                      </div>
                    )}
                  </div>
                </>
              )}

              {messageForm.type === 'sms' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">SMS Template</label>
                  <select
                    value={selectedSmsTemplateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedSmsTemplateId(id);

                      if (!id) return;
                      const tmpl = SMS_TEMPLATES.find((t) => t.id === id);
                      if (!tmpl) return;

                      setMessageForm({
                        ...messageForm,
                        content: tmpl.text,
                      });
                    }}
                    className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose template…</option>
                    {SMS_TEMPLATES.map((tmpl) => (
                      <option key={tmpl.id} value={tmpl.id}>
                        {tmpl.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Message</label>
                <textarea
                  value={messageForm.content}
                  onChange={(e) => setMessageForm({ ...messageForm, content: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-32"
                  required
                />
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-400">
                <Send className="w-4 h-4 inline mr-2" />
                This will be sent to{' '}
                {messageForm.type === 'email'
                  ? syncedCount
                  : contacts.filter((c) => c.consent_sms && c.phone).length}{' '}
                subscribed fan{(messageForm.type === 'email' ? syncedCount : contacts.filter((c) => c.consent_sms && c.phone).length) === 1 ? '' : 's'}
                {messageForm.type === 'email' && mailchimpConnection && ' via Mailchimp'}
              </div>

              {messageForm.type === 'sms' && (
                <div className="flex items-center justify-between px-1 py-2 bg-slate-900/50 rounded-lg border border-slate-800">
                  <span className="text-xs text-slate-400">SMS blast cost:</span>
                  <CreditCostBadge featureKey="fan_broadcast_sms" />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={sending || isSpending}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {(sending || isSpending) && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {isSpending ? 'Reserving credits...' : sending ? 'Sending...' : 'Send Message'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMessageModal(false)}
                  disabled={sending}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </form>
              </div>

              {/* Right: Live Preview (email only) */}
              {messageForm.type === 'email' && (
                <div className="flex-1 bg-neutral-900/60 rounded-xl border border-neutral-800 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                    <h3 className="text-sm font-medium text-gray-200">Email Preview</h3>
                    {emailDesigner.html && (
                      <span className="text-xs text-purple-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Ghoste AI Design
                      </span>
                    )}
                  </div>

                  {emailDesigner.html ? (
                    <div className="w-full h-[550px] bg-white">
                      <iframe
                        title="Email preview"
                        className="w-full h-full"
                        srcDoc={emailDesigner.html}
                        sandbox="allow-same-origin"
                      />
                    </div>
                  ) : (
                    <div className="p-4 overflow-auto max-h-[550px]">
                      <div className="bg-black/40 rounded-lg border border-neutral-800 p-4 text-sm leading-relaxed">
                        {messageForm.subject && (
                          <div className="mb-3 pb-3 border-b border-neutral-800">
                            <span className="font-semibold text-gray-300">Subject: </span>
                            <span className="text-gray-100">
                              {messageForm.subject
                                .replace(/\{\{\s*first_name\s*\}\}/gi, 'Alex')
                                .replace(/\{\{\s*name\s*\}\}/gi, 'Alex')
                                .replace(/\{\{\s*artist_name\s*\}\}/gi, 'Your Artist Name')}
                            </span>
                          </div>
                        )}

                        <div
                          className="prose prose-invert max-w-none text-sm prose-headings:text-gray-100 prose-p:text-gray-200 prose-a:text-blue-400 prose-strong:text-gray-100"
                          dangerouslySetInnerHTML={{
                            __html: messageForm.content
                              .replace(/\{\{\s*first_name\s*\}\}/gi, 'Alex')
                              .replace(/\{\{\s*name\s*\}\}/gi, 'Alex')
                              .replace(/\{\{\s*artist_name\s*\}\}/gi, 'Your Artist Name')
                              .replace(/\{\{\s*link\s*\}\}/gi, 'https://ghoste.one/sample-link')
                              .replace(/\{\{\s*track_name\s*\}\}/gi, 'Your New Track')
                              .replace(/\{\{\s*release_date\s*\}\}/gi, 'Friday')
                          }}
                        />
                      </div>

                      {!messageForm.subject && !messageForm.content && (
                        <div className="text-center py-8 text-gray-500 text-sm">
                          Select a template or start typing to see preview
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6">Mailchimp Settings</h2>
            <form onSubmit={handleSaveMailchimpSettings} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">API Key *</label>
                <input
                  type="text"
                  value={settingsForm.api_key}
                  onChange={(e) => setSettingsForm({ ...settingsForm, api_key: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="abc123def456-us1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Server Prefix *</label>
                <input
                  type="text"
                  value={settingsForm.server_prefix}
                  onChange={(e) => setSettingsForm({ ...settingsForm, server_prefix: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="us1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Audience ID *</label>
                <input
                  type="text"
                  value={settingsForm.audience_id}
                  onChange={(e) => setSettingsForm({ ...settingsForm, audience_id: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="abc123def4"
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Save Settings
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </ProGate>
  );
}
