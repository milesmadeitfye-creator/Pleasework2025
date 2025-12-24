/**
 * Feature flags for AI Operator
 * Set to false to disable backend calls until tables/functions are ready
 */

export const OPERATOR_CONFIG = {
  // Main enable/disable switch
  ENABLED: true,

  // Individual feature flags
  LOAD_SETTINGS: true,
  LOAD_ACTIONS: true,
  RUN_ANALYSIS: true,
  EXECUTE_ACTIONS: false, // Keep disabled for V1 (suggest-only)

  // UI behavior when disabled
  SHOW_WARMING_UP: false,
  SHOW_INSIGHTS_FROM_CONTEXT: true,
};

export function isOperatorEnabled(): boolean {
  return OPERATOR_CONFIG.ENABLED;
}

export function canLoadSettings(): boolean {
  return OPERATOR_CONFIG.ENABLED && OPERATOR_CONFIG.LOAD_SETTINGS;
}

export function canLoadActions(): boolean {
  return OPERATOR_CONFIG.ENABLED && OPERATOR_CONFIG.LOAD_ACTIONS;
}

export function canRunAnalysis(): boolean {
  return OPERATOR_CONFIG.ENABLED && OPERATOR_CONFIG.RUN_ANALYSIS;
}

export function canExecuteActions(): boolean {
  return OPERATOR_CONFIG.ENABLED && OPERATOR_CONFIG.EXECUTE_ACTIONS;
}
