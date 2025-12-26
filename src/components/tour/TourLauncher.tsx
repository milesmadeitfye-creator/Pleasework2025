import { useState, useEffect } from 'react';
import { Play, RotateCcw, CheckCircle, BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTour } from '../../contexts/TourContext';

interface TourLauncherProps {
  variant?: 'button' | 'card' | 'banner';
}

export default function TourLauncher({ variant = 'button' }: TourLauncherProps) {
  const { user } = useAuth();
  const { startTour, resumeTour, progress } = useTour();
  const [tourState, setTourState] = useState<'not-started' | 'in-progress' | 'completed' | 'paused'>('not-started');

  useEffect(() => {
    if (user) {
      loadTourState();
    }
  }, [user]);

  const loadTourState = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('user_tour_progress')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!data) {
        setTourState('not-started');
      } else if (data.tour_completed_at) {
        setTourState('completed');
      } else if (data.paused_at) {
        setTourState('paused');
      } else {
        setTourState('in-progress');
      }
    } catch (err) {
      console.error('Error loading tour state:', err);
    }
  };

  const handleStartTour = () => {
    startTour();
    setTourState('in-progress');
  };

  const handleResumeTour = () => {
    resumeTour();
    setTourState('in-progress');
  };

  const handleRestartTour = async () => {
    if (!user) return;

    try {
      await supabase.from('user_tour_progress').delete().eq('user_id', user.id);

      startTour();
      setTourState('in-progress');
    } catch (err) {
      console.error('Error restarting tour:', err);
    }
  };

  if (variant === 'button') {
    return (
      <>
        {tourState === 'not-started' && (
          <button
            onClick={handleStartTour}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            Take the Tour
          </button>
        )}

        {tourState === 'paused' && (
          <button
            onClick={handleResumeTour}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            Resume Tour ({Math.round(progress)}%)
          </button>
        )}

        {tourState === 'completed' && (
          <button
            onClick={handleRestartTour}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Restart Tour
          </button>
        )}
      </>
    );
  }

  if (variant === 'card') {
    return (
      <div className="bg-gradient-to-br from-blue-900/20 to-blue-950/20 border border-blue-800/50 rounded-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/20 rounded-xl">
              <BookOpen className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Ghoste Product Tour</h3>
              <p className="text-sm text-gray-400">
                {tourState === 'not-started' && 'Learn everything about Ghoste'}
                {tourState === 'paused' && `${Math.round(progress)}% complete`}
                {tourState === 'completed' && 'Tour completed!'}
              </p>
            </div>
          </div>
          {tourState === 'completed' && <CheckCircle className="w-6 h-6 text-green-400" />}
        </div>

        {tourState !== 'completed' && (
          <div className="mb-4">
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <p className="text-sm text-gray-300 mb-4">
          {tourState === 'not-started' &&
            'A 10-step guided walkthrough that teaches you everything about running your music like a label.'}
          {tourState === 'paused' && 'Pick up where you left off and continue learning.'}
          {tourState === 'completed' && "You've mastered Ghoste One. Want a refresher?"}
        </p>

        <div className="flex gap-3">
          {tourState === 'not-started' && (
            <button
              onClick={handleStartTour}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
            >
              <Play className="w-5 h-5" />
              Start Tour
            </button>
          )}

          {tourState === 'paused' && (
            <button
              onClick={handleResumeTour}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
            >
              <Play className="w-5 h-5" />
              Resume Tour
            </button>
          )}

          {tourState === 'completed' && (
            <button
              onClick={handleRestartTour}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
              Restart Tour
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'banner') {
    if (tourState === 'completed') return null;

    return (
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 border border-blue-500 rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-white/20 rounded-lg">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold">
                {tourState === 'not-started' ? 'New to Ghoste?' : 'Continue Your Tour'}
              </h3>
              <p className="text-blue-100 text-sm">
                {tourState === 'not-started'
                  ? 'Take a 20-minute tour and learn everything'
                  : `${Math.round(progress)}% complete — pick up where you left off`}
              </p>
            </div>
          </div>
          <button
            onClick={tourState === 'not-started' ? handleStartTour : handleResumeTour}
            className="px-6 py-2 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap"
          >
            {tourState === 'not-started' ? 'Start Tour' : 'Resume'}
          </button>
        </div>

        {tourState === 'paused' && progress > 0 && (
          <div className="mt-3">
            <div className="h-1 bg-blue-800 rounded-full overflow-hidden">
              <div className="h-full bg-white transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
