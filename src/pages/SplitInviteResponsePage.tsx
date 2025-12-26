import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface Participant {
  id: string;
  name: string;
  email: string;
  role: string;
  master_rights_pct: number;
  publishing_rights_pct: number;
  status: string;
  invited_at: string | null;
  responded_at: string | null;
  counter_master_pct: number | null;
  counter_publishing_pct: number | null;
  counter_notes: string | null;
}

interface Negotiation {
  id: string;
  project_name: string;
  project_title: string;
  description: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

interface Inviter {
  name: string;
  email: string;
}

export default function SplitInviteResponsePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [negotiation, setNegotiation] = useState<Negotiation | null>(null);
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [inviter, setInviter] = useState<Inviter | null>(null);

  const [showCounter, setShowCounter] = useState(false);
  const [signature, setSignature] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [counterMaster, setCounterMaster] = useState<number>(0);
  const [counterPublishing, setCounterPublishing] = useState<number>(0);
  const [counterNotes, setCounterNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successAction, setSuccessAction] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link');
      setLoading(false);
      return;
    }

    fetch(`/.netlify/functions/split-respond-invite?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.message || data.error);
        } else {
          setParticipant(data.participant);
          setNegotiation(data.negotiation);
          setAllParticipants(data.participants || []);
          setInviter(data.inviter);
          setCounterMaster(data.participant.master_rights_pct);
          setCounterPublishing(data.participant.publishing_rights_pct);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load invitation:', err);
        setError('Failed to load invitation details');
        setLoading(false);
      });
  }, [token]);

  const handleAction = async (action: 'accept' | 'decline' | 'counter') => {
    if (!token) return;

    setProcessing(true);
    setError(null);

    const body: any = { action };

    if (action === 'accept') {
      if (!signature.trim()) {
        setError('Please enter your signature to accept');
        setProcessing(false);
        return;
      }
      body.signature = signature.trim();
    }

    if (action === 'decline') {
      body.reason = declineReason;
    }

    if (action === 'counter') {
      if (counterMaster < 0 || counterMaster > 100 || counterPublishing < 0 || counterPublishing > 100) {
        setError('Percentages must be between 0 and 100');
        setProcessing(false);
        return;
      }
      body.counter_master_pct = counterMaster;
      body.counter_publishing_pct = counterPublishing;
      body.counter_notes = counterNotes;
    }

    try {
      const res = await fetch(`/.netlify/functions/split-respond-invite?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.message || data.error);
      } else {
        setSuccess(true);
        setSuccessAction(action);
      }
    } catch (err) {
      console.error('Failed to respond:', err);
      setError('Failed to submit your response');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
          <div className="text-red-400 text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-2">Invalid Invitation</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
          <div className="text-green-400 text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {successAction === 'accept' && 'Invitation Accepted'}
            {successAction === 'decline' && 'Invitation Declined'}
            {successAction === 'counter' && 'Counter Proposal Sent'}
          </h1>
          <p className="text-gray-400 mb-6">
            {successAction === 'accept' && `You've successfully accepted the split for "${negotiation?.project_name}". The creator has been notified.`}
            {successAction === 'decline' && `You've declined the split invitation. The creator has been notified.`}
            {successAction === 'counter' && `Your counter proposal has been sent to the creator. They will review and respond.`}
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const isAlreadyResponded = participant && ['accepted', 'declined'].includes(participant.status);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black p-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Split Negotiation Invitation</h1>
          {negotiation && (
            <p className="text-xl text-gray-300">
              Project: <span className="font-semibold text-white">{negotiation.project_name || negotiation.project_title}</span>
            </p>
          )}
          {inviter && (
            <p className="text-sm text-gray-400 mt-2">
              From: {inviter.name} ({inviter.email})
            </p>
          )}
        </div>

        {/* Negotiation Details */}
        {negotiation?.description && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-2">Project Description</h2>
            <p className="text-gray-300">{negotiation.description}</p>
          </div>
        )}

        {/* Your Proposed Split */}
        {participant && (
          <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Your Proposed Split</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-400">Role</label>
                <p className="text-white font-medium">{participant.role}</p>
              </div>
              <div>
                <label className="text-sm text-gray-400">Name</label>
                <p className="text-white font-medium">{participant.name}</p>
              </div>
              <div>
                <label className="text-sm text-gray-400">Master Rights</label>
                <p className="text-white font-medium text-2xl">{participant.master_rights_pct}%</p>
              </div>
              <div>
                <label className="text-sm text-gray-400">Publishing Rights</label>
                <p className="text-white font-medium text-2xl">{participant.publishing_rights_pct}%</p>
              </div>
            </div>
            {participant.status !== 'pending' && participant.status !== 'invited' && (
              <div className="mt-4 p-3 bg-gray-700/50 rounded-lg">
                <p className="text-gray-300">
                  Status: <span className="font-semibold text-white capitalize">{participant.status}</span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* All Participants */}
        {allParticipants.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">All Participants</h2>
            <div className="space-y-3">
              {allParticipants.map((p) => (
                <div key={p.id} className="flex justify-between items-center p-3 bg-gray-700/30 rounded-lg">
                  <div className="flex-1">
                    <p className="text-white font-medium">{p.name}</p>
                    <p className="text-sm text-gray-400">{p.role}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white">
                      <span className="font-semibold">{p.master_rights_pct}%</span> Master
                    </p>
                    <p className="text-white">
                      <span className="font-semibold">{p.publishing_rights_pct}%</span> Publishing
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons or Already Responded Message */}
        {isAlreadyResponded ? (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center">
            <p className="text-gray-400 mb-4">
              You have already {participant.status} this invitation on{' '}
              {participant.responded_at ? new Date(participant.responded_at).toLocaleDateString() : 'a previous date'}.
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Go to Homepage
            </button>
          </div>
        ) : showCounter ? (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">Submit Counter Proposal</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Master Rights Percentage
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={counterMaster}
                  onChange={(e) => setCounterMaster(parseFloat(e.target.value))}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Publishing Rights Percentage
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={counterPublishing}
                  onChange={(e) => setCounterPublishing(parseFloat(e.target.value))}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={counterNotes}
                  onChange={(e) => setCounterNotes(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Explain your counter proposal..."
                />
              </div>
            </div>
            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => handleAction('counter')}
                disabled={processing}
                className="flex-1 px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {processing ? 'Sending...' : 'Submit Counter Proposal'}
              </button>
              <button
                onClick={() => setShowCounter(false)}
                disabled={processing}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">Your Response</h2>

            {/* Accept Section */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Type your name to accept this split
              </label>
              <input
                type="text"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="Your full name"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500 mb-3"
              />
              <button
                onClick={() => handleAction('accept')}
                disabled={processing || !signature.trim()}
                className="w-full px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Processing...' : 'Accept Split'}
              </button>
            </div>

            <div className="border-t border-gray-700 my-6"></div>

            {/* Counter Section */}
            <div className="mb-6">
              <button
                onClick={() => setShowCounter(true)}
                disabled={processing}
                className="w-full px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg transition-colors"
              >
                Submit Counter Proposal
              </button>
            </div>

            <div className="border-t border-gray-700 my-6"></div>

            {/* Decline Section */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Reason for declining (optional)
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
                placeholder="Let them know why you're declining..."
              />
              <button
                onClick={() => handleAction('decline')}
                disabled={processing}
                className="w-full px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors"
              >
                {processing ? 'Processing...' : 'Decline Split'}
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
