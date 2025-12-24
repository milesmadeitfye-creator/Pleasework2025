import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music, ArrowRight } from 'lucide-react';
import AnimatedBackground from './AnimatedBackground';
import { trackViewContent } from '../lib/ownerMetaPixel';
import { trackMetaEvent } from '../lib/metaTrack';

export default function MarketingLandingEnhanced() {
  const navigate = useNavigate();
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    // Track landing page view (existing pixel tracking)
    trackViewContent('Landing');

    // Track PageView via Pixel + CAPI
    trackMetaEvent('PageView');
  }, []);

  const handleSpotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!spotifyUrl.trim()) {
      setError('Please enter a Spotify URL');
      return;
    }

    if (!spotifyUrl.includes('spotify.com')) {
      setError('Please enter a valid Spotify URL');
      return;
    }

    setIsValidating(true);

    try {
      // Navigate to signup with the Spotify URL
      navigate(`/auth?mode=signup&spotify_url=${encodeURIComponent(spotifyUrl)}`);
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated Background */}
      <AnimatedBackground />

      {/* All content with proper z-index */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-black/40 backdrop-blur-xl border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">G</span>
                </div>
                <span className="text-xl font-bold text-white">Ghoste</span>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigate('/auth?mode=signin')}
                  className="px-4 py-2 text-sm font-medium text-white hover:text-blue-400 transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => navigate('/auth?mode=signup')}
                  className="px-4 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  Sign Up Free
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="flex-1 flex items-center justify-center pt-32 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-sm font-medium">
              <span>✨</span>
              <span>Join 10,000+ Artists Growing Their Careers</span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight text-white">
              Grow Your Music Career on
              <span className="block mt-2 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 bg-clip-text text-transparent">
                Autopilot
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Smart links, AI-powered content creation, and fan analytics—all in one platform.
              Connect your Spotify and start growing today.
            </p>

            {/* Spotify URL Input Form */}
            <div className="max-w-2xl mx-auto">
              <form onSubmit={handleSpotifySubmit} className="space-y-4">
                <div className="relative">
                  <Music className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={spotifyUrl}
                    onChange={(e) => setSpotifyUrl(e.target.value)}
                    placeholder="Paste your Spotify artist URL here..."
                    className="w-full pl-12 pr-4 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={isValidating}
                  className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-xl font-semibold text-lg transition-colors flex items-center justify-center gap-2 group"
                >
                  {isValidating ? (
                    'Verifying...'
                  ) : (
                    <>
                      <span>Get Started Free</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>
              <p className="text-sm text-gray-400 mt-4">
                No credit card required • Free forever • Upgrade to Pro for $19/month
              </p>
            </div>
          </div>
        </section>

        {/* Artist Success Stories */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-black/20 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
                Real Artists, Real Results
              </h2>
              <p className="text-xl text-gray-300">
                See how Ghoste helped these artists grow their streams
              </p>
            </div>

            {/* Artist Profile Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
              {/* Kyleigh */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:border-blue-400/50 transition-all">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold text-2xl">
                    K
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Kyleigh</h3>
                    <p className="text-gray-400 text-sm">Pop Artist</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Before</span>
                    <span className="text-gray-300 font-semibold">2,400 streams</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-400 to-pink-400" style={{ width: '12%' }}></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-green-400 font-semibold">After</span>
                    <span className="text-white font-bold text-2xl">20,000</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-400 to-emerald-400" style={{ width: '100%' }}></div>
                  </div>
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-green-400 font-bold text-3xl">+733%</p>
                    <p className="text-gray-400 text-sm">Stream Growth</p>
                  </div>
                </div>
              </div>

              {/* JeFo Da Kidd */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:border-blue-400/50 transition-all">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-red-400 flex items-center justify-center text-white font-bold text-2xl">
                    J
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">JeFo Da Kidd</h3>
                    <p className="text-gray-400 text-sm">Hip-Hop Artist</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Before</span>
                    <span className="text-gray-300 font-semibold">3,800 streams</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-orange-400 to-red-400" style={{ width: '15%' }}></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-green-400 font-semibold">After</span>
                    <span className="text-white font-bold text-2xl">26,000</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-400 to-emerald-400" style={{ width: '100%' }}></div>
                  </div>
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-green-400 font-bold text-3xl">+584%</p>
                    <p className="text-gray-400 text-sm">Stream Growth</p>
                  </div>
                </div>
              </div>

              {/* James Cole */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:border-blue-400/50 transition-all">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-bold text-2xl">
                    JC
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">James Cole</h3>
                    <p className="text-gray-400 text-sm">R&B Artist</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Before</span>
                    <span className="text-gray-300 font-semibold">420 streams</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-400 to-cyan-400" style={{ width: '20%' }}></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-green-400 font-semibold">After</span>
                    <span className="text-white font-bold text-2xl">2,100</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-400 to-emerald-400" style={{ width: '100%' }}></div>
                  </div>
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-green-400 font-bold text-3xl">+400%</p>
                    <p className="text-gray-400 text-sm">Stream Growth</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Testimonials */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Testimonial 1 */}
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-400 text-xl">★</span>
                  ))}
                </div>
                <p className="text-gray-300 mb-6 italic">
                  "Ghoste's smart links helped me grow my streams by 733% in just 3 months. The analytics are incredible!"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold">
                    K
                  </div>
                  <div>
                    <p className="text-white font-semibold">Kyleigh</p>
                    <p className="text-gray-400 text-sm">Pop Artist</p>
                  </div>
                </div>
              </div>

              {/* Testimonial 2 */}
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-400 text-xl">★</span>
                  ))}
                </div>
                <p className="text-gray-300 mb-6 italic">
                  "The AI content creation saves me hours every week. I can focus on making music while Ghoste handles marketing."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-400 flex items-center justify-center text-white font-bold">
                    J
                  </div>
                  <div>
                    <p className="text-white font-semibold">JeFo Da Kidd</p>
                    <p className="text-gray-400 text-sm">Hip-Hop Artist</p>
                  </div>
                </div>
              </div>

              {/* Testimonial 3 */}
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-400 text-xl">★</span>
                  ))}
                </div>
                <p className="text-gray-300 mb-6 italic">
                  "As an independent artist, Ghoste is exactly what I needed. Professional tools at an affordable price."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-bold">
                    JC
                  </div>
                  <div>
                    <p className="text-white font-semibold">James Cole</p>
                    <p className="text-gray-400 text-sm">R&B Artist</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Before & After Comparison */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
                The Ghoste Difference
              </h2>
              <p className="text-xl text-gray-300">
                See what changes when you use professional tools
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
              {/* BEFORE - Without Ghoste */}
              <div className="bg-red-500/10 backdrop-blur-sm border border-red-400/30 rounded-2xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-white">Before Ghoste</h3>
                  <span className="px-3 py-1 bg-red-500/20 text-red-300 rounded-full text-sm font-semibold">
                    Struggling
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="text-red-400 text-xl flex-shrink-0">✗</span>
                    <div>
                      <p className="text-white font-semibold">Manual Everything</p>
                      <p className="text-gray-400 text-sm">Spending hours creating content and tracking links manually</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-red-400 text-xl flex-shrink-0">✗</span>
                    <div>
                      <p className="text-white font-semibold">No Analytics</p>
                      <p className="text-gray-400 text-sm">Guessing what's working with no real data</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-red-400 text-xl flex-shrink-0">✗</span>
                    <div>
                      <p className="text-white font-semibold">Low Engagement</p>
                      <p className="text-gray-400 text-sm">Generic links getting ignored by fans</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-red-400 text-xl flex-shrink-0">✗</span>
                    <div>
                      <p className="text-white font-semibold">Wasted Ad Spend</p>
                      <p className="text-gray-400 text-sm">Running ads without proper targeting or tracking</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-red-400 text-xl flex-shrink-0">✗</span>
                    <div>
                      <p className="text-white font-semibold">Slow Growth</p>
                      <p className="text-gray-400 text-sm">Streams trickling in at 100-500/month</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-red-400 text-xl flex-shrink-0">✗</span>
                    <div>
                      <p className="text-white font-semibold">No Email List</p>
                      <p className="text-gray-400 text-sm">Missing out on building a direct connection with fans</p>
                    </div>
                  </div>
                </div>

                {/* Stats Box */}
                <div className="mt-8 p-4 bg-red-500/10 border border-red-400/30 rounded-xl">
                  <p className="text-gray-400 text-sm mb-2">Average Monthly Results</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-2xl font-bold text-red-300">300</p>
                      <p className="text-gray-400 text-sm">Streams</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-300">50</p>
                      <p className="text-gray-400 text-sm">Link Clicks</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* AFTER - With Ghoste */}
              <div className="bg-green-500/10 backdrop-blur-sm border border-green-400/30 rounded-2xl p-8 relative">
                {/* Recommended Badge */}
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-green-400 to-emerald-400 text-black text-sm font-bold rounded-full">
                  Recommended
                </div>

                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-white">After Ghoste</h3>
                  <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-sm font-semibold">
                    Thriving
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="text-green-400 text-xl flex-shrink-0">✓</span>
                    <div>
                      <p className="text-white font-semibold">AI-Powered Automation</p>
                      <p className="text-gray-300 text-sm">Generate videos, captions, and cover art in seconds</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-green-400 text-xl flex-shrink-0">✓</span>
                    <div>
                      <p className="text-white font-semibold">Advanced Analytics</p>
                      <p className="text-gray-300 text-sm">Track every click, conversion, and fan behavior</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-green-400 text-xl flex-shrink-0">✓</span>
                    <div>
                      <p className="text-white font-semibold">Smart Links That Convert</p>
                      <p className="text-gray-300 text-sm">Beautiful landing pages that drive 3x more engagement</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-green-400 text-xl flex-shrink-0">✓</span>
                    <div>
                      <p className="text-white font-semibold">Optimized Ad Campaigns</p>
                      <p className="text-gray-300 text-sm">Meta & TikTok ads managed from one dashboard</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-green-400 text-xl flex-shrink-0">✓</span>
                    <div>
                      <p className="text-white font-semibold">Explosive Growth</p>
                      <p className="text-gray-300 text-sm">Average 400-700% increase in monthly streams</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="text-green-400 text-xl flex-shrink-0">✓</span>
                    <div>
                      <p className="text-white font-semibold">Build Your Email List</p>
                      <p className="text-gray-300 text-sm">Pre-save campaigns that capture thousands of emails</p>
                    </div>
                  </div>
                </div>

                {/* Stats Box */}
                <div className="mt-8 p-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30 rounded-xl">
                  <p className="text-gray-300 text-sm mb-2">Average Monthly Results</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-3xl font-bold text-green-300">15,000+</p>
                      <p className="text-gray-300 text-sm">Streams</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-green-300">2,500+</p>
                      <p className="text-gray-300 text-sm">Link Clicks</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-green-400/30">
                    <p className="text-green-300 font-bold text-lg">+5,000% Average ROI</p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center mt-12">
              <button
                onClick={() => navigate('/auth?mode=signup')}
                className="px-8 py-4 bg-gradient-to-r from-green-400 to-emerald-400 hover:from-green-500 hover:to-emerald-500 text-black font-bold text-lg rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-green-500/20"
              >
                Start Your Transformation Today
              </button>
              <p className="text-gray-400 text-sm mt-4">
                Join 10,000+ artists who made the switch
              </p>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-black/20 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
                Everything You Need to Succeed
              </h2>
              <p className="text-xl text-gray-300">
                One platform, unlimited possibilities for your music career
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { title: 'Smart Links', desc: 'Create beautiful landing pages for your music' },
                { title: 'Fan Analytics', desc: 'Track every click, stream, and conversion' },
                { title: 'AI Content', desc: 'Generate videos, captions, and cover art' },
                { title: 'Email Capture', desc: 'Build your email list with pre-save campaigns' },
                { title: 'Ad Management', desc: 'Run Meta & TikTok ads from one dashboard' },
                { title: 'Split Payments', desc: 'Automatic royalty splits with collaborators' },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl hover:border-blue-400/50 transition-all"
                >
                  <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
                  <p className="text-gray-300">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
                Simple, Transparent Pricing
              </h2>
              <p className="text-xl text-gray-300">
                Start free, upgrade when you're ready
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {/* Free Plan */}
              <div className="p-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl">
                <h3 className="text-2xl font-bold text-white mb-2">Free</h3>
                <div className="text-4xl font-bold text-white mb-6">
                  $0<span className="text-lg text-gray-400">/month</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {['5 Smart Links', 'Basic Analytics', 'Email Support'].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-300">
                      <span className="text-green-400">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/auth?mode=signup')}
                  className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold transition-colors"
                >
                  Get Started Free
                </button>
              </div>

              {/* Pro Plan */}
              <div className="p-8 bg-gradient-to-br from-blue-500/20 to-blue-600/20 backdrop-blur-sm border border-blue-400/30 rounded-2xl relative">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-500 text-white text-sm font-semibold rounded-full">
                  Most Popular
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
                <div className="text-4xl font-bold text-white mb-6">
                  $19<span className="text-lg text-gray-400">/month</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {[
                    'Unlimited Smart Links',
                    'Advanced Analytics',
                    'AI Content Generation',
                    'Ad Campaign Management',
                    'Priority Support',
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-300">
                      <span className="text-green-400">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/auth?mode=signup')}
                  className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
                >
                  Start Free Trial
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-black/40 backdrop-blur-sm border-t border-white/10">
          <div className="max-w-7xl mx-auto text-center">
            <div className="text-gray-400 mb-8">
              <span className="text-white font-bold">Ghoste</span> - Grow your music career on autopilot
            </div>
            <div className="flex justify-center gap-8 text-sm text-gray-400">
              <a href="/privacy-policy" className="hover:text-white transition-colors">Privacy</a>
              <a href="/terms" className="hover:text-white transition-colors">Terms</a>
              <a href="/data-deletion" className="hover:text-white transition-colors">Data Deletion</a>
            </div>
            <div className="mt-8 text-sm text-gray-500">
              © 2025 Ghoste. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
