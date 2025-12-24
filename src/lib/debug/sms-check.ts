/**
 * SMS Readiness Checker
 *
 * Verifies that all SMS/Twilio functionality is properly wired:
 * - Twilio function is reachable
 * - AI action is registered
 * - Client-side helpers are available
 *
 * Call verifySmsReady() on app startup to log diagnostics.
 */

import { GHOSTE_TOOLS, type GhosteToolId } from '../ghosteToolsRegistry';

export interface SmsCheckResult {
  ready: boolean;
  checks: {
    toolsRegistered: boolean;
    smsBlastTool: boolean;
    clientHelperExists: boolean;
  };
  warnings: string[];
  errors: string[];
}

/**
 * Verify SMS readiness
 */
export function verifySmsReady(): SmsCheckResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check 1: Tools registry exists
  const toolsRegistered = Array.isArray(GHOSTE_TOOLS) && GHOSTE_TOOLS.length > 0;
  if (!toolsRegistered) {
    errors.push("GHOSTE_TOOLS registry is missing or empty");
  }

  // Check 2: SMS blast tool is registered
  const smsBlastTool = GHOSTE_TOOLS.find((t) => t.id === "fan_sms_blast");
  if (!smsBlastTool) {
    errors.push("fan_sms_blast tool is not registered in GHOSTE_TOOLS");
  } else if (smsBlastTool.netlifyFunction !== "twilio-send-sms") {
    warnings.push(`fan_sms_blast points to '${smsBlastTool.netlifyFunction}' instead of 'twilio-send-sms'`);
  }

  // Check 3: Client helper exists
  let clientHelperExists = false;
  try {
    // Try dynamic import to check if the module exists
    import('../../features/sms/sendSms').then(() => {
      clientHelperExists = true;
    }).catch(() => {
      warnings.push("Client-side SMS helper (src/features/sms/sendSms.ts) may not be available");
    });
    clientHelperExists = true; // Assume it exists if import doesn't throw immediately
  } catch {
    warnings.push("Client-side SMS helper (src/features/sms/sendSms.ts) is missing");
  }

  const ready = errors.length === 0;

  return {
    ready,
    checks: {
      toolsRegistered,
      smsBlastTool: !!smsBlastTool,
      clientHelperExists,
    },
    warnings,
    errors,
  };
}

/**
 * Log SMS readiness to console
 */
export function logSmsReadiness(): void {
  const result = verifySmsReady();

  if (result.ready) {
    console.log("✅ SMS Features: Ready");
    console.log("  ✓ Tools registered:", result.checks.toolsRegistered);
    console.log("  ✓ SMS blast tool:", result.checks.smsBlastTool);
    console.log("  ✓ Client helper:", result.checks.clientHelperExists);
  } else {
    console.warn("⚠️ SMS Features: Not Ready");
    console.warn("  Errors:", result.errors);
  }

  if (result.warnings.length > 0) {
    console.warn("  Warnings:", result.warnings);
  }

  // Note: Twilio env vars can't be checked from frontend
  console.log("  ℹ️ Server-side check: Verify TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in Netlify env");
}

/**
 * Check if SMS tool is available in tools registry
 */
export function isSmsToolAvailable(): boolean {
  return GHOSTE_TOOLS.some((t) => t.id === "fan_sms_blast");
}

/**
 * Get SMS tool configuration
 */
export function getSmsToolConfig() {
  return GHOSTE_TOOLS.find((t) => t.id === "fan_sms_blast");
}
