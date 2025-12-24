import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

type PricingProps = {
  onStartTrial: () => void;
};

const plans: Array<{
  name: string;
  price: number;
  description: string;
  popular?: boolean;
  features: string[];
}> = [
  {
    name: 'Operator',
    price: 29,
    description: 'For emerging artists',
    features: [
      'Smart Links with tracking',
      '3 active campaigns',
      'Basic analytics',
      'Email automation',
      '1,000 credits/month',
    ],
  },
  {
    name: 'Growth',
    price: 59,
    description: 'For serious independents',
    popular: true,
    features: [
      'Everything in Operator',
      'Unlimited campaigns',
      'Meta Ads integration',
      'AI Manager insights',
      'Advanced analytics',
      'Split contracts',
      '3,000 credits/month',
    ],
  },
  {
    name: 'Label',
    price: 99,
    description: 'For teams & labels',
    features: [
      'Everything in Growth',
      'Multi-artist management',
      'White-label options',
      'Priority support',
      'Custom integrations',
      '10,000 credits/month',
    ],
  },
];

export default function Pricing({ onStartTrial }: PricingProps) {
  return (
    <section className="relative z-10 container mx-auto px-4 sm:px-6 py-16 sm:py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl sm:text-4xl font-black mb-4">
          Founding member pricing
        </h2>
        <p className="text-lg text-white/60 max-w-2xl mx-auto mb-2">
          Lock in early pricing. Cancel anytime. 7-day trial included.
        </p>
        <p className="text-sm text-[#60a5fa] font-medium">
          Prices increase after soft launch period
        </p>
      </motion.div>

      <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {plans.map((plan, index) => (
          <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className={`relative bg-gradient-to-br from-[#1e293b]/60 to-[#0f172a]/80 backdrop-blur-xl border rounded-2xl p-8 ${
              plan.popular
                ? 'border-[#60a5fa] shadow-2xl shadow-[#60a5fa]/20 scale-105'
                : 'border-white/10'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#60a5fa] text-white text-xs font-bold px-4 py-1.5 rounded-full">
                Most Popular
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-2xl font-black mb-2">{plan.name}</h3>
              <p className="text-sm text-white/60 mb-4">{plan.description}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black">${plan.price}</span>
                <span className="text-white/50">/month</span>
              </div>
            </div>

            <ul className="space-y-3 mb-8">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-[#60a5fa]/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-[#60a5fa]" />
                  </div>
                  <span className="text-sm text-white/80">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={onStartTrial}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                plan.popular
                  ? 'bg-[#60a5fa] hover:bg-[#3b82f6] text-white shadow-lg hover:shadow-xl hover:shadow-[#60a5fa]/30'
                  : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
              }`}
            >
              Start 7-day trial
            </button>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="text-center mt-12"
      >
        <div className="inline-flex items-center gap-8 bg-gradient-to-br from-[#1e293b]/60 to-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-2xl px-8 py-4">
          <div className="text-center">
            <div className="text-sm text-white/40">Track every click</div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <div className="text-sm text-white/40">Automate your rollout</div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <div className="text-sm text-white/40">One hub for growth</div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
