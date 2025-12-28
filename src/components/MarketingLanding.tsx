import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  TrendingUp,
  Users,
  BarChart3,
  Zap,
  Shield,
  Star,
  Check,
  ChevronDown,
  Music,
  ArrowRight,
} from 'lucide-react';
import AnimatedBackground from './AnimatedBackground';

export default function MarketingLanding() {
  const navigate = useNavigate();
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleSpotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!spotifyUrl.trim()) {
      setError('Please enter your Spotify artist URL');
      return;
    }

    if (!spotifyUrl.includes('spotify.com')) {
      setError('Please enter a valid Spotify URL');
      return;
    }

    setIsValidating(true);

    try {
      const artistId = extractSpotifyArtistId(spotifyUrl);

      if (!artistId) {
        setError('Invalid Spotify artist URL. Please check and try again.');
        setIsValidating(false);
        return;
      }

      const response = await fetch(`/.netlify/functions/spotify-app-token`);
      const { access_token } = await response.json();

      const artistResponse = await fetch(
        `https://api.spotify.com/v1/artists/${artistId}`,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      );

      if (!artistResponse.ok) {
        setError('Could not verify Spotify artist. Please check the URL.');
        setIsValidating(false);
        return;
      }

      const artistData = await artistResponse.json();

      navigate('/auth', {
        state: {
          spotifyArtistId: artistId,
          spotifyArtistName: artistData.name,
          spotifyArtistImage: artistData.images?.[0]?.url,
        },
      });
    } catch (err) {
      console.error('Spotify validation error:', err);
      setError('Something went wrong. Please try again.');
      setIsValidating(false);
    }
  };

  const extractSpotifyArtistId = (url: string): string | null => {
    const patterns = [
      /spotify\.com\/artist\/([a-zA-Z0-9]+)/,
      /open\.spotify\.com\/artist\/([a-zA-Z0-9]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  };

  const features = [
    {
      icon: Sparkles,
      title: 'AI-Powered Studio',
      description: 'Create stunning cover art, lyric videos, and social content in minutes',
    },
    {
      icon: TrendingUp,
      title: 'Smart Link Analytics',
      description: 'Track every click, stream, and fan interaction across all platforms',
    },
    {
      icon: Users,
      title: 'Fan CRM',
      description: 'Build and manage your fanbase with powerful email and audience tools',
    },
    {
      icon: BarChart3,
      title: 'Real-Time Stats',
      description: 'See your Spotify, Apple Music, and platform metrics in one dashboard',
    },
    {
      icon: Zap,
      title: 'Instant Setup',
      description: 'Connect your Spotify and start growing in under 2 minutes',
    },
    {
      icon: Shield,
      title: 'Secure & Private',
      description: 'Your data is encrypted and never shared with third parties',
    },
  ];

  const testimonials = [
    {
      name: 'Sarah Chen',
      role: 'Independent Artist',
      image: '👩‍🎤',
      quote: 'Ghoste helped me grow from 5K to 50K monthly listeners in 6 months. The smart links and analytics are game-changing.',
      stats: '10x growth in 6 months',
    },
    {
      name: 'Marcus Johnson',
      role: 'Producer & DJ',
      image: '🎧',
      quote: 'The AI studio tools save me hours every week. I can create professional visuals for every release without hiring a designer.',
      stats: 'Saves 15+ hours/week',
    },
    {
      name: 'Luna Rivera',
      role: 'Singer-Songwriter',
      image: '🎤',
      quote: "Best investment I've made in my music career. The fan communication features helped me build a loyal community.",
      stats: '2,500+ email subscribers',
    },
  ];

  const faqs = [
    {
      question: 'Do I need to be on Spotify to use Ghoste?',
      answer: 'Yes, we currently integrate with Spotify to pull your artist data and analytics. However, our smart links work with all major streaming platforms including Apple Music, YouTube Music, Tidal, and more.',
    },
    {
      question: 'Can I cancel anytime?',
      answer: 'Absolutely! There are no long-term contracts. You can cancel your subscription anytime from your account settings, and you\'ll continue to have access until the end of your billing period.',
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit cards (Visa, Mastercard, American Express) through our secure payment processor, Stripe. All payments are encrypted and secure.',
    },
    {
      question: 'Is there a free trial?',
      answer: 'Yes! Sign up for free and explore the platform. You can create smart links, access basic analytics, and try our AI studio tools before upgrading to Pro.',
    },
    {
      question: 'What happens to my links if I cancel?',
      answer: 'Your smart links will continue to work forever, even if you cancel. However, advanced analytics and AI studio features require an active Pro subscription.',
    },
    {
      question: 'Do you offer refunds?',
      answer: 'We offer a 30-day money-back guarantee. If you\'re not satisfied within the first 30 days, contact support for a full refund.',
    },
  ];

  return (
    <div className="min-h-screen bg-ghoste-bg text-ghoste-text relative">
      {/* Animated Background */}
      <AnimatedBackground />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-ghoste-bg/80 backdrop-blur-md border-b border-ghoste-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-ghoste-accent to-blue-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">G</span>
              </div>
              <span className="text-xl font-bold">Ghoste</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/auth?mode=signin')}
                className="px-4 py-2 text-sm font-medium text-ghoste-text hover:text-ghoste-accent transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => navigate('/auth?mode=signup')}
                className="px-4 py-2 text-sm font-medium bg-ghoste-accent hover:bg-ghoste-accent-hover text-white rounded-lg transition-colors"
              >
                Sign Up Free
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ghoste-accent-soft/30 border border-ghoste-accent/30 text-ghoste-accent text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              <span>Join 10,000+ Artists Growing Their Careers</span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight">
              Grow Your Music Career on
              <span className="block bg-gradient-to-r from-ghoste-accent to-blue-400 bg-clip-text text-transparent">
                Autopilot
              </span>
            </h1>

            <p className="text-xl text-ghoste-text-muted max-w-2xl mx-auto">
              Smart links, AI-powered content creation, and fan analytics—all in one platform.
              Connect your Spotify and start growing today.
            </p>

            {/* Spotify URL Input */}
            <div className="max-w-2xl mx-auto">
              <form onSubmit={handleSpotifySubmit} className="space-y-4">
                <div className="relative">
                  <Music className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ghoste-text-muted" />
                  <input
                    type="text"
                    value={spotifyUrl}
                    onChange={(e) => setSpotifyUrl(e.target.value)}
                    placeholder="Paste your Spotify artist URL here..."
                    className="w-full pl-12 pr-4 py-4 bg-ghoste-surface border border-ghoste-border rounded-xl text-ghoste-text placeholder-ghoste-text-secondary focus:outline-none focus:ring-2 focus:ring-ghoste-accent transition-all"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={isValidating}
                  className="w-full py-4 bg-ghoste-accent hover:bg-ghoste-accent-hover disabled:bg-ghoste-accent/50 text-white rounded-xl font-semibold text-lg transition-colors flex items-center justify-center gap-2 group"
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
              <p className="text-sm text-ghoste-text-secondary mt-4">
                No credit card required • Free forever • Upgrade to Pro for $19/month
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Before/After Profile Showcase */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-ghoste-bg-secondary">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Before & After Ghoste</h2>
            <p className="text-xl text-ghoste-text-muted">
              See how artists transform their careers in weeks, not years
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Before */}
            <div className="bg-ghoste-surface rounded-2xl border border-ghoste-border p-8 space-y-6">
              <div className="text-center">
                <div className="text-6xl mb-4">😔</div>
                <h3 className="text-2xl font-bold mb-2">Before</h3>
                <p className="text-ghoste-text-muted">Struggling to be heard</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-red-400 text-xs">✕</span>
                  </div>
                  <span className="text-sm text-ghoste-text-muted">
                    Spending hours on social media with low engagement
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-red-400 text-xs">✕</span>
                  </div>
                  <span className="text-sm text-ghoste-text-muted">
                    No idea where streams are coming from
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-red-400 text-xs">✕</span>
                  </div>
                  <span className="text-sm text-ghoste-text-muted">
                    Paying designers $200+ per release
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-red-400 text-xs">✕</span>
                  </div>
                  <span className="text-sm text-ghoste-text-muted">
                    Can't afford ads or don't know how to run them
                  </span>
                </div>
              </div>
            </div>

            {/* After */}
            <div className="bg-gradient-to-br from-ghoste-accent-soft to-ghoste-accent/30 rounded-2xl border border-ghoste-accent p-8 space-y-6">
              <div className="text-center">
                <div className="text-6xl mb-4">🚀</div>
                <h3 className="text-2xl font-bold mb-2">After</h3>
                <p className="text-ghoste-text-muted">Growing every week</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-green-400" />
                  </div>
                  <span className="text-sm text-ghoste-text">
                    AI creates professional visuals in seconds
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-green-400" />
                  </div>
                  <span className="text-sm text-ghoste-text">
                    Track every stream, click, and fan across all platforms
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-green-400" />
                  </div>
                  <span className="text-sm text-ghoste-text">
                    Build an email list and communicate directly with fans
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-green-400" />
                  </div>
                  <span className="text-sm text-ghoste-text">
                    Run effective Meta ads without a marketing degree
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything You Need to Succeed</h2>
            <p className="text-xl text-ghoste-text-muted">
              All the tools professional artists use, in one simple platform
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="bg-ghoste-surface rounded-2xl border border-ghoste-border p-6 hover:border-ghoste-accent transition-all group"
                >
                  <div className="w-12 h-12 rounded-lg bg-ghoste-accent-soft flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6 text-ghoste-accent" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-ghoste-text-muted">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-ghoste-bg-secondary">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Loved by Artists Worldwide</h2>
            <p className="text-xl text-ghoste-text-muted">
              Don't just take our word for it
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, idx) => (
              <div
                key={idx}
                className="bg-ghoste-surface rounded-2xl border border-ghoste-border p-6 space-y-4"
              >
                <div className="flex items-center gap-1 text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-current" />
                  ))}
                </div>
                <p className="text-ghoste-text italic">"{testimonial.quote}"</p>
                <div className="pt-4 border-t border-ghoste-border">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-3xl">{testimonial.image}</div>
                    <div>
                      <div className="font-semibold">{testimonial.name}</div>
                      <div className="text-sm text-ghoste-text-muted">
                        {testimonial.role}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-ghoste-accent">
                    {testimonial.stats}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-xl text-ghoste-text-muted">
              Start free, upgrade when you're ready
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <div className="bg-ghoste-surface rounded-2xl border border-ghoste-border p-8 space-y-6">
              <div>
                <h3 className="text-2xl font-bold mb-2">Free</h3>
                <div className="text-4xl font-bold mb-4">
                  $0<span className="text-lg text-ghoste-text-muted">/month</span>
                </div>
                <p className="text-ghoste-text-muted">Perfect to get started</p>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-ghoste-accent flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Basic smart links</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-ghoste-accent flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Basic analytics</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-ghoste-accent flex-shrink-0 mt-0.5" />
                  <span className="text-sm">5 AI studio generations/month</span>
                </li>
              </ul>
              <button
                onClick={() => navigate('/auth?mode=signup')}
                className="w-full py-3 border-2 border-ghoste-border hover:bg-ghoste-surface-hover rounded-lg font-semibold transition-colors"
              >
                Sign Up Free
              </button>
            </div>

            {/* Pro Plan */}
            <div className="bg-gradient-to-br from-ghoste-accent-soft to-ghoste-accent/30 rounded-2xl border-2 border-ghoste-accent p-8 space-y-6 relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-ghoste-accent text-white text-xs font-bold px-4 py-1 rounded-full">
                  MOST POPULAR
                </span>
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-2">Pro</h3>
                <div className="text-4xl font-bold mb-4">
                  $19<span className="text-lg text-ghoste-text-muted">/month</span>
                </div>
                <p className="text-ghoste-text-muted">For serious artists</p>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Everything in Free</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Unlimited smart links</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Advanced analytics & insights</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Unlimited AI studio generations</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Fan CRM & email tools</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Meta ads integration</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Priority support</span>
                </li>
              </ul>
              <button
                onClick={() => navigate('/auth?mode=signup&plan=pro')}
                className="w-full py-3 bg-ghoste-accent hover:bg-ghoste-accent-hover text-white rounded-lg font-semibold transition-colors"
              >
                Start Pro Trial
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-ghoste-bg-secondary">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Frequently Asked Questions</h2>
            <p className="text-xl text-ghoste-text-muted">
              Got questions? We've got answers.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="bg-ghoste-surface rounded-xl border border-ghoste-border overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-6 text-left hover:bg-ghoste-surface-hover transition-colors"
                >
                  <span className="font-semibold pr-8">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-ghoste-accent flex-shrink-0 transition-transform ${
                      openFaq === idx ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openFaq === idx && (
                  <div className="px-6 pb-6">
                    <p className="text-ghoste-text-muted">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to Grow Your Music Career?
          </h2>
          <p className="text-xl text-ghoste-text-muted mb-8">
            Join thousands of artists who are building sustainable careers with Ghoste
          </p>
          <button
            onClick={() => navigate('/auth?mode=signup')}
            className="px-8 py-4 bg-ghoste-accent hover:bg-ghoste-accent-hover text-white rounded-xl font-semibold text-lg transition-colors inline-flex items-center gap-2 group"
          >
            <span>Get Started Free</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <p className="text-sm text-ghoste-text-secondary mt-4">
            No credit card required • Free forever
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ghoste-border py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-ghoste-accent to-blue-600 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">G</span>
                </div>
                <span className="text-xl font-bold">Ghoste</span>
              </div>
              <p className="text-sm text-ghoste-text-muted">
                The all-in-one platform for independent artists
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-ghoste-text-muted">
                <li><a href="#" className="hover:text-ghoste-accent transition-colors">Features</a></li>
                <li><a href="/subscriptions" className="hover:text-ghoste-accent transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-ghoste-text-muted">
                <li><a href="/terms" className="hover:text-ghoste-accent transition-colors">Terms</a></li>
                <li><a href="/privacy-policy" className="hover:text-ghoste-accent transition-colors">Privacy</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Connect</h4>
              <ul className="space-y-2 text-sm text-ghoste-text-muted">
                <li><a href="#" className="hover:text-ghoste-accent transition-colors">Instagram</a></li>
                <li><a href="#" className="hover:text-ghoste-accent transition-colors">Twitter</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-ghoste-border text-center text-sm text-ghoste-text-secondary">
            © 2025 Ghoste. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
