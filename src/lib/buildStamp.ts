/**
 * Build stamp for deploy verification
 * This value changes on every build to confirm fresh deploys are live
 */
export const BUILD_STAMP = `DEPLOY_${new Date().toISOString().replace(/[:.]/g, '-')}`;
export const BUILD_DATE = new Date().toISOString();
export const BUILD_VERSION = '1.0.0';

/**
 * Returns a short, human-readable build identifier
 */
export function getBuildInfo() {
  return {
    stamp: BUILD_STAMP,
    date: BUILD_DATE,
    version: BUILD_VERSION,
  };
}
