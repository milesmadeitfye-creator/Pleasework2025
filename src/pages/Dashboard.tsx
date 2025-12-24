import React from 'react';
import { CreditCard, Zap } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { getProductsByMode } from '../stripe-config';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { planName } = useSubscription(user?.id);
  
  const subscriptionProducts = getProductsByMode('subscription');
  const paymentProducts = getProductsByMode('payment');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back!
          </h1>
          <p className="text-gray-600">
            Choose a plan or add credits to power your campaigns.
          </p>
        </div>

        {/* Subscription Plans */}
        <div className="mb-12">
          <div className="flex items-center mb-6">
            <CreditCard className="w-6 h-6 text-blue-600 mr-2" />
            <h2 className="text-2xl font-bold text-gray-900">Subscription Plans</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subscriptionProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isSubscription={true}
                currentPlan={planName}
              />
            ))}
          </div>
        </div>

        {/* Credit Packs */}
        <div>
          <div className="flex items-center mb-6">
            <Zap className="w-6 h-6 text-yellow-600 mr-2" />
            <h2 className="text-2xl font-bold text-gray-900">Credit Packs</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paymentProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isSubscription={false}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};