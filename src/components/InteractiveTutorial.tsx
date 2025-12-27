import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  targetPosition?: 'top' | 'bottom' | 'left' | 'right';
  action?: {
    label: string;
    path: string;
  };
}

const tutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Ghoste One',
    description: 'Let\'s take a quick tour of your new music marketing platform. This tutorial will guide you through the essential features.',
    targetPosition: 'bottom'
  },
  {
    id: 'wallet',
    title: 'Your Wallet & Credits',
    description: 'You start with 7,500 credits per month on the Free plan. Credits are used to create links, send broadcasts, and use AI features.',
    action: {
      label: 'View Wallet',
      path: '/wallet'
    }
  },
  {
    id: 'smart-links',
    title: 'Create Smart Links',
    description: 'Smart Links are trackable, brandable links that work across all music platforms. Create one now to get started.',
    action: {
      label: 'Create Link',
      path: '/studio/smart-links'
    }
  },
  {
    id: 'fan-communication',
    title: 'Fan Communication',
    description: 'Connect with your fans through an intelligent inbox. Use templates, broadcasts, and automated sequences.',
    action: {
      label: 'Explore',
      path: '/studio/fan-communication'
    }
  },
  {
    id: 'ghoste-ai',
    title: 'Meet Ghoste AI',
    description: 'Your AI-powered manager is available 24/7 for strategy advice, content ideas, and platform guidance.',
    action: {
      label: 'Chat with AI',
      path: '/studio/ghoste-ai'
    }
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'You\'ve completed the tutorial. Check your dashboard for a detailed checklist of next steps.',
    action: {
      label: 'Go to Dashboard',
      path: '/dashboard'
    }
  }
];

interface InteractiveTutorialProps {
  onComplete?: () => void;
}

export default function InteractiveTutorial({ onComplete }: InteractiveTutorialProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      loadProgress();
    }
  }, [user]);

  const loadProgress = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_tutorial_progress')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCompletedSteps(data.completed_steps || []);
        if (data.is_complete) {
          setIsOpen(false);
        }
      } else {
        // First time user - show tutorial
        setIsOpen(true);
      }
    } catch (err) {
      console.error('Error loading tutorial progress:', err);
    }
  };

  const saveProgress = async () => {
    if (!user) return;

    try {
      const isComplete = currentStep >= tutorialSteps.length - 1;
      const newCompletedSteps = [...new Set([...completedSteps, tutorialSteps[currentStep].id])];

      const { error } = await supabase
        .from('user_tutorial_progress')
        .upsert({
          user_id: user.id,
          completed_steps: newCompletedSteps,
          is_complete: isComplete,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setCompletedSteps(newCompletedSteps);
    } catch (err) {
      console.error('Error saving tutorial progress:', err);
    }
  };

  const handleNext = () => {
    saveProgress();
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    if (!user) return;

    try {
      await supabase
        .from('user_tutorial_progress')
        .upsert({
          user_id: user.id,
          completed_steps: tutorialSteps.map(s => s.id),
          is_complete: true,
          updated_at: new Date().toISOString()
        });

      setIsOpen(false);
      onComplete?.();
    } catch (err) {
      console.error('Error skipping tutorial:', err);
    }
  };

  const handleComplete = async () => {
    await saveProgress();
    setIsOpen(false);
    onComplete?.();
    navigate('/dashboard');
  };

  const handleAction = () => {
    const step = tutorialSteps[currentStep];
    if (step.action) {
      navigate(step.action.path);
      setIsOpen(false);
    }
  };

  if (!isOpen || !user) return null;

  const step = tutorialSteps[currentStep];
  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" />

      {/* Tutorial Card */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl p-4">
        <div className="bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
          {/* Progress Bar */}
          <div className="h-1 bg-gray-800">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 text-sm font-bold">
                    {currentStep + 1}
                  </div>
                  <span className="text-sm text-gray-500">
                    Step {currentStep + 1} of {tutorialSteps.length}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">{step.title}</h2>
                <p className="text-gray-400 leading-relaxed">{step.description}</p>
              </div>
              <button
                onClick={handleSkip}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action Button (if step has one) */}
            {step.action && (
              <div className="mb-6">
                <button
                  onClick={handleAction}
                  className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {step.action.label}
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>

              <div className="flex gap-1.5">
                {tutorialSteps.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentStep
                        ? 'bg-blue-500'
                        : index < currentStep
                        ? 'bg-blue-500/50'
                        : 'bg-gray-700'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
              >
                {currentStep === tutorialSteps.length - 1 ? (
                  <>
                    <Check className="w-4 h-4" />
                    Complete
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {/* Skip Link */}
            <div className="mt-4 text-center">
              <button
                onClick={handleSkip}
                className="text-sm text-gray-500 hover:text-gray-400 transition-colors"
              >
                Skip tutorial
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
