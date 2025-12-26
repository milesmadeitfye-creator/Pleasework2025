import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface TourContextType {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  startTour: () => void;
  pauseTour: () => void;
  resumeTour: () => void;
  completeTour: () => void;
  nextStep: () => void;
  previousStep: () => void;
  goToStep: (step: number) => void;
  skipTour: () => void;
  progress: number;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [totalSteps] = useState(10);
  const [loading, setLoading] = useState(true);

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

      if (data && !data.tour_completed_at) {
        setCurrentStep(data.current_chapter || 1);

        if (data.paused_at) {
          setIsActive(false);
        }
      }
    } catch (err) {
      console.error('[TourContext] Error loading tour state:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveTourState = async (step: number, completed: boolean = false) => {
    if (!user) return;

    try {
      const completedChapters = Array.from({ length: step - 1 }, (_, i) => i + 1);

      await supabase.from('user_tour_progress').upsert({
        user_id: user.id,
        current_chapter: step,
        completed_chapters: completedChapters,
        tour_completed_at: completed ? new Date().toISOString() : null,
        last_resumed_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[TourContext] Error saving tour state:', err);
    }
  };

  const startTour = () => {
    setIsActive(true);
    setCurrentStep(1);
    saveTourState(1);
  };

  const pauseTour = async () => {
    if (!user) return;

    try {
      await supabase
        .from('user_tour_progress')
        .update({ paused_at: new Date().toISOString() })
        .eq('user_id', user.id);

      setIsActive(false);
    } catch (err) {
      console.error('[TourContext] Error pausing tour:', err);
    }
  };

  const resumeTour = () => {
    setIsActive(true);
  };

  const completeTour = () => {
    saveTourState(currentStep, true);
    setIsActive(false);
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      const next = currentStep + 1;
      setCurrentStep(next);
      saveTourState(next);
    } else {
      completeTour();
    }
  };

  const previousStep = () => {
    if (currentStep > 1) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      saveTourState(prev);
    }
  };

  const goToStep = (step: number) => {
    if (step >= 1 && step <= totalSteps) {
      setCurrentStep(step);
      saveTourState(step);
    }
  };

  const skipTour = async () => {
    if (!user) return;

    try {
      await supabase
        .from('user_tour_progress')
        .update({
          tour_completed_at: new Date().toISOString(),
          completed_chapters: Array.from({ length: totalSteps }, (_, i) => i + 1),
        })
        .eq('user_id', user.id);

      setIsActive(false);
    } catch (err) {
      console.error('[TourContext] Error skipping tour:', err);
    }
  };

  const progress = (currentStep / totalSteps) * 100;

  return (
    <TourContext.Provider
      value={{
        isActive,
        currentStep,
        totalSteps,
        startTour,
        pauseTour,
        resumeTour,
        completeTour,
        nextStep,
        previousStep,
        goToStep,
        skipTour,
        progress,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within TourProvider');
  }
  return context;
}
