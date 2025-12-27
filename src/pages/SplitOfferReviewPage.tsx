import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase.client';
import { Check, X, AlertCircle } from 'lucide-react';
import { useToast } from '../components/Toast';

interface SplitOffer {
  split_title: string | null;
  beat_fee: number | null;
  participant_name: string | null;
  role: string | null;
  master_percent: number | null;
  pub_percent: number | null;
  invite_status: string | null;
}

export default function SplitOfferReviewPage() {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [offer, setOffer] = useState<SplitOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterOffer, setCounterOffer] = useState({
    master_percent: '',
    pub_percent: '',
    role: '',
    reason: '',
  });

  useEffect(() => {
    if (!inviteToken) return;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('split_participants')
        .select(`
          invite_status,
          master_percent,
          pub_percent,
          role,
          name,
          split_negotiations:negotiation_id (
            title,
            project_name,
            beat_fee
          )
        `)
        .eq('invite_token', inviteToken)
        .maybeSingle();

      setLoading(false);

      if (error || !data) {
        console.error('[SplitOfferReviewPage] Error fetching offer:', error);
        showToast('Offer not found or expired', 'error');
        return;
      }

      const splitNegotiations = (data as any).split_negotiations;

      setOffer({
        split_title: splitNegotiations?.title || splitNegotiations?.project_name || null,
        beat_fee: splitNegotiations?.beat_fee ?? null,
        participant_name: data.name ?? null,
        role: data.role ?? null,
        master_percent: data.master_percent ?? null,
        pub_percent: data.pub_percent ?? null,
        invite_status: data.invite_status ?? null,
      });
    })();
  }, [inviteToken]);

  async function handleRespond(status: 'accepted' | 'declined') {
    if (!inviteToken) return;
    setSubmitting(true);
    try {
      const res = await fetch('/.netlify/functions/split-respond-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken, status }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update offer');
      }

      showToast(status === 'accepted' ? 'Offer accepted!' : 'Offer declined', 'success');

      // Update local state
      setOffer((prev) =>
        prev ? { ...prev, invite_status: status } : null
      );
    } catch (err: any) {
      console.error('[SplitOfferReviewPage] Error responding:', err);
      showToast(
        err.message || 'There was a problem saving your response',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCounterOffer() {
    if (!inviteToken) return;
    setSubmitting(true);
    try {
      const res = await fetch('/.netlify/functions/split-respond-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteToken,
          status: 'countered',
          counterOffer: {
            master_percent: counterOffer.master_percent ? Number(counterOffer.master_percent) : undefined,
            pub_percent: counterOffer.pub_percent ? Number(counterOffer.pub_percent) : undefined,
            role: counterOffer.role || undefined,
            reason: counterOffer.reason || undefined,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send counter offer');
      }

      showToast('Counter offer sent successfully!', 'success');

      // Update local state
      setOffer((prev) =>
        prev ? { ...prev, invite_status: 'countered' } : null
      );
      setShowCounterForm(false);
    } catch (err: any) {
      console.error('[SplitOfferReviewPage] Error sending counter:', err);
      showToast(
        err.message || 'There was a problem sending your counter offer',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading offer...</p>
        </div>
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 px-4">
        <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-xl p-8 text-center">
          <AlertCircle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold mb-2">Offer Not Found</h1>
          <p className="text-slate-400 mb-6">
            This offer may have expired or been removed.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
          >
            Go to Ghoste
          </button>
        </div>
      </div>
    );
  }

  const {
    split_title,
    beat_fee,
    participant_name,
    role,
    master_percent,
    pub_percent,
    invite_status,
  } = offer;

  const disabled = submitting || invite_status !== 'pending';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 px-4 py-8">
      <div className="max-w-2xl w-full bg-slate-900/80 border border-slate-800 rounded-xl p-8 space-y-6">
        {/* Header */}
        <div className="text-center border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-bold text-sky-400 mb-2">
            Ghoste Split Offer
          </h1>
          <p className="text-slate-300">
            Review your offer for{' '}
            <span className="font-semibold text-white">
              {split_title || 'Untitled track'}
            </span>
          </p>
        </div>

        {/* Offer Details */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-6 space-y-4">
          <div>
            <span className="text-sm text-slate-400">Name</span>
            <div className="text-lg font-medium text-white">
              {participant_name || 'Unnamed participant'}
            </div>
          </div>

          <div>
            <span className="text-sm text-slate-400">Role</span>
            <div className="text-lg font-medium text-white">
              {role || 'Participant'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-2 border-t border-slate-800">
            <div>
              <span className="text-sm text-slate-400">Master Rights</span>
              <div className="text-2xl font-bold text-sky-400">
                {master_percent ?? 0}%
              </div>
            </div>
            <div>
              <span className="text-sm text-slate-400">Publishing Rights</span>
              <div className="text-2xl font-bold text-emerald-400">
                {pub_percent ?? 0}%
              </div>
            </div>
          </div>

          {beat_fee != null && beat_fee > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <span className="text-sm text-slate-400">Beat Fee</span>
              <div className="text-2xl font-bold text-orange-400">
                ${beat_fee.toLocaleString()}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800">
            <span className="text-sm text-slate-400">Status</span>
            <div className="mt-1">
              {invite_status === 'accepted' && (
                <span className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-sm font-medium">
                  <Check className="w-4 h-4" />
                  Accepted
                </span>
              )}
              {invite_status === 'declined' && (
                <span className="inline-flex items-center gap-2 px-3 py-1 bg-red-500/20 text-red-300 border border-red-500/30 rounded-full text-sm font-medium">
                  <X className="w-4 h-4" />
                  Declined
                </span>
              )}
              {invite_status === 'pending' && (
                <span className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-sm font-medium">
                  <AlertCircle className="w-4 h-4" />
                  Pending
                </span>
              )}
              {invite_status === 'countered' && (
                <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-sm font-medium">
                  <AlertCircle className="w-4 h-4" />
                  Counter Sent
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {invite_status === 'pending' ? (
          <>
            <div className="flex gap-4 pt-4">
              <button
                onClick={() => handleRespond('accepted')}
                disabled={disabled}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-5 h-5" />
                Accept Offer
              </button>
              <button
                onClick={() => handleRespond('declined')}
                disabled={disabled}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-5 h-5" />
                Decline
              </button>
            </div>

            {/* Counter Offer Button */}
            <div className="text-center">
              <button
                onClick={() => setShowCounterForm(!showCounterForm)}
                disabled={disabled}
                className="text-sky-400 hover:text-sky-300 text-sm font-medium underline disabled:opacity-50"
              >
                {showCounterForm ? 'Hide counter offer form' : 'Or send a counter offer'}
              </button>
            </div>

            {/* Counter Offer Form */}
            {showCounterForm && (
              <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6 space-y-4">
                <h3 className="text-lg font-semibold text-white mb-4">Counter Offer</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Master Rights (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder={master_percent?.toString() || '0'}
                      value={counterOffer.master_percent}
                      onChange={(e) => setCounterOffer({ ...counterOffer, master_percent: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Publishing Rights (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder={pub_percent?.toString() || '0'}
                      value={counterOffer.pub_percent}
                      onChange={(e) => setCounterOffer({ ...counterOffer, pub_percent: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Role (optional)
                  </label>
                  <input
                    type="text"
                    placeholder={role || 'Your role'}
                    value={counterOffer.role}
                    onChange={(e) => setCounterOffer({ ...counterOffer, role: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Reason for counter (optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Explain why you're proposing these changes..."
                    value={counterOffer.reason}
                    onChange={(e) => setCounterOffer({ ...counterOffer, reason: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                  />
                </div>

                <button
                  onClick={handleCounterOffer}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <AlertCircle className="w-5 h-5" />
                  Send Counter Offer
                </button>

                <p className="text-xs text-slate-400 text-center">
                  Your counter offer will be sent to the original sender for review.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="text-center pt-4 text-slate-400">
            You have already {invite_status} this offer.
          </div>
        )}

        {submitting && (
          <div className="text-center text-sm text-slate-400">
            Saving your response...
          </div>
        )}
      </div>
    </div>
  );
}
