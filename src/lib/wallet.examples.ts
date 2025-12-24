/**
 * Ghoste Credit Wallet - Usage Examples
 *
 * This file contains examples of how to use the wallet system throughout the app.
 * The wallet supports two separate budgets:
 * - MANAGER: For high-cost strategic actions (AI features, advanced analytics)
 * - TOOLS: For utility/rendering actions (renders, exports, basic operations)
 */

import {
  topUpBudget,
  consumeCredits,
  transferCredits,
  getWallet,
  getCurrentUserWallet,
  hasSufficientCredits,
  type BudgetType,
} from './wallet';

// ============================================================================
// EXAMPLE 1: Monthly Subscription Top-Up
// ============================================================================
// Called when Stripe subscription renews successfully
export async function handleSubscriptionRenewal(
  userId: string,
  stripeChargeId: string,
  planType: 'pro' | 'enterprise'
) {
  // Pro plan: 5,000 MANAGER + 20,000 TOOLS credits
  // Enterprise plan: 15,000 MANAGER + 50,000 TOOLS credits
  const managerAmount = planType === 'pro' ? 5000 : 15000;
  const toolsAmount = planType === 'pro' ? 20000 : 50000;

  try {
    // Top up MANAGER budget
    await topUpBudget(
      userId,
      managerAmount,
      'MANAGER',
      'MonthlySubscription',
      stripeChargeId
    );

    // Top up TOOLS budget
    await topUpBudget(
      userId,
      toolsAmount,
      'TOOLS',
      'MonthlySubscription',
      stripeChargeId
    );

    console.log(`✅ Subscription renewed: ${managerAmount} MANAGER + ${toolsAmount} TOOLS credits`);
    return { success: true };
  } catch (error) {
    console.error('❌ Subscription top-up failed:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 2: Ghoste AI - High-Value Feature Consumption
// ============================================================================
// Called before running expensive AI operations
export async function runViralLeadSetup(userId: string, campaignData: any) {
  const COST = 2000; // 2,000 MANAGER credits

  try {
    // Check if user has sufficient credits
    const hasFunds = await hasSufficientCredits(userId, COST, 'MANAGER');

    if (!hasFunds) {
      throw new Error('Insufficient MANAGER credits. Please upgrade your plan or top up.');
    }

    // Consume credits BEFORE running the operation
    await consumeCredits(userId, COST, 'MANAGER', 'ViralLeadSetup');

    // Now run the actual AI operation
    console.log('🤖 Running Viral Lead Setup...');
    // ... AI operation code here ...

    return { success: true, creditsUsed: COST };
  } catch (error) {
    console.error('❌ Viral Lead Setup failed:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 3: Ghoste Studio - Rendering Actions
// ============================================================================
// Called when user renders a video/asset
export async function renderAsset(
  userId: string,
  assetType: 'video' | 'image' | 'audio',
  duration?: number
) {
  // Different costs based on asset type
  const costs = {
    video: 1500,  // 1,500 TOOLS credits per video
    image: 500,   // 500 TOOLS credits per image
    audio: 800,   // 800 TOOLS credits per audio
  };

  const COST = costs[assetType];

  try {
    // Check balance
    const wallet = await getWallet(userId);
    if (!wallet || wallet.tools_budget_balance < COST) {
      throw new Error('Insufficient TOOLS credits for rendering.');
    }

    // Consume credits
    await consumeCredits(
      userId,
      COST,
      'TOOLS',
      `GhosteStudioRender_${assetType}`,
      `asset_${Date.now()}`
    );

    // Perform render
    console.log(`🎨 Rendering ${assetType}...`);
    // ... rendering code here ...

    return { success: true, creditsUsed: COST };
  } catch (error) {
    console.error('❌ Render failed:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 4: Meta Ads Campaign Creation
// ============================================================================
// Called when creating a Meta ad campaign
export async function createMetaAdCampaign(userId: string, campaignConfig: any) {
  const COST = 3000; // 3,000 MANAGER credits

  try {
    // Pre-flight check
    if (!(await hasSufficientCredits(userId, COST, 'MANAGER'))) {
      return {
        success: false,
        error: 'INSUFFICIENT_CREDITS',
        message: 'Need 3,000 MANAGER credits to create ad campaign',
      };
    }

    // Consume credits
    await consumeCredits(userId, COST, 'MANAGER', 'MetaAdCampaignCreate');

    // Create campaign
    console.log('📱 Creating Meta ad campaign...');
    // ... Meta API calls here ...

    return { success: true, creditsUsed: COST };
  } catch (error) {
    console.error('❌ Campaign creation failed:', error);

    // If campaign creation fails, consider issuing a refund
    // (refund function would need to be implemented separately)

    throw error;
  }
}

// ============================================================================
// EXAMPLE 5: User Budget Transfer
// ============================================================================
// Called when user manually moves credits between budgets
export async function handleUserBudgetTransfer(
  userId: string,
  amount: number,
  from: BudgetType,
  to: BudgetType
) {
  try {
    await transferCredits(userId, amount, from, to, 'UserAdjust');

    console.log(`↔️ Transferred ${amount} credits from ${from} to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Transfer failed:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 6: Smart Link Creation
// ============================================================================
// Called when creating a smart link with analytics
export async function createSmartLink(userId: string, linkData: any) {
  const COST = 100; // 100 TOOLS credits

  try {
    await consumeCredits(userId, COST, 'TOOLS', 'SmartLinkCreate');

    // Create the link
    console.log('🔗 Creating smart link...');
    // ... link creation code ...

    return { success: true, creditsUsed: COST };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Insufficient')) {
      return {
        success: false,
        error: 'LOW_CREDITS',
        message: 'Not enough credits. Links require 100 TOOLS credits.',
      };
    }
    throw error;
  }
}

// ============================================================================
// EXAMPLE 7: Cover Art Generation
// ============================================================================
// Called when generating AI cover art
export async function generateCoverArt(userId: string, prompt: string) {
  const COST = 800; // 800 TOOLS credits

  try {
    // Check and consume
    await consumeCredits(userId, COST, 'TOOLS', 'CoverArtGenerate');

    // Generate cover art
    console.log('🎨 Generating cover art...');
    // ... AI generation code ...

    return { success: true, creditsUsed: COST };
  } catch (error) {
    throw error;
  }
}

// ============================================================================
// EXAMPLE 8: Email Campaign Send
// ============================================================================
// Called when sending bulk email campaigns
export async function sendEmailCampaign(
  userId: string,
  recipientCount: number
) {
  // Cost scales with recipient count: 1 credit per 10 recipients
  const COST = Math.ceil(recipientCount / 10);
  const BUDGET: BudgetType = 'MANAGER';

  try {
    await consumeCredits(userId, COST, BUDGET, 'EmailCampaign', `recipients_${recipientCount}`);

    console.log(`📧 Sending to ${recipientCount} recipients...`);
    // ... send emails ...

    return { success: true, creditsUsed: COST };
  } catch (error) {
    throw error;
  }
}

// ============================================================================
// EXAMPLE 9: Display User Wallet Summary (UI Helper)
// ============================================================================
// Called to show wallet status in UI
export async function getWalletSummary(userId: string) {
  try {
    const wallet = await getWallet(userId);

    if (!wallet) {
      return {
        manager: 0,
        tools: 0,
        total: 0,
        message: 'No wallet found. Top up to get started!',
      };
    }

    return {
      manager: wallet.manager_budget_balance,
      tools: wallet.tools_budget_balance,
      total: wallet.manager_budget_balance + wallet.tools_budget_balance,
      lastUpdate: wallet.updated_at,
    };
  } catch (error) {
    console.error('Failed to get wallet summary:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 10: Free Trial Credits
// ============================================================================
// Called during user onboarding to give initial credits
export async function grantTrialCredits(userId: string) {
  try {
    // Give new users starter credits
    await topUpBudget(userId, 1000, 'MANAGER', 'TrialBonus');
    await topUpBudget(userId, 5000, 'TOOLS', 'TrialBonus');

    console.log('🎁 Trial credits granted: 1,000 MANAGER + 5,000 TOOLS');
    return { success: true };
  } catch (error) {
    console.error('Failed to grant trial credits:', error);
    throw error;
  }
}
