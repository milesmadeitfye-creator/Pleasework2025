import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { FileText, Check, AlertCircle, Loader } from 'lucide-react';

interface Participant {
  id: string;
  email: string;
  name: string;
  role: string;
  master_rights_pct: number;
  publishing_rights_pct: number;
  signed_at: string | null;
  status: string;
}

interface Negotiation {
  id: string;
  project_name: string;
  beat_fee?: number | null;
  advance_amount?: number | null;
}

export default function SplitAcceptPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [negotiation, setNegotiation] = useState<Negotiation | null>(null);
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);

  const [signatureName, setSignatureName] = useState('');
  const [agree, setAgree] = useState(false);
  const [signing, setSigning] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link - missing token');
      setLoading(false);
      return;
    }

    loadSplitData();
  }, [token]);

  const loadSplitData = async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError('');

      // Look up participant by token (no auth required)
      const { data: participantData, error: participantError } = await supabase
        .from('split_participants')
        .select('*')
        .eq('invite_token', token)
        .maybeSingle();

      if (participantError || !participantData) {
        setError('Invalid or expired invitation link');
        setLoading(false);
        return;
      }

      if (participantData.signed_at) {
        setError('You have already signed this split sheet');
        setParticipant(participantData);
        setLoading(false);
        return;
      }

      setParticipant(participantData);

      // Load negotiation details
      const { data: negotiationData, error: negotiationError } = await supabase
        .from('split_negotiations')
        .select('id, project_name, beat_fee, advance_amount')
        .eq('id', participantData.negotiation_id)
        .maybeSingle();

      if (negotiationError || !negotiationData) {
        setError('Failed to load split details');
        setLoading(false);
        return;
      }

      setNegotiation(negotiationData);

      // Load all participants to show the full split
      const { data: allParticipantsData, error: allParticipantsError } = await supabase
        .from('split_participants')
        .select('*')
        .eq('negotiation_id', participantData.negotiation_id)
        .order('created_at', { ascending: true });

      if (!allParticipantsError && allParticipantsData) {
        setAllParticipants(allParticipantsData);
      }

      setLoading(false);
    } catch (err: any) {
      console.error('Error loading split data:', err);
      setError('Failed to load split data');
      setLoading(false);
    }
  };

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !signatureName.trim()) {
      setError('Please enter your full legal name');
      return;
    }

    if (!agree) {
      setError('You must agree to the electronic signature terms');
      return;
    }

    try {
      setSigning(true);
      setError('');

      const response = await fetch('/.netlify/functions/split-sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          signature_name: signatureName.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to sign split sheet');
      }

      setSuccess(true);
      setSigning(false);
    } catch (err: any) {
      console.error('Error signing:', err);
      setError(err.message || 'Failed to sign split sheet');
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading split details...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-green-700 rounded-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Successfully Signed!</h2>
          <p className="text-gray-400 mb-6">
            You have successfully signed the split sheet for <span className="font-semibold text-white">{negotiation?.project_name}</span>
          </p>
          <p className="text-sm text-gray-500 mb-6">
            The split owner will be notified of your signature.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
          >
            Go to Ghoste
          </button>
        </div>
      </div>
    );
  }

  if (error && !participant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-red-700 rounded-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Invalid Link</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
          >
            Go to Ghoste
          </button>
        </div>
      </div>
    );
  }

  if (participant?.signed_at) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Already Signed</h2>
          <p className="text-gray-400 mb-2">
            You already signed this split sheet on{' '}
            {new Date(participant.signed_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Signed as: <span className="font-semibold text-white">{participant.signature_name}</span>
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
          >
            Go to Ghoste
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 py-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-900/20 rounded-full flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white mb-2">Split Sheet Signature Request</h1>
              <p className="text-gray-400 mb-1">
                You've been invited to sign the split sheet for:
              </p>
              <p className="text-xl font-semibold text-white">{negotiation?.project_name}</p>
              {(negotiation?.beat_fee || negotiation?.advance_amount) && (
                <div className="mt-3 text-sm text-gray-400">
                  {negotiation.beat_fee && <p>Beat Fee: ${negotiation.beat_fee.toLocaleString()}</p>}
                  {negotiation.advance_amount && <p>Advance: ${negotiation.advance_amount.toLocaleString()}</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Your Details */}
        {participant && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Your Split Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500 mb-1">Name</p>
                <p className="text-white font-medium">{participant.name}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Email</p>
                <p className="text-white font-medium">{participant.email}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Role</p>
                <p className="text-white font-medium">{participant.role}</p>
              </div>
              <div></div>
              <div>
                <p className="text-gray-500 mb-1">Master Rights</p>
                <p className="text-green-400 font-bold text-lg">{participant.master_rights_pct}%</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Publishing Rights</p>
                <p className="text-blue-400 font-bold text-lg">{participant.publishing_rights_pct}%</p>
              </div>
            </div>
          </div>
        )}

        {/* All Participants */}
        {allParticipants.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">All Participants</h2>
            <div className="space-y-3">
              {allParticipants.map((p) => (
                <div
                  key={p.id}
                  className={`p-3 rounded-lg border ${
                    p.id === participant?.id ? 'bg-blue-900/10 border-blue-700' : 'bg-black border-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{p.name}</p>
                      <p className="text-sm text-gray-400">{p.role} • {p.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">
                        Master: <span className="text-green-400 font-semibold">{p.master_rights_pct}%</span>
                      </p>
                      <p className="text-sm text-gray-400">
                        Pub: <span className="text-blue-400 font-semibold">{p.publishing_rights_pct}%</span>
                      </p>
                    </div>
                  </div>
                  {p.signed_at && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <p className="text-xs text-green-400">
                        ✓ Signed on {new Date(p.signed_at).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signature Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Sign Split Sheet</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSign} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Full Legal Name *
              </label>
              <input
                type="text"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="John Doe"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Type your full legal name as it should appear on the split sheet
              </p>
            </div>

            <div className="flex items-start gap-3 p-4 bg-yellow-900/10 border border-yellow-700/50 rounded-lg">
              <input
                type="checkbox"
                id="agree"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-1 flex-shrink-0"
                required
              />
              <label htmlFor="agree" className="text-sm text-gray-300">
                I agree that typing my name above counts as my electronic signature on this split sheet.
                I understand this is for documentation purposes and not legal advice.
              </label>
            </div>

            <button
              type="submit"
              disabled={signing || !signatureName.trim() || !agree}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {signing ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Signing...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Sign Split Sheet
                </>
              )}
            </button>

            <p className="text-xs text-gray-500 text-center">
              After signing, you'll receive a confirmation and the split owner will be notified.
            </p>
          </form>
        </div>

        {/* Disclaimer */}
        <div className="mt-6 p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
          <p className="text-xs text-gray-500 text-center">
            This split sheet is for reference and documentation purposes only. It is not legal advice.
            For legally binding agreements, consult an attorney.
          </p>
        </div>
      </div>
    </div>
  );
}
