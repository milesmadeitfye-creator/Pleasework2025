import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface SplitNegotiation {
  id: string;
  public_token: string;
  song_title: string;
  primary_artist: string;
  recipient_name: string | null;
  recipient_email: string | null;
  status: string;
  proposed_split: number;
  role: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export default function PublicSplitNegotiation() {
  const { token } = useParams<{ token: string }>();
  const [negotiation, setNegotiation] = useState<SplitNegotiation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState('');
  const [counterSplit, setCounterSplit] = useState<number | null>(null);
  const [counterRole, setCounterRole] = useState('');
  const [counterNotes, setCounterNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [actionType, setActionType] = useState<'accept' | 'reject' | 'counter' | null>(null);

  useEffect(() => {
    if (!token) return;

    fetch(`/.netlify/functions/split-negotiation-public?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setNegotiation(data.negotiation);
          setCounterSplit(data.negotiation.proposed_split);
          setCounterRole(data.negotiation.role || '');
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch negotiation:', err);
        setError('Failed to load split offer');
        setLoading(false);
      });
  }, [token]);

  const handleAction = async (action: 'accept' | 'reject' | 'counter') => {
    if (!token) return;

    setProcessing(true);
    setError(null);

    const body: any = { action };

    if (action === 'accept') {
      if (!signature.trim()) {
        setError('Signature is required to accept');
        setProcessing(false);
        return;
      }
      body.signature = signature.trim();
    }

    if (action === 'reject') {
      body.reason = rejectReason;
    }

    if (action === 'counter') {
      if (counterSplit === null || counterSplit < 0 || counterSplit > 100) {
        setError('Please enter a valid split percentage (0-100)');
        setProcessing(false);
        return;
      }
      body.proposed_split = counterSplit;
      body.role = counterRole;
      body.notes = counterNotes;
    }

    try {
      const res = await fetch(`/.netlify/functions/split-negotiation-public?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setSuccess(true);
        setActionType(action);
      }
    } catch (err: any) {
      console.error('Action failed:', err);
      setError('Failed to process your response. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-ghoste-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-ghoste-accent"></div>
      </div>
    );
  }

  if (error && !negotiation) {
    return (
      <div className="min-h-screen bg-ghoste-bg flex items-center justify-center p-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 max-w-md">
          <h1 className="text-xl font-bold text-red-400 mb-2">Error</h1>
          <p className="text-ghoste-text">{error}</p>
        </div>
      </div>
    );
  }

  if (!negotiation) {
    return (
      <div className="min-h-screen bg-ghoste-bg flex items-center justify-center p-4">
        <div className="text-ghoste-text">Split offer not found</div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-ghoste-bg flex items-center justify-center p-4">
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-8 max-w-md text-center">
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-green-400 mb-4">
            {actionType === 'accept' && 'Offer Accepted!'}
            {actionType === 'reject' && 'Offer Rejected'}
            {actionType === 'counter' && 'Counter Offer Sent!'}
          </h1>
          <p className="text-ghoste-text">
            {actionType === 'accept' &&
              'Thank you for accepting this split offer. The creator has been notified.'}
            {actionType === 'reject' && 'The creator has been notified of your decision.'}
            {actionType === 'counter' &&
              'Your counter offer has been sent. The creator will review and respond.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ghoste-bg p-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="bg-ghoste-card border border-ghoste-border rounded-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-ghoste-text mb-6">Split Offer</h1>

          <div className="space-y-4 mb-8">
            <div>
              <label className="text-sm text-ghoste-text-muted">Song Title</label>
              <div className="text-lg font-semibold text-ghoste-text">{negotiation.song_title}</div>
            </div>

            <div>
              <label className="text-sm text-ghoste-text-muted">Primary Artist</label>
              <div className="text-lg text-ghoste-text">{negotiation.primary_artist}</div>
            </div>

            <div>
              <label className="text-sm text-ghoste-text-muted">Proposed Split</label>
              <div className="text-2xl font-bold text-ghoste-accent">{negotiation.proposed_split}%</div>
            </div>

            {negotiation.role && (
              <div>
                <label className="text-sm text-ghoste-text-muted">Role</label>
                <div className="text-ghoste-text">{negotiation.role}</div>
              </div>
            )}

            {negotiation.notes && (
              <div>
                <label className="text-sm text-ghoste-text-muted">Notes</label>
                <div className="text-ghoste-text whitespace-pre-wrap">{negotiation.notes}</div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 mb-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-6">
            <details className="bg-ghoste-bg rounded-lg p-4">
              <summary className="cursor-pointer font-semibold text-ghoste-text mb-2">
                ✓ Accept Offer
              </summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm text-ghoste-text-muted mb-2">
                    Type your full name to sign
                  </label>
                  <input
                    type="text"
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    placeholder="Your Full Name"
                    className="w-full bg-ghoste-bg border border-ghoste-border rounded px-4 py-2 text-ghoste-text"
                    disabled={processing}
                  />
                </div>
                <button
                  onClick={() => handleAction('accept')}
                  disabled={processing || !signature.trim()}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 rounded transition-colors"
                >
                  {processing ? 'Processing...' : 'Accept & Sign'}
                </button>
              </div>
            </details>

            <details className="bg-ghoste-bg rounded-lg p-4">
              <summary className="cursor-pointer font-semibold text-ghoste-text mb-2">
                ↔ Counter Offer
              </summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm text-ghoste-text-muted mb-2">
                    Proposed Split (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={counterSplit ?? ''}
                    onChange={(e) => setCounterSplit(Number(e.target.value))}
                    className="w-full bg-ghoste-bg border border-ghoste-border rounded px-4 py-2 text-ghoste-text"
                    disabled={processing}
                  />
                </div>
                <div>
                  <label className="block text-sm text-ghoste-text-muted mb-2">Role</label>
                  <input
                    type="text"
                    value={counterRole}
                    onChange={(e) => setCounterRole(e.target.value)}
                    placeholder="e.g., Producer, Writer"
                    className="w-full bg-ghoste-bg border border-ghoste-border rounded px-4 py-2 text-ghoste-text"
                    disabled={processing}
                  />
                </div>
                <div>
                  <label className="block text-sm text-ghoste-text-muted mb-2">Notes (optional)</label>
                  <textarea
                    value={counterNotes}
                    onChange={(e) => setCounterNotes(e.target.value)}
                    placeholder="Any additional details..."
                    rows={3}
                    className="w-full bg-ghoste-bg border border-ghoste-border rounded px-4 py-2 text-ghoste-text"
                    disabled={processing}
                  />
                </div>
                <button
                  onClick={() => handleAction('counter')}
                  disabled={processing}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 rounded transition-colors"
                >
                  {processing ? 'Processing...' : 'Send Counter Offer'}
                </button>
              </div>
            </details>

            <details className="bg-ghoste-bg rounded-lg p-4">
              <summary className="cursor-pointer font-semibold text-ghoste-text mb-2">
                ✕ Reject Offer
              </summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm text-ghoste-text-muted mb-2">
                    Reason (optional)
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Let them know why you're declining..."
                    rows={3}
                    className="w-full bg-ghoste-bg border border-ghoste-border rounded px-4 py-2 text-ghoste-text"
                    disabled={processing}
                  />
                </div>
                <button
                  onClick={() => handleAction('reject')}
                  disabled={processing}
                  className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 rounded transition-colors"
                >
                  {processing ? 'Processing...' : 'Reject Offer'}
                </button>
              </div>
            </details>
          </div>
        </div>

        <div className="text-center text-sm text-ghoste-text-muted">
          Powered by <span className="text-ghoste-accent font-semibold">Ghoste</span>
        </div>
      </div>
    </div>
  );
}
