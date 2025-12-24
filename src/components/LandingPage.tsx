import { useState } from 'react';
import { Music2, Link2, BarChart3, Target, Check, X, ArrowRight, Bot, Mail, Palette, Star } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const [spotifyUrl, setSpotifyUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (spotifyUrl.trim()) {
      localStorage.setItem('pending_spotify_url', spotifyUrl);
      onGetStarted();
    }
  };

  const features = [
    {
      icon: Link2,
      title: 'Smart Links',
      description: 'Create beautiful landing pages for your music. One link, all platforms.',
      color: 'blue',
    },
    {
      icon: Bot,
      title: 'Ghoste AI Manager',
      description: 'AI-powered assistant that runs campaigns, analyzes data, and optimizes your marketing.',
      color: 'purple',
    },
    {
      icon: BarChart3,
      title: 'Advanced Analytics',
      description: 'Track every click, conversion, and fan interaction in real-time.',
      color: 'green',
    },
    {
      icon: Target,
      title: 'Ad Campaign Manager',
      description: 'Run Meta ads campaigns directly from the platform with AI optimization.',
      color: 'red',
    },
    {
      icon: Mail,
      title: 'Fan Communication',
      description: 'Build your fanbase with email capture and pre-save campaigns.',
      color: 'yellow',
    },
    {
      icon: Palette,
      title: 'Cover Art Generator',
      description: 'Create stunning cover art with AI in seconds.',
      color: 'pink',
    },
  ];

  const testimonials = [
    {
      name: 'Sarah Mitchell',
      role: 'Independent Artist',
      image: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=150',
      quote: 'My Ghoste helped me grow from 5k to 50k monthly listeners in just 3 months. The AI manager is like having a full marketing team.',
      rating: 5,
    },
    {
      name: 'Marcus Johnson',
      role: 'Hip-Hop Producer',
      image: 'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=150',
      quote: "The smart links converted 3x better than my old bio links. And Ghoste AI actually understands my genre and audience.",
      rating: 5,
    },
    {
      name: 'Luna Rose',
      role: 'Singer-Songwriter',
      image: 'https://images.pexels.com/photos/3756681/pexels-photo-3756681.jpeg?auto=compress&cs=tinysrgb&w=150',
      quote: 'I saved $500/month on marketing tools and got better results. The analytics alone are worth the price.',
      rating: 5,
    },
  ];

  const comparisonData = [
    { feature: 'Smart Links', myGhoste: true, competitors: true },
    { feature: 'AI Marketing Manager', myGhoste: true, competitors: false },
    { feature: 'Advanced Analytics', myGhoste: true, competitors: true },
    { feature: 'Ad Campaign Manager', myGhoste: true, competitors: false },
    { feature: 'Email Capture', myGhoste: true, competitors: true },
    { feature: 'Cover Art Generator', myGhoste: true, competitors: false },
    { feature: 'Social Media Scheduler', myGhoste: true, competitors: true },
    { feature: 'Budget Optimization AI', myGhoste: true, competitors: false },
    { feature: 'Audience Builder', myGhoste: true, competitors: false },
    { feature: 'Real-time Data Insights', myGhoste: true, competitors: false },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="border-b border-gray-800 bg-black/50 backdrop-blur-lg fixed w-full z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Music2 className="w-8 h-8 text-blue-500" />
              <span className="text-xl font-bold">My Ghoste</span>
            </div>
            <button
              onClick={onGetStarted}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <div className="inline-block mb-6">
              <span className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-sm font-medium">
                AI-Powered Music Marketing
              </span>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent">
              Grow Your Music Career with AI
            </h1>
            <p className="text-xl text-gray-400 mb-12">
              Smart links, AI campaigns, and analytics that actually help you reach more fans.
              Meet Ghoste, your AI marketing manager.
            </p>

            <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mb-8">
              <div className="flex flex-col sm:flex-row gap-3 p-2 bg-gray-900 rounded-xl border border-gray-800">
                <input
                  type="url"
                  value={spotifyUrl}
                  onChange={(e) => setSpotifyUrl(e.target.value)}
                  placeholder="Paste your Spotify song link..."
                  className="flex-1 px-6 py-4 bg-transparent text-white placeholder-gray-500 focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  Get Started Free
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-3">No credit card required • Free 14-day trial</p>
            </form>

            <div className="flex items-center justify-center gap-8 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-400" />
                <span>10,000+ Artists</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-400" />
                <span>50M+ Clicks</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-400" />
                <span>$2M+ Ad Spend</span>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 blur-3xl"></div>
            <div className="relative bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 shadow-2xl">
              <img
                src="https://images.pexels.com/photos/6953876/pexels-photo-6953876.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="Dashboard Preview"
                className="w-full rounded-lg shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">Everything You Need to Succeed</h2>
            <p className="text-xl text-gray-400">All the tools professional artists use, in one platform</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all group"
                >
                  <div className={`w-12 h-12 bg-${feature.color}-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-6 h-6 text-${feature.color}-400`} />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-gray-400">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">My Ghoste vs. Competitors</h2>
            <p className="text-xl text-gray-400">See why artists are switching to My Ghoste</p>
          </div>

          <div className="max-w-4xl mx-auto bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-3 gap-4 p-6 border-b border-gray-800 bg-gray-800/50">
              <div className="text-gray-400 font-medium">Feature</div>
              <div className="text-center">
                <div className="inline-block px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg font-bold">
                  My Ghoste
                </div>
              </div>
              <div className="text-center text-gray-400 font-medium">Others</div>
            </div>

            {comparisonData.map((row, idx) => (
              <div
                key={idx}
                className={`grid grid-cols-3 gap-4 p-6 ${idx !== comparisonData.length - 1 ? 'border-b border-gray-800' : ''}`}
              >
                <div className="text-gray-300">{row.feature}</div>
                <div className="flex justify-center">
                  {row.myGhoste ? (
                    <Check className="w-6 h-6 text-green-400" />
                  ) : (
                    <X className="w-6 h-6 text-red-400" />
                  )}
                </div>
                <div className="flex justify-center">
                  {row.competitors ? (
                    <Check className="w-6 h-6 text-gray-600" />
                  ) : (
                    <X className="w-6 h-6 text-red-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">Loved by Artists Worldwide</h2>
            <p className="text-xl text-gray-400">Join thousands of artists growing their careers</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, idx) => (
              <div
                key={idx}
                className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-300 mb-6 italic">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <img
                    src={testimonial.image}
                    alt={testimonial.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <div className="font-semibold">{testimonial.name}</div>
                    <div className="text-sm text-gray-400">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-xl text-gray-400">One plan with everything you need</p>
          </div>

          <div className="max-w-lg mx-auto">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur-xl opacity-50"></div>
              <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-6">
                  <div className="inline-block px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-sm font-medium mb-4">
                    Most Popular
                  </div>
                  <h3 className="text-3xl font-bold mb-2">Pro Plan</h3>
                  <div className="flex items-baseline justify-center gap-2 mb-2">
                    <span className="text-5xl font-bold">$19</span>
                    <span className="text-gray-400">/month</span>
                  </div>
                  <p className="text-gray-400">Everything you need to grow</p>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">Unlimited smart links</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">Ghoste AI marketing manager</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">Advanced analytics & insights</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">Ad campaign manager</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">Fan communication tools</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">AI cover art generator</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">Social media scheduler</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">Priority support</span>
                  </div>
                </div>

                <button
                  onClick={onGetStarted}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  Start Free Trial
                  <ArrowRight className="w-5 h-5" />
                </button>

                <p className="text-center text-sm text-gray-500 mt-4">
                  14-day free trial • No credit card required • Cancel anytime
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600/10 to-purple-600/10 border-y border-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold mb-6">Ready to Grow Your Career?</h2>
          <p className="text-xl text-gray-400 mb-8">
            Join 10,000+ artists using AI to reach more fans and grow faster
          </p>
          <button
            onClick={onGetStarted}
            className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-lg font-bold rounded-lg transition-all inline-flex items-center gap-2"
          >
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <Music2 className="w-6 h-6 text-blue-500" />
              <span className="text-lg font-bold">Ghoste</span>
            </div>
            <div className="text-gray-400 text-sm">
              © 2025 Ghoste. All rights reserved.
            </div>
            <div className="flex gap-6 text-sm text-gray-400">
              <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="/data-deletion" className="hover:text-white transition-colors">Data Deletion</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
