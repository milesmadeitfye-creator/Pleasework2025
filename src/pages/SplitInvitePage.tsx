import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

type InviteData = {
  participant: {
    id: string;
    status: string;
    email: string;
    name: string | null;
    role: string | null;
    masterShare: number;
    publishingShare: number;
    respondedAt: string | null;
  };
  split: {
    id: string;
    title: string | null;
    projectName: string | null;
    artistName: string | null;
    beatFee: number | null;
    ownerName: string | null;
    ownerEmail: string | null;
  };
};

export default function SplitInvitePage() {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadInvite = async () => {
      if (!inviteToken) {
        setError('Invalid invite link.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/.netlify/functions/get-split-invite?token=${inviteToken}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          setError(data.message || 'This invite link is invalid or has expired.');
          setLoading(false);
          return;
        }

        setInviteData(data);
        setLoading(false);
      } catch (err) {
        console.error('Unexpected error loading invite', err);
        setError('An unexpected error occurred. Please try again.');
        setLoading(false);
      }
    };

    void loadInvite();
  }, [inviteToken]);

  const handleRespond = async (action: 'accepted' | 'declined') => {
    if (!inviteToken || !inviteData) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/split-respond-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteToken,
          status: action,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || `Failed to ${action === 'accepted' ? 'accept' : 'decline'} the split.`);
        setSaving(false);
        return;
      }

      // Update local state
      setInviteData({
        ...inviteData,
        participant: {
          ...inviteData.participant,
          status: action,
        },
      });
      setSaving(false);

      // Redirect after 2 seconds for accepted invites
      if (action === 'accepted') {
        setTimeout(() => {
          navigate('/');
        }, 2000);
      }
    } catch (err) {
      console.error(`Unexpected error ${action === 'accepted' ? 'accepting' : 'declining'} split`, err);
      setError('An unexpected error occurred. Please try again.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-sm text-slate-400">Loading split invite...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-white px-4">
        <div className="bg-black/40 border border-white/10 rounded-2xl p-6 max-w-md text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold mb-2">Oops</h1>
          <p className="text-sm text-white/70">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 px-4 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  if (!inviteData) return null;

  const { participant, split } = inviteData;
  const isAccepted = participant.status === 'accepted';
  const isDeclined = participant.status === 'declined';
  const isPending = participant.status === 'pending';
  const projectName = split.projectName || split.title || 'Untitled Project';

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl bg-black/50 border border-white/10 rounded-2xl p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">Ghoste Split Invitation</h1>
          <p className="text-sm sm:text-base text-white/60">
            You've been invited to participate in a split
          </p>
        </div>

        {/* Split Details */}
        <div className="bg-white/5 rounded-xl p-4 sm:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">{projectName}</h2>
            {split.artistName && (
              <p className="text-sm text-white/60">by {split.artistName}</p>
            )}
            {split.ownerName && (
              <p className="text-sm text-white/50 mt-1">
                Invited by <span className="text-blue-400">{split.ownerName}</span>
              </p>
            )}
          </div>

          <div className="grid gap-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Your Email</span>
              <span className="font-medium">{participant.email}</span>
            </div>
            {participant.name && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-white/60">Name</span>
                <span className="font-medium">{participant.name}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Role</span>
              <span className="font-medium">{participant.role || 'Participant'}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Master Rights</span>
              <span className="font-medium text-blue-400">{participant.masterShare}%</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Publishing Rights</span>
              <span className="font-medium text-emerald-400">{participant.publishingShare}%</span>
            </div>
            {split.beatFee && split.beatFee > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-white/60">Beat Fee</span>
                <span className="font-medium text-orange-400">${split.beatFee.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Status</span>
              <span className={`font-medium capitalize ${
                isAccepted ? 'text-green-400' :
                isDeclined ? 'text-red-400' :
                'text-yellow-400'
              }`}>
                {participant.status}
              </span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {isAccepted && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 mx-auto mb-3">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-green-300 font-medium">
              You've accepted this split invitation!
            </p>
            <p className="text-xs text-green-400/70 mt-1">
              Redirecting to homepage...
            </p>
          </div>
        )}

        {/* Declined Message */}
        {isDeclined && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 mx-auto mb-3">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-sm text-red-300 font-medium">
              You've declined this split invitation
            </p>
            <p className="text-xs text-red-400/70 mt-1">
              The split owner has been notified
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {isPending && (
          <div className="space-y-3">
            <button
              onClick={() => handleRespond('accepted')}
              disabled={saving}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white disabled:bg-white/10 disabled:text-white/40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Accept Split Invitation
                </>
              )}
            </button>

            <button
              onClick={() => handleRespond('declined')}
              disabled={saving}
              className="w-full py-3 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Decline Invitation
            </button>
          </div>
        )}

        {/* Already Responded */}
        {!isPending && (
          <div className="text-center pt-2">
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/15 text-white transition-colors"
            >
              Go to Ghoste
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-center text-white/40">
          This invitation was sent via Ghoste. If you didn't expect this, you can safely ignore it.
        </p>
      </div>
    </div>
  );
}
