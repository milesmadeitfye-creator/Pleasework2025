import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export interface BillingStatus {
  planKey: string;
  status: string;
  isPaidActive: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to check user's billing status from user_billing_v2
 *
 * Paid access = status IN ('active', 'trialing')
 *
 * Use isPaidActive to gate:
 * - Fan messages/sequences/broadcasts
 * - Ad campaigns
 * - Credit refills
 */
export function useBillingStatus(): BillingStatus {
  const { user } = useAuth();
  const [status, setStatus] = useState<BillingStatus>({
    planKey: 'free',
    status: 'free',
    isPaidActive: false,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!user) {
      setStatus({
        planKey: 'free',
        status: 'free',
        isPaidActive: false,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        loading: false,
        error: null,
      });
      return;
    }

    let isMounted = true;

    const fetchBillingStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('user_billing_v2')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!isMounted) return;

        if (error) {
          console.error('[useBillingStatus] Error:', error);
          setStatus({
            planKey: 'free',
            status: 'free',
            isPaidActive: false,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            loading: false,
            error: error.message,
          });
          return;
        }

        if (!data) {
          setStatus({
            planKey: 'free',
            status: 'free',
            isPaidActive: false,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            loading: false,
            error: null,
          });
          return;
        }

        const isPaidActive = ['active', 'trialing'].includes(data.status);

        setStatus({
          planKey: data.plan_key,
          status: data.status,
          isPaidActive,
          currentPeriodEnd: data.current_period_end,
          cancelAtPeriodEnd: data.cancel_at_period_end,
          loading: false,
          error: null,
        });
      } catch (err: any) {
        if (!isMounted) return;

        console.error('[useBillingStatus] Unexpected error:', err);
        setStatus({
          planKey: 'free',
          status: 'free',
          isPaidActive: false,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          loading: false,
          error: err.message || 'Unknown error',
        });
      }
    };

    fetchBillingStatus();

    const subscription = supabase
      .channel('user_billing_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_billing_v2',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          console.log('[useBillingStatus] Billing changed, refetching');
          fetchBillingStatus();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [user]);

  return status;
}
