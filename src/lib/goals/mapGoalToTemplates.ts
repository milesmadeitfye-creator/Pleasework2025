/**
 * Maps overall goals to ads template keys
 */
import { GOAL_REGISTRY, type OverallGoalKey } from './goalRegistry';

/**
 * Get template keys for a given overall goal
 */
export function getTemplatesForGoal(goalKey: OverallGoalKey): string[] {
  const goal = GOAL_REGISTRY[goalKey];
  return goal ? goal.defaultTemplateKeys : [];
}

/**
 * Get the primary (first) template key for a goal
 */
export function getPrimaryTemplateForGoal(goalKey: OverallGoalKey): string | null {
  const templates = getTemplatesForGoal(goalKey);
  return templates.length > 0 ? templates[0] : null;
}

/**
 * Reverse map: template key to overall goal
 */
export function getGoalForTemplate(templateKey: string): OverallGoalKey | null {
  for (const [goalKey, goal] of Object.entries(GOAL_REGISTRY)) {
    if (goal.defaultTemplateKeys.includes(templateKey)) {
      return goalKey as OverallGoalKey;
    }
  }
  return null;
}

/**
 * Get all template keys across all goals
 */
export function getAllTemplateKeys(): string[] {
  const allTemplates: string[] = [];
  for (const goal of Object.values(GOAL_REGISTRY)) {
    allTemplates.push(...goal.defaultTemplateKeys);
  }
  return Array.from(new Set(allTemplates));
}
