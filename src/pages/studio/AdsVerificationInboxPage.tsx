import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, XCircle, Loader2, AlertTriangle, Clock } from 'lucide-react';

export default function AdsVerificationInboxPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('ads_verification_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    setItems(data ?? []);
    setLoading(false);
  }

  async function decide(queue_id: string, decision: 'approve' | 'reject') {
    setProcessing(queue_id);

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    if (!token) {
      alert('Not signed in');
      setProcessing(null);
      return;
    }

    try {
      const res = await fetch('/.netlify/functions/ads-autopilot-approve', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ queue_id, decision }),
      });

      const j = await res.json();

      if (!res.ok) {
        alert(j?.error || 'Failed to process decision');
      }

      await load();
    } catch (e: any) {
      alert(e.message || 'Network error');
    }

    setProcessing(null);
  }

  function getRiskBadge(level: string) {
    const colors = {
      low: 'bg-green-500/20 text-green-500 border-green-500/30',
      med: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
      high: 'bg-red-500/20 text-red-500 border-red-500/30',
    };

    return (
      <span className={`px-2 py-1 rounded-lg border text-xs font-medium ${colors[level as keyof typeof colors] || colors.high}`}>
        {level.toUpperCase()} RISK
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin opacity-50" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Verification Inbox</h1>
        <p className="text-sm opacity-70 mt-2">
          Review and approve high-risk actions proposed by Autopilot or Ghoste AI.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border bg-white/5 p-12 text-center">
          <CheckCircle className="w-12 h-12 mx-auto opacity-30 mb-4" />
          <div className="font-medium opacity-80">No pending approvals</div>
          <div className="text-sm opacity-60 mt-2">All actions have been reviewed.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border bg-white/5 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                    <div className="font-semibold text-lg">{item.action_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</div>
                    {getRiskBadge(item.risk_level)}
                  </div>

                  {item.reason && (
                    <div className="text-sm opacity-80 mb-3">
                      {item.reason}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs opacity-60">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                    <div>Requested by: {item.requested_by}</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    className="px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => decide(item.id, 'reject')}
                    disabled={processing === item.id}
                  >
                    {processing === item.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 inline mr-1" />
                        Reject
                      </>
                    )}
                  </button>

                  <button
                    className="px-4 py-2 rounded-xl border border-green-500/30 bg-green-500/10 hover:bg-green-500/20 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => decide(item.id, 'approve')}
                    disabled={processing === item.id}
                  >
                    {processing === item.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5 inline mr-1" />
                        Approve & Execute
                      </>
                    )}
                  </button>
                </div>
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-sm opacity-70 hover:opacity-100 font-medium">
                  View Technical Details
                </summary>
                <pre className="mt-3 text-xs overflow-auto bg-black/20 p-4 rounded-xl border">
                  {JSON.stringify(item.payload, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
