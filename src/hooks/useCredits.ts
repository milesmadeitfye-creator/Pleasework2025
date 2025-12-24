import { useState, useEffect } from 'react';
import { getWallet, getCost, chargeCredits, InsufficientCreditsError } from '../lib/credits';
import { useAuth } from '../contexts/AuthContext';

interface Wallet {
  user_id: string;
  plan: 'operator' | 'growth' | 'scale';
  monthly_credits: number;
  credits_remaining: number;
  credits_used: number;
  cycle_start: string;
  cycle_end: string;
}

export function useCredits() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  const loadWallet = async () => {
    if (!user?.id) {
      setWallet(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const w = await getWallet(user.id);
      setWallet(w);
    } catch (error) {
      console.error('[useCredits] loadWallet error:', error);
      setWallet(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWallet();
  }, [user?.id]);

  const charge = async (featureKey: string, metadata?: Record<string, any>) => {
    try {
      const result = await chargeCredits(featureKey, metadata);
      // Refresh wallet after charge
      await loadWallet();
      return result;
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        throw error;
      }
      throw error;
    }
  };

  const getFeatureCost = async (featureKey: string) => {
    return getCost(featureKey);
  };

  return {
    wallet,
    loading,
    charge,
    refresh: loadWallet,
    getFeatureCost,
  };
}
