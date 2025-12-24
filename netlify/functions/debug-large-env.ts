/**
 * Debug Utility: Detect Large Environment Variables
 *
 * This endpoint analyzes all environment variables and identifies
 * which ones are consuming significant space (over 400 characters).
 *
 * This helps identify candidates for migration to Supabase config tables.
 *
 * Usage: GET /.netlify/functions/debug-large-env
 *
 * IMPORTANT: This is for internal debugging only. Do not expose to end users.
 */

import type { Handler } from "@netlify/functions";

const THRESHOLD = 400; // characters

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

export const handler: Handler = async (event) => {
  // Handle OPTIONS for CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const largeEnv: Array<{
      key: string;
      length: number;
      preview: string;
      type: string;
    }> = [];

    // Analyze all environment variables
    for (const [key, value] of Object.entries(process.env)) {
      if (!value) continue;

      const length = value.length;

      if (length >= THRESHOLD) {
        // Determine type
        let type = "string";
        let preview = value.substring(0, 100);

        try {
          JSON.parse(value);
          type = "json";
          preview = value.substring(0, 100) + "... (JSON)";
        } catch {
          // Not JSON, keep as string
          preview = value.substring(0, 100) + "...";
        }

        largeEnv.push({
          key,
          length,
          preview,
          type,
        });
      }
    }

    // Sort by size (largest first)
    largeEnv.sort((a, b) => b.length - a.length);

    // Calculate total size
    const totalSize = largeEnv.reduce((sum, env) => sum + env.length, 0);

    // Categorize by prefix
    const categories: Record<string, number> = {};
    largeEnv.forEach(env => {
      const prefix = env.key.split("_")[0];
      categories[prefix] = (categories[prefix] || 0) + 1;
    });

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        {
          summary: {
            threshold: THRESHOLD,
            count: largeEnv.length,
            totalSize,
            averageSize: Math.round(totalSize / largeEnv.length) || 0,
          },
          categories,
          envVars: largeEnv,
          recommendations: [
            "Environment variables over 400 characters should be migrated to Supabase.",
            "Use the migrate-env-config-to-supabase function to perform the migration.",
            "After migration, verify data in Supabase before deleting env vars.",
          ],
          nextSteps: [
            "1. Review the envVars list above",
            "2. Add relevant keys to migrate-env-config-to-supabase.ts",
            "3. Run the migration function",
            "4. Verify data in Supabase app_config and email_flows tables",
            "5. Delete env vars from Netlify dashboard",
          ],
        },
        null,
        2
      ),
    };
  } catch (err: any) {
    console.error("[debug-large-env] Error:", err);
    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Failed to analyze environment variables",
        message: err.message,
      }),
    };
  }
};
