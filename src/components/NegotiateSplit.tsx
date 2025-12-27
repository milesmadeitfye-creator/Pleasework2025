import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase.client';
import { Check, X, ArrowRight, FileText, Download } from 'lucide-react';

interface Participant {
  id: string;
  negotiation_id: string;
  email: string;
  name: string;
  role: string;
  percentage: number;
  publishing_percentage: number;
  master_percentage: number;
  credit_name: string;
  response_status: string;
  counter_offer_percentage: number | null;
  counter_offer_publishing: number | null;
  counter_offer_master: number | null;
  signed: boolean;
}

interface Negotiation {
  id: string;
  project_name: string;
  status: string;
  contract_url?: string | null; // Optional - set later when split sheet is generated
}

export default function NegotiateSplit() {
  const { token } = useParams<{ token: string }>();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [negotiation, setNegotiation] = useState<Negotiation | null>(null);
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<'review' | 'counter'>('review');

  const [counterOffer, setCounterOffer] = useState({
    master_percentage: 0,
    publishing_percentage: 0,
  });

  useEffect(() => {
    if (token) {
      fetchNegotiation();
    }
  }, [token]);

  const fetchNegotiation = async () => {
    setLoading(true);
    setError('');

    try {
      const { data: participantData, error: participantError } = await supabase
        .from('split_participants')
        .select('*')
        .eq('token', token)
        .maybeSingle();

      if (participantError || !participantData) {
        throw new Error('Invalid or expired invitation link');
      }

      setParticipant(participantData);
      setCounterOffer({
        master_percentage: participantData.master_percentage || participantData.percentage,
        publishing_percentage: participantData.publishing_percentage || participantData.percentage,
      });

      const { data: negotiationData, error: negotiationError } = await supabase
        .from('split_negotiations')
        .select('*')
        .eq('id', participantData.negotiation_id)
        .single();

      if (negotiationError) {
        console.error('[NegotiateSplit] Error fetching negotiation:', negotiationError);
        if (negotiationError.message?.includes('does not exist')) {
          throw new Error('Split negotiations feature is not available. Please contact support.');
        }
        throw new Error('Negotiation not found');
      }

      if (!negotiationData) {
        throw new Error('Negotiation not found');
      }

      setNegotiation(negotiationData);

      const { data: allParticipantsData, error: allParticipantsError } = await supabase
        .from('split_participants')
        .select('*')
        .eq('negotiation_id', participantData.negotiation_id);

      if (!allParticipantsError && allParticipantsData) {
        setAllParticipants(allParticipantsData);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load negotiation');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!participant) return;

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('split_participants')
        .update({
          response_status: 'accepted',
          signed: true,
          signed_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
        })
        .eq('id', participant.id);

      if (error) throw error;

      alert('Terms accepted! You will receive a copy of the split sheet once all parties have signed.');
      fetchNegotiation();
    } catch (err: any) {
      alert('Error accepting terms: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!participant || !confirm('Are you sure you want to reject these terms?')) return;

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('split_participants')
        .update({
          response_status: 'rejected',
          responded_at: new Date().toISOString(),
        })
        .eq('id', participant.id);

      if (error) throw error;

      alert('Terms rejected. The project owner will be notified.');
      fetchNegotiation();
    } catch (err: any) {
      alert('Error rejecting terms: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCounterOffer = async () => {
    if (!participant) return;

    if (counterOffer.master_percentage <= 0 || counterOffer.publishing_percentage <= 0) {
      alert('Please enter valid percentages');
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('split_participants')
        .update({
          response_status: 'countered',
          counter_offer_master: counterOffer.master_percentage,
          counter_offer_publishing: counterOffer.publishing_percentage,
          responded_at: new Date().toISOString(),
        })
        .eq('id', participant.id);

      if (error) throw error;

      alert('Counter-offer submitted! The project owner will be notified.');
      setView('review');
      fetchNegotiation();
    } catch (err: any) {
      alert('Error submitting counter-offer: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadContract = async () => {
    if (!negotiation?.contract_url) {
      alert('Split sheet not available yet');
      return;
    }
    window.open(negotiation.contract_url, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black safe-top flex items-center justify-center">
        <div className="text-white text-xl">Loading negotiation...</div>
      </div>
    );
  }

  if (error || !participant || !negotiation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black safe-top flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-8">
            <X className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Invalid Link</h1>
            <p className="text-gray-400">{error || 'This invitation link is invalid or has expired.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const masterPercentage = participant.master_percentage || participant.percentage;
  const publishingPercentage = participant.publishing_percentage || participant.percentage;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black safe-top px-4 pb-12">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">

          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-b border-gray-800 p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-600 rounded-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">{negotiation.project_name}</h1>
                <p className="text-blue-300">Split Negotiation</p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 bg-black/30 rounded-lg">
              <span className="text-sm text-gray-400">Status:</span>
              <span className={`text-sm font-semibold ${
                participant.response_status === 'accepted' ? 'text-green-400' :
                participant.response_status === 'rejected' ? 'text-red-400' :
                participant.response_status === 'countered' ? 'text-yellow-400' :
                'text-gray-400'
              }`}>
                {participant.response_status.charAt(0).toUpperCase() + participant.response_status.slice(1)}
              </span>
            </div>
          </div>

          <div className="p-8">
            {view === 'review' ? (
              <>
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-white mb-2">Hi {participant.name},</h2>
                  <p className="text-gray-400">
                    Review the proposed split terms below. You can accept, reject, or submit a counter-offer.
                  </p>
                </div>

                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
                  <h3 className="text-xl font-bold text-white mb-4">Your Proposed Split</h3>

                  <div className="grid gap-4">
                    <div className="flex justify-between items-center p-4 bg-black rounded-lg">
                      <span className="text-gray-400">Role</span>
                      <span className="text-white font-semibold">{participant.role}</span>
                    </div>

                    <div className="flex justify-between items-center p-4 bg-black rounded-lg">
                      <span className="text-gray-400">Credit As</span>
                      <span className="text-white font-semibold">{participant.credit_name || participant.name}</span>
                    </div>

                    <div className="flex justify-between items-center p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <span className="text-green-400 font-medium">Master Recording Rights</span>
                      <span className="text-2xl font-bold text-green-400">{masterPercentage}%</span>
                    </div>

                    <div className="flex justify-between items-center p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <span className="text-blue-400 font-medium">Publishing Rights</span>
                      <span className="text-2xl font-bold text-blue-400">{publishingPercentage}%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
                  <h3 className="text-xl font-bold text-white mb-4">All Participants</h3>
                  <div className="space-y-3">
                    {allParticipants.map((p) => (
                      <div key={p.id} className="flex justify-between items-center p-3 bg-black rounded-lg">
                        <div>
                          <div className="text-white font-medium">{p.name}</div>
                          <div className="text-sm text-gray-500">{p.role}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-400">Master: <span className="text-green-400">{p.master_percentage || p.percentage}%</span></div>
                          <div className="text-sm text-gray-400">Publishing: <span className="text-blue-400">{p.publishing_percentage || p.percentage}%</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {participant.response_status === 'pending' && (
                  <div className="flex gap-3">
                    <button
                      onClick={handleAccept}
                      disabled={submitting}
                      className="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Check className="w-5 h-5" />
                      Accept Terms
                    </button>
                    <button
                      onClick={() => setView('counter')}
                      className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <ArrowRight className="w-5 h-5" />
                      Counter-Offer
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={submitting}
                      className="flex-1 py-4 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <X className="w-5 h-5" />
                      Reject
                    </button>
                  </div>
                )}

                {participant.response_status === 'accepted' && negotiation.contract_url && (
                  <button
                    onClick={downloadContract}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Download Split Sheet
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="mb-8">
                  <button
                    onClick={() => setView('review')}
                    className="text-blue-400 hover:text-blue-300 mb-4"
                  >
                    ← Back to Review
                  </button>
                  <h2 className="text-2xl font-bold text-white mb-2">Submit Counter-Offer</h2>
                  <p className="text-gray-400">
                    Propose different percentages. The project owner will be notified of your counter-offer.
                  </p>
                </div>

                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-green-400 mb-2">
                        Master % (Sound Recording)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={counterOffer.master_percentage}
                        onChange={(e) => setCounterOffer({ ...counterOffer, master_percentage: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-blue-400 mb-2">
                        Publishing % (Songwriting)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={counterOffer.publishing_percentage}
                        onChange={(e) => setCounterOffer({ ...counterOffer, publishing_percentage: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleCounterOffer}
                    disabled={submitting}
                    className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Check className="w-5 h-5" />
                    {submitting ? 'Submitting...' : 'Submit Counter-Offer'}
                  </button>
                  <button
                    onClick={() => setView('review')}
                    className="px-6 py-4 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
