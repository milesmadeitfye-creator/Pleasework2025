import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, ChevronLeft, X, Pause } from 'lucide-react';
import { useTour } from '../../contexts/TourContext';
import { useAuth } from '../../contexts/AuthContext';
import { tourChapters } from '../../lib/tourContent';

export default function MasterTour() {
  const { isActive, currentStep, totalSteps, nextStep, previousStep, pauseTour, skipTour, progress } = useTour();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isNavigating, setIsNavigating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'forward' | 'backward'>('forward');
  const contentRef = useRef<HTMLDivElement>(null);

  const chapter = tourChapters[currentStep - 1];

  const getUserDisplayName = () => {
    if (!user) return '';

    // Try user metadata first
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name;
    if (fullName) return fullName.split(' ')[0];

    // Try email prefix
    if (user.email) {
      const emailPrefix = user.email.split('@')[0];
      return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }

    return 'there';
  };

  useEffect(() => {
    if (isActive && chapter?.navigationPath && location.pathname !== chapter.navigationPath) {
      setIsNavigating(true);
      const timer = setTimeout(() => {
        navigate(chapter.navigationPath!);
        setTimeout(() => setIsNavigating(false), 300);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [currentStep, isActive, chapter, location.pathname, navigate]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [currentStep]);

  const handleNext = () => {
    setSlideDirection('forward');
    nextStep();
  };

  const handlePrevious = () => {
    setSlideDirection('backward');
    previousStep();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;

      if (e.key === 'ArrowRight' && currentStep < totalSteps) {
        handleNext();
      } else if (e.key === 'ArrowLeft' && currentStep > 1) {
        handlePrevious();
      } else if (e.key === 'Escape') {
        pauseTour();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, currentStep, totalSteps]);

  if (!isActive || !chapter) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] animate-in fade-in duration-300" />

      {/* Tour Modal (80% viewport) */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-8 pointer-events-none">
        <div
          className={`w-full max-w-5xl h-[85vh] bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-800 rounded-3xl shadow-2xl overflow-hidden pointer-events-auto transform transition-all duration-500 ${
            slideDirection === 'forward'
              ? 'animate-in slide-in-from-right-4 fade-in'
              : 'animate-in slide-in-from-left-4 fade-in'
          }`}
        >
          {/* Progress Bar */}
          <div className="h-1.5 bg-gray-800">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Header (Sticky) */}
          <div className="px-8 py-6 border-b border-gray-800/50 bg-gray-900/80 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/20 text-blue-400 text-lg font-bold border border-blue-500/30">
                  {currentStep}
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">
                    Step {currentStep} of {totalSteps}
                  </div>
                  <div className="text-sm text-gray-400">{chapter.estimatedMinutes} min read</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={pauseTour}
                  className="p-2.5 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                  title="Pause tour (Esc)"
                >
                  <Pause className="w-5 h-5" />
                </button>
                <button
                  onClick={skipTour}
                  className="p-2.5 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                  title="Skip tour"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Personalized welcome for first slide */}
            {currentStep === 1 && user && (
              <div className="mb-3">
                <p className="text-xl text-gray-300">
                  Welcome, <span className="text-white font-semibold">{getUserDisplayName()}</span>
                </p>
              </div>
            )}

            <h1 className="text-3xl font-bold text-white mb-2 leading-tight">{chapter.title}</h1>
            <p className="text-lg text-blue-400 font-medium">{chapter.subtitle}</p>
          </div>

          {/* Body (Scrollable) */}
          <div ref={contentRef} className="overflow-y-auto h-[calc(85vh-220px)] px-8 py-6">
            {/* Visual Section */}
            <div className="mb-8">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-gray-800">
                {/* Show illustration if available */}
                {chapter.illustration ? (
                  <img
                    src={chapter.illustration}
                    alt={chapter.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                        <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-500">Visual preview for {chapter.title}</p>
                    </div>
                  </div>
                )}

                {/* Navigating Overlay */}
                {isNavigating && chapter.beforeNavigation && (
                  <div className="absolute inset-0 bg-gray-900/90 backdrop-blur-sm flex items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
                      <p className="text-blue-400 font-medium">{chapter.beforeNavigation}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Content Sections */}
            <div className="space-y-6 prose prose-invert max-w-none">
              {chapter.description.split('\n\n').map((paragraph, index) => {
                if (paragraph.trim().startsWith('**') && paragraph.includes(':**')) {
                  const [heading, ...rest] = paragraph.split('**').filter(Boolean);
                  return (
                    <div key={index}>
                      <h3 className="text-xl font-bold text-white mb-3">{heading.replace(':', '')}</h3>
                      <p className="text-gray-300 leading-relaxed">{rest.join('')}</p>
                    </div>
                  );
                }

                if (paragraph.startsWith('**') && paragraph.includes('**')) {
                  const parts = paragraph.split('**').filter(Boolean);
                  return (
                    <p key={index} className="text-gray-300 leading-relaxed text-base">
                      {parts.map((part, i) =>
                        i % 2 === 0 ? (
                          part
                        ) : (
                          <strong key={i} className="text-white font-semibold">
                            {part}
                          </strong>
                        )
                      )}
                    </p>
                  );
                }

                if (paragraph.trim().startsWith('-')) {
                  const items = paragraph.split('\n').filter((line) => line.trim().startsWith('-'));
                  return (
                    <ul key={index} className="space-y-2 text-gray-300">
                      {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="text-blue-400 mt-1.5">•</span>
                          <span className="flex-1">{item.replace(/^-\s*/, '')}</span>
                        </li>
                      ))}
                    </ul>
                  );
                }

                if (paragraph.trim().match(/^\d+\./)) {
                  const items = paragraph.split('\n').filter((line) => line.trim().match(/^\d+\./));
                  return (
                    <ol key={index} className="space-y-2 text-gray-300 list-decimal list-inside">
                      {items.map((item, i) => (
                        <li key={i}>{item.replace(/^\d+\.\s*/, '')}</li>
                      ))}
                    </ol>
                  );
                }

                return (
                  <p key={index} className="text-gray-300 leading-relaxed text-base">
                    {paragraph}
                  </p>
                );
              })}
            </div>
          </div>

          {/* Footer (Sticky) */}
          <div className="px-8 py-5 border-t border-gray-800/50 bg-gray-900/80 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              {currentStep === 1 ? (
                <button
                  onClick={skipTour}
                  className="flex items-center gap-2 px-5 py-2.5 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
                >
                  <span className="font-medium">Skip for now</span>
                </button>
              ) : (
                <button
                  onClick={handlePrevious}
                  disabled={currentStep === 1}
                  className="flex items-center gap-2 px-5 py-2.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-lg hover:bg-gray-800"
                >
                  <ChevronLeft className="w-5 h-5" />
                  <span className="font-medium">Previous</span>
                </button>
              )}

              {/* Progress Dots */}
              <div className="flex gap-2">
                {Array.from({ length: totalSteps }).map((_, index) => (
                  <div
                    key={index}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      index + 1 === currentStep
                        ? 'bg-blue-500 w-8'
                        : index + 1 < currentStep
                        ? 'bg-blue-500/50 w-2'
                        : 'bg-gray-700 w-2'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                {currentStep === totalSteps ? (
                  <>
                    <span>Complete Tour</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                ) : (
                  <>
                    <span>Next Step</span>
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
