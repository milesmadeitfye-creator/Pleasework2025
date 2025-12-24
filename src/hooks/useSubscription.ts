import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getProductByPriceId } from '../stripe-config';

interface Subscription {
  id: string;
  status: string;
  price_id: string;
  current_period_end: string;
}

export const useSubscription = (userId: string | undefined) => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      try {
        const { data, error } = await supabase
          .from('stripe_subscriptions')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching subscription:', error);
        } else {
          setSubscription(data);
        }
      } catch (error) {
        console.error('Error fetching subscription:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [userId]);

  const getSubscriptionPlan = () => {
    if (!subscription) return null;
    const product = getProductByPriceId(subscription.price_id);
    return product?.name || 'Unknown Plan';
  };

  return {
    subscription,
    loading,
    planName: getSubscriptionPlan(),
  };
};