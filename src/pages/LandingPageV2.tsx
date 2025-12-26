import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';
import { useMotionPolicy } from '../hooks/useMotionPolicy';
import HeroShowcase from '../components/landing/HeroShowcase';
import Pricing from '../components/landing/Pricing';
import GhosteAiTry from '../components/landing/GhosteAiTry';
const UseCases = lazy(() => import('../components/landing/UseCases'));
const WalkthroughDemo = lazy(() => import('../components/landing/WalkthroughDemo'));
const FeatureGrid = lazy(() => import('../components/landing/FeatureGrid'));
const FAQ = lazy(() => import('../components/landing/FAQ'));

export default function LandingPageV2() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { mode: motionMode, isMobile } = useMotionPolicy();
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // DO NOT auto-redirect logged-in users - this causes redirect loops
  // when authenticated users hit the catch-all route or visit landing page directly
  // Instead, let them see the landing page with a "Go to Dashboard" button

  useEffect(() => {
    const handleScroll = () => {
      setShowStickyCTA(window.scrollY > 800);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleStartTrial = () => {
    if (user) {
      navigate('/dashboard/overview');
    } else {
      navigate('/auth?mode=signup');
    }
  };

  const handleSignIn = () => {
    if (user) {
      navigate('/dashboard/overview');
    } else {
      navigate('/auth?mode=signin');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white relative overflow-hidden">
      {/* Grain Overlay - desktop only */}
      {motionMode === 'full' && (
        <div className="fixed inset-0 pointer-events-none opacity-[0.06] z-50 mix-blend-overlay">
          <svg className="w-full h-full">
            <filter id="noise">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" />
            </filter>
            <rect width="100%" height="100%" filter="url(#noise)" />
          </svg>
        </div>
      )}

      {/* Background - adaptive based on motion mode */}
      <div className="fixed inset-0 pointer-events-none decorOverlay">
        {motionMode === 'lite' ? (
          <>
            {/* Mobile: subtle breathing gradient - opacity only, no transforms */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[#60a5fa]/8 rounded-full animate-breathing pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-br from-[#60a5fa]/10 via-transparent to-[#0a0e1a] pointer-events-none" />
          </>
        ) : motionMode === 'off' ? (
          <>
            {/* No motion: fully static */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[#60a5fa]/8 rounded-full" />
            <div className="absolute inset-0 bg-gradient-to-br from-[#60a5fa]/10 via-transparent to-[#0a0e1a]" />
          </>
        ) : (
          <>
            {/* Rich animated background for desktop */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-[#60a5fa]/10 rounded-full blur-[150px] animate-pulse-slow" />
            <div className="absolute top-1/2 right-0 w-[800px] h-[800px] bg-[#60a5fa]/8 rounded-full blur-[140px] animate-pulse-slow" style={{ animationDelay: '4s' }} />
            <div className="absolute bottom-0 left-0 w-[900px] h-[900px] bg-[#60a5fa]/8 rounded-full blur-[140px] animate-pulse-slow" style={{ animationDelay: '2s' }} />
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#60a5fa]/20 via-transparent to-[#60a5fa]/10 animate-gradient-shift" />
            </div>
            <svg className="absolute inset-0 w-full h-full opacity-40" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
              <defs>
                <linearGradient id="wave-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.08" />
                </linearGradient>
              </defs>
              <g>
                <path
                  d="M0,100 C150,80 350,120 500,100 C650,80 850,120 1000,100 L1000,200 L0,200 Z"
                  fill="url(#wave-gradient)"
                  opacity="0.3"
                >
                  <animate
                    attributeName="d"
                    dur="20s"
                    repeatCount="indefinite"
                    values="
                      M0,100 C150,80 350,120 500,100 C650,80 850,120 1000,100 L1000,200 L0,200 Z;
                      M0,120 C150,100 350,80 500,100 C650,120 850,80 1000,100 L1000,200 L0,200 Z;
                      M0,100 C150,80 350,120 500,100 C650,80 850,120 1000,100 L1000,200 L0,200 Z
                    "
                  />
                </path>
              </g>
            </svg>
          </>
        )}
      </div>

      {/* Header */}
      <header className="relative z-10 container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between">
          <div className="text-xl sm:text-2xl font-black tracking-tight">GHOSTE</div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <button
              onClick={handleSignIn}
              className="text-sm font-semibold text-white/80 hover:text-white transition"
            >
              Sign in
            </button>
            <button
              onClick={handleStartTrial}
              className="bg-[#60a5fa] hover:bg-[#3b82f6] text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-all hover:shadow-lg hover:shadow-[#60a5fa]/30"
            >
              {user ? 'Go to Dashboard' : 'Get started'}
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-white p-2"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/80 z-[9998] md:hidden"
            />

            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-x-0 top-0 z-[9999] md:hidden bg-[#0a0e1a] border-b-2 border-[#60a5fa]/50 shadow-2xl"
            >
              <div className="flex items-center justify-between px-6 py-6 border-b border-white/20 bg-black/40">
                <div className="text-2xl font-black tracking-tight text-white">GHOSTE</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileMenuOpen(false);
                  }}
                  className="text-white hover:text-[#60a5fa] transition-colors p-2 hover:bg-white/10 rounded-lg"
                >
                  <X className="w-7 h-7" />
                </button>
              </div>

              <div className="px-6 py-10 space-y-5 bg-gradient-to-b from-[#0a0e1a] to-[#060913]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSignIn();
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-center bg-white/10 hover:bg-white/20 text-white transition-all py-5 px-6 rounded-2xl font-bold text-xl border border-white/20 hover:border-white/40"
                >
                  Sign in
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartTrial();
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-center bg-[#60a5fa] hover:bg-[#3b82f6] text-white font-bold py-5 px-6 rounded-2xl text-xl shadow-xl"
                >
                  {user ? 'Go to Dashboard' : 'Get started'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </header>

      {/* Main Content */}
      <main style={{ contain: 'layout style' }} className="pagePadForSticky">
        <HeroShowcase
          onStartTrial={handleStartTrial}
          onSignIn={handleSignIn}
          motionMode={motionMode}
        />

        {/* Test Ghoste AI */}
        <section className="relative z-10 container mx-auto px-4 sm:px-6 py-6">
          <GhosteAiTry />
        </section>

        <Suspense fallback={<div className="h-96" />}>
          <UseCases motionMode={motionMode} />
        </Suspense>
        <Suspense fallback={<div className="h-96" />}>
          <WalkthroughDemo motionMode={motionMode} />
        </Suspense>
        <Suspense fallback={<div className="h-96" />}>
          <FeatureGrid motionMode={motionMode} />
        </Suspense>
        <Pricing
          onStartTrial={handleStartTrial}
        />
        <Suspense fallback={<div className="h-64" />}>
          <FAQ />
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-12">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-2xl font-black tracking-tight">GHOSTE</div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/60">
              <a href="/privacy" className="hover:text-white transition">Privacy</a>
              <a href="/terms" className="hover:text-white transition">Terms</a>
              <a href="mailto:support@ghoste.one" className="hover:text-white transition">Support</a>
            </div>
            <div className="text-sm text-white/40">
              © 2024 Ghoste. All rights reserved.
            </div>
          </div>
        </div>
      </footer>

      {/* Sticky CTA Bar - Desktop */}
      {showStickyCTA && !isMobile && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={`fixed bottom-0 inset-x-0 z-50 bg-[#0a0e1a]/95 ${motionMode === 'full' ? 'backdrop-blur-xl' : ''} border-t border-white/10 py-4 shadow-2xl`}
        >
          <div className="container mx-auto px-4 sm:px-6 flex items-center justify-between">
            <div className="hidden sm:block">
              <div className="font-bold">Ready to grow your music career?</div>
              <div className="text-sm text-white/60">Join Ghoste today</div>
            </div>
            <button
              onClick={handleStartTrial}
              className="bg-[#60a5fa] hover:bg-[#3b82f6] text-white font-bold px-8 py-3 rounded-xl transition-all hover:shadow-xl hover:shadow-[#60a5fa]/30 w-full sm:w-auto"
            >
              {user ? 'Go to Dashboard' : 'Get started'}
            </button>
          </div>
        </motion.div>
      )}

      {/* Sticky CTA Bar - Mobile Only with iOS Safe Area */}
      {showStickyCTA && isMobile && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="mobileStickyCta"
        >
          <button
            onClick={handleStartTrial}
            className="bg-[#60a5fa] hover:bg-[#3b82f6] text-white font-bold px-8 py-3 rounded-xl transition-all hover:shadow-xl hover:shadow-[#60a5fa]/30 w-full"
          >
            {user ? 'Go to Dashboard' : 'Get started'}
          </button>
        </motion.div>
      )}
    </div>
  );
}
