import { motion } from 'framer-motion';
import { memo } from 'react';

type MotionMode = 'off' | 'lite' | 'full';

type FeatureGridProps = {
  motionMode?: MotionMode;
};

const features = [
  {
    title: 'Smart Links',
    description: 'One link, all platforms + pixel tracking',
    visual: (
      <svg viewBox="0 0 120 80" className="w-full h-20">
        {[0, 1, 2, 3].map((i) => (
          <motion.rect
            key={i}
            x={10 + i * 27}
            y={20}
            width={22}
            height={40}
            rx={4}
            fill="url(#linkGradient)"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          />
        ))}
        <defs>
          <linearGradient id="linkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.8" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    title: 'Live Analytics',
    description: 'Cross-platform insights in real-time',
    visual: (
      <svg viewBox="0 0 120 80" className="w-full h-20">
        {[30, 45, 35, 55, 40, 60, 50, 70].map((height, i) => (
          <motion.rect
            key={i}
            x={8 + i * 14}
            y={70 - height}
            width={10}
            height={height}
            rx={2}
            fill="url(#chartGradient)"
            initial={{ height: 0, y: 70 }}
            animate={{ height, y: 70 - height }}
            transition={{ duration: 0.8, delay: i * 0.08 }}
          />
        ))}
        <defs>
          <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    title: 'Audio Waveform',
    description: 'Visualize your tracks instantly',
    visual: (
      <svg viewBox="0 0 120 80" className="w-full h-20">
        <motion.path
          d={`M 0 40 ${Array.from({ length: 30 }, (_, i) => {
            const x = i * 4;
            const y = 40 + Math.sin(i * 0.5) * (15 + Math.random() * 10);
            return `L ${x} ${y}`;
          }).join(' ')}`}
          stroke="#60a5fa"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, ease: 'easeInOut' }}
        />
        <motion.path
          d={`M 0 40 ${Array.from({ length: 30 }, (_, i) => {
            const x = i * 4;
            const y = 40 - Math.sin(i * 0.5) * (15 + Math.random() * 10);
            return `L ${x} ${y}`;
          }).join(' ')}`}
          stroke="#3b82f6"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, ease: 'easeInOut', delay: 0.2 }}
        />
      </svg>
    ),
  },
  {
    title: 'Schedule Posts',
    description: 'Calendar view + auto-posting',
    visual: (
      <svg viewBox="0 0 120 80" className="w-full h-20">
        <rect x="10" y="10" width="100" height="60" rx="4" fill="none" stroke="#60a5fa" strokeOpacity="0.3" strokeWidth="1" />
        {/* Grid lines */}
        {[1, 2, 3, 4].map((i) => (
          <line key={`v${i}`} x1={10 + i * 20} y1="10" x2={10 + i * 20} y2="70" stroke="#60a5fa" strokeOpacity="0.2" strokeWidth="1" />
        ))}
        {[1, 2].map((i) => (
          <line key={`h${i}`} x1="10" y1={10 + i * 20} x2="110" y2={10 + i * 20} stroke="#60a5fa" strokeOpacity="0.2" strokeWidth="1" />
        ))}
        {/* Events */}
        {[[25, 25, 15, 8], [55, 35, 20, 8], [35, 55, 25, 8]].map(([x, y, w, h], i) => (
          <motion.rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={h}
            rx={2}
            fill="#60a5fa"
            fillOpacity="0.6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4, delay: 0.5 + i * 0.1 }}
          />
        ))}
      </svg>
    ),
  },
  {
    title: 'Email Builder',
    description: 'Drag-drop templates + AI writing',
    visual: (
      <svg viewBox="0 0 120 80" className="w-full h-20">
        <rect x="20" y="15" width="80" height="50" rx="4" fill="none" stroke="#60a5fa" strokeOpacity="0.4" strokeWidth="1.5" />
        <motion.rect
          x="25" y="20" width="30" height="4" rx="2" fill="#60a5fa" fillOpacity="0.6"
          initial={{ width: 0 }} animate={{ width: 30 }} transition={{ duration: 0.6, delay: 0.3 }}
        />
        <motion.rect
          x="25" y="28" width="50" height="3" rx="1.5" fill="#60a5fa" fillOpacity="0.4"
          initial={{ width: 0 }} animate={{ width: 50 }} transition={{ duration: 0.6, delay: 0.5 }}
        />
        <motion.rect
          x="25" y="34" width="45" height="3" rx="1.5" fill="#60a5fa" fillOpacity="0.4"
          initial={{ width: 0 }} animate={{ width: 45 }} transition={{ duration: 0.6, delay: 0.7 }}
        />
        <motion.rect
          x="25" y="45" width="35" height="8" rx="4" fill="#60a5fa" fillOpacity="0.7"
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.4, delay: 0.9 }}
        />
        {/* Shimmer effect */}
        <motion.rect
          x="0" y="0" width="120" height="80" fill="url(#shimmer)"
          initial={{ x: -120 }} animate={{ x: 120 }} transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1 }}
        />
        <defs>
          <linearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0" />
            <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    title: 'Split Contracts',
    description: 'Digital agreements + signatures',
    visual: (
      <svg viewBox="0 0 120 80" className="w-full h-20">
        {/* Document */}
        <rect x="30" y="10" width="60" height="60" rx="3" fill="none" stroke="#60a5fa" strokeOpacity="0.4" strokeWidth="1.5" />
        {/* Lines */}
        {[20, 28, 36, 44].map((y, i) => (
          <motion.line
            key={i}
            x1="38" y1={y} x2="82" y2={y}
            stroke="#60a5fa" strokeOpacity="0.4" strokeWidth="1.5"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          />
        ))}
        {/* Signature */}
        <motion.path
          d="M 38 55 Q 45 50, 52 55 T 68 55 Q 73 52, 78 55"
          stroke="#60a5fa"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, delay: 0.6, ease: 'easeInOut' }}
        />
        {/* Checkmark */}
        <motion.circle
          cx="82" cy="62" r="6" fill="none" stroke="#60a5fa" strokeWidth="1.5"
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.3, delay: 1.5 }}
        />
        <motion.path
          d="M 79 62 L 81 64 L 85 60"
          stroke="#60a5fa" strokeWidth="1.5" fill="none" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, delay: 1.7 }}
        />
      </svg>
    ),
  },
];

const FeatureGrid = memo(function FeatureGrid({ motionMode = 'full' }: FeatureGridProps) {
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
          Everything you need
        </h2>
        <p className="text-lg text-white/60 max-w-2xl mx-auto">
          Built-in tools that actually work together
        </p>
      </motion.div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, index) => (
          shouldAnimate && motionMode === 'full' ? (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.06, ease: [0.4, 0, 0.2, 1] }}
              className="group glass-card-hover bg-gradient-to-br from-[#1e293b]/60 to-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-[#60a5fa]/30 transition-colors"
            >
              <div className="mb-4 overflow-hidden rounded-lg">
                {feature.visual}
              </div>
              <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
              <p className="text-sm text-white/60">{feature.description}</p>
            </motion.div>
          ) : (
            <div key={feature.title} className="glass-card-hover bg-[#1e293b]/80 border border-white/20 rounded-2xl p-6">
              <div className="mb-4 overflow-hidden rounded-lg opacity-70">
                {feature.visual}
              </div>
              <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
              <p className="text-sm text-white/60">{feature.description}</p>
            </div>
          )
        ))}
      </div>
    </section>
  );
});

export default FeatureGrid;
