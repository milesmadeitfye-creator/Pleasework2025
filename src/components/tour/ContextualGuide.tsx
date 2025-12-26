import { useState, useEffect } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { contextualGuides, type ContextualGuide as ContextualGuideType } from '../../lib/tourContent';

export default function ContextualGuide() {
  const { user } = useAuth();
  const location = useLocation();
  const [activeGuide, setActiveGuide] = useState<ContextualGuideType | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (user) {
      checkForGuide();
    }
  }, [user, location.pathname]);

  const checkForGuide = async () => {
    if (!user) return;

    // Find guide for current path
    const guide = contextualGuides.find((g) => location.pathname.startsWith(g.triggerPath));
    if (!guide) return;

    try {
      // Check if user has seen this guide
      const { data } = await supabase
        .from('user_contextual_guides')
        .select('*')
        .eq('user_id', user.id)
        .eq('guide_id', guide.id)
        .maybeSingle();

      if (!data) {
        // Show guide and mark as shown
        setActiveGuide(guide);
        setIsVisible(true);

        await supabase.from('user_contextual_guides').insert({
          user_id: user.id,
          guide_id: guide.id,
          shown_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Error checking contextual guide:', err);
    }
  };

  const handleDismiss = async () => {
    if (!user || !activeGuide) return;

    try {
      await supabase
        .from('user_contextual_guides')
        .update({
          dismissed_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('guide_id', activeGuide.id);

      setIsVisible(false);
      setTimeout(() => setActiveGuide(null), 300);
    } catch (err) {
      console.error('Error dismissing guide:', err);
    }
  };

  const handleComplete = async () => {
    if (!user || !activeGuide) return;

    try {
      await supabase
        .from('user_contextual_guides')
        .update({
          completed: true,
          dismissed_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('guide_id', activeGuide.id);

      setIsVisible(false);
      setTimeout(() => setActiveGuide(null), 300);
    } catch (err) {
      console.error('Error completing guide:', err);
    }
  };

  if (!activeGuide || !isVisible) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 w-96 bg-gradient-to-br from-blue-900/95 to-blue-950/95 backdrop-blur-xl border border-blue-700/50 rounded-2xl shadow-2xl p-6 z-50 transition-all duration-300 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <CheckCircle className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{activeGuide.title}</h3>
            <p className="text-xs text-blue-300">Quick Guide</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 hover:bg-blue-800/50 rounded-lg transition-colors text-gray-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <p className="text-gray-200 text-sm leading-relaxed mb-4">{activeGuide.description}</p>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleComplete}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm"
        >
          Got it
        </button>
        <button
          onClick={handleDismiss}
          className="px-4 py-2 text-gray-300 hover:text-white transition-colors text-sm"
        >
          Dismiss
        </button>
      </div>

      {/* Indicator dot */}
      <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-pulse" />
    </div>
  );
}
