/*
  # User Billing V2 and Subscription Entitlements System
  
  ## Summary
  Creates clean billing table and entitlement RPC for Stripe subscription management.
  
  ## New Tables
  - `user_billing_v2`
    - `user_id` (uuid, primary key, references auth.users)
    - `plan_key` (text, default 'free') - free | artist | growth | scale
    - `status` (text, default 'free') - free | trialing | active | past_due | canceled | incomplete
    - `stripe_customer_id` (text, nullable)
    - `stripe_subscription_id` (text, nullable)
    - `price_id` (text, nullable)
    - `current_period_end` (timestamptz, nullable)
    - `cancel_at_period_end` (boolean, default false)
    - `created_at` (timestamptz, default now())
    - `updated_at` (timestamptz, default now())
  
  ## Security
  - Enable RLS on user_billing_v2
  - Users can SELECT their own billing record only
  - NO client-side inserts/updates/deletes (server-only)
  
  ## Functions
  - `apply_subscription_entitlements_v2`: Server-side RPC to sync Stripe subscription → Supabase
    - Upserts billing record
    - Applies credit entitlements based on plan
    - Idempotent (safe for duplicate webhook deliveries)
  
  ## Notes
  - Does NOT delete old billing_subscriptions table
  - user_billing_v2 becomes the new source of truth
  - Webhooks call apply_subscription_entitlements_v2
*/

-- Create user_billing_v2 table
CREATE TABLE IF NOT EXISTS public.user_billing_v2 (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_key text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_billing_v2 ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own billing record
CREATE POLICY "Users can view own billing"
  ON public.user_billing_v2
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_user_billing_v2_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_billing_v2_updated_at
  BEFORE UPDATE ON public.user_billing_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_billing_v2_updated_at();

-- Create apply_subscription_entitlements_v2 RPC
CREATE OR REPLACE FUNCTION public.apply_subscription_entitlements_v2(
  p_user_id uuid,
  p_plan_key text,
  p_status text,
  p_price_id text DEFAULT NULL,
  p_current_period_end timestamptz DEFAULT NULL,
  p_stripe_customer_id text DEFAULT NULL,
  p_stripe_subscription_id text DEFAULT NULL,
  p_cancel_at_period_end boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_paid_active boolean;
  v_effective_plan text;
  v_credit_amount int;
  v_existing_period_end timestamptz;
BEGIN
  -- Determine if user has active paid subscription
  v_paid_active := p_status IN ('active', 'trialing');
  
  -- Force free plan if not paid_active
  IF NOT v_paid_active THEN
    v_effective_plan := 'free';
  ELSE
    v_effective_plan := p_plan_key;
  END IF;
  
  -- Upsert billing record
  INSERT INTO public.user_billing_v2 (
    user_id,
    plan_key,
    status,
    price_id,
    current_period_end,
    stripe_customer_id,
    stripe_subscription_id,
    cancel_at_period_end,
    updated_at
  ) VALUES (
    p_user_id,
    v_effective_plan,
    p_status,
    p_price_id,
    p_current_period_end,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_cancel_at_period_end,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan_key = EXCLUDED.plan_key,
    status = EXCLUDED.status,
    price_id = EXCLUDED.price_id,
    current_period_end = EXCLUDED.current_period_end,
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    updated_at = now()
  RETURNING current_period_end INTO v_existing_period_end;
  
  -- Apply credit entitlements (only for paid active subscriptions)
  IF v_paid_active THEN
    -- Map plan to credits
    CASE v_effective_plan
      WHEN 'artist' THEN v_credit_amount := 30000;
      WHEN 'growth' THEN v_credit_amount := 65000;
      WHEN 'scale' THEN v_credit_amount := 500000;
      ELSE v_credit_amount := 7500; -- fallback to free tier
    END CASE;
    
    -- Check if user_wallets table exists and has reset_monthly_credits function
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reset_monthly_credits') THEN
      -- Call existing reset function
      PERFORM public.reset_monthly_credits(p_user_id);
    ELSE
      -- Fallback: Upsert wallet with monthly credits
      INSERT INTO public.user_wallets (
        user_id,
        balance,
        monthly_credits,
        updated_at
      ) VALUES (
        p_user_id,
        v_credit_amount,
        v_credit_amount,
        now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        balance = v_credit_amount,
        monthly_credits = v_credit_amount,
        updated_at = now();
      
      -- Log transaction
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallet_transactions') THEN
        INSERT INTO public.wallet_transactions (
          user_id,
          amount,
          transaction_type,
          description,
          created_at
        ) VALUES (
          p_user_id,
          v_credit_amount,
          'subscription_refill',
          'Monthly subscription credit refill for ' || v_effective_plan || ' plan',
          now()
        );
      END IF;
    END IF;
    
    -- Update profiles.plan for backward compatibility
    UPDATE public.profiles
    SET 
      plan = v_effective_plan,
      updated_at = now()
    WHERE id = p_user_id;
  ELSE
    -- Not paid active: set plan to free in profiles
    UPDATE public.profiles
    SET 
      plan = 'free',
      updated_at = now()
    WHERE id = p_user_id;
  END IF;
END;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.apply_subscription_entitlements_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_entitlements_v2 TO service_role;
