import { useState, useEffect, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, Search, Calendar, TrendingUp, Check } from 'lucide-react';

type MotionMode = 'off' | 'lite' | 'full';

type WalkthroughDemoProps = {
  motionMode?: MotionMode;
};

const steps = [
  {
    id: 1,
    icon: Link2,
    title: 'Paste your song link',
    description: 'Drop any streaming link — Spotify, Apple Music, YouTube',
    mockUI: (
      <div className="space-y-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-xs text-white/40 mb-2">Song URL</div>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 1 }}
            className="text-sm text-white/70 font-mono overflow-hidden whitespace-nowrap"
          >
            https://open.spotify.com/track/3n3Ppam...
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 1 }}
          className="bg-[#60a5fa]/10 border border-[#60a5fa]/30 rounded-xl p-3 flex items-center gap-2"
        >
          <div className="w-6 h-6 bg-[#60a5fa] rounded-full flex items-center justify-center">
            <Check className="w-4 h-4 text-white" />
          </div>
          <div className="text-sm text-[#60a5fa] font-medium">Link detected</div>
        </motion.div>
      </div>
    ),
  },
  {
    id: 2,
    icon: Search,
    title: 'Ghoste resolves platforms',
    description: 'Auto-finds all streaming links + adds pixel tracking',
    mockUI: (
      <div className="space-y-3">
        {['Spotify', 'Apple Music', 'YouTube Music', 'Tidal', 'Deezer'].map((platform, i) => (
          <motion.div
            key={platform}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.4, delay: i * 0.2 }}
            className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-[#60a5fa]/30 to-[#3b82f6]/30 rounded-lg" />
              <span className="text-sm font-medium">{platform}</span>
            </div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3, delay: i * 0.2 + 0.3 }}
              className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
            >
              <Check className="w-3 h-3 text-white" />
            </motion.div>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.2 }}
          className="bg-[#60a5fa]/10 border border-[#60a5fa]/30 rounded-lg p-2 text-center"
        >
          <div className="text-xs text-[#60a5fa] font-medium">Meta Pixel tracking enabled</div>
        </motion.div>
      </div>
    ),
  },
  {
    id: 3,
    icon: Calendar,
    title: 'Create content + schedule',
    description: 'AI generates posts, stories, and email campaigns',
    mockUI: (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {['Instagram Story', 'TikTok Promo', 'Email Blast', 'Twitter Thread'].map((content, i) => (
            <motion.div
              key={content}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: i * 0.15 }}
              className="bg-gradient-to-br from-[#1e293b]/80 to-[#0f172a]/90 border border-white/10 rounded-lg p-3"
            >
              <div className="w-full h-20 bg-gradient-to-br from-[#60a5fa]/20 to-[#3b82f6]/20 rounded-lg mb-2" />
              <div className="text-xs font-medium">{content}</div>
              <div className="text-xs text-white/40 mt-1">Tomorrow 6pm</div>
            </motion.div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 4,
    icon: TrendingUp,
    title: 'Launch + measure results',
    description: 'Real-time analytics across all platforms',
    mockUI: (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Clicks', value: '2.4K', change: '+18%' },
            { label: 'Conversions', value: '340', change: '+24%' },
            { label: 'Revenue', value: '$890', change: '+12%' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-white/5 border border-white/10 rounded-lg p-3"
            >
              <div className="text-xs text-white/40">{stat.label}</div>
              <div className="text-lg font-bold mt-1">{stat.value}</div>
              <div className="text-xs text-[#60a5fa] font-medium mt-1">{stat.change}</div>
            </motion.div>
          ))}
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="flex items-end justify-between h-24 gap-1">
            {[20, 35, 28, 45, 38, 55, 48, 65, 58, 75].map((height, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.05 }}
                className="flex-1 bg-gradient-to-t from-[#60a5fa] to-[#3b82f6] rounded-t"
              />
            ))}
          </div>
        </div>
      </div>
    ),
  },
];

const WalkthroughDemo = memo(function WalkthroughDemo({ motionMode = 'full' }: WalkthroughDemoProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const shouldAnimate = motionMode !== 'off';
  const isAutoLoop = motionMode === 'full';

  useEffect(() => {
    // Only auto-loop on desktop (full mode)
    if (!isAutoLoop) return;

    const interval = setInterval(() => {
      // Pause if tab not visible
      if (document.hidden) return;
      setCurrentStep((prev) => (prev + 1) % steps.length);
    }, 5000);

    // Handle visibility change - clear interval when tab hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(interval);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAutoLoop]);

  const step = steps[currentStep];
  const Icon = step.icon;

  return (
    <section className="relative z-10 container mx-auto px-4 sm:px-6 py-16 sm:py-24" style={{ contain: 'layout style' }}>
      <motion.div
        initial={shouldAnimate ? { opacity: 0, y: 10 } : false}
        whileInView={shouldAnimate ? { opacity: 1, y: 0 } : {}}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl sm:text-4xl font-black mb-4">
          Ghoste in motion
        </h2>
        <p className="text-lg text-white/60 max-w-2xl mx-auto">
          {motionMode === 'lite' ? 'Tap to preview steps' : 'Watch how a song becomes a full campaign in 30 seconds'}
        </p>
      </motion.div>

      <div className="max-w-5xl mx-auto">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-12">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <motion.div
                className={`relative flex items-center justify-center w-12 h-12 rounded-full border-2 transition-colors ${
                  i === currentStep
                    ? 'border-[#60a5fa] bg-[#60a5fa]/20'
                    : i < currentStep
                    ? 'border-[#60a5fa] bg-[#60a5fa]'
                    : 'border-white/20 bg-white/5'
                }`}
                animate={{
                  scale: i === currentStep ? [1, 1.1, 1] : 1,
                }}
                transition={{ duration: 0.5 }}
              >
                {i < currentStep ? (
                  <Check className="w-5 h-5 text-white" />
                ) : (
                  <div className={`text-sm font-bold ${i === currentStep ? 'text-[#60a5fa]' : 'text-white/40'}`}>
                    {i + 1}
                  </div>
                )}
              </motion.div>
              {i < steps.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 bg-white/10 relative overflow-hidden">
                  <motion.div
                    className="absolute inset-0 bg-[#60a5fa]"
                    initial={{ width: 0 }}
                    animate={{ width: i < currentStep ? '100%' : i === currentStep ? '50%' : 0 }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* Left: Step Info */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-[#60a5fa]/20 rounded-2xl flex items-center justify-center">
                  <Icon className="w-8 h-8 text-[#60a5fa]" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{step.title}</div>
                  <div className="text-white/60">{step.description}</div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Right: Mock UI */}
          {shouldAnimate && motionMode === 'full' ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                className="bg-gradient-to-br from-[#1e293b]/60 to-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
              >
                {step.mockUI}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="bg-[#1e293b]/80 border border-white/20 rounded-2xl p-6">
              {step.mockUI}
            </div>
          )}
        </div>

        {/* Progress Dots */}
        <div className="flex items-center justify-center gap-2 mt-8">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrentStep(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === currentStep ? 'bg-[#60a5fa] w-8' : 'bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
});

export default WalkthroughDemo;
