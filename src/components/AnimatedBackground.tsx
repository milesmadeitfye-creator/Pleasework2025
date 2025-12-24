export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      {/* Base gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#080810] via-[#0a0a1f] to-[#0f1020]" />

      {/* Animated gradient orbs */}
      <div className="absolute inset-0">
        {/* Large blue orb - top left */}
        <div
          className="absolute w-[600px] h-[600px] md:w-[1000px] md:h-[1000px] -top-48 -left-48 md:-top-96 md:-left-96 rounded-full blur-3xl animate-wave"
          style={{
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.6) 0%, rgba(59, 130, 246, 0.3) 40%, transparent 70%)',
          }}
        />

        {/* Medium blue orb - top right */}
        <div
          className="absolute w-[500px] h-[500px] md:w-[800px] md:h-[800px] -top-32 -right-32 md:-top-64 md:-right-64 rounded-full blur-3xl animate-wave-reverse"
          style={{
            background: 'radial-gradient(circle, rgba(96, 165, 250, 0.5) 0%, rgba(96, 165, 250, 0.2) 40%, transparent 70%)',
            animationDelay: '2s',
          }}
        />

        {/* Large blue orb - center */}
        <div
          className="absolute w-[700px] h-[700px] md:w-[1200px] md:h-[1200px] top-1/3 left-1/2 -translate-x-1/2 rounded-full blur-3xl animate-float"
          style={{
            background: 'radial-gradient(circle, rgba(37, 99, 235, 0.4) 0%, rgba(37, 99, 235, 0.2) 40%, transparent 70%)',
            animationDelay: '4s',
          }}
        />

        {/* Bottom left accent */}
        <div
          className="absolute w-[550px] h-[550px] md:w-[900px] md:h-[900px] -bottom-48 -left-32 md:-bottom-96 md:-left-64 rounded-full blur-3xl animate-wave"
          style={{
            background: 'radial-gradient(circle, rgba(30, 58, 138, 0.7) 0%, rgba(30, 58, 138, 0.4) 40%, transparent 70%)',
            animationDelay: '1s',
          }}
        />

        {/* Bottom right accent */}
        <div
          className="absolute w-[500px] h-[500px] md:w-[800px] md:h-[800px] -bottom-32 -right-24 md:-bottom-64 md:-right-48 rounded-full blur-3xl animate-wave-reverse"
          style={{
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.6) 0%, rgba(59, 130, 246, 0.3) 40%, transparent 70%)',
            animationDelay: '3s',
          }}
        />
      </div>

      {/* Animated wave SVG overlay */}
      <div className="absolute inset-0 opacity-10">
        <svg
          className="absolute bottom-0 w-full h-full"
          viewBox="0 0 1440 800"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="wave-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'rgb(59, 130, 246)', stopOpacity: 0.2 }} />
              <stop offset="100%" style={{ stopColor: 'rgb(37, 99, 235)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          {/* Wave 1 */}
          <path
            fill="url(#wave-gradient)"
            d="M0,400 C320,300 420,500 720,400 C1020,300 1120,500 1440,400 L1440,800 L0,800 Z"
            className="animate-wave"
            style={{ animationDuration: '20s' }}
          />

          {/* Wave 2 */}
          <path
            fill="url(#wave-gradient)"
            d="M0,500 C360,450 480,550 840,500 C1140,450 1260,550 1440,500 L1440,800 L0,800 Z"
            className="animate-wave-reverse"
            style={{ animationDuration: '15s', opacity: 0.5 }}
          />

          {/* Wave 3 */}
          <path
            fill="url(#wave-gradient)"
            d="M0,600 C240,550 360,650 720,600 C1080,550 1200,650 1440,600 L1440,800 L0,800 Z"
            className="animate-wave"
            style={{ animationDuration: '25s', opacity: 0.3 }}
          />
        </svg>
      </div>

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Noise texture for depth */}
      <div
        className="absolute inset-0 opacity-20 mix-blend-soft-light"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
