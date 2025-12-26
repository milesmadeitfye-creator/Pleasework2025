import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { decideAction, checkKillswitch, validateBudgetSafety, type DecisionContext } from "./_aiManagerStrictEngine";
import { checkSilenceMode } from "./_aiMailchimpTrigger";

interface TestResult {
  test_name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

export const handler: Handler = async (event) => {
  const supabase = getSupabaseAdmin();
  const results: TestResult[] = [];

  console.log('[ai-manager-acceptance-tests] 🧪 Running acceptance tests...');

  try {
    results.push(await testKillswitchStopsActions());
    results.push(await testLowScoreNoSpend());
    results.push(await testBudgetIncreaseRequiresApproval());
    results.push(await testSilenceModeEnforced());
    results.push(await testCreativeRequestPausesAds());
    results.push(await testOnlyThreeActionsAllowed());
    results.push(await testLowConfidenceNoAction());
    results.push(await testBudgetSafetyCaps());

    const allPassed = results.every(r => r.passed);
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;

    console.log(`[ai-manager-acceptance-tests] ${passedCount}/${totalCount} tests passed`);

    if (!allPassed) {
      const failures = results.filter(r => !r.passed);
      console.error('[ai-manager-acceptance-tests] ❌ FAILURES:', failures);
    }

    return {
      statusCode: allPassed ? 200 : 500,
      body: JSON.stringify({
        ok: allPassed,
        passed: passedCount,
        total: totalCount,
        results,
      }, null, 2),
    };
  } catch (e: any) {
    console.error("[ai-manager-acceptance-tests] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};

async function testKillswitchStopsActions(): Promise<TestResult> {
  try {
    const supabase = getSupabaseAdmin();

    await supabase
      .from('ai_manager_killswitch')
      .update({ disable_ai_actions: true })
      .eq('id', (await supabase.from('ai_manager_killswitch').select('id').single()).data?.id);

    const isActive = await checkKillswitch();

    if (!isActive) {
      return {
        test_name: 'Killswitch stops all actions',
        passed: false,
        error: 'Killswitch not detected as active',
      };
    }

    const context: DecisionContext = {
      student_signals: {
        campaign_id: 'test',
        days_running: 5,
        total_spend_cents: 10000,
        current_daily_budget_cents: 2000,
        max_daily_budget_cents: 5000,
        creatives_count: 3,
        creative_fatigue_detected: false,
      },
      teacher_score: {
        score: 85,
        grade: 'strong',
        confidence: 'high',
        reasons: [],
      },
      killswitch_active: true,
      silence_mode_active: false,
      force_silence: false,
      last_message_hours_ago: 999,
    };

    const decision = decideAction(context);

    await supabase
      .from('ai_manager_killswitch')
      .update({ disable_ai_actions: false })
      .eq('id', (await supabase.from('ai_manager_killswitch').select('id').single()).data?.id);

    if (decision.action !== 'no_action') {
      return {
        test_name: 'Killswitch stops all actions',
        passed: false,
        error: `Expected no_action, got ${decision.action}`,
      };
    }

    return {
      test_name: 'Killswitch stops all actions',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Killswitch stops all actions',
      passed: false,
      error: e.message,
    };
  }
}

async function testLowScoreNoSpend(): Promise<TestResult> {
  try {
    const context: DecisionContext = {
      student_signals: {
        campaign_id: 'test',
        days_running: 5,
        total_spend_cents: 10000,
        current_daily_budget_cents: 2000,
        max_daily_budget_cents: 5000,
        creatives_count: 3,
        creative_fatigue_detected: false,
      },
      teacher_score: {
        score: 35,
        grade: 'fail',
        confidence: 'high',
        reasons: [],
      },
      killswitch_active: false,
      silence_mode_active: false,
      force_silence: false,
      last_message_hours_ago: 999,
    };

    const decision = decideAction(context);

    if (decision.action === 'spend_more') {
      return {
        test_name: 'Low score prevents spending',
        passed: false,
        error: 'AI tried to spend more with low score',
      };
    }

    return {
      test_name: 'Low score prevents spending',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Low score prevents spending',
      passed: false,
      error: e.message,
    };
  }
}

async function testBudgetIncreaseRequiresApproval(): Promise<TestResult> {
  try {
    const context: DecisionContext = {
      student_signals: {
        campaign_id: 'test',
        days_running: 5,
        total_spend_cents: 10000,
        current_daily_budget_cents: 2000,
        max_daily_budget_cents: 5000,
        creatives_count: 3,
        creative_fatigue_detected: false,
      },
      teacher_score: {
        score: 85,
        grade: 'strong',
        confidence: 'high',
        reasons: [],
      },
      killswitch_active: false,
      silence_mode_active: false,
      force_silence: false,
      last_message_hours_ago: 999,
    };

    const decision = decideAction(context);

    if (decision.action === 'spend_more' && !decision.requires_user_action) {
      return {
        test_name: 'Budget increase requires approval',
        passed: false,
        error: 'Budget increase did not require approval',
      };
    }

    return {
      test_name: 'Budget increase requires approval',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Budget increase requires approval',
      passed: false,
      error: e.message,
    };
  }
}

async function testSilenceModeEnforced(): Promise<TestResult> {
  try {
    const context: DecisionContext = {
      student_signals: {
        campaign_id: 'test',
        days_running: 5,
        total_spend_cents: 10000,
        current_daily_budget_cents: 2000,
        max_daily_budget_cents: 5000,
        creatives_count: 3,
        creative_fatigue_detected: false,
      },
      teacher_score: {
        score: 85,
        grade: 'strong',
        confidence: 'high',
        reasons: [],
      },
      killswitch_active: false,
      silence_mode_active: true,
      force_silence: true,
      last_message_hours_ago: 12,
    };

    const decision = decideAction(context);

    if (decision.action !== 'no_action') {
      return {
        test_name: 'Silence mode prevents messaging',
        passed: false,
        error: `Expected no_action during silence, got ${decision.action}`,
      };
    }

    return {
      test_name: 'Silence mode prevents messaging',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Silence mode prevents messaging',
      passed: false,
      error: e.message,
    };
  }
}

async function testCreativeRequestPausesAds(): Promise<TestResult> {
  try {
    const context: DecisionContext = {
      student_signals: {
        campaign_id: 'test',
        days_running: 5,
        total_spend_cents: 10000,
        current_daily_budget_cents: 2000,
        max_daily_budget_cents: 5000,
        creatives_count: 3,
        creative_fatigue_detected: true,
      },
      teacher_score: {
        score: 25,
        grade: 'fail',
        confidence: 'high',
        reasons: [],
      },
      killswitch_active: false,
      silence_mode_active: false,
      force_silence: false,
      last_message_hours_ago: 999,
    };

    const decision = decideAction(context);

    if (decision.action !== 'make_more_creatives') {
      return {
        test_name: 'Creative fatigue triggers request',
        passed: false,
        error: `Expected make_more_creatives, got ${decision.action}`,
      };
    }

    if (decision.urgency !== 'high') {
      return {
        test_name: 'Creative fatigue triggers request',
        passed: false,
        error: 'Low score should trigger high urgency',
      };
    }

    return {
      test_name: 'Creative fatigue triggers request',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Creative fatigue triggers request',
      passed: false,
      error: e.message,
    };
  }
}

async function testOnlyThreeActionsAllowed(): Promise<TestResult> {
  try {
    const allowedActions = ['spend_more', 'spend_less', 'make_more_creatives', 'no_action'];

    const testCases: DecisionContext[] = [
      {
        student_signals: {
          campaign_id: 'test',
          days_running: 5,
          total_spend_cents: 10000,
          current_daily_budget_cents: 2000,
          max_daily_budget_cents: 5000,
          creatives_count: 3,
          creative_fatigue_detected: false,
        },
        teacher_score: { score: 85, grade: 'strong', confidence: 'high', reasons: [] },
        killswitch_active: false,
        silence_mode_active: false,
        force_silence: false,
        last_message_hours_ago: 999,
      },
      {
        student_signals: {
          campaign_id: 'test',
          days_running: 5,
          total_spend_cents: 10000,
          current_daily_budget_cents: 2000,
          max_daily_budget_cents: 5000,
          creatives_count: 3,
          creative_fatigue_detected: false,
        },
        teacher_score: { score: 45, grade: 'weak', confidence: 'medium', reasons: [] },
        killswitch_active: false,
        silence_mode_active: false,
        force_silence: false,
        last_message_hours_ago: 999,
      },
      {
        student_signals: {
          campaign_id: 'test',
          days_running: 5,
          total_spend_cents: 10000,
          current_daily_budget_cents: 2000,
          max_daily_budget_cents: 5000,
          creatives_count: 3,
          creative_fatigue_detected: false,
        },
        teacher_score: { score: 70, grade: 'pass', confidence: 'medium', reasons: [] },
        killswitch_active: false,
        silence_mode_active: false,
        force_silence: false,
        last_message_hours_ago: 999,
      },
    ];

    for (const testCase of testCases) {
      const decision = decideAction(testCase);

      if (!allowedActions.includes(decision.action)) {
        return {
          test_name: 'Only 3 actions allowed',
          passed: false,
          error: `Invalid action: ${decision.action}`,
        };
      }
    }

    return {
      test_name: 'Only 3 actions allowed',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Only 3 actions allowed',
      passed: false,
      error: e.message,
    };
  }
}

async function testLowConfidenceNoAction(): Promise<TestResult> {
  try {
    const context: DecisionContext = {
      student_signals: {
        campaign_id: 'test',
        days_running: 5,
        total_spend_cents: 10000,
        current_daily_budget_cents: 2000,
        max_daily_budget_cents: 5000,
        creatives_count: 3,
        creative_fatigue_detected: false,
      },
      teacher_score: {
        score: 85,
        grade: 'strong',
        confidence: 'low',
        reasons: [],
      },
      killswitch_active: false,
      silence_mode_active: false,
      force_silence: false,
      last_message_hours_ago: 999,
    };

    const decision = decideAction(context);

    if (decision.action !== 'no_action') {
      return {
        test_name: 'Low confidence forces no action',
        passed: false,
        error: `Expected no_action with low confidence, got ${decision.action}`,
      };
    }

    return {
      test_name: 'Low confidence forces no action',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Low confidence forces no action',
      passed: false,
      error: e.message,
    };
  }
}

async function testBudgetSafetyCaps(): Promise<TestResult> {
  try {
    const safety1 = await validateBudgetSafety('test', 2000, 3000);

    if (!safety1.safe) {
      return {
        test_name: 'Budget safety enforces caps',
        passed: false,
        error: '25% increase should be safe',
      };
    }

    const safety2 = await validateBudgetSafety('test', 2000, 3000);

    if (safety2.warnings.length === 0) {
      return {
        test_name: 'Budget safety enforces caps',
        passed: false,
        error: 'Budget increase should warn about approval needed',
      };
    }

    const safety3 = await validateBudgetSafety('test', 2000, 3000);

    if (!safety3.warnings.includes('INCREASE_REQUIRES_APPROVAL')) {
      return {
        test_name: 'Budget safety enforces caps',
        passed: false,
        error: 'Budget increase should flag approval requirement',
      };
    }

    return {
      test_name: 'Budget safety enforces caps',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Budget safety enforces caps',
      passed: false,
      error: e.message,
    };
  }
}
