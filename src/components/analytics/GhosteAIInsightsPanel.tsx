import { useState } from "react";
import { X, Sparkles, Loader2, TrendingUp, Target, Zap, AlertCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";

type GhosteAIInsightsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  spotifyArtistId?: string;
  artistName?: string;
};

type AIResponse = {
  summary?: string;
  decisions?: Array<{
    title: string;
    why: string;
    confidence: "low" | "med" | "high";
  }>;
  insights?: Array<{
    metric: string;
    change: string;
    meaning: string;
  }>;
  next_actions?: Array<{
    title: string;
    why: string;
    priority: "high" | "med" | "low";
    cta_label?: string;
    cta_route?: string;
  }>;
  what_to_do_today?: string[];
};

export function GhosteAIInsightsPanel({
  isOpen,
  onClose,
  spotifyArtistId,
  artistName,
}: GhosteAIInsightsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIResponse | null>(null);

  // Form state
  const [range, setRange] = useState<"7d" | "28d" | "90d">("28d");
  const [goal, setGoal] = useState<"growth" | "playlisting" | "touring" | "ads" | "">("growth");
  const [budget, setBudget] = useState<string>("");

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Please log in to use AI insights");
      }

      const body: any = {
        range,
        spotify_artist_id: spotifyArtistId,
      };

      if (goal) body.goal = goal;
      if (budget && !isNaN(Number(budget))) body.budget = Number(budget);

      const response = await fetch("/.netlify/functions/ghoste-ai-analytics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate insights");
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      console.error("AI insights error:", err);
      setError(err.message || "Failed to generate insights");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const confidenceColors = {
    low: "text-yellow-400",
    med: "text-blue-400",
    high: "text-green-400",
  };

  const priorityColors = {
    low: "border-gray-500/30 bg-gray-500/10",
    med: "border-blue-500/30 bg-blue-500/10",
    high: "border-red-500/30 bg-red-500/10",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-ghoste-black/95 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-ghoste-blue" />
            <div>
              <h2 className="text-xl font-bold text-white">Ghoste AI Insights</h2>
              {artistName && <p className="text-sm text-gray-400">{artistName}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        {!result && (
          <div className="space-y-4 mb-6">
            {/* Range Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Time Range
              </label>
              <div className="flex gap-2">
                {(["7d", "28d", "90d"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      range === r
                        ? "bg-ghoste-blue text-white"
                        : "bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {r === "7d" ? "7 Days" : r === "28d" ? "28 Days" : "90 Days"}
                  </button>
                ))}
              </div>
            </div>

            {/* Goal Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Primary Goal (Optional)
              </label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value as any)}
                className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white"
              >
                <option value="">No specific goal</option>
                <option value="growth">Growth & Audience Building</option>
                <option value="playlisting">Playlist Placements</option>
                <option value="touring">Touring & Live Shows</option>
                <option value="ads">Paid Advertising Campaigns</option>
              </select>
            </div>

            {/* Budget Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Budget (Optional)
              </label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="e.g., 500"
                className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter available budget (USD) for AI to factor into recommendations
              </p>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full rounded-xl bg-ghoste-blue text-white px-6 py-3 font-semibold hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate AI Plan
                </>
              )}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 mb-6">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary */}
            {result.summary && (
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <h3 className="text-lg font-bold text-white mb-2">Summary</h3>
                <p className="text-gray-300">{result.summary}</p>
              </div>
            )}

            {/* What to Do Today */}
            {result.what_to_do_today && result.what_to_do_today.length > 0 && (
              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-bold text-white">What to Do Today</h3>
                </div>
                <ul className="space-y-2">
                  {result.what_to_do_today.map((action, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-gray-300">
                      <span className="text-blue-400">•</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Decisions */}
            {result.decisions && result.decisions.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-white mb-3">Key Decisions</h3>
                <div className="space-y-3">
                  {result.decisions.map((decision, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-white/10 bg-black/40 p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-white">{decision.title}</h4>
                        <span
                          className={`text-xs font-medium ${confidenceColors[decision.confidence]}`}
                        >
                          {decision.confidence.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">{decision.why}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Insights */}
            {result.insights && result.insights.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-white mb-3">Insights</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result.insights.map((insight, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-white/10 bg-black/40 p-3"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4 text-gray-400" />
                        <h4 className="text-sm font-semibold text-white">{insight.metric}</h4>
                      </div>
                      <p className="text-xs text-gray-400 mb-1">{insight.change}</p>
                      <p className="text-xs text-gray-500">{insight.meaning}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Actions */}
            {result.next_actions && result.next_actions.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-white mb-3">Next Actions</h3>
                <div className="space-y-3">
                  {result.next_actions.map((action, idx) => (
                    <div
                      key={idx}
                      className={`rounded-2xl border p-4 ${priorityColors[action.priority]}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Target className="w-4 h-4" />
                            <h4 className="font-semibold text-white">{action.title}</h4>
                          </div>
                          <p className="text-sm text-gray-400">{action.why}</p>
                        </div>
                        <span className="text-xs font-medium text-white/60 uppercase">
                          {action.priority} Priority
                        </span>
                      </div>
                      {action.cta_label && action.cta_route && (
                        <button
                          onClick={() => {
                            window.location.href = action.cta_route!;
                          }}
                          className="mt-2 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-medium text-white transition"
                        >
                          {action.cta_label}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reset Button */}
            <button
              onClick={() => setResult(null)}
              className="w-full rounded-xl bg-white/5 hover:bg-white/10 text-white px-6 py-3 font-medium transition"
            >
              Generate New Analysis
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
