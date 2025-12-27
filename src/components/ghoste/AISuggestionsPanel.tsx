import { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, Calendar, Link2, Target, Music, Users, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase.client';

interface Suggestion {
  id: string;
  title: string;
  why: string;
  category: string;
  toolName?: string;
  input?: any;
  priority: 'high' | 'medium' | 'low';
}

interface Props {
  userId: string;
}

const categoryIcons: Record<string, any> = {
  analytics: TrendingUp,
  calendar: Calendar,
  links: Link2,
  ads: Target,
  content: Music,
  social: Users,
  splits: Users
};

const priorityColors = {
  high: 'border-red-500/30 bg-red-500/5',
  medium: 'border-blue-500/30 bg-blue-500/5',
  low: 'border-slate-500/30 bg-slate-500/5'
};

export function AISuggestionsPanel({ userId }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{
    version?: string;
    requestId?: string;
    reason?: string;
  }>({});

  useEffect(() => {
    fetchSuggestions();
  }, [userId]);

  async function fetchSuggestions(force = false) {
    try {
      setLoading(true);
      setError(null);

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      // Get user profile for context
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('artist_name')
        .eq('user_id', userId)
        .maybeSingle();

      const res = await fetch('/.netlify/functions/ai-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          artistName: profile?.artist_name || 'Unknown Artist',
          goal: 'Growth',
          context: { force }
        })
      });

      const data = await res.json().catch(() => ({
        ok: true,
        suggestions: [],
        degraded: true,
        reason: 'invalid_json_response'
      }));

      // Always extract suggestions array
      const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];

      setSuggestions(suggestions);
      setDegraded(!!data?.degraded);
      setDebugInfo({
        version: data?.debug_version,
        requestId: data?.request_id,
        reason: data?.reason
      });

      if (data?.degraded) {
        console.warn('[AISuggestionsPanel] Using fallback suggestions:', data?.reason);
      }
    } catch (err: any) {
      console.error('[AISuggestionsPanel] Failed to fetch suggestions:', err);
      setError(err.message || 'Failed to load suggestions');
      // Set empty suggestions on complete failure
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  async function executeSuggestion(suggestion: Suggestion) {
    try {
      setExecuting(suggestion.id);
      setError(null);

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      // Send message to Ghoste AI to execute the tool
      const res = await fetch('/.netlify/functions/ghosteAgent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          userId,
          messages: [
            {
              role: 'user',
              content: `Execute this suggestion: ${suggestion.title}. ${JSON.stringify(suggestion.input)}`
            }
          ]
        })
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to execute suggestion');
      }

      // Remove executed suggestion from list
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));

      // Refresh suggestions after execution
      setTimeout(() => fetchSuggestions(true), 1000);
    } catch (err: any) {
      console.error('Failed to execute suggestion:', err);
      setError(err.message || 'Failed to execute suggestion');
    } finally {
      setExecuting(null);
    }
  }

  if (loading && suggestions.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ghoste-blue"></div>
      </div>
    );
  }

  if (error && suggestions.length === 0) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={() => fetchSuggestions(true)}
          className="mt-2 text-xs text-red-300 hover:text-red-200 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-6 text-center">
        <Sparkles className="w-8 h-8 text-slate-400 mx-auto mb-3" />
        <p className="text-sm text-slate-400 mb-4">
          No suggestions right now. You're all caught up!
        </p>
        <button
          onClick={() => fetchSuggestions(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh Suggestions
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-ghoste-blue" />
          <span className="text-sm font-medium text-slate-300">
            {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => fetchSuggestions(true)}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {degraded && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 mb-3">
          <p className="text-xs text-yellow-400">
            Using fallback suggestions (AI temporarily unavailable)
          </p>
          {debugInfo.reason && (
            <p className="text-xs text-yellow-500/70 mt-1">
              Reason: {debugInfo.reason}
            </p>
          )}
          {debugInfo.requestId && (
            <p className="text-xs text-yellow-500/50 mt-1 font-mono">
              ID: {debugInfo.requestId}
            </p>
          )}
        </div>
      )}

      {suggestions.map((suggestion) => {
        const Icon = categoryIcons[suggestion.category] || Sparkles;
        const isExecuting = executing === suggestion.id;

        return (
          <div
            key={suggestion.id}
            className={`rounded-xl border p-4 transition-all ${priorityColors[suggestion.priority]}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <div className="rounded-lg bg-slate-800 p-2">
                  <Icon className="w-4 h-4 text-ghoste-blue" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-slate-100 mb-1">
                      {suggestion.title}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {suggestion.why}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      suggestion.priority === 'high'
                        ? 'bg-red-500/20 text-red-300'
                        : suggestion.priority === 'medium'
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-slate-500/20 text-slate-400'
                    }`}>
                      {suggestion.priority}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  {suggestion.toolName ? (
                    <>
                      <button
                        onClick={() => executeSuggestion(suggestion)}
                        disabled={isExecuting}
                        className="inline-flex items-center gap-1 rounded-lg bg-ghoste-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-ghoste-blue/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isExecuting ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                            <span>Running...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3" />
                            <span>Do it</span>
                          </>
                        )}
                      </button>

                      <button
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition"
                        onClick={() => {
                          // TODO: Open modal to edit input parameters
                          console.log('Edit suggestion:', suggestion);
                        }}
                      >
                        Edit
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500 italic">
                      Manual action required
                    </span>
                  )}

                  <span className="text-xs text-slate-500 ml-auto">
                    {suggestion.category}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
