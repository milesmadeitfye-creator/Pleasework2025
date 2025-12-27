import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { StripeProduct } from '../stripe-config';
import { supabase } from '@/lib/supabase.client';

interface ProductCardProps {
  product: StripeProduct;
  isSubscription?: boolean;
  currentPlan?: string | null;
}

export const ProductCard: React.FC<ProductCardProps> = ({ 
  product, 
  isSubscription = false,
  currentPlan 
}) => {
  const [loading, setLoading] = useState(false);
  const isCurrentPlan = currentPlan === product.name;

  const handlePurchase = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        alert('Please sign in to make a purchase');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            priceId: product.priceId,
            userId: user.id,
            mode: product.mode,
          }),
        }
      );

      const { url, error } = await response.json();

      if (error) {
        throw new Error(error);
      }

      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      alert('Failed to start checkout process');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-lg p-6 border-2 transition-all duration-200 hover:shadow-xl ${
      isCurrentPlan ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-blue-300'
    }`}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-bold text-gray-900">{product.name}</h3>
        {isCurrentPlan && (
          <div className="flex items-center text-green-600 bg-green-100 px-2 py-1 rounded-full text-sm">
            <Check className="w-4 h-4 mr-1" />
            Current
          </div>
        )}
      </div>
      
      {product.description && (
        <p className="text-gray-600 mb-4 text-sm leading-relaxed">
          {product.description}
        </p>
      )}
      
      <div className="mb-6">
        <div className="flex items-baseline">
          <span className="text-3xl font-bold text-gray-900">
            ${product.price}
          </span>
          {isSubscription && (
            <span className="text-gray-500 ml-1">/month</span>
          )}
        </div>
      </div>
      
      <button
        onClick={handlePurchase}
        disabled={loading || isCurrentPlan}
        className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center ${
          isCurrentPlan
            ? 'bg-green-100 text-green-700 cursor-not-allowed'
            : loading
            ? 'bg-gray-400 text-white cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 active:transform active:scale-95'
        }`}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : isCurrentPlan ? (
          'Current Plan'
        ) : (
          `${isSubscription ? 'Subscribe' : 'Buy Now'}`
        )}
      </button>
    </div>
  );
};