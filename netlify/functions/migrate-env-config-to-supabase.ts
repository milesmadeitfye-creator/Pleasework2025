/**
 * Environment Variable Migration to Supabase
 *
 * This function migrates large environment variables into Supabase config tables:
 * - Email flows go into email_flows table
 * - Other configs go into app_config table
 *
 * Usage: POST /.netlify/functions/migrate-env-config-to-supabase
 *
 * IMPORTANT:
 * 1. First, run debug-large-env to identify large env vars
 * 2. Add the env var keys you want to migrate to the arrays below
 * 3. Run this function once to perform the migration
 * 4. Verify the data in Supabase
 * 5. Only then delete the env vars from Netlify
 *
 * DO NOT automatically delete env vars - the user must verify first!
 */

import type { Handler } from "@netlify/functions";
import { setAppConfig } from "./_appConfig";
import { upsertEmailFlow, type EmailFlowStep } from "./_emailFlows";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

/**
 * Email flow environment variable mappings
 *
 * TODO: Add your email flow env vars here based on debug-large-env output
 * Example format:
 */
type EnvFlowMapping = {
  envKey: string;        // The env var name
  flowName: string;      // The flow name to use in Supabase
  description?: string;  // Human-readable description
};

const EMAIL_FLOW_ENV_VARS: EnvFlowMapping[] = [
  // TODO: User should add real env keys here
  // Example:
  // {
  //   envKey: "GHOSTE_EMAIL_FLOW_ONBOARDING",
  //   flowName: "onboarding_v1",
  //   description: "Default onboarding flow for new signups",
  // },
  // {
  //   envKey: "GHOSTE_EMAIL_SEQUENCE_REACTIVATION",
  //   flowName: "reactivation_v1",
  //   description: "Re-engagement flow for inactive users",
  // },
];

/**
 * Generic application config environment variables
 *
 * TODO: Add your app config env vars here based on debug-large-env output
 * Example format: Just the env var key as a string
 */
const APP_CONFIG_ENV_VARS: string[] = [
  // TODO: User should add real env keys here
  // Example:
  // "GHOSTE_DEFAULT_EMAIL_HTML",
  // "GHOSTE_SMARTLINK_DEFAULT_CONFIG",
  // "META_DEFAULT_THUMB_URL",
  // "GHOSTE_EMAIL_TEMPLATES",
];

export const handler: Handler = async (event) => {
  // Handle OPTIONS for CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed, use POST" }),
    };
  }

  try {
    const migratedFlows: string[] = [];
    const migratedConfig: string[] = [];
    const missingEnv: string[] = [];
    const errors: Array<{ key: string; error: string }> = [];

    console.log("[migrate-env-config] Starting migration...");

    // ========================================
    // Migrate Email Flows
    // ========================================
    console.log("[migrate-env-config] Migrating", EMAIL_FLOW_ENV_VARS.length, "email flows...");

    for (const mapping of EMAIL_FLOW_ENV_VARS) {
      const raw = process.env[mapping.envKey];

      if (!raw) {
        console.warn("[migrate-env-config] Missing env var:", mapping.envKey);
        missingEnv.push(mapping.envKey);
        continue;
      }

      let steps: EmailFlowStep[];
      try {
        const parsed = JSON.parse(raw);
        steps = Array.isArray(parsed) ? parsed : [parsed];
      } catch (err: any) {
        console.error(
          `[migrate-env-config] Failed to parse JSON for ${mapping.envKey}`,
          err
        );
        errors.push({
          key: mapping.envKey,
          error: `JSON parse failed: ${err.message}`,
        });
        continue;
      }

      try {
        await upsertEmailFlow(
          mapping.flowName,
          mapping.description || null,
          steps,
          true
        );
        migratedFlows.push(
          `${mapping.envKey} → email_flows.name="${mapping.flowName}" (${steps.length} steps)`
        );
        console.log("[migrate-env-config] ✅ Migrated flow:", mapping.flowName);
      } catch (err: any) {
        console.error(
          `[migrate-env-config] upsertEmailFlow failed for ${mapping.envKey}`,
          err
        );
        errors.push({
          key: mapping.envKey,
          error: `Database error: ${err.message}`,
        });
      }
    }

    // ========================================
    // Migrate Generic App Config
    // ========================================
    console.log("[migrate-env-config] Migrating", APP_CONFIG_ENV_VARS.length, "app configs...");

    for (const envKey of APP_CONFIG_ENV_VARS) {
      const raw = process.env[envKey];

      if (!raw) {
        console.warn("[migrate-env-config] Missing env var:", envKey);
        missingEnv.push(envKey);
        continue;
      }

      let value: any = raw;

      // Try to parse as JSON; if it fails, store as string
      try {
        value = JSON.parse(raw);
      } catch {
        // Not JSON, store as plain string
        value = raw;
      }

      try {
        await setAppConfig(envKey, value);
        const valueType = typeof value === "string" ? "string" : "json";
        migratedConfig.push(
          `${envKey} → app_config.key="${envKey}" (${valueType})`
        );
        console.log("[migrate-env-config] ✅ Migrated config:", envKey);
      } catch (err: any) {
        console.error(
          `[migrate-env-config] setAppConfig failed for ${envKey}`,
          err
        );
        errors.push({
          key: envKey,
          error: `Database error: ${err.message}`,
        });
      }
    }

    // ========================================
    // Build Response
    // ========================================
    const allMigrated = [...migratedFlows, ...migratedConfig];
    const successCount = allMigrated.length;
    const errorCount = errors.length + missingEnv.length;

    console.log("[migrate-env-config] Migration complete:", {
      success: successCount,
      errors: errorCount,
    });

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        {
          success: true,
          message: `Migration attempted. Migrated ${successCount} configs, ${errorCount} had issues.`,
          summary: {
            migratedFlows: migratedFlows.length,
            migratedConfig: migratedConfig.length,
            missingEnv: missingEnv.length,
            errors: errors.length,
          },
          details: {
            migratedFlows,
            migratedConfig,
            missingEnv,
            errors,
          },
          safeToDeleteAfterVerification: {
            warning:
              "⚠️  IMPORTANT: Verify data in Supabase BEFORE deleting any env vars!",
            steps: [
              "1. Check app_config table in Supabase for your configs",
              "2. Check email_flows table in Supabase for your flows",
              "3. Test that your app can read from Supabase successfully",
              "4. Only then delete these env vars from Netlify:",
            ],
            emailFlowEnvVars: EMAIL_FLOW_ENV_VARS.map((m) => m.envKey).filter(
              (key) => !missingEnv.includes(key) && !errors.find((e) => e.key === key)
            ),
            appConfigEnvVars: APP_CONFIG_ENV_VARS.filter(
              (key) => !missingEnv.includes(key) && !errors.find((e) => e.key === key)
            ),
          },
          nextSteps: [
            "1. Review the migration results above",
            "2. Visit Supabase and verify the data is correct",
            "3. Test your application to ensure it reads from Supabase",
            "4. Delete the env vars listed in safeToDeleteAfterVerification",
            "5. Monitor your application for any issues",
          ],
        },
        null,
        2
      ),
    };
  } catch (err: any) {
    console.error("[migrate-env-config] Fatal error:", err);
    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        error: "Migration failed",
        message: err.message,
      }),
    };
  }
};
