import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { FileText, Download, ArrowLeft } from 'lucide-react';

interface Negotiation {
  id: string;
  project_name: string;
  beat_fee?: number;
  status: string;
  created_at: string;
  contract_url?: string;
}

interface Participant {
  id: string;
  name: string;
  email: string;
  role: string;
  how_to_credit?: string;
  master_rights_pct: number;
  publishing_rights_pct: number;
  performing_rights_org?: string;
  ipi_number?: string;
  signed_at?: string;
  signature_name?: string;
}

export default function ContractReview() {
  const { negotiationId } = useParams<{ negotiationId: string }>();
  const navigate = useNavigate();

  const [negotiation, setNegotiation] = useState<Negotiation | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!negotiationId) {
      setError('No negotiation ID provided');
      setLoading(false);
      return;
    }

    loadContractData();
  }, [negotiationId]);

  const loadContractData = async () => {
    try {
      setLoading(true);

      // Load negotiation
      const { data: negData, error: negError } = await supabase
        .from('split_negotiations')
        .select('*')
        .eq('id', negotiationId)
        .single();

      if (negError || !negData) {
        console.error('Failed to load negotiation:', negError);
        setError('Split negotiation not found');
        setLoading(false);
        return;
      }

      setNegotiation(negData);

      // Load participants
      const { data: partData, error: partError } = await supabase
        .from('split_participants')
        .select('*')
        .eq('negotiation_id', negotiationId)
        .order('created_at', { ascending: true });

      if (partError) {
        console.error('Failed to load participants:', partError);
      } else {
        setParticipants(partData || []);
      }

      // Get PDF URL from storage
      const filePath = `${negotiationId}/split-sheet-latest.pdf`;
      const { data: urlData } = supabase.storage
        .from('split_sheets')
        .getPublicUrl(filePath);

      if (urlData?.publicUrl) {
        setPdfUrl(urlData.publicUrl);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading contract data:', err);
      setError('Failed to load contract data');
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-400">Loading split sheet...</p>
        </div>
      </div>
    );
  }

  if (error || !negotiation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Contract Not Found</h2>
          <p className="text-gray-400 mb-6">{error || 'The split sheet you are looking for does not exist.'}</p>
          <button
            onClick={() => navigate('/split-negotiations')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Split Negotiations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/split-negotiations')}
            className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Split Negotiations
          </button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{negotiation.project_name}</h1>
              <p className="text-gray-400">Split Sheet Contract</p>
            </div>
            {pdfUrl && (
              <button
                onClick={handleDownload}
                className="px-6 py-3 bg-green-900/20 text-green-400 border border-green-700 hover:bg-green-900/30 rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download PDF
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* PDF Viewer */}
          <div className="lg:col-span-2">
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className="w-full"
                  style={{ height: '80vh', border: 'none' }}
                  title="Split Sheet PDF"
                />
              ) : (
                <div className="p-12 text-center">
                  <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No Split Sheet Generated Yet</h3>
                  <p className="text-gray-400">
                    Go back to Split Negotiations and click "Generate Split Sheet" to create the PDF.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Participants Summary */}
          <div className="space-y-6">
            {/* Project Details */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4">Project Details</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-400">Status</p>
                  <p className="font-semibold capitalize">{negotiation.status}</p>
                </div>
                {negotiation.beat_fee && (
                  <div>
                    <p className="text-sm text-gray-400">Beat Fee</p>
                    <p className="font-semibold">${negotiation.beat_fee.toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-400">Created</p>
                  <p className="font-semibold">{new Date(negotiation.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            {/* Participants */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4">Participants ({participants.length})</h2>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {participants.map((p) => (
                  <div key={p.id} className="bg-black border border-gray-800 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-sm text-gray-400">{p.email}</p>
                      </div>
                      {p.signed_at && (
                        <span className="px-2 py-1 bg-green-900/20 text-green-400 text-xs rounded">
                          Signed
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-sm">
                      <p className="text-gray-400">Role: <span className="text-white">{p.role}</span></p>
                      <p className="text-gray-400">Master: <span className="text-white">{p.master_rights_pct}%</span></p>
                      <p className="text-gray-400">Publishing: <span className="text-white">{p.publishing_rights_pct}%</span></p>
                      {p.performing_rights_org && (
                        <p className="text-gray-400">PRO: <span className="text-white">{p.performing_rights_org}</span></p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
