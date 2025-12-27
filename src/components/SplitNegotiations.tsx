import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { Plus, FileText, Users, Check, Trash2, MessageSquare, Download, DollarSign, TrendingUp, X, Search, Filter, MoreVertical, Mail, Calendar, FileSignature } from 'lucide-react';
import Toast from './Toast';
import { ROUTES } from '../lib/routes';

interface Negotiation {
  id: string;
  project_name: string;
  status: string;
  contract_url?: string | null;
  created_at: string;
  updated_at?: string;
  advance_amount?: number | null;
  beat_fee?: number | null;
  estimated_streams?: number | null;
  per_stream_rate?: number | null;
}

interface Participant {
  id: string;
  negotiation_id: string;
  email: string;
  name: string;
  role: string;
  how_to_credit?: string | null;
  master_rights_pct: number;
  publishing_rights_pct: number;
  ipi_number?: string | null;
  performing_rights_org?: string | null;
  signed_at: string | null;
  signature_name?: string | null;
  signature_ip?: string | null;
}

interface Message {
  id: string;
  negotiation_id: string;
  author_id: string;
  author_name: string;
  author_email: string;
  message_type: 'comment' | 'offer' | 'counter_offer';
  body: string;
  created_at: string;
}

type TabType = 'open' | 'royalties' | 'past';

