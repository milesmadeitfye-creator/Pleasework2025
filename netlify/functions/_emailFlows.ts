/**
 * Email Flow Configuration Helpers
 *
 * Provides functions to read/write email automation flows from Supabase
 * instead of relying on large environment variables.
 */

import { supabaseAdmin } from "./_supabaseAdmin";

/**
 * Email flow step definition
 */
export type EmailFlowStep = {
  id?: string;
  delayMinutes?: number;
  delayHours?: number;
  delayDays?: number;
  templateKey?: string;   // e.g. "welcome_1", "reminder_2"
  trigger?: string;       // e.g. "signup", "no_open", "no_click"
  subject?: string;       // Email subject
  content?: string;       // Email content/template
  meta?: Record<string, any>;
};

/**
 * Complete email flow definition
 */
export type EmailFlow = {
  id: string;
  name: string;
  description?: string | null;
  steps: EmailFlowStep[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

/**
 * Get an email flow by name
 *
 * @param name - Flow identifier (e.g., "onboarding_v1")
 * @returns The email flow, or null if not found
 */
export async function getEmailFlowByName(
  name: string
): Promise<EmailFlow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("email_flows")
      .select("*")
      .eq("name", name)
      .maybeSingle();

    if (error) {
      console.error("[email_flows] getEmailFlowByName error", { name, error });
      return null;
    }

    if (!data) {
      console.warn("[email_flows] No flow found for name:", name);
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      steps: data.steps || [],
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (err) {
    console.error("[email_flows] getEmailFlowByName exception", { name, err });
    return null;
  }
}

/**
 * Get all active email flows
 *
 * @returns Array of active email flows
 */
export async function getActiveEmailFlows(): Promise<EmailFlow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("email_flows")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("[email_flows] getActiveEmailFlows error", error);
      return [];
    }

    return (data || []).map(d => ({
      id: d.id,
      name: d.name,
      description: d.description,
      steps: d.steps || [],
      is_active: d.is_active,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));
  } catch (err) {
    console.error("[email_flows] getActiveEmailFlows exception", err);
    return [];
  }
}

/**
 * Create or update an email flow
 *
 * @param name - Flow identifier
 * @param description - Human-readable description
 * @param steps - Array of flow steps
 * @param isActive - Whether the flow is active
 */
export async function upsertEmailFlow(
  name: string,
  description: string | null,
  steps: EmailFlowStep[],
  isActive = true
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("email_flows")
      .upsert(
        {
          name,
          description,
          steps,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "name" }
      );

    if (error) {
      console.error("[email_flows] upsertEmailFlow error", { name, error });
      throw error;
    }

    console.log("[email_flows] Successfully upserted flow:", name);
  } catch (err) {
    console.error("[email_flows] upsertEmailFlow exception", { name, err });
    throw err;
  }
}

/**
 * Delete an email flow
 *
 * @param name - Flow identifier to delete
 */
export async function deleteEmailFlow(name: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("email_flows")
      .delete()
      .eq("name", name);

    if (error) {
      console.error("[email_flows] deleteEmailFlow error", { name, error });
      throw error;
    }

    console.log("[email_flows] Successfully deleted flow:", name);
  } catch (err) {
    console.error("[email_flows] deleteEmailFlow exception", { name, err });
    throw err;
  }
}

/**
 * Get all email flows (active and inactive)
 *
 * @returns Array of all email flows
 */
export async function getAllEmailFlows(): Promise<EmailFlow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("email_flows")
      .select("*")
      .order("name");

    if (error) {
      console.error("[email_flows] getAllEmailFlows error", error);
      return [];
    }

    return (data || []).map(d => ({
      id: d.id,
      name: d.name,
      description: d.description,
      steps: d.steps || [],
      is_active: d.is_active,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));
  } catch (err) {
    console.error("[email_flows] getAllEmailFlows exception", err);
    return [];
  }
}
