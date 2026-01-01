import { createClient } from '@supabase/supabase-js';

export interface OrchestratorConfig {
  userId: string;
  dryRun?: boolean;
  supabaseUrl: string;
  supabaseKey: string;
}

export interface OrchestratorResult {
  success: boolean;
  runId?: string;
  campaignsCreated: number;
  campaignsUpdated: number;
  winnersPromoted: number;
  budgetsScaled: number;
  adsetsPaused: number;
  errors: string[];
  actions: OrchestratorAction[];
}

export interface OrchestratorAction {
  actionType: 'create_campaign' | 'update_budget' | 'promote_winner' | 'pause_adset' | 'error';
  goalKey?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  details: any;
  status: 'pending' | 'success' | 'failed';
  message?: string;
}

interface GoalData {
  goalKey: string;
  isActive: boolean;
  priority: number;
  budgetHint?: number;
  templateKey?: string;
  assets: any;
  creatives: any[];
}

interface WinnerCandidate {
  adsetId: string;
  adId?: string;
  costPerEvent: number;
  spend: number;
  events: number;
  goalKey: string;
}

const CORE_SIGNAL_MAP: Record<string, string> = {
  'streams': 'smartlinkclicked',
  'presave': 'presavecomplete',
  'virality': 'thruplay',
  'followers': 'profile_view',
  'build_audience': 'lead',
  'fan_segmentation': 'onclicklink',
};

const MIN_SPEND_THRESHOLD = 5;
const MIN_EVENTS_THRESHOLD = 3;
const WINNER_IMPROVEMENT_THRESHOLD = 0.15; // 15% better than median
const PROMOTION_COOLDOWN_HOURS = 72;
const BUDGET_SCALE_COOLDOWN_HOURS = 24;
const MAX_DAILY_BUDGET_DEFAULT = 50;

