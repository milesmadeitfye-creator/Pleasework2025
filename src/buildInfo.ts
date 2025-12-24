/**
 * Build information - injected at build time via environment variables
 * Used to verify which branch/commit is running in production
 */

export const BUILD_INFO = {
  branch: import.meta.env.VITE_GIT_BRANCH || 'unknown',
  commit: import.meta.env.VITE_GIT_COMMIT_SHA?.substring(0, 7) || 'unknown',
  buildTime: import.meta.env.VITE_BUILD_TIME || 'unknown',
  context: import.meta.env.CONTEXT || 'unknown',
} as const;

/**
 * Returns a compact build stamp string for display
 * Example: "stable-v1@a1b2c3d"
 */
export function getBuildStamp(): string {
  const { branch, commit } = BUILD_INFO;
  return `${branch}@${commit}`;
}

/**
 * Returns full build information as a formatted string
 */
export function getFullBuildInfo(): string {
  const { branch, commit, buildTime, context } = BUILD_INFO;
  return `Branch: ${branch} | Commit: ${commit} | Built: ${buildTime} | Context: ${context}`;
}
