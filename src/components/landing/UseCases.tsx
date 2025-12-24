import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, Users, Target } from 'lucide-react';

type MotionMode = 'off' | 'lite' | 'full';

type UseCasesProps = {
  motionMode?: MotionMode;
};

const useCases = [
  {
    id: 'launch',
    icon: Rocket,
    title: 'Launch a song',
    description: 'Turn releases into campaigns',
    mockUI: (
      <div className="space-y-3">
        <div className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
          <div className="w-12 h-12 bg-gradient-to-br from-[#60a5fa] to-[#3b82f6] rounded-lg" />
          <div className="flex-1">
            <div className="text-sm font-semibold">Summer Nights</div>
            <div className="text-xs text-white/50">Smart Link → Presave → Launch</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/5 rounded-lg p-2 text-center">
            <div className="text-sm font-bold text-[#60a5fa]">1.2K</div>
            <div className="text-xs text-white/40">Presaves</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2 text-center">
            <div className="text-sm font-bold text-[#60a5fa]">340</div>
            <div className="text-xs text-white/40">Emails</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2 text-center">
            <div className="text-sm font-bold text-[#60a5fa]">2.4K</div>
            <div className="text-xs text-white/40">Clicks</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'grow',
    icon: Users,
    title: 'Grow fans',
    description: 'Build & own your audience',
    mockUI: (
      <div className="space-y-3">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-white/50">Email list</div>
            <div className="text-xs font-bold text-[#60a5fa]">+18% this week</div>
          </div>
          <div className="h-16 flex items-end gap-1">
            {[30, 45, 35, 50, 40, 60, 55, 70].map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-[#60a5fa]/60 to-[#60a5fa] rounded-t"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 bg-white/5 rounded-lg p-2">
            <div className="text-xs text-white/40">Mailchimp</div>
            <div className="text-sm font-semibold">Synced</div>
          </div>
          <div className="flex-1 bg-white/5 rounded-lg p-2">
            <div className="text-xs text-white/40">Segments</div>
            <div className="text-sm font-semibold">4 active</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'ads',
    icon: Target,
    title: 'Run ads smarter',
    description: 'Meta campaigns + AI optimization',
    mockUI: (
      <div className="space-y-3">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold">Campaign Active</div>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-white/40">Spend</div>
              <div className="text-sm font-bold">$240</div>
            </div>
            <div>
              <div className="text-xs text-white/40">CPC</div>
              <div className="text-sm font-bold text-[#60a5fa]">$0.18</div>
            </div>
            <div>
              <div className="text-xs text-white/40">Reach</div>
              <div className="text-sm font-bold">12.4K</div>
            </div>
            <div>
              <div className="text-xs text-white/40">Clicks</div>
              <div className="text-sm font-bold text-[#60a5fa]">1,340</div>
            </div>
          </div>
        </div>
        <div className="bg-[#60a5fa]/10 border border-[#60a5fa]/20 rounded-lg p-2">
          <div className="text-xs text-[#60a5fa] font-medium">AI: Increase budget 20% for optimal reach</div>
        </div>
      </div>
    ),
  },
];

const UseCases = memo(function UseCases({ motionMode = 'full' }: UseCasesProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const shouldAnimate = motionMode !== 'off';

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
          One platform. Every move.
        </h2>
        <p className="text-lg text-white/60 max-w-2xl mx-auto">
          From release to reach, operate your entire music business from one command center.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-3 gap-6">
        {useCases.map((useCase, index) => {
          const Icon = useCase.icon;
          const isExpanded = expandedId === useCase.id;

          return motionMode === 'lite' || motionMode === 'off' ? (
            <div key={useCase.id} className="relative glass-card-hover">
              <div className="bg-[#1e293b]/80 border border-white/20 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-[#60a5fa]/20 rounded-xl flex items-center justify-center">
                    <Icon className="w-6 h-6 text-[#60a5fa]" />
                  </div>
                  <div>
                    <div className="font-bold text-lg">{useCase.title}</div>
                    <div className="text-sm text-white/50">{useCase.description}</div>
                  </div>
                </div>
                {useCase.mockUI}
              </div>
            </div>
          ) : (
            <motion.div
              key={useCase.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08, ease: [0.4, 0, 0.2, 1] }}
              onHoverStart={() => setExpandedId(useCase.id)}
              onHoverEnd={() => setExpandedId(null)}
              onTouchStart={() => setExpandedId(isExpanded ? null : useCase.id)}
              className="relative cursor-pointer glass-card-hover"
            >
              <motion.div
                layout
                className="bg-gradient-to-br from-[#1e293b]/60 to-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-[#60a5fa]/30 transition-colors"
                animate={{
                  scale: isExpanded ? 1.01 : 1,
                }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              >
                <motion.div layout className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-[#60a5fa]/20 rounded-xl flex items-center justify-center">
                    <Icon className="w-6 h-6 text-[#60a5fa]" />
                  </div>
                  <div>
                    <div className="font-bold text-lg">{useCase.title}</div>
                    <div className="text-sm text-white/50">{useCase.description}</div>
                  </div>
                </motion.div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      {useCase.mockUI}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
});

export default UseCases;
