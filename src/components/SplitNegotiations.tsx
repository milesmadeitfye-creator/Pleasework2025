import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { Plus, FileText, Users, Check, Trash2, MessageSquare, Download, DollarSign, TrendingUp, X } from 'lucide-react';
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
        // Store ALL negotiations, filter them in render based on activeTab
        const negs = result.negotiations || [];
        setNegotiations(negs);

        // Fetch signature counts for all negotiations
        await fetchSignatureCounts(negs);
      }
    } catch (err) {
      console.error('[SplitNegotiations] Unexpected error:', err);
      setNegotiations([]);
    }
    setLoading(false);
  };

  const fetchSignatureCounts = async (negotiations: Negotiation[]) => {
    if (!negotiations || negotiations.length === 0) return;

    const counts: Record<string, { signed: number; total: number }> = {};

    for (const neg of negotiations) {
      const { data, error } = await supabase
        .from('split_participants')
        .select('id, signed_at')
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
    const { data, error } = await supabase
      .from('split_participants')
      .select('*')
      .eq('negotiation_id', negotiationId);

    if (error) {
      console.error('Failed to load participants', error);
      setToast({ message: 'Could not load participants for this negotiation', type: 'error' });
      return;
    }

    if (!data || data.length === 0) {
      setToast({ message: 'No participants found for this negotiation. Add participants first.', type: 'error' });
      setParticipants([]);
      return;
    }

    setParticipants(data);
  };

  const fetchMessages = async (negotiationId: string) => {
    const { data } = await supabase
      .from('split_negotiation_messages')
      .select('*')
      .eq('negotiation_id', negotiationId)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.project_name.trim()) {
      setToast({ message: 'Please enter a project name', type: 'error' });
      return;
    }

    if (!formData.your_name.trim()) {
      setToast({ message: 'Please enter your name', type: 'error' });
      return;
    }

    if (!formData.your_email.trim()) {
      setToast({ message: 'Please enter your email', type: 'error' });
      return;
    }

    if (!formData.your_role.trim()) {
      setToast({ message: 'Please select your role', type: 'error' });
      return;
    }

    if (!formData.how_to_credit.trim()) {
      setToast({ message: 'Please enter how you want to be credited', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !user) {
        setToast({ message: 'You must be logged in to create a negotiation', type: 'error' });
        setSubmitting(false);
        return;
      }

      const collaboratorEmails = formData.collaborator_emails
        .split(/[\n,]/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      const response = await fetch('/.netlify/functions/create-split-negotiation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          project_name: formData.project_name.trim(),
          beat_fee: formData.beat_fee ? Number(formData.beat_fee) : null,
          your_name: formData.your_name.trim(),
          your_email: formData.your_email.trim(),
          your_role: formData.your_role.trim(),
          how_to_credit: formData.how_to_credit.trim(),
          pro: formData.pro.trim() || null,
          ipi_number: formData.ipi_number.trim() || null,
          master_rights_pct: Number(formData.master_rights_pct) || 0,
          publishing_rights_pct: Number(formData.publishing_rights_pct) || 0,
          collaborator_emails: collaboratorEmails,
          participants: inlineParticipants,
        }),
      });

      let result: any = null;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('[SplitNegotiations] Failed to parse response:', parseError);
        setToast({ message: 'Invalid server response. Please try again.', type: 'error' });
        setSubmitting(false);
        return;
      }

      if (!response.ok || !result?.success) {
        console.error('[SplitNegotiations] Error creating negotiation:', {
          status: response.status,
          result,
        });

        const errorMessage = result?.error || result?.details || 'Failed to create negotiation';
        setToast({ message: errorMessage, type: 'error' });
      } else {
        console.log('[SplitNegotiations] Negotiation created successfully:', result);
        setToast({ message: 'Split negotiation created successfully!', type: 'success' });

        // Close modal and refresh list
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
    if (!selectedNegotiation) return;

    if (!participantForm.name.trim() || !participantForm.email.trim() || !participantForm.role.trim()) {
      setToast({ message: 'Please fill in all required fields', type: 'error' });
      return;
    }

    if (participantForm.master_percentage < 0 || participantForm.master_percentage > 100) {
      setToast({ message: 'Master percentage must be between 0 and 100', type: 'error' });
      return;
    }

    if (participantForm.publishing_percentage < 0 || participantForm.publishing_percentage > 100) {
      setToast({ message: 'Publishing percentage must be between 0 and 100', type: 'error' });
      return;
    }

    const { data, error } = await supabase
      .from('split_participants')
      .insert({
        negotiation_id: selectedNegotiation.id,
        name: participantForm.name.trim(),
        email: participantForm.email.trim(),
        role: participantForm.role.trim(),
        how_to_credit: participantForm.credit_name.trim() || null,
        master_rights_pct: Number(participantForm.master_percentage) || 0,
        publishing_rights_pct: Number(participantForm.publishing_percentage) || 0,
        ipi_number: participantForm.ipi_number.trim() || null,
        performing_rights_org: participantForm.performing_rights_org.trim() || null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Add participant error:', error);
      setToast({ message: error.message || 'Failed to add participant', type: 'error' });
      return;
    }

    console.log('Participant added:', data);
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
    setToast({ message: 'Participant added successfully!', type: 'success' });
  };

  const postMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNegotiation || !user) return;

    const isOfferOrCounter = messageForm.message_type === 'offer' || messageForm.message_type === 'counter_offer';

    let composedBody = messageForm.body.trim();

    // Build structured offer details if present
    if (isOfferOrCounter) {
      const parts: string[] = [];

      if (messageForm.requested_master_pct) {
        parts.push(`Requested Master %: ${messageForm.requested_master_pct}`);
      }
      if (messageForm.requested_publishing_pct) {
        parts.push(`Requested Publishing %: ${messageForm.requested_publishing_pct}`);
      }
      if (messageForm.requested_upfront) {
        parts.push(`Requested Upfront: $${messageForm.requested_upfront}`);
      }

      if (parts.length > 0) {
        const offerSummary = parts.join(' | ');
        composedBody = offerSummary + (composedBody ? `\n\nNotes: ${composedBody}` : '');
      }
    }

    if (!composedBody) {
      setToast({ message: 'Please enter a message or offer details', type: 'error' });
      return;
    }

    const { data, error } = await supabase
      .from('split_negotiation_messages')
      .insert({
        negotiation_id: selectedNegotiation.id,
        author_id: user.id,
        author_name: user.user_metadata?.full_name || user.email || 'Unknown',
        author_email: user.email || '',
        message_type: messageForm.message_type,
        body: composedBody,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Post message error:', error);
      setToast({ message: error.message || 'Failed to post message', type: 'error' });
      return;
    }

    setMessages((prev) => [...prev, data]);
    setMessageForm({
      message_type: 'comment',
      body: '',
      requested_master_pct: '',
      requested_publishing_pct: '',
      requested_upfront: '',
    });
    setToast({ message: 'Message posted successfully!', type: 'success' });
  };

  const handleESign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParticipant) return;

    if (!eSignForm.signature_name.trim()) {
      setToast({ message: 'Please enter your full legal name', type: 'error' });
      return;
    }

    if (!eSignForm.agree) {
      setToast({ message: 'You must agree to the electronic signature terms', type: 'error' });
      return;
    }

    const { error } = await supabase
      .from('split_participants')
      .update({
        signature_name: eSignForm.signature_name.trim(),
        signed_at: new Date().toISOString(),
      })
      .eq('id', selectedParticipant.id);

    if (error) {
      console.error('E-sign error:', error);
      setToast({ message: error.message || 'Failed to sign', type: 'error' });
      return;
    }

    setToast({ message: 'Successfully signed!', type: 'success' });
    setShowESignModal(false);
    setESignForm({ signature_name: '', agree: false });

    if (selectedNegotiation) {
      fetchParticipants(selectedNegotiation.id);
      checkAllSigned(selectedNegotiation.id);
    }
  };

  const checkAllSigned = async (negotiationId: string) => {
    const { data: participants } = await supabase
      .from('split_participants')
      .select('id, signed_at')
      .eq('negotiation_id', negotiationId);

    const allSigned = participants && participants.length > 0 && participants.every(p => p.signed_at);

    if (allSigned) {
      await supabase
        .from('split_negotiations')
        .update({ status: 'completed' })
        .eq('id', negotiationId);

      setToast({ message: 'All participants have signed! Negotiation completed.', type: 'success' });
      fetchNegotiations();
    }
  };

  const saveRoyaltiesDefaults = async () => {
    if (!selectedNegotiation) return;

    const { error } = await supabase
      .from('split_negotiations')
      .update({
        estimated_streams: Number(royaltiesForm.estimated_streams) || null,
        per_stream_rate: Number(royaltiesForm.per_stream_rate) || null,
      })
      .eq('id', selectedNegotiation.id);

    if (error) {
      console.error('Save royalties error:', error);
      setToast({ message: error.message || 'Failed to save defaults', type: 'error' });
      return;
    }

    setToast({ message: 'Royalty defaults saved!', type: 'success' });
  };

  const ensureParticipantsExist = async (negotiationId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('split_participants')
      .select('id')
      .eq('negotiation_id', negotiationId);

    if (error) {
      console.error('Failed to load participants', error);
      setToast({ message: 'Could not check participants for this negotiation', type: 'error' });
      return false;
    }

    if (!data || data.length === 0) {
      setToast({ message: 'You must add at least one participant before opening this negotiation.', type: 'error' });
      return false;
    }

    return true;
  };

  const handleOpenNegotiation = async (negotiation: Negotiation) => {
    try {
      setGeneratingId(negotiation.id);

      // 1) Require at least one participant
      const hasParticipants = await ensureParticipantsExist(negotiation.id);
      if (!hasParticipants) {
        setGeneratingId(null);
        return;
      }

      // 2) If contract_url already points at our Ghoste route, just open it
      if (negotiation.contract_url && negotiation.contract_url.includes('/contracts/')) {
        window.open(negotiation.contract_url, '_blank');
        setGeneratingId(null);
        return;
      }

      // 3) Otherwise, call generate-split-sheet function
      const res = await fetch('/.netlify/functions/generate-split-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ negotiation_id: negotiation.id }),
      });

      let data: any;
      try {
        data = await res.json();
      } catch (err) {
        console.error('[SplitNegotiations] Failed to parse generate-split-sheet response', err);
        setToast({ message: 'Unexpected server response while generating split sheet', type: 'error' });
        setGeneratingId(null);
        return;
      }

      if (!res.ok || !data?.success || !data?.contractUrl) {
        console.error('[SplitNegotiations] generate-split-sheet error payload', data);
        setToast({ message: data?.error || 'Failed to generate split sheet', type: 'error' });
        setGeneratingId(null);
        return;
      }

      const contractUrl = data.contractUrl as string;

      // Update local state so future clicks use the new URL
      setNegotiations((prev) =>
        prev.map((n) => (n.id === negotiation.id ? { ...n, contract_url: contractUrl } : n))
      );

      setToast({ message: 'Negotiation opened', type: 'success' });
      window.open(contractUrl, '_blank');
    } catch (err: any) {
      console.error('[SplitNegotiations] handleOpenNegotiation error', err);
      setToast({ message: err?.message || 'Failed to open negotiation', type: 'error' });
    } finally {
      setGeneratingId(null);
    }
  };

  const handleDownloadSplitSheet = async (negotiation: Negotiation) => {
    if (negotiation.contract_url && negotiation.contract_url.includes('/contracts/')) {
      window.open(negotiation.contract_url, '_blank');
      return;
    }

    try {
      setGeneratingId(negotiation.id);

      // Fetch participants for this negotiation
      const { data: participantsData, error: partError } = await supabase
        .from('split_participants')
        .select('*')
        .eq('negotiation_id', negotiation.id);

      if (partError || !participantsData || participantsData.length === 0) {
        setToast({ message: 'No participants found for this split', type: 'error' });
        setGeneratingId(null);
        return;
      }

      // Get host name
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('display_name, full_name')
        .eq('id', user?.id)
        .maybeSingle();

      const hostName = profile?.display_name || profile?.full_name || user?.email || 'Host';

      // Call lite PDF endpoint
      const response = await fetch('/.netlify/functions/split-generate-pdf-lite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName: negotiation.project_name,
          trackTitle: undefined,
          createdAt: negotiation.created_at,
          hostName,
          participants: participantsData.map(p => ({
            name: p.name,
            role: p.role,
            master_rights_pct: p.master_rights_pct,
            publishing_rights_pct: p.publishing_rights_pct,
            performing_rights_org: p.performing_rights_org,
            ipi_number: p.ipi_number,
            how_to_credit: p.how_to_credit,
            signed_at: p.signed_at,
            signature_name: p.signature_name,
          })),
          beatFee: negotiation.beat_fee,
          advanceAmount: negotiation.advance_amount,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        console.error('[SplitNegotiations] Lite PDF error:', result);
        const errorMsg = result?.message || result?.error || 'Failed to generate PDF. Please try again.';
        throw new Error(errorMsg);
      }

      const { base64, filename } = result as { base64: string; filename: string };

      // Convert base64 to blob and download
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'ghoste-split-summary.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setToast({ message: 'Split sheet downloaded successfully!', type: 'success' });
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      setToast({ message: error.message || 'Failed to generate PDF', type: 'error' });
    } finally {
      setGeneratingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this negotiation?')) {
      const { error } = await supabase
        .from('split_negotiations')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting negotiation:', error);
        setToast({ message: error.message || 'Failed to delete negotiation', type: 'error' });
      } else {
        fetchNegotiations();
        setToast({ message: 'Negotiation deleted successfully', type: 'success' });
      }
    }
  };

  const handleSendInvite = async (splitId: string, participantId?: string) => {
    try {
      setSubmitting(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setToast({ message: 'You must be logged in to send invites', type: 'error' });
        return;
      }

      // Find the negotiation
      const negotiation = negotiations.find(n => n.id === splitId);
      if (!negotiation) {
        setToast({ message: 'Split negotiation not found', type: 'error' });
        return;
      }

      // Get host name
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('display_name, full_name')
        .eq('id', user?.id)
        .maybeSingle();

      const hostName = profile?.display_name || profile?.full_name || user?.email || 'A Ghoste user';

      // Calculate total percentage for summary
      const totalMaster = participants.reduce((sum, p) => sum + (p.master_rights_pct || 0), 0);
      const totalPub = participants.reduce((sum, p) => sum + (p.publishing_rights_pct || 0), 0);
      const splitSummary = `${participants.length} participants: ${totalMaster.toFixed(1)}% master rights, ${totalPub.toFixed(1)}% publishing rights`;

      // If participantId is provided, send invite to that participant
      if (participantId) {
        const participant = participants.find(p => p.id === participantId);
        if (!participant || !participant.email) {
          setToast({ message: 'Participant email not found', type: 'error' });
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

        // Refresh participants list
        if (selectedNegotiation) {
          fetchParticipants(selectedNegotiation.id);
        }
      } else {
        // Otherwise, get email from input fields
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

        // Clear inputs
        if (emailInput) emailInput.value = '';
        if (nameInput) nameInput.value = '';

        // Refresh participants list
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
    if (activeTab === 'open') {
      return negotiations.filter(n => n.status !== 'completed');
    } else if (activeTab === 'past') {
      return negotiations.filter(n => n.status === 'completed');
    }
    return negotiations;
  };

  const filteredNegotiations = getFilteredNegotiations();

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
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

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Split Negotiations</h2>
          <p className="text-gray-400">Negotiate splits and generate split sheets for collaborations</p>
        </div>
        {activeTab === 'open' && (
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Negotiation
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('open')}
            className={`px-4 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'open'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Open Negotiations
          </button>
          <button
            onClick={() => setActiveTab('royalties')}
            className={`px-4 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'royalties'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Estimated Spotify Royalties
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`px-4 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'past'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Completed Negotiations
          </button>
        </div>
      </div>

      {/* Open Negotiations Tab */}
      {activeTab === 'open' && (
        <div className="space-y-4">
          {filteredNegotiations.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
              <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No open negotiations</h3>
              <p className="text-gray-400 mb-6">Create your first split negotiation to get started</p>
              <button
                onClick={() => setShowModal(true)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                New Negotiation
              </button>
            </div>
          ) : (
            filteredNegotiations.map((negotiation) => (
              <div key={negotiation.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{negotiation.project_name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-3 py-1 rounded-full text-sm ${
                        negotiation.status === 'draft' ? 'bg-gray-700 text-gray-300' : 'bg-green-900/20 text-green-400'
                      }`}>
                        {negotiation.status === 'draft' ? 'Draft' : 'Open'}
                      </span>
                      {signatureCounts[negotiation.id] && signatureCounts[negotiation.id].total > 0 && (
                        <span className="px-3 py-1 bg-blue-900/20 text-blue-400 rounded-full text-sm flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Signatures: {signatureCounts[negotiation.id].signed} / {signatureCounts[negotiation.id].total}
                        </span>
                      )}
                      {negotiation.advance_amount && (
                        <span className="text-sm text-gray-400">
                          Advance: ${negotiation.advance_amount.toLocaleString()}
                        </span>
                      )}
                      {negotiation.beat_fee && (
                        <span className="text-sm text-gray-400">
                          Beat Fee: ${negotiation.beat_fee.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(negotiation.id)}
                    className="p-2 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => openParticipantsModal(negotiation)}
                    className="px-4 py-2 bg-blue-900/20 text-blue-400 border border-blue-700 hover:bg-blue-900/30 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    Manage Participants
                  </button>
                  <button
                    onClick={() => openMessagesModal(negotiation)}
                    className="px-4 py-2 bg-purple-900/20 text-purple-400 border border-purple-700 hover:bg-purple-900/30 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    View Thread / Offers
                  </button>
                  <button
                    onClick={() => openMessagesModal(negotiation)}
                    className="px-4 py-2 bg-green-900/20 text-green-400 border border-green-700 hover:bg-green-900/30 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Open Negotiation
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Estimated Spotify Royalties Tab */}
      {activeTab === 'royalties' && (
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-xl font-semibold mb-4">Select Negotiation</h3>
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
              className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-xl font-semibold mb-4">Royalty Calculator</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Estimated Streams</label>
                    <input
                      type="number"
                      value={royaltiesForm.estimated_streams}
                      onChange={(e) => setRoyaltiesForm({ ...royaltiesForm, estimated_streams: e.target.value })}
                      className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="100000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Per-Stream Rate (USD)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={royaltiesForm.per_stream_rate}
                      onChange={(e) => setRoyaltiesForm({ ...royaltiesForm, per_stream_rate: e.target.value })}
                      className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.003"
                    />
                  </div>
                </div>
                <button
                  onClick={saveRoyaltiesDefaults}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Save Defaults
                </button>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="mb-4">
                  <h3 className="text-2xl font-bold text-green-400">
                    Total Estimated Gross: ${calculateRoyalties().gross.toFixed(2)}
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-3 px-4">Participant</th>
                        <th className="text-left py-3 px-4">Role</th>
                        <th className="text-right py-3 px-4">Master %</th>
                        <th className="text-right py-3 px-4">Publishing %</th>
                        <th className="text-right py-3 px-4">Master Royalties</th>
                        <th className="text-right py-3 px-4">Publishing Royalties</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculateRoyalties().participants.map((p) => (
                        <tr key={p.id} className="border-b border-gray-800">
                          <td className="py-3 px-4">{p.name}</td>
                          <td className="py-3 px-4 text-gray-400">{p.role}</td>
                          <td className="py-3 px-4 text-right text-green-400">{p.master_rights_pct}%</td>
                          <td className="py-3 px-4 text-right text-blue-400">{p.publishing_rights_pct}%</td>
                          <td className="py-3 px-4 text-right font-semibold text-green-400">
                            ${p.masterRoyalties.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-blue-400">
                            ${p.publishingRoyalties.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {participants.length === 0 && (
                  <p className="text-center py-8 text-gray-400">No participants added yet</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Past Negotiations Tab */}
      {activeTab === 'past' && (
        <div className="space-y-4">
          {filteredNegotiations.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
              <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No past negotiations</h3>
              <p className="text-gray-400">Completed negotiations will appear here</p>
            </div>
          ) : (
            filteredNegotiations.map((negotiation) => (
              <div key={negotiation.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{negotiation.project_name}</h3>
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`px-3 py-1 rounded-full ${
                        negotiation.status === 'completed'
                          ? 'bg-green-900/20 text-green-400'
                          : 'bg-gray-700 text-gray-300'
                      }`}>
                        {negotiation.status.charAt(0).toUpperCase() + negotiation.status.slice(1)}
                      </span>
                      <span className="text-gray-400">
                        {new Date(negotiation.updated_at || negotiation.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownloadSplitSheet(negotiation)}
                    disabled={generatingId === negotiation.id}
                    className="px-4 py-2 bg-blue-900/20 text-blue-400 border border-blue-700 hover:bg-blue-900/30 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4" />
                    {generatingId === negotiation.id ? 'Opening...' : 'Download Split Sheet'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Negotiation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-3xl w-full my-8 max-h-[90vh] flex flex-col">
            <h3 className="text-2xl font-bold mb-6">New Split Negotiation</h3>
            <form onSubmit={handleCreate} className="flex flex-col flex-1 min-h-0">
              {/* Scrollable form body */}
              <div className="overflow-y-auto pr-2 space-y-6 flex-1">
              {/* Project Details */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-blue-400">Project Details</h4>
                <div>
                  <label className="block text-sm font-medium mb-2">Project Name *</label>
                  <input
                    type="text"
                    value={formData.project_name}
                    onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="My Amazing Song"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Beat Fee (USD)</label>
                  <input
                    type="number"
                    value={formData.beat_fee}
                    onChange={(e) => setFormData({ ...formData, beat_fee: e.target.value })}
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="1000"
                    min="0"
                  />
                </div>
              </div>

              {/* Your Split Details */}
              <div className="space-y-4 border-t border-gray-800 pt-4">
                <h4 className="text-lg font-semibold text-green-400">Your Split Details</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Your Name *</label>
                    <input
                      type="text"
                      value={formData.your_name}
                      onChange={(e) => setFormData({ ...formData, your_name: e.target.value })}
                      className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="John Doe"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Your Email *</label>
                    <input
                      type="email"
                      value={formData.your_email}
                      onChange={(e) => setFormData({ ...formData, your_email: e.target.value })}
                      className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="john@example.com"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Role *</label>
                    <select
                      value={formData.your_role}
                      onChange={(e) => setFormData({ ...formData, your_role: e.target.value })}
                      className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="Artist">Artist</option>
                      <option value="Producer">Producer</option>
                      <option value="Songwriter">Songwriter</option>
                      <option value="Featured Artist">Featured Artist</option>
                      <option value="Engineer">Engineer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">How to Credit You *</label>
                    <input
                      type="text"
                      value={formData.how_to_credit}
                      onChange={(e) => setFormData({ ...formData, how_to_credit: e.target.value })}
                      className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="J. Doe"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">PRO (Performing Rights Org)</label>
                    <input
                      type="text"
                      value={formData.pro}
                      onChange={(e) => setFormData({ ...formData, pro: e.target.value })}
                      className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="ASCAP, BMI, SESAC"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">IPI Number</label>
                    <input
                      type="text"
                      value={formData.ipi_number}
                      onChange={(e) => setFormData({ ...formData, ipi_number: e.target.value })}
                      className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="00123456789"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-green-400 mb-2">Master Rights % *</label>
                    <input
                      type="number"
                      value={formData.master_rights_pct}
                      onChange={(e) => setFormData({ ...formData, master_rights_pct: e.target.value })}
                      className="w-full px-4 py-3 bg-black border border-green-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-400 mb-2">Publishing Rights % *</label>
                    <input
                      type="number"
                      value={formData.publishing_rights_pct}
                      onChange={(e) => setFormData({ ...formData, publishing_rights_pct: e.target.value })}
                      className="w-full px-4 py-3 bg-black border border-blue-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Settings Section */}
              <div className="space-y-4 border-t border-gray-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowSettings(!showSettings)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div>
                    <h4 className="text-lg font-semibold text-blue-400">Creator Settings</h4>
                    <p className="text-xs text-gray-500">Save your name, PRO, IPI, and distribution info</p>
                  </div>
                  <span className="text-gray-400">{showSettings ? '▼' : '▶'}</span>
                </button>

                {showSettings && (
                  <div className="space-y-4 bg-blue-900/10 border border-blue-700/30 rounded-lg p-4">
                    <p className="text-sm text-gray-400">
                      Your default details will auto-fill when creating new negotiations
                    </p>
                    <div>
                      <label className="block text-sm font-medium mb-2">Distributed Through</label>
                      <select
                        value={formData.distributor}
                        onChange={(e) => setFormData({ ...formData, distributor: e.target.value })}
                        className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select distributor...</option>
                        <option value="DistroKid">DistroKid</option>
                        <option value="TuneCore">TuneCore</option>
                        <option value="UnitedMasters">UnitedMasters</option>
                        <option value="CD Baby">CD Baby</option>
                        <option value="Ditto">Ditto</option>
                        <option value="Stem">Stem</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveDefaults}
                      className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                    >
                      Save as Default
                    </button>
                  </div>
                )}
              </div>

              {/* Add Participants (Inline) */}
              <div className="space-y-4 border-t border-gray-800 pt-4">
                <h4 className="text-lg font-semibold text-orange-400">Add Participants (Optional)</h4>

                {/* Inline participant form */}
                <div className="bg-black/30 border border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Name *</label>
                      <input
                        type="text"
                        value={inlineParticipant.name}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, name: e.target.value })}
                        className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="Jane Smith"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Email *</label>
                      <input
                        type="email"
                        value={inlineParticipant.email}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, email: e.target.value })}
                        className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="jane@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Role *</label>
                      <select
                        value={inlineParticipant.role}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, role: e.target.value })}
                        className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="Artist">Artist</option>
                        <option value="Producer">Producer</option>
                        <option value="Songwriter">Songwriter</option>
                        <option value="Featured Artist">Featured Artist</option>
                        <option value="Engineer">Engineer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">How to Credit</label>
                      <input
                        type="text"
                        value={inlineParticipant.how_to_credit}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, how_to_credit: e.target.value })}
                        className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="J. Smith"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Master %</label>
                      <input
                        type="number"
                        value={inlineParticipant.master_rights_pct}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, master_rights_pct: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        min="0"
                        max="100"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Pub %</label>
                      <input
                        type="number"
                        value={inlineParticipant.publishing_rights_pct}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, publishing_rights_pct: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        min="0"
                        max="100"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">PRO</label>
                      <input
                        type="text"
                        value={inlineParticipant.performing_rights_org}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, performing_rights_org: e.target.value })}
                        className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="ASCAP"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">IPI</label>
                      <input
                        type="text"
                        value={inlineParticipant.ipi_number}
                        onChange={(e) => setInlineParticipant({ ...inlineParticipant, ipi_number: e.target.value })}
                        className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="123456789"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddInlineParticipant}
                    className="w-full px-4 py-2 bg-orange-900/20 text-orange-400 border border-orange-700 hover:bg-orange-900/30 rounded-lg transition-colors text-sm font-medium"
                  >
                    Add Participant
                  </button>
                </div>

                {/* List of added participants */}
                {inlineParticipants.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">Added participants ({inlineParticipants.length}):</p>
                    {inlineParticipants.map((p, index) => (
                      <div key={index} className="bg-black border border-gray-800 rounded-lg p-3 flex items-center justify-between">
                        <div className="text-sm">
                          <p className="font-semibold">{p.name}</p>
                          <p className="text-xs text-gray-400">
                            {p.email} • {p.role} • Master: {p.master_rights_pct}% • Pub: {p.publishing_rights_pct}%
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveInlineParticipant(index)}
                          className="px-3 py-1 text-red-400 hover:bg-red-900/20 rounded text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Invite Collaborators */}
              <div className="space-y-4 border-t border-gray-800 pt-4">
                <h4 className="text-lg font-semibold text-purple-400">Invite Collaborators (Optional)</h4>
                <div>
                  <label className="block text-sm font-medium mb-2">Collaborator Emails</label>
                  <textarea
                    value={formData.collaborator_emails}
                    onChange={(e) => setFormData({ ...formData, collaborator_emails: e.target.value })}
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                    placeholder="Enter emails separated by commas or new lines&#10;example@email.com, another@email.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">They'll be added as participants with 0% splits (edit later)</p>
                </div>
              </div>
              </div>
              {/* End scrollable form body */}

              {/* Fixed footer buttons */}
              <div className="flex gap-3 pt-4 mt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Split Negotiation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Participants Modal */}
      {showParticipantsModal && selectedNegotiation && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-4xl w-full my-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">Manage Participants - {selectedNegotiation.project_name}</h3>
              <button
                onClick={() => {
                  setShowParticipantsModal(false);
                  setSelectedNegotiation(null);
                }}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Participant List */}
            {participants.length > 0 && (
              <div className="mb-6 space-y-2">
                {participants.map((participant) => {
                  const getStatusBadge = () => {
                    if (participant.signed_at) {
                      return (
                        <span className="px-3 py-1 bg-green-900/20 text-green-400 rounded-full text-sm flex items-center gap-1">
                          <Check className="w-4 h-4" />
                          Signed
                        </span>
                      );
                    } else if (participant.status === 'invited') {
                      return (
                        <span className="px-3 py-1 bg-blue-900/20 text-blue-400 rounded-full text-sm">
                          Invited
                        </span>
                      );
                    } else if (participant.status === 'declined') {
                      return (
                        <span className="px-3 py-1 bg-red-900/20 text-red-400 rounded-full text-sm">
                          Declined
                        </span>
                      );
                    } else {
                      return (
                        <span className="px-3 py-1 bg-gray-800 text-gray-400 rounded-full text-sm">
                          Pending
                        </span>
                      );
                    }
                  };

                  return (
                    <div key={participant.id} className="bg-black border border-gray-800 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-semibold">{participant.name}</p>
                          <p className="text-sm text-gray-400">{participant.email} • {participant.role}</p>
                          <p className="text-xs text-gray-500">
                            Master: {participant.master_rights_pct}% • Publishing: {participant.publishing_rights_pct}%
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {participant.signed_at ? (
                          <>
                            <p className="text-xs text-gray-500 flex-1">
                              Signed on {new Date(participant.signed_at).toLocaleDateString()} at {new Date(participant.signed_at).toLocaleTimeString()}
                            </p>
                            <button
                              onClick={() => openSignatureViewModal(participant)}
                              className="px-3 py-1 text-blue-400 hover:bg-blue-900/20 rounded-lg text-sm"
                            >
                              View Signature
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => openESignModal(participant)}
                              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-1"
                            >
                              <Check className="w-4 h-4" />
                              E-Sign
                            </button>
                            {participant.status !== 'invited' && (
                              <button
                                onClick={() => handleSendInvite(selectedNegotiation?.id || '', participant.id)}
                                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm flex items-center gap-1"
                              >
                                <Users className="w-4 h-4" />
                                Send Invite
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Send Email Invite */}
            <div className="mb-6 space-y-4 border-t border-gray-800 pt-6">
              <h4 className="text-lg font-semibold">Send Email Invite</h4>
              <p className="text-sm text-gray-400">Invite collaborators by email to review and accept this split.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Collaborator Email *</label>
                  <input
                    type="email"
                    id="invite-email"
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="collaborator@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Name (Optional)</label>
                  <input
                    type="text"
                    id="invite-name"
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Collaborator Name"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSendInvite(selectedNegotiation.id)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <Users className="w-5 h-5" />
                Send Invite
              </button>
            </div>

            {/* Add Participant Form */}
            <form onSubmit={addParticipant} className="space-y-4 border-t border-gray-800 pt-6">
              <h4 className="text-lg font-semibold">Add New Participant</h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Name *</label>
                  <input
                    type="text"
                    value={participantForm.name}
                    onChange={(e) => setParticipantForm({ ...participantForm, name: e.target.value })}
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email *</label>
                  <input
                    type="email"
                    value={participantForm.email}
                    onChange={(e) => setParticipantForm({ ...participantForm, email: e.target.value })}
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Role *</label>
                  <input
                    type="text"
                    value={participantForm.role}
                    onChange={(e) => setParticipantForm({ ...participantForm, role: e.target.value })}
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Producer, Writer, etc."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">How to Credit</label>
                  <input
                    type="text"
                    value={participantForm.credit_name}
                    onChange={(e) => setParticipantForm({ ...participantForm, credit_name: e.target.value })}
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave blank to use their name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-green-400 mb-2">Master Rights % *</label>
                  <input
                    type="number"
                    value={participantForm.master_percentage}
                    onChange={(e) => setParticipantForm({ ...participantForm, master_percentage: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-black border border-green-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-400 mb-2">Publishing Rights % *</label>
                  <input
                    type="number"
                    value={participantForm.publishing_percentage}
                    onChange={(e) => setParticipantForm({ ...participantForm, publishing_percentage: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-black border border-blue-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">IPI Number</label>
                  <input
                    type="text"
                    value={participantForm.ipi_number}
                    onChange={(e) => setParticipantForm({ ...participantForm, ipi_number: e.target.value })}
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 00123456789"
                  />
                  <p className="text-xs text-gray-500 mt-1">International Performer Identifier</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Performing Rights Org</label>
                  <input
                    type="text"
                    value={participantForm.performing_rights_org}
                    onChange={(e) => setParticipantForm({ ...participantForm, performing_rights_org: e.target.value })}
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. ASCAP, BMI, SESAC"
                  />
                  <p className="text-xs text-gray-500 mt-1">PRO membership organization</p>
                </div>
              </div>

              <button
                type="submit"
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add Participant
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Messages Modal */}
      {showMessagesModal && selectedNegotiation && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-3xl w-full my-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">Thread / Offers - {selectedNegotiation.project_name}</h3>
              <button
                onClick={() => {
                  setShowMessagesModal(false);
                  setSelectedNegotiation(null);
                  setMessages([]);
                }}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Messages List */}
            <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No messages yet</p>
              ) : (
                messages.map((message) => {
                  // Parse offer details from body if present
                  const bodyLines = message.body.split('\n');
                  const hasOfferDetails = message.message_type !== 'comment' &&
                    (message.body.includes('Requested Master %') ||
                     message.body.includes('Requested Publishing %') ||
                     message.body.includes('Requested Upfront'));

                  let offerDetails = '';
                  let notes = '';

                  if (hasOfferDetails) {
                    const notesIndex = bodyLines.findIndex(line => line.startsWith('Notes:'));
                    if (notesIndex > -1) {
                      offerDetails = bodyLines.slice(0, notesIndex).join('\n');
                      notes = bodyLines.slice(notesIndex + 1).join('\n').trim();
                    } else {
                      offerDetails = message.body;
                    }
                  }

                  return (
                    <div key={message.id} className="bg-black border border-gray-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-semibold">{message.author_name}</span>
                          <span className="text-sm text-gray-400 ml-2">{message.author_email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            message.message_type === 'offer'
                              ? 'bg-green-900/20 text-green-400'
                              : message.message_type === 'counter_offer'
                              ? 'bg-yellow-900/20 text-yellow-400'
                              : 'bg-blue-900/20 text-blue-400'
                          }`}>
                            {message.message_type.replace('_', ' ').toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(message.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {hasOfferDetails ? (
                        <div className="space-y-2">
                          <div className="text-yellow-400 font-semibold text-sm">
                            {offerDetails.split('|').map((part, i) => (
                              <div key={i}>{part.trim()}</div>
                            ))}
                          </div>
                          {notes && (
                            <div className="text-gray-300 mt-2 pt-2 border-t border-gray-700">
                              {notes}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-300">{message.body}</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Post Message Form */}
            <form onSubmit={postMessage} className="space-y-4 border-t border-gray-800 pt-6">
              <div>
                <label className="block text-sm font-medium mb-2">Message Type</label>
                <select
                  value={messageForm.message_type}
                  onChange={(e) => setMessageForm({ ...messageForm, message_type: e.target.value as any })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="comment">Comment</option>
                  <option value="offer">Offer</option>
                  <option value="counter_offer">Counter Offer</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Message</label>
                <textarea
                  value={messageForm.body}
                  onChange={(e) => setMessageForm({ ...messageForm, body: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                  placeholder="Type your message..."
                />
              </div>

              {/* Offer Details - Show only for Offer/Counter Offer */}
              {(messageForm.message_type === 'offer' || messageForm.message_type === 'counter_offer') && (
                <div className="space-y-4 border-t border-gray-700 pt-4">
                  <h4 className="text-sm font-semibold text-yellow-400">Offer Details (Optional)</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-2">Requested Master %</label>
                      <input
                        type="number"
                        value={messageForm.requested_master_pct}
                        onChange={(e) => setMessageForm({ ...messageForm, requested_master_pct: e.target.value })}
                        className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="50"
                        min="0"
                        max="100"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-2">Requested Publishing %</label>
                      <input
                        type="number"
                        value={messageForm.requested_publishing_pct}
                        onChange={(e) => setMessageForm({ ...messageForm, requested_publishing_pct: e.target.value })}
                        className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="25"
                        min="0"
                        max="100"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-2">Requested Upfront (USD)</label>
                      <input
                        type="number"
                        value={messageForm.requested_upfront}
                        onChange={(e) => setMessageForm({ ...messageForm, requested_upfront: e.target.value })}
                        className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="5000"
                        min="0"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Post Message
              </button>
            </form>
          </div>
        </div>
      )}

      {/* E-Sign Modal */}
      {showESignModal && selectedParticipant && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-2xl font-bold mb-4">E-Sign Split Sheet</h3>
            <p className="text-gray-400 mb-6">
              Type your full legal name to sign this split sheet. This is for reference only and not legal advice.
            </p>

            <form onSubmit={handleESign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Full Legal Name *</label>
                <input
                  type="text"
                  value={eSignForm.signature_name}
                  onChange={(e) => setESignForm({ ...eSignForm, signature_name: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                  required
                />
              </div>

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="agree"
                  checked={eSignForm.agree}
                  onChange={(e) => setESignForm({ ...eSignForm, agree: e.target.checked })}
                  className="mt-1"
                  required
                />
                <label htmlFor="agree" className="text-sm text-gray-400">
                  I agree that this typed name counts as my electronic signature.
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowESignModal(false);
                    setESignForm({ signature_name: '', agree: false });
                  }}
                  className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Sign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Signature Modal */}
      {showSignatureViewModal && selectedParticipant && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">Signature Details</h3>
              <button
                onClick={() => setShowSignatureViewModal(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Signed By</label>
                <p className="text-xl font-semibold">{selectedParticipant.signature_name}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Signed Date</label>
                <p className="text-lg">{selectedParticipant.signed_at ? new Date(selectedParticipant.signed_at).toLocaleString() : 'N/A'}</p>
              </div>

              <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 mt-6">
                <p className="text-sm text-yellow-400">
                  This is a digital acknowledgement only, not legal advice. For legally binding agreements, consult an attorney.
                </p>
              </div>

              <button
                onClick={() => setShowSignatureViewModal(false)}
                className="w-full px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
