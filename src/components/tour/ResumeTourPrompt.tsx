import { useEffect, useState } from 'react';
import { Play, RotateCcw, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTour } from '../../contexts/TourContext';

export default function ResumeTourPrompt() {
  const { user } = useAuth();
  const { startTour, resumeTour, currentStep, progress } = useTour();
  const [showPrompt, setShowPrompt] = useState(false);
  const [tourData, setTourData] = useState<any>(null);

  useEffect(() => {
    if (user) {
      checkForIncompleteTour();
    }
  }, [user]);

  const checkForIncompleteTour = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('user_tour_progress')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data && !data.tour_completed_at && data.current_chapter && data.current_chapter > 1) {
        const dismissedKey = `ghoste:tour:resume_dismissed:${user.id}`;
        const dismissed = localStorage.getItem(dismissedKey);

        const lastSeen = data.last_resumed_at || data.created_at;
        const hoursSinceLastSeen = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60);

        if (!dismissed && hoursSinceLastSeen > 1) {
          setTourData(data);
          setShowPrompt(true);
        }
      }
    } catch (err) {
      console.error('[ResumeTourPrompt] Error checking tour status:', err);
    }
  };

  const handleResume = () => {
    resumeTour();
    setShowPrompt(false);
  };

  const handleRestart = async () => {
    if (!user) return;

    try {
      await supabase.from('user_tour_progress').delete().eq('user_id', user.id);
      startTour();
      setShowPrompt(false);
    } catch (err) {
      console.error('[ResumeTourPrompt] Error restarting tour:', err);
    }
  };

  const handleDismiss = () => {
    if (user) {
      localStorage.setItem(`ghoste:tour:resume_dismissed:${user.id}`, Date.now().toString());
    }
    setShowPrompt(false);
  };

  if (!showPrompt || !tourData) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 animate-in fade-in duration-300"
        onClick={handleDismiss}
      />

      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-51 w-full max-w-md p-4 animate-in zoom-in-95 fade-in duration-300">
        <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="relative">
            <div className="absolute top-4 right-4">
              <button
                onClick={handleDismiss}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-blue-500/20 rounded-xl">
                  <Play className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Resume your tour?</h2>
                  <p className="text-sm text-gray-400">Pick up where you left off</p>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Progress</span>
                  <span className="text-sm font-semibold text-blue-400">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Step {tourData.current_chapter} of 11
                </p>
              </div>

              <p className="text-gray-300 text-sm mb-6">
                You were making great progress learning Ghoste. Continue the tour to discover more features and unlock your music's full potential.
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleResume}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
                >
                  <Play className="w-5 h-5" />
                  Resume Tour
                </button>

                <div className="flex gap-3">
                  <button
                    onClick={handleRestart}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restart
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="flex-1 px-4 py-2.5 text-gray-400 hover:text-white hover:bg-gray-800 font-medium rounded-lg transition-colors text-sm"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
