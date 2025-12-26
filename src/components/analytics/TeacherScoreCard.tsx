import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { TrendingUp, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';

interface TeacherScore {
  id: string;
  score: number;
  grade: 'fail' | 'weak' | 'pass' | 'strong';
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
  window_start: string;
  window_end: string;
  created_at: string;
}

interface Props {
  entity_type: string;
  entity_id: string;
  platform?: string;
  onScoreLoaded?: (score: TeacherScore | null) => void;
}

export default function TeacherScoreCard({ entity_type, entity_id, platform, onScoreLoaded }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<TeacherScore | null>(null);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    if (user) {
      loadScore();
    }
  }, [user, entity_id, platform]);

  const loadScore = async () => {
    if (!user) return;

    setLoading(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        console.error('[TeacherScore] No auth token');
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({
        entity_type,
        entity_id,
      });

      if (platform) {
        params.append('platform', platform);
      }

      const res = await fetch(`/.netlify/functions/teacher-score-read?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json();

      if (json.ok && json.scores && json.scores.length > 0) {
        const latestScore = json.scores[0];
        setScore(latestScore);
        if (onScoreLoaded) onScoreLoaded(latestScore);
      } else {
        setScore(null);
        if (onScoreLoaded) onScoreLoaded(null);
      }
    } catch (err) {
      console.error('[TeacherScore] Load error:', err);
      setScore(null);
    } finally {
      setLoading(false);
    }
  };

  const computeScore = async () => {
    if (!user) return;

    setComputing(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        console.error('[TeacherScore] No auth token');
        setComputing(false);
        return;
      }

      const res = await fetch('/.netlify/functions/teacher-score-compute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          entity_type,
          entity_id,
          platform,
          window_hours: 24,
        }),
      });

      const json = await res.json();

      if (json.ok) {
        await loadScore();
      } else {
        console.error('[TeacherScore] Compute error:', json.error);
      }
    } catch (err) {
      console.error('[TeacherScore] Compute error:', err);
    } finally {
      setComputing(false);
    }
  };

  const getBadgeColor = (grade: string): string => {
    switch (grade) {
      case 'strong': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'pass': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'weak': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'fail': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getGradeIcon = (grade: string) => {
    switch (grade) {
      case 'strong': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'pass': return <CheckCircle className="w-5 h-5 text-blue-400" />;
      case 'weak': return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case 'fail': return <XCircle className="w-5 h-5 text-red-400" />;
      default: return <TrendingUp className="w-5 h-5 text-gray-400" />;
    }
  };

  const getConfidenceIcon = (confidence: string) => {
    switch (confidence) {
      case 'high': return '🎯';
      case 'medium': return '📊';
      case 'low': return '⚠️';
      default: return '📈';
    }
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-800 rounded w-1/3"></div>
          <div className="h-12 bg-gray-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (!score) {
    return (
      <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-6">
        <div className="text-center">
          <TrendingUp className="w-8 h-8 text-gray-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white mb-2">No Performance Score Yet</h3>
          <p className="text-xs text-gray-400 mb-4">
            Generate a score based on your campaign performance
          </p>
          <button
            onClick={computeScore}
            disabled={computing}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {computing ? 'Computing...' : 'Compute Score'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-400">Performance Score</h3>
        <button
          onClick={computeScore}
          disabled={computing}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
        >
          {computing ? 'Computing...' : 'Refresh'}
        </button>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex-shrink-0">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-2 border-blue-500/30 flex items-center justify-center">
            <span className="text-3xl font-bold text-white">{score.score}</span>
          </div>
        </div>

        <div className="flex-1">
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold mb-2 ${getBadgeColor(score.grade)}`}>
            {getGradeIcon(score.grade)}
            <span className="uppercase">{score.grade}</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{getConfidenceIcon(score.confidence)}</span>
            <span className="capitalize">{score.confidence} Confidence</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Insights</h4>
        <ul className="space-y-1.5">
          {score.reasons.map((reason, index) => (
            <li key={index} className="flex items-start gap-2 text-xs text-gray-300">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="pt-4 border-t border-gray-800 flex items-center gap-2 text-xs text-gray-500">
        <Clock className="w-3 h-3" />
        <span>
          Last scored {new Date(score.created_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </div>

      <div className="mt-3 p-3 bg-gray-800/50 rounded-lg">
        <p className="text-xs text-gray-400 leading-relaxed">
          <span className="font-semibold text-gray-300">Privacy Note:</span> This score is computed from your campaign data and platform signals.
          Raw analytics are never stored — only the score and insights you see here.
        </p>
      </div>
    </div>
  );
}
