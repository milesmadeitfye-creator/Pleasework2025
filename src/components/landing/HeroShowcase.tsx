import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, Link2, BarChart3 } from 'lucide-react';
import { memo } from 'react';

type MotionMode = 'off' | 'lite' | 'full';

type HeroShowcaseProps = {
  onStartTrial: () => void;
  onSignIn: () => void;
  motionMode?: MotionMode;
};

const HeroShowcase = memo(function HeroShowcase({ onStartTrial, onSignIn, motionMode = 'full' }: HeroShowcaseProps) {
  const shouldAnimate = motionMode !== 'off';
  return (
    <section className="relative z-10 container mx-auto px-4 sm:px-6 py-12 sm:py-20">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Left: Headline + CTAs with glass entrance */}
        <motion.div
          initial={shouldAnimate ? { opacity: 0, y: 10 } : false}
          animate={shouldAnimate ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-6">
            Your music career,
            <br />
            <span className="bg-gradient-to-r from-[#60a5fa] via-[#3b82f6] to-[#2563eb] bg-clip-text text-transparent">
              operated like a business
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/70 mb-8 max-w-xl">
            Launch smarter. Track everything. Grow faster. One command center for independent artists and managers.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={onStartTrial}
              className="glass-button bg-[#60a5fa] hover:bg-[#3b82f6] text-white font-bold px-8 py-4 rounded-xl text-base hover:shadow-xl hover:shadow-[#60a5fa]/30"
            >
              Start 7-day trial — $59/mo
            </button>
            <button
              onClick={onSignIn}
              className="glass-button bg-white/5 hover:bg-white/10 text-white font-semibold px-8 py-4 rounded-xl text-base border border-white/10"
            >
              Sign in
            </button>
          </div>
          <p className="text-sm text-white/50 mt-4">
            Founding member pricing • Cancel anytime • No credit card for trial
          </p>
        </motion.div>

        {/* Right: Product Vignette with glass scale-in */}
        <motion.div
          initial={shouldAnimate ? { opacity: 0, scale: 0.98 } : false}
          animate={shouldAnimate ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
          className="relative h-[400px] lg:h-[500px]"
        >
          {motionMode === 'lite' || motionMode === 'off' ? (
            /* Simplified vignette for mobile/reduced motion */
            <>
            {/* Main Studio Card - static */}
            <div className="absolute top-0 left-0 w-72 bg-[#1e293b]/90 border border-white/20 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[#60a5fa]/20 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-[#60a5fa]" />
                </div>
                <div>
                  <div className="text-sm font-bold">Ghoste Studio</div>
                  <div className="text-xs text-white/50">Campaign ready</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#60a5fa] to-[#3b82f6] w-3/4" />
                </div>
                <div className="text-xs text-white/40">Track resolved • Pixels firing</div>
              </div>
            </div>

            {/* Mini Cards - static */}
            <div className="absolute bottom-0 right-0 w-48 bg-[#1e293b]/90 border border-white/20 rounded-xl p-3 shadow-xl">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-[#60a5fa]" />
                <div className="text-xs font-semibold">Campaign Live</div>
              </div>
              <div className="flex items-end justify-between h-12 gap-1">
                {[40, 65, 45, 80, 55, 90, 70].map((height, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-[#60a5fa] to-[#3b82f6] rounded-t"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="text-xs text-white/50">Reach</div>
                <div className="text-xs font-bold text-[#60a5fa]">+340%</div>
              </div>
            </div>

            <div className="absolute top-28 right-0 w-56 bg-[#1e293b]/90 border border-white/20 rounded-xl p-3 shadow-xl">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="w-3 h-3 text-[#60a5fa]" />
                <div className="text-xs font-semibold">Smart Link</div>
              </div>
              <div className="space-y-1.5">
                {['Spotify', 'Apple Music', 'YouTube'].map((platform) => (
                  <div key={platform} className="flex items-center justify-between text-xs bg-white/5 rounded-lg p-2">
                    <span className="text-white/70">{platform}</span>
                    <div className="w-1.5 h-1.5 bg-[#60a5fa] rounded-full" />
                  </div>
                ))}
              </div>
            </div>
            </>
          ) : (
            /* Rich animated vignette for desktop - lite animations */
            <>
          {/* Floating Ghoste Studio Card */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="absolute top-0 left-0 w-72 bg-gradient-to-br from-[#1e293b]/80 to-[#0f172a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#60a5fa]/20 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#60a5fa]" />
              </div>
              <div>
                <div className="text-sm font-bold">Ghoste Studio</div>
                <div className="text-xs text-white/50">Campaign ready</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#60a5fa] to-[#3b82f6]"
                  initial={{ width: 0 }}
                  animate={{ width: '75%' }}
                  transition={{ duration: 1.5, delay: 0.8 }}
                />
              </div>
              <div className="text-xs text-white/40">Track resolved • Pixels firing</div>
            </div>
          </motion.div>

          {/* My Manager Chat Bubble */}
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="absolute top-24 right-0 w-80 bg-gradient-to-br from-[#1e293b]/90 to-[#0f172a]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-[#60a5fa] to-[#3b82f6] rounded-full flex items-center justify-center text-xs font-bold">
                AI
              </div>
              <div className="text-sm font-semibold">My Manager</div>
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="space-y-3"
            >
              <div className="text-xs text-white/70 bg-white/5 rounded-lg p-3">
                Your "Summer Nights" link has 2.4K clicks this week but no conversion tracking.
              </div>
              <div className="text-xs text-white/70 bg-white/5 rounded-lg p-3">
                I can set up Meta Pixel + CAPI in 3 clicks. Ready?
              </div>
              <div className="flex gap-2">
                <div className="text-xs bg-[#60a5fa]/20 text-[#60a5fa] px-3 py-1.5 rounded-lg font-medium">
                  Set up tracking
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Smart Link Mini Preview */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="absolute bottom-32 left-4 w-64 bg-gradient-to-br from-[#1e293b]/80 to-[#0f172a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl"
          >
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="w-4 h-4 text-[#60a5fa]" />
              <div className="text-xs font-semibold">Smart Link</div>
            </div>
            <div className="space-y-2">
              {['Spotify', 'Apple Music', 'YouTube'].map((platform, i) => (
                <motion.div
                  key={platform}
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 1 + i * 0.1 }}
                  className="flex items-center justify-between text-xs bg-white/5 rounded-lg p-2"
                >
                  <span className="text-white/70">{platform}</span>
                  <motion.div
                    className="w-2 h-2 bg-[#60a5fa] rounded-full"
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Campaign Card with Chart */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 1 }}
            className="absolute bottom-0 right-0 w-56 bg-gradient-to-br from-[#1e293b]/80 to-[#0f172a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl"
          >
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-[#60a5fa]" />
              <div className="text-xs font-semibold">Campaign Live</div>
            </div>
            <div className="flex items-end justify-between h-16 gap-1">
              {[40, 65, 45, 80, 55, 90, 70].map((height, i) => (
                <motion.div
                  key={i}
                  className="flex-1 bg-gradient-to-t from-[#60a5fa] to-[#3b82f6] rounded-t"
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ duration: 0.8, delay: 1.2 + i * 0.1 }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="text-xs text-white/50">Reach</div>
              <div className="text-xs font-bold text-[#60a5fa]">+340%</div>
            </div>
          </motion.div>

          {/* Subtle floating accent - only ONE particle for lite CPU usage */}
          <motion.div
            className="absolute w-1 h-1 bg-[#60a5fa]/40 rounded-full"
            style={{ left: '30%', top: '20%' }}
            animate={{
              y: [0, -15, 0],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
});

export default HeroShowcase;