export default function SplitNegotiations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('open');
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [showMessagesModal, setShowMessagesModal] = useState(false);
  const [showESignModal, setShowESignModal] = useState(false);
  const [showSignatureViewModal, setShowSignatureViewModal] = useState(false);
  const [selectedNegotiation, setSelectedNegotiation] = useState<Negotiation | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [signatureCounts, setSignatureCounts] = useState<Record<string, { signed: number; total: number }>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    project_name: '',
    beat_fee: '',
    your_name: '',
    your_email: '',
    your_role: 'Artist',
    how_to_credit: '',
    pro: '',
    ipi_number: '',
    master_rights_pct: '100',
    publishing_rights_pct: '0',
    collaborator_emails: '',
    distributor: '',
  });

  const [inlineParticipant, setInlineParticipant] = useState({
    name: '',
    email: '',
    role: 'Artist',
    how_to_credit: '',
    master_rights_pct: 0,
    publishing_rights_pct: 0,
    performing_rights_org: '',
    ipi_number: '',
  });

  const [inlineParticipants, setInlineParticipants] = useState<typeof inlineParticipant[]>([]);
  const [showSettings, setShowSettings] = useState(true);

  const [participantForm, setParticipantForm] = useState({
    name: '',
    email: '',
    role: '',
    master_percentage: 0,
    publishing_percentage: 0,
    credit_name: '',
    ipi_number: '',
    performing_rights_org: '',
  });

  const [messageForm, setMessageForm] = useState({
    message_type: 'comment' as 'comment' | 'offer' | 'counter_offer',
    body: '',
    requested_master_pct: '',
    requested_publishing_pct: '',
    requested_upfront: '',
  });

  const [eSignForm, setESignForm] = useState({
    signature_name: '',
    agree: false,
  });

  const [royaltiesForm, setRoyaltiesForm] = useState({
    estimated_streams: '100000',
    per_stream_rate: '0.003',
  });

  useEffect(() => {
    if (user) {
      fetchNegotiations();

      // Load defaults from localStorage
      try {
        const raw = localStorage.getItem('ghoste_split_profile');
        if (raw) {
          const parsed = JSON.parse(raw);
          setFormData(prev => ({
            ...prev,
            your_name: parsed.name || user.user_metadata?.full_name || user.email?.split('@')[0] || '',
            your_email: parsed.email || user.email || '',
            your_role: parsed.role || 'Artist',
            how_to_credit: parsed.how_to_credit || user.user_metadata?.full_name || user.email?.split('@')[0] || '',
            pro: parsed.pro || '',
            ipi_number: parsed.ipi_number || '',
            distributor: parsed.distributor || '',
          }));
        } else {
          setFormData(prev => ({
            ...prev,
            your_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
            your_email: user.email || '',
            how_to_credit: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
          }));
        }
      } catch (e) {
        console.error('Failed to load split profile defaults', e);
        setFormData(prev => ({
          ...prev,
          your_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
          your_email: user.email || '',
          how_to_credit: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
        }));
      }
    }
  }, [user, activeTab]);

  const fetchNegotiations = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('[SplitNegotiations] No session found');
        setLoading(false);
        return;
      }

      const response = await fetch('/.netlify/functions/split-negotiations', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('[SplitNegotiations] Error fetching negotiations:', result);
        setNegotiations([]);
      } else {
        const negs = result.negotiations || [];
        setNegotiations(negs);
        await fetchSignatureCounts(negs);
      }
    } catch (err) {
      console.error('[SplitNegotiations] Unexpected error:', err);
      setNegotiations([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSignatureCounts = async (negotiations: Negotiation[]) => {
    const counts: Record<string, { signed: number; total: number }> = {};
    for (const neg of negotiations) {
      const { data, error } = await supabase
        .from('split_participants')
        .select('signed_at')
        .eq('negotiation_id', neg.id);

      if (!error && data) {
        const total = data.length;
        const signed = data.filter(p => p.signed_at).length;
        counts[neg.id] = { signed, total };
      }
    }
    setSignatureCounts(counts);
  };

  const fetchParticipants = async (negotiationId: string) => {
    try {
      const { data, error } = await supabase
        .from('split_participants')
        .select('*')
        .eq('negotiation_id', negotiationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching participants:', error);
        setParticipants([]);
      } else {
        setParticipants(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching participants:', err);
      setParticipants([]);
    }
  };

  const fetchMessages = async (negotiationId: string) => {
    try {
      const { data, error } = await supabase
        .from('split_messages')
        .select('*')
        .eq('negotiation_id', negotiationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        setMessages([]);
      } else {
        setMessages(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching messages:', err);
      setMessages([]);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setToast({ message: 'No active session', type: 'error' });
        setSubmitting(false);
        return;
      }

      const response = await fetch('/.netlify/functions/create-split-negotiation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          project_name: formData.project_name,
          beat_fee: formData.beat_fee ? Number(formData.beat_fee) : undefined,
          owner_name: formData.your_name,
          owner_email: formData.your_email,
          owner_role: formData.your_role,
          owner_credit: formData.how_to_credit,
          owner_master_pct: Number(formData.master_rights_pct),
          owner_publishing_pct: Number(formData.publishing_rights_pct),
          owner_pro: formData.pro,
          owner_ipi: formData.ipi_number,
          distributor: formData.distributor,
          participants: inlineParticipants,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('[SplitNegotiations] Error creating negotiation:', result);

        const errorMessage = result?.error || result?.details || 'Failed to create negotiation';
        setToast({ message: errorMessage, type: 'error' });
      } else {
        console.log('[SplitNegotiations] Negotiation created successfully:', result);
        setToast({ message: 'Split negotiation created successfully!', type: 'success' });

        if (result.negotiation) {
          setNegotiations((prev) => [result.negotiation, ...prev]);
        }
        setFormData(prev => ({
          ...prev,
          project_name: '',
          beat_fee: '',
          master_rights_pct: '100',
          publishing_rights_pct: '0',
          collaborator_emails: '',
        }));
        setInlineParticipants([]);
        setShowModal(false);
      }
    } catch (err: any) {
      console.error('[SplitNegotiations] Unexpected error:', err);
      setToast({ message: err?.message || 'An unexpected error occurred', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const addParticipant = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedNegotiation) {
      setToast({ message: 'No negotiation selected', type: 'error' });
      return;
    }

    const { data: insertedParticipant, error } = await supabase
      .from('split_participants')
      .insert({
        negotiation_id: selectedNegotiation.id,
        email: participantForm.email,
        name: participantForm.name,
        role: participantForm.role,
        how_to_credit: participantForm.credit_name,
        master_rights_pct: participantForm.master_percentage,
        publishing_rights_pct: participantForm.publishing_percentage,
        ipi_number: participantForm.ipi_number || null,
        performing_rights_org: participantForm.performing_rights_org || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding participant:', error);
      setToast({ message: 'Failed to add participant', type: 'error' });
    } else {
      setToast({ message: 'Participant added successfully!', type: 'success' });
      fetchParticipants(selectedNegotiation.id);
      setParticipantForm({
        name: '',
        email: '',
        role: '',
        master_percentage: 0,
        publishing_percentage: 0,
        credit_name: '',
        ipi_number: '',
        performing_rights_org: '',
      });
    }
  };

  const handleDelete = async (negotiationId: string) => {
    if (!confirm('Are you sure you want to delete this negotiation?')) {
      return;
    }

    const { error } = await supabase
      .from('split_negotiations')
      .delete()
      .eq('id', negotiationId);

    if (error) {
      console.error('Error deleting negotiation:', error);
      setToast({ message: 'Failed to delete negotiation', type: 'error' });
    } else {
      setToast({ message: 'Negotiation deleted successfully', type: 'success' });
      setNegotiations(negotiations.filter(n => n.id !== negotiationId));
    }
  };

  const handleDeleteParticipant = async (participantId: string) => {
    if (!confirm('Remove this participant?')) {
      return;
    }

    const { error } = await supabase
      .from('split_participants')
      .delete()
      .eq('id', participantId);

    if (error) {
      console.error('Error deleting participant:', error);
      setToast({ message: 'Failed to remove participant', type: 'error' });
    } else {
      setToast({ message: 'Participant removed', type: 'success' });
      if (selectedNegotiation) {
        fetchParticipants(selectedNegotiation.id);
      }
    }
  };

  const handleDownloadSplitSheet = async (negotiation: Negotiation) => {
    setGeneratingId(negotiation.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setToast({ message: 'No active session', type: 'error' });
        setGeneratingId(null);
        return;
      }

      const response = await fetch('/.netlify/functions/split-generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ negotiationId: negotiation.id }),
      });

      const result = await response.json();

      if (response.ok && result.pdf_url) {
        window.open(result.pdf_url, '_blank');
        setToast({ message: 'Split sheet opened in new tab', type: 'success' });
      } else {
        setToast({ message: result.error || 'Failed to generate PDF', type: 'error' });
      }
    } catch (err) {
      console.error('Error downloading split sheet:', err);
      setToast({ message: 'Failed to generate split sheet', type: 'error' });
    } finally {
      setGeneratingId(null);
    }
  };

  const saveRoyaltiesDefaults = async () => {
    if (!selectedNegotiation) return;

    const { error } = await supabase
      .from('split_negotiations')
      .update({
        estimated_streams: Number(royaltiesForm.estimated_streams),
        per_stream_rate: Number(royaltiesForm.per_stream_rate),
      })
      .eq('id', selectedNegotiation.id);

    if (error) {
      console.error('Error saving royalties:', error);
      setToast({ message: 'Failed to save', type: 'error' });
    } else {
      setToast({ message: 'Royalties saved!', type: 'success' });
    }
  };

  const handleSendInvite = async (splitId: string, participant?: Participant) => {
    setSubmitting(true);
    try {
      const negotiation = negotiations.find(n => n.id === splitId);
      if (!negotiation) {
        setToast({ message: 'Negotiation not found', type: 'error' });
        setSubmitting(false);
        return;
      }

      const hostName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Host';
      const splitSummary = `Project: ${negotiation.project_name}${negotiation.beat_fee ? `, Beat Fee: $${negotiation.beat_fee}` : ''}`;

      if (participant) {
        const response = await fetch('/.netlify/functions/split-send-invite-lite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            negotiationId: splitId,
            projectName: negotiation.project_name,
            trackTitle: undefined,
            hostName,
            inviteeEmail: participant.email,
            splitSummary,
          }),
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
          console.error('[SplitNegotiations] Lite invite error (participant path):', result);
          const errorMsg = result?.message || result?.error || 'Failed to send invite. Please try again.';
          throw new Error(errorMsg);
        }

        setToast({ message: 'Invite sent successfully!', type: 'success' });

        if (selectedNegotiation) {
          fetchParticipants(selectedNegotiation.id);
        }
      } else {
        const emailInput = document.getElementById('invite-email') as HTMLInputElement;
        const nameInput = document.getElementById('invite-name') as HTMLInputElement;

        const collaboratorEmail = emailInput?.value.trim();
        const collaboratorName = nameInput?.value.trim();

        if (!collaboratorEmail) {
          setToast({ message: 'Please enter a collaborator email', type: 'error' });
          return;
        }

        const response = await fetch('/.netlify/functions/split-send-invite-lite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            negotiationId: splitId,
            projectName: negotiation.project_name,
            trackTitle: undefined,
            hostName,
            inviteeEmail: collaboratorEmail,
            splitSummary,
          }),
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
          console.error('[SplitNegotiations] Lite invite error (email path):', result);
          const errorMsg = result?.message || result?.error || 'Failed to send invite. Please try again.';
          throw new Error(errorMsg);
        }

        setToast({ message: 'Invite sent successfully!', type: 'success' });

        if (emailInput) emailInput.value = '';
        if (nameInput) nameInput.value = '';

        if (selectedNegotiation) {
          fetchParticipants(selectedNegotiation.id);
        }
      }
    } catch (error: any) {
      console.error('Error sending invite:', error);
      setToast({ message: error.message || 'Failed to send invite', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddInlineParticipant = () => {
    if (!inlineParticipant.name.trim() || !inlineParticipant.email.trim() || !inlineParticipant.role.trim()) {
      setToast({ message: 'Please fill in Name, Email, and Role for the participant', type: 'error' });
      return;
    }

    setInlineParticipants(prev => [...prev, inlineParticipant]);
    setInlineParticipant({
      name: '',
      email: '',
      role: 'Artist',
      how_to_credit: '',
      master_rights_pct: 0,
      publishing_rights_pct: 0,
      performing_rights_org: '',
      ipi_number: '',
    });
    setToast({ message: 'Participant added to list', type: 'success' });
  };

  const handleRemoveInlineParticipant = (index: number) => {
    setInlineParticipants(prev => prev.filter((_, i) => i !== index));
    setToast({ message: 'Participant removed', type: 'info' });
  };

  const handleSaveDefaults = () => {
    const payload = {
      name: formData.your_name,
      email: formData.your_email,
      role: formData.your_role,
      how_to_credit: formData.how_to_credit,
      pro: formData.pro,
      ipi_number: formData.ipi_number,
      distributor: formData.distributor,
    };

    try {
      localStorage.setItem('ghoste_split_profile', JSON.stringify(payload));
      setToast({ message: 'Saved split settings as default', type: 'success' });
    } catch (e) {
      console.error('Failed to save split profile defaults', e);
      setToast({ message: 'Failed to save defaults', type: 'error' });
    }
  };

  const openParticipantsModal = (negotiation: Negotiation) => {
    setSelectedNegotiation(negotiation);
    fetchParticipants(negotiation.id);
    setShowParticipantsModal(true);
  };

  const openMessagesModal = (negotiation: Negotiation) => {
    setSelectedNegotiation(negotiation);
    fetchMessages(negotiation.id);
    setShowMessagesModal(true);
  };

  const openESignModal = (participant: Participant) => {
    setSelectedParticipant(participant);
    setShowESignModal(true);
  };

  const openSignatureViewModal = (participant: Participant) => {
    setSelectedParticipant(participant);
    setShowSignatureViewModal(true);
  };

  const calculateRoyalties = () => {
    const streams = Number(royaltiesForm.estimated_streams) || 0;
    const rate = Number(royaltiesForm.per_stream_rate) || 0;
    const gross = streams * rate;

    return {
      gross,
      participants: participants.map(p => ({
        ...p,
        masterRoyalties: (p.master_rights_pct / 100) * gross,
        publishingRoyalties: (p.publishing_rights_pct / 100) * gross,
      })),
    };
  };

  const getFilteredNegotiations = () => {
    let filtered = negotiations;

    if (activeTab === 'open') {
      filtered = negotiations.filter(n => n.status !== 'completed');
    } else if (activeTab === 'past') {
      filtered = negotiations.filter(n => n.status === 'completed');
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(n =>
        n.project_name.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const filteredNegotiations = getFilteredNegotiations();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-gray-800"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 animate-spin"></div>
          </div>
          <div className="space-y-2">
            <p className="text-lg font-medium text-white">Loading negotiations</p>
            <p className="text-sm text-gray-400">Getting your splits ready...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Premium Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-900 to-blue-900/20 border border-gray-800/50 rounded-2xl p-8 shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent"></div>
        <div className="relative">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-white">Split Negotiations</h1>
              <p className="text-base text-gray-400 max-w-2xl">
                Create splits, collect signatures, and keep everyone paid — clean.
              </p>
            </div>
            {activeTab === 'open' && (
              <button
                onClick={() => setShowModal(true)}
                className="group relative px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-blue-500/25"
              >
                <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
                New Negotiation
              </button>
            )}
          </div>

          {/* Search and Filter Bar */}
          <div className="flex items-center gap-3 mt-6">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search negotiations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800/50">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('open')}
            className={`relative px-6 py-3 font-medium transition-all duration-200 ${
              activeTab === 'open'
                ? 'text-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Open Negotiations
            {activeTab === 'open' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-400"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('royalties')}
            className={`relative px-6 py-3 font-medium transition-all duration-200 ${
              activeTab === 'royalties'
                ? 'text-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Royalty Calculator
            {activeTab === 'royalties' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-400"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`relative px-6 py-3 font-medium transition-all duration-200 ${
              activeTab === 'past'
                ? 'text-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Completed
            {activeTab === 'past' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-400"></div>
            )}
          </button>
        </div>
      </div>

      {/* Open Negotiations Tab */}
      {activeTab === 'open' && (
        <div className="space-y-4">
          {filteredNegotiations.length === 0 ? (
            <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 rounded-2xl p-16 text-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent"></div>
              <div className="relative space-y-4">
                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-2xl flex items-center justify-center border border-blue-500/20">
                  <FileSignature className="w-10 h-10 text-blue-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-white">No negotiations yet</h3>
                  <p className="text-gray-400 max-w-md mx-auto">
                    {searchQuery ? 'No negotiations match your search.' : 'Create a split and send it for signatures in minutes.'}
                  </p>
                </div>
                {!searchQuery && (
                  <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-blue-500/25"
                  >
                    <Plus className="w-5 h-5" />
                    New Negotiation
                  </button>
                )}
              </div>
            </div>
          ) : (
            filteredNegotiations.map((negotiation) => (
              <div key={negotiation.id} className="group relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 hover:border-gray-700/50 rounded-2xl p-6 transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/5">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-blue-500/0 group-hover:from-blue-500/5 group-hover:to-transparent transition-all duration-200"></div>

                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-white mb-3 truncate">{negotiation.project_name}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                          negotiation.status === 'draft'
                            ? 'bg-gray-800/50 text-gray-300 border border-gray-700/50'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            negotiation.status === 'draft' ? 'bg-gray-400' : 'bg-emerald-400'
                          }`}></div>
                          {negotiation.status === 'draft' ? 'Draft' : 'Active'}
                        </span>
                        {signatureCounts[negotiation.id] && signatureCounts[negotiation.id].total > 0 && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-sm font-medium">
                            <FileSignature className="w-3.5 h-3.5" />
                            {signatureCounts[negotiation.id].signed} / {signatureCounts[negotiation.id].total} signed
                          </span>
                        )}
                        {negotiation.advance_amount && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/50 text-gray-300 border border-gray-700/50 rounded-lg text-sm">
                            <DollarSign className="w-3.5 h-3.5" />
                            ${negotiation.advance_amount.toLocaleString()} advance
                          </span>
                        )}
                        {negotiation.beat_fee && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/50 text-gray-300 border border-gray-700/50 rounded-lg text-sm">
                            <DollarSign className="w-3.5 h-3.5" />
                            ${negotiation.beat_fee.toLocaleString()} beat fee
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(negotiation.id)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200"
                      title="Delete negotiation"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openParticipantsModal(negotiation)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/30 rounded-xl transition-all duration-200 text-sm font-medium"
                    >
                      <Users className="w-4 h-4" />
                      Participants
                    </button>
                    <button
                      onClick={() => openMessagesModal(negotiation)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-500/30 rounded-xl transition-all duration-200 text-sm font-medium"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Messages
                    </button>
                    <button
                      onClick={() => navigate(ROUTES.studioSplitsDetail(negotiation.id))}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 rounded-xl transition-all duration-200 text-sm font-medium"
                    >
                      <FileText className="w-4 h-4" />
                      Open Split Breakdown
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Royalty Calculator Tab */}
      {activeTab === 'royalties' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Select Negotiation</h3>
            <select
              value={selectedNegotiation?.id || ''}
              onChange={(e) => {
                const neg = negotiations.find(n => n.id === e.target.value);
                setSelectedNegotiation(neg || null);
                if (neg) {
                  fetchParticipants(neg.id);
                  setRoyaltiesForm({
                    estimated_streams: neg.estimated_streams?.toString() || '100000',
                    per_stream_rate: neg.per_stream_rate?.toString() || '0.003',
                  });
                }
              }}
              className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            >
              <option value="">Choose a negotiation...</option>
              {negotiations.map((neg) => (
                <option key={neg.id} value={neg.id}>
                  {neg.project_name} ({neg.status})
                </option>
              ))}
            </select>
          </div>

          {selectedNegotiation && (
            <>
              <div className="bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 rounded-2xl p-6">
                <h3 className="text-xl font-bold text-white mb-4">Royalty Calculator</h3>
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Estimated Streams</label>
                    <input
                      type="number"
                      value={royaltiesForm.estimated_streams}
                      onChange={(e) => setRoyaltiesForm({ ...royaltiesForm, estimated_streams: e.target.value })}
                      className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                      placeholder="100000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Per-Stream Rate (USD)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={royaltiesForm.per_stream_rate}
                      onChange={(e) => setRoyaltiesForm({ ...royaltiesForm, per_stream_rate: e.target.value })}
                      className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                      placeholder="0.003"
                    />
                  </div>
                </div>
                <button
                  onClick={saveRoyaltiesDefaults}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-all duration-200"
                >
                  Save Defaults
                </button>
              </div>

              <div className="bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 rounded-2xl p-6">
                <div className="mb-6">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-medium text-emerald-400">Total Estimated Gross</span>
                  </div>
                  <p className="text-4xl font-bold text-white mt-4">
                    ${calculateRoyalties().gross.toFixed(2)}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800/50">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Participant</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Role</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Master %</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Publishing %</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Master Royalties</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Publishing Royalties</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculateRoyalties().participants.map((p) => (
                        <tr key={p.id} className="border-b border-gray-800/30 hover:bg-gray-800/20 transition-colors">
                          <td className="py-3 px-4 text-white font-medium">{p.name}</td>
                          <td className="py-3 px-4 text-gray-400 text-sm">{p.role}</td>
                          <td className="py-3 px-4 text-right text-gray-300">{p.master_rights_pct}%</td>
                          <td className="py-3 px-4 text-right text-gray-300">{p.publishing_rights_pct}%</td>
                          <td className="py-3 px-4 text-right text-blue-400 font-medium">${p.masterRoyalties.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-purple-400 font-medium">${p.publishingRoyalties.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-emerald-400 font-bold">${(p.masterRoyalties + p.publishingRoyalties).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Completed Negotiations Tab */}
      {activeTab === 'past' && (
        <div className="space-y-4">
          {filteredNegotiations.length === 0 ? (
            <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 rounded-2xl p-16 text-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent"></div>
              <div className="relative space-y-4">
                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                  <Check className="w-10 h-10 text-emerald-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-white">No completed negotiations</h3>
                  <p className="text-gray-400">Completed negotiations will appear here.</p>
                </div>
              </div>
            </div>
          ) : (
            filteredNegotiations.map((negotiation) => (
              <div key={negotiation.id} className="bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800/50 rounded-2xl p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-3">{negotiation.project_name}</h3>
                    <div className="flex items-center gap-2 flex-wrap mb-4">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm font-medium">
                        <Check className="w-3.5 h-3.5" />
                        Completed
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/50 text-gray-400 border border-gray-700/50 rounded-lg text-sm">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(negotiation.updated_at || negotiation.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownloadSplitSheet(negotiation)}
                    disabled={generatingId === negotiation.id}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/30 rounded-xl transition-all duration-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4" />
                    {generatingId === negotiation.id ? 'Opening...' : 'Download'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Negotiation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gradient-to-br from-gray-900 to-gray-900/95 border border-gray-800/50 rounded-2xl p-6 max-w-4xl w-full my-8 max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white">New Split Negotiation</h3>
                <p className="text-sm text-gray-400 mt-1">Create and send a split sheet to your collaborators</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto pr-2 space-y-6 flex-1">
                {/* Project Details */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-white">Project Details</h4>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Project Name *</label>
                    <input
                      type="text"
                      value={formData.project_name}
                      onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                      className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                      placeholder="My Amazing Song"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Beat Fee (USD)</label>
                    <input
                      type="number"
                      value={formData.beat_fee}
                      onChange={(e) => setFormData({ ...formData, beat_fee: e.target.value })}
                      className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                      placeholder="1000"
                      min="0"
                    />
                  </div>
                </div>

                {/* Your Split Details */}
                <div className="space-y-4 border-t border-gray-800/50 pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <Users className="w-4 h-4 text-emerald-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-white">Your Split Details</h4>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Your Name *</label>
                      <input
                        type="text"
                        value={formData.your_name}
                        onChange={(e) => setFormData({ ...formData, your_name: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="John Doe"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Your Email *</label>
                      <input
                        type="email"
                        value={formData.your_email}
                        onChange={(e) => setFormData({ ...formData, your_email: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="john@example.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Role *</label>
                      <select
                        value={formData.your_role}
                        onChange={(e) => setFormData({ ...formData, your_role: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        required
                      >
                        <option value="Artist">Artist</option>
                        <option value="Producer">Producer</option>
                        <option value="Songwriter">Songwriter</option>
                        <option value="Engineer">Engineer</option>
                        <option value="Mixer">Mixer</option>
                        <option value="Featured Artist">Featured Artist</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">How to Credit</label>
                      <input
                        type="text"
                        value={formData.how_to_credit}
                        onChange={(e) => setFormData({ ...formData, how_to_credit: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="Artist Name"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Master Rights %</label>
                      <input
                        type="number"
                        value={formData.master_rights_pct}
                        onChange={(e) => setFormData({ ...formData, master_rights_pct: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="100"
                        min="0"
                        max="100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Publishing Rights %</label>
                      <input
                        type="number"
                        value={formData.publishing_rights_pct}
                        onChange={(e) => setFormData({ ...formData, publishing_rights_pct: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="0"
                        min="0"
                        max="100"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">PRO</label>
                      <input
                        type="text"
                        value={formData.pro}
                        onChange={(e) => setFormData({ ...formData, pro: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="BMI, ASCAP, etc."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">IPI Number</label>
                      <input
                        type="text"
                        value={formData.ipi_number}
                        onChange={(e) => setFormData({ ...formData, ipi_number: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="00000000000"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveDefaults}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Save as default
                  </button>
                </div>

                {/* Collaborators */}
                <div className="space-y-4 border-t border-gray-800/50 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                        <Users className="w-4 h-4 text-purple-400" />
                      </div>
                      <h4 className="text-lg font-semibold text-white">Add Collaborators</h4>
                    </div>
                  </div>

                  {inlineParticipants.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {inlineParticipants.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-black/40 border border-gray-700/50 rounded-xl">
                          <div className="flex-1">
                            <p className="text-white font-medium">{p.name}</p>
                            <p className="text-sm text-gray-400">{p.email} • {p.role}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveInlineParticipant(i)}
                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
                      <input
                        type="text"
                        value={inlineParticipant.name}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, name: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="Collaborator Name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                      <input
                        type="email"
                        value={inlineParticipant.email}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, email: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="collaborator@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Role</label>
                      <select
                        value={inlineParticipant.role}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, role: e.target.value })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                      >
                        <option value="Artist">Artist</option>
                        <option value="Producer">Producer</option>
                        <option value="Songwriter">Songwriter</option>
                        <option value="Engineer">Engineer</option>
                        <option value="Mixer">Mixer</option>
                        <option value="Featured Artist">Featured Artist</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Master %</label>
                      <input
                        type="number"
                        value={inlineParticipant.master_rights_pct}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, master_rights_pct: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="0"
                        min="0"
                        max="100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Publishing %</label>
                      <input
                        type="number"
                        value={inlineParticipant.publishing_rights_pct}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, publishing_rights_pct: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="0"
                        min="0"
                        max="100"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddInlineParticipant}
                    className="w-full px-4 py-3 bg-gray-800/50 hover:bg-gray-800 text-white font-medium rounded-xl transition-all duration-200 border border-gray-700/50 hover:border-gray-600"
                  >
                    Add Collaborator
                  </button>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center gap-3 pt-6 border-t border-gray-800/50 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-800/50 hover:bg-gray-800 text-white font-medium rounded-xl transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-blue-500/25"
                >
                  {submitting ? 'Creating...' : 'Create Negotiation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Participants Modal */}
      {showParticipantsModal && selectedNegotiation && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gradient-to-br from-gray-900 to-gray-900/95 border border-gray-800/50 rounded-2xl p-6 max-w-4xl w-full my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white">{selectedNegotiation.project_name}</h3>
                <p className="text-sm text-gray-400 mt-1">Manage participants and send invites</p>
              </div>
              <button
                onClick={() => setShowParticipantsModal(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Participants List */}
              {participants.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Participants ({participants.length})</h4>
                  {participants.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-4 bg-black/40 border border-gray-700/50 rounded-xl">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20 flex items-center justify-center">
                            <span className="text-sm font-bold text-blue-400">{p.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <div>
                            <p className="text-white font-medium">{p.name}</p>
                            <p className="text-sm text-gray-400">{p.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs px-2 py-1 bg-gray-800/50 text-gray-300 rounded-lg">{p.role}</span>
                          <span className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg">Master: {p.master_rights_pct}%</span>
                          <span className="text-xs px-2 py-1 bg-purple-500/10 text-purple-400 rounded-lg">Publishing: {p.publishing_rights_pct}%</span>
                          {p.signed_at ? (
                            <span className="text-xs px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Signed
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 bg-yellow-500/10 text-yellow-400 rounded-lg">Pending signature</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!p.signed_at && (
                          <button
                            onClick={() => handleSendInvite(selectedNegotiation.id, p)}
                            disabled={submitting}
                            className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                            title="Resend invite"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteParticipant(p.id)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          title="Remove participant"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Participant Form */}
              <form onSubmit={addParticipant} className="space-y-4 border-t border-gray-800/50 pt-6">
                <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Add New Participant</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    value={participantForm.name}
                    onChange={(e) => setParticipantForm({ ...participantForm, name: e.target.value })}
                    className="px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    placeholder="Name"
                    required
                  />
                  <input
                    type="email"
                    value={participantForm.email}
                    onChange={(e) => setParticipantForm({ ...participantForm, email: e.target.value })}
                    className="px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    placeholder="Email"
                    required
                  />
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <select
                    value={participantForm.role}
                    onChange={(e) => setParticipantForm({ ...participantForm, role: e.target.value })}
                    className="px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    required
                  >
                    <option value="">Select Role</option>
                    <option value="Artist">Artist</option>
                    <option value="Producer">Producer</option>
                    <option value="Songwriter">Songwriter</option>
                    <option value="Engineer">Engineer</option>
                    <option value="Mixer">Mixer</option>
                    <option value="Featured Artist">Featured Artist</option>
                  </select>
                  <input
                    type="number"
                    value={participantForm.master_percentage}
                    onChange={(e) => setParticipantForm({ ...participantForm, master_percentage: Number(e.target.value) })}
                    className="px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    placeholder="Master %"
                    min="0"
                    max="100"
                  />
                  <input
                    type="number"
                    value={participantForm.publishing_percentage}
                    onChange={(e) => setParticipantForm({ ...participantForm, publishing_percentage: Number(e.target.value) })}
                    className="px-4 py-3 bg-black/40 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    placeholder="Publishing %"
                    min="0"
                    max="100"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-blue-500/25"
                >
                  Add Participant
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Messages Modal */}
      {showMessagesModal && selectedNegotiation && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gradient-to-br from-gray-900 to-gray-900/95 border border-gray-800/50 rounded-2xl p-6 max-w-4xl w-full my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white">{selectedNegotiation.project_name}</h3>
                <p className="text-sm text-gray-400 mt-1">Negotiation thread and offers</p>
              </div>
              <button
                onClick={() => setShowMessagesModal(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No messages yet. Start the conversation.</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className="p-4 bg-black/40 border border-gray-700/50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-white font-medium">{msg.author_name}</p>
                        <p className="text-xs text-gray-400">{msg.author_email}</p>
                      </div>
                      <span className="text-xs px-2 py-1 bg-gray-800/50 text-gray-400 rounded-lg">{msg.message_type}</span>
                    </div>
                    <p className="text-gray-300">{msg.body}</p>
                    <p className="text-xs text-gray-500 mt-2">{new Date(msg.created_at).toLocaleString()}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