export class AdsOrchestrator {
  private supabase: ReturnType<typeof createClient>;
  private config: OrchestratorConfig;
  private runId?: string;
  private actions: OrchestratorAction[] = [];
  private errors: string[] = [];

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
  }

  async run(): Promise<OrchestratorResult> {
    console.log(`[AdsOrchestrator] Starting run for user ${this.config.userId}, dryRun=${this.config.dryRun}`);

    try {
      // Create run log
      if (!this.config.dryRun) {
        this.runId = await this.createRunLog();
      }

      // Load user settings
      const settings = await this.loadUserSettings();
      if (!settings) {
        throw new Error('Failed to load user settings');
      }

      // Load active goals with their data
      const goals = await this.loadActiveGoals(settings);
      console.log(`[AdsOrchestrator] Loaded ${goals.length} active goals`);

      // Process each goal
      for (const goal of goals) {
        await this.processGoal(goal, settings);
      }

      // Finalize run log
      if (!this.config.dryRun && this.runId) {
        await this.finalizeRunLog();
      }

      return {
        success: true,
        runId: this.runId,
        campaignsCreated: this.countActions('create_campaign', 'success'),
        campaignsUpdated: this.countActions('update_budget', 'success'),
        winnersPromoted: this.countActions('promote_winner', 'success'),
        budgetsScaled: this.countActions('update_budget', 'success'),
        adsetsPaused: this.countActions('pause_adset', 'success'),
        errors: this.errors,
        actions: this.actions,
      };
    } catch (err) {
      console.error('[AdsOrchestrator] Run failed:', err);
      this.errors.push(err instanceof Error ? err.message : 'Unknown error');

      if (!this.config.dryRun && this.runId) {
        await this.markRunFailed(err);
      }

      return {
        success: false,
        runId: this.runId,
        campaignsCreated: 0,
        campaignsUpdated: 0,
        winnersPromoted: 0,
        budgetsScaled: 0,
        adsetsPaused: 0,
        errors: this.errors,
        actions: this.actions,
      };
    }
  }

  private async createRunLog(): Promise<string> {
    const { data, error } = await this.supabase
      .from('ads_automation_runs')
      .insert({
        user_id: this.config.userId,
        run_type: this.config.dryRun ? 'dryrun' : 'user_triggered',
        status: 'running',
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  private async finalizeRunLog(): Promise<void> {
    if (!this.runId) return;

    await this.supabase
      .from('ads_automation_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        campaigns_created: this.countActions('create_campaign', 'success'),
        campaigns_updated: this.countActions('update_budget', 'success'),
        winners_promoted: this.countActions('promote_winner', 'success'),
        budgets_scaled: this.countActions('update_budget', 'success'),
        adsets_paused: this.countActions('pause_adset', 'success'),
        errors_count: this.errors.length,
      })
      .eq('id', this.runId);
  }

  private async markRunFailed(err: any): Promise<void> {
    if (!this.runId) return;

    await this.supabase
      .from('ads_automation_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: err instanceof Error ? err.message : 'Unknown error',
        error_stack: err instanceof Error ? err.stack : '',
        errors_count: this.errors.length,
      })
      .eq('id', this.runId);
  }

  private async logAction(action: OrchestratorAction): Promise<void> {
    this.actions.push(action);

    if (this.config.dryRun || !this.runId) return;

    await this.supabase
      .from('ads_automation_actions')
      .insert({
        run_id: this.runId,
        user_id: this.config.userId,
        action_type: action.actionType,
        goal_key: action.goalKey,
        campaign_id: action.campaignId,
        adset_id: action.adsetId,
        ad_id: action.adId,
        action_details: action.details,
        status: action.status,
        result_message: action.message,
      });
  }

  private countActions(type: string, status?: string): number {
    return this.actions.filter(a =>
      a.actionType === type && (!status || a.status === status)
    ).length;
  }

  private async loadUserSettings(): Promise<any> {
    const { data, error } = await this.supabase
      .rpc('get_user_ads_mode_settings', { p_user_id: this.config.userId });

    if (error) {
      console.error('[AdsOrchestrator] Failed to load settings:', error);
      return null;
    }

    return data;
  }

  private async loadActiveGoals(settings: any): Promise<GoalData[]> {
    const goalSettings = settings?.goal_settings || {};
    const goals: GoalData[] = [];

    for (const [goalKey, goalConfig] of Object.entries(goalSettings)) {
      const config = goalConfig as any;
      if (config.is_active) {
        // Load template for this goal
        const template = await this.loadTemplate(goalKey);

        // Load assets for this goal (placeholder - adapt to your storage)
        const assets = await this.loadGoalAssets(goalKey);

        // Load creatives for this goal (placeholder - adapt to your storage)
        const creatives = await this.loadGoalCreatives(goalKey);

        goals.push({
          goalKey,
          isActive: config.is_active,
          priority: config.priority || 3,
          budgetHint: config.budget_hint,
          templateKey: template?.template_key,
          assets,
          creatives,
        });
      }
    }

    return goals;
  }

  private async loadTemplate(goalKey: string): Promise<any> {
    const { data } = await this.supabase
      .from('ad_campaign_templates')
      .select('*')
      .eq('goal_key', goalKey)
      .maybeSingle();

    return data;
  }

  private async loadGoalAssets(goalKey: string): Promise<any> {
    // Placeholder: Load assets from wherever you store them
    // Could be in user_profile, or a dedicated assets table
    return {};
  }

  private async loadGoalCreatives(goalKey: string): Promise<any[]> {
    // Placeholder: Load creatives from wherever you store them
    // Could be ad_creatives table or similar
    const { data } = await this.supabase
      .from('ad_creatives')
      .select('*')
      .eq('user_id', this.config.userId)
      .eq('goal_key', goalKey);

    return data || [];
  }

  private async processGoal(goal: GoalData, settings: any): Promise<void> {
    console.log(`[AdsOrchestrator] Processing goal: ${goal.goalKey}`);

    try {
      // 1. Ensure Learning campaign exists
      await this.ensureLearningCampaign(goal, settings);

      // 2. Detect winners
      const winners = await this.detectWinners(goal);

      // 3. Promote winners if auto-scale enabled
      if (settings.auto_scale_winners && winners.length > 0) {
        await this.promoteWinners(goal, winners, settings);
      }

      // 4. Scale budgets if appropriate
      if (settings.auto_scale_winners) {
        await this.scaleBudgets(goal, settings);
      }

      // 5. Pause losers if enabled
      if (settings.auto_pause_losers) {
        await this.pauseLosers(goal);
      }
    } catch (err) {
      console.error(`[AdsOrchestrator] Error processing goal ${goal.goalKey}:`, err);
      this.errors.push(`Goal ${goal.goalKey}: ${err instanceof Error ? err.message : 'Unknown error'}`);

      await this.logAction({
        actionType: 'error',
        goalKey: goal.goalKey,
        details: { error: err instanceof Error ? err.message : 'Unknown error' },
        status: 'failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  private async ensureLearningCampaign(goal: GoalData, settings: any): Promise<void> {
    // Check if learning campaign already exists
    const existingCampaign = await this.findExistingCampaign(goal.goalKey, 'testing');

    if (existingCampaign) {
      console.log(`[AdsOrchestrator] Learning campaign exists for ${goal.goalKey}: ${existingCampaign.id}`);
      return;
    }

    // Create learning campaign (placeholder - integrate with your Meta pipeline)
    await this.logAction({
      actionType: 'create_campaign',
      goalKey: goal.goalKey,
      details: {
        campaignRole: 'testing',
        budgetType: 'ABO',
        goalKey: goal.goalKey,
        templateKey: goal.templateKey,
      },
      status: this.config.dryRun ? 'pending' : 'success',
      message: `Would create learning campaign for ${goal.goalKey}`,
    });
  }

  private async detectWinners(goal: GoalData): Promise<WinnerCandidate[]> {
    const coreSignal = CORE_SIGNAL_MAP[goal.goalKey] || 'smartlinkclicked';

    // Placeholder: Query Meta API or your analytics for performance data
    // For now, return empty array
    // Real implementation would:
    // 1. Get all adsets in learning campaign for this goal
    // 2. Calculate cost per core event for each
    // 3. Filter by min spend/events thresholds
    // 4. Identify top performers

    return [];
  }

  private async promoteWinners(goal: GoalData, winners: WinnerCandidate[], settings: any): Promise<void> {
    for (const winner of winners) {
      // Check promotion cooldown
      const recentlyPromoted = await this.wasRecentlyPromoted(winner.adsetId, PROMOTION_COOLDOWN_HOURS);
      if (recentlyPromoted) {
        console.log(`[AdsOrchestrator] Skipping ${winner.adsetId} - recently promoted`);
        continue;
      }

      // Ensure scaling campaign exists
      await this.ensureScalingCampaign(goal, settings);

      // Promote winner (placeholder - integrate with your Meta pipeline)
      await this.logAction({
        actionType: 'promote_winner',
        goalKey: goal.goalKey,
        adsetId: winner.adsetId,
        details: {
          costPerEvent: winner.costPerEvent,
          spend: winner.spend,
          events: winner.events,
        },
        status: this.config.dryRun ? 'pending' : 'success',
        message: `Would promote adset ${winner.adsetId} to scaling campaign`,
      });
    }
  }

  private async ensureScalingCampaign(goal: GoalData, settings: any): Promise<void> {
    const existingCampaign = await this.findExistingCampaign(goal.goalKey, 'scaling');

    if (existingCampaign) {
      return;
    }

    // Create scaling campaign
    await this.logAction({
      actionType: 'create_campaign',
      goalKey: goal.goalKey,
      details: {
        campaignRole: 'scaling',
        budgetType: 'CBO',
        goalKey: goal.goalKey,
      },
      status: this.config.dryRun ? 'pending' : 'success',
      message: `Would create scaling campaign for ${goal.goalKey}`,
    });
  }

  private async scaleBudgets(goal: GoalData, settings: any): Promise<void> {
    // Check scaling cooldown
    const recentlyScaled = await this.wasRecentlyScaled(goal.goalKey, BUDGET_SCALE_COOLDOWN_HOURS);
    if (recentlyScaled) {
      return;
    }

    // Placeholder: Check if scaling campaign is performing well
    // If yes, increase budget by 20%

    await this.logAction({
      actionType: 'update_budget',
      goalKey: goal.goalKey,
      details: {
        action: 'increase',
        percentage: 20,
      },
      status: 'pending',
      message: `Would scale budget for ${goal.goalKey}`,
    });
  }

  private async pauseLosers(goal: GoalData): Promise<void> {
    // Placeholder: Find adsets with spend > $10 and 0 core events
    // Pause them

    await this.logAction({
      actionType: 'pause_adset',
      goalKey: goal.goalKey,
      details: {},
      status: 'pending',
      message: `Would pause losing adsets for ${goal.goalKey}`,
    });
  }

  private async findExistingCampaign(goalKey: string, role: string): Promise<any> {
    const { data } = await this.supabase
      .from('ad_campaigns')
      .select('*')
      .eq('user_id', this.config.userId)
      .eq('goal_key', goalKey)
      .eq('campaign_role', role)
      .maybeSingle();

    return data;
  }

  private async wasRecentlyPromoted(adsetId: string, hours: number): Promise<boolean> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const { data } = await this.supabase
      .from('ads_automation_actions')
      .select('id')
      .eq('user_id', this.config.userId)
      .eq('action_type', 'promote_winner')
      .eq('adset_id', adsetId)
      .gte('created_at', cutoff.toISOString())
      .maybeSingle();

    return !!data;
  }

  private async wasRecentlyScaled(goalKey: string, hours: number): Promise<boolean> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const { data } = await this.supabase
      .from('ads_automation_actions')
      .select('id')
      .eq('user_id', this.config.userId)
      .eq('action_type', 'update_budget')
      .eq('goal_key', goalKey)
      .gte('created_at', cutoff.toISOString())
      .maybeSingle();

    return !!data;
  }
}
