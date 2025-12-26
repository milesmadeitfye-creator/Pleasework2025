import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, ChevronLeft, X, Pause, Play, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { tourChapters, type TourChapter } from '../../lib/tourContent';
import SpotlightOverlay from './SpotlightOverlay';

interface MasterTourProps {
  onComplete?: () => void;
  onPause?: () => void;
}

export default function MasterTour({ onComplete, onPause }: MasterTourProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(1);
  const [completedChapters, setCompletedChapters] = useState<number[]>([]);
  const [isNavigating, setIsNavigating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadProgress();
    }
  }, [user]);

  const loadProgress = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_tour_progress')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCurrentChapter(data.current_chapter || 1);
        setCompletedChapters(data.completed_chapters || []);

        if (data.tour_completed_at) {
          setIsOpen(false);
          onComplete?.();
        }
      } else {
        // First time - create record
        await supabase.from('user_tour_progress').insert({
          user_id: user.id,
          current_chapter: 1,
          completed_chapters: [],
          tour_started_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Error loading tour progress:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveProgress = async (chapter: number, completed: number[]) => {
    if (!user) return;

    try {
      const isComplete = completed.length === tourChapters.length;

      await supabase
        .from('user_tour_progress')
        .upsert({
          user_id: user.id,
          current_chapter: chapter,
          completed_chapters: completed,
          tour_completed_at: isComplete ? new Date().toISOString() : null,
          last_resumed_at: new Date().toISOString(),
        });
    } catch (err) {
      console.error('Error saving tour progress:', err);
    }
  };

  const handleNext = async () => {
    const chapter = tourChapters[currentChapter - 1];
    const newCompleted = [...completedChapters, currentChapter];
    setCompletedChapters(newCompleted);

    if (currentChapter < tourChapters.length) {
      const nextChapter = currentChapter + 1;
      setCurrentChapter(nextChapter);
      await saveProgress(nextChapter, newCompleted);

      // Navigate if next chapter has a path
      const nextChapterData = tourChapters[nextChapter - 1];
      if (nextChapterData.navigationPath) {
        setIsNavigating(true);
        setTimeout(() => {
          navigate(nextChapterData.navigationPath!);
          setIsNavigating(false);
        }, 500);
      }
    } else {
      // Tour complete
      await saveProgress(currentChapter, newCompleted);
      setIsOpen(false);
      onComplete?.();
    }
  };

  const handlePrevious = () => {
    if (currentChapter > 1) {
      const prevChapter = currentChapter - 1;
      setCurrentChapter(prevChapter);
      saveProgress(prevChapter, completedChapters);

      // Navigate to previous chapter's path if it has one
      const prevChapterData = tourChapters[prevChapter - 1];
      if (prevChapterData.navigationPath) {
        navigate(prevChapterData.navigationPath);
      }
    }
  };

  const handlePause = async () => {
    if (!user) return;

    try {
      await supabase
        .from('user_tour_progress')
        .update({
          paused_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      setIsOpen(false);
      onPause?.();
    } catch (err) {
      console.error('Error pausing tour:', err);
    }
  };

  const handleSkip = async () => {
    if (!user) return;

    try {
      await supabase
        .from('user_tour_progress')
        .update({
          tour_completed_at: new Date().toISOString(),
          completed_chapters: tourChapters.map((c) => c.id),
        })
        .eq('user_id', user.id);

      setIsOpen(false);
      onComplete?.();
    } catch (err) {
      console.error('Error skipping tour:', err);
    }
  };

  if (!isOpen || loading || !user) return null;

  const chapter = tourChapters[currentChapter - 1];
  const progress = (completedChapters.length / tourChapters.length) * 100;

  return (
    <SpotlightOverlay targetSelector={chapter.highlightSelector} onClose={handleSkip}>
      <div className="w-full max-w-3xl">
        <div className="bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
          {/* Progress Bar */}
          <div className="h-2 bg-gray-800">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Chapter Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 text-sm font-bold">
                  {currentChapter}
                </div>
                <div>
                  <div className="text-sm text-gray-500">
                    Chapter {currentChapter} of {tourChapters.length} • {chapter.estimatedMinutes} min
                  </div>
                  <h2 className="text-2xl font-bold text-white">{chapter.title}</h2>
                </div>
              </div>
              <p className="text-lg text-blue-400 font-medium">{chapter.subtitle}</p>
            </div>

            {/* Navigating Indicator */}
            {isNavigating && chapter.beforeNavigation && (
              <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>
                  <p className="text-blue-400">{chapter.beforeNavigation}</p>
                </div>
              </div>
            )}

            {/* Chapter Content */}
            <div className="mb-8 prose prose-invert max-w-none">
              {chapter.description.split('\n\n').map((paragraph, index) => {
                // Handle bold text
                if (paragraph.startsWith('**') && paragraph.includes('**')) {
                  const parts = paragraph.split('**').filter(Boolean);
                  return (
                    <p key={index} className="text-gray-300 leading-relaxed mb-4">
                      {parts.map((part, i) => (
                        i % 2 === 0 ? part : <strong key={i} className="text-white font-semibold">{part}</strong>
                      ))}
                    </p>
                  );
                }
                return (
                  <p key={index} className="text-gray-300 leading-relaxed mb-4">
                    {paragraph}
                  </p>
                );
              })}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-4 pt-6 border-t border-gray-800">
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePrevious}
                  disabled={currentChapter === 1}
                  className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>

                <button
                  onClick={handlePause}
                  className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white transition-colors"
                  title="Pause tour (resume anytime)"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
              </div>

              <div className="flex items-center gap-3">
                {!chapter.skipable && (
                  <span className="text-xs text-gray-500 mr-2">Required chapter</span>
                )}

                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
                >
                  {currentChapter === tourChapters.length ? (
                    <>
                      <Check className="w-5 h-5" />
                      Complete Tour
                    </>
                  ) : (
                    <>
                      Next Chapter
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Progress Dots */}
            <div className="mt-6 flex justify-center gap-2">
              {tourChapters.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index + 1 === currentChapter
                      ? 'bg-blue-500 w-8'
                      : completedChapters.includes(index + 1)
                      ? 'bg-blue-500/50'
                      : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>

            {/* Skip Option */}
            {chapter.skipable && (
              <div className="mt-4 text-center">
                <button
                  onClick={handleSkip}
                  className="text-sm text-gray-500 hover:text-gray-400 transition-colors"
                >
                  Skip entire tour
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </SpotlightOverlay>
  );
}
