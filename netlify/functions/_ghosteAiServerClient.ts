/**
 * Ghoste AI Server Client
 *
 * Helper functions for calling Ghoste AI from serverless functions.
 * Used for generating email copy, ad copy, content ideas, etc.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Generate email subject and body using Ghoste AI
 *
 * @param opts - Options for email generation
 * @returns Generated email copy or null if AI fails
 */
export async function generateEmailCopy(opts: {
  userId: string;
  step: {
    subjectPrompt: string;
    bodyPrompt: string;
    [key: string]: any;
  };
  userContext: {
    first_name?: string;
    email?: string;
    [key: string]: any;
  };
}): Promise<{ subject: string; body: string } | null> {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[generateEmailCopy] Supabase not configured');
      return null;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Call Ghoste AI edge function
    const { data, error } = await supabase.functions.invoke('ghoste-ai', {
      body: {
        user_id: opts.userId,
        task: 'email_draft',
        payload: {
          subject_prompt: opts.step.subjectPrompt,
          body_prompt: opts.step.bodyPrompt,
          user_context: opts.userContext,
        },
      },
    });

    if (error) {
      console.error('[generateEmailCopy] Ghoste AI error:', error);
      return null;
    }

    if (!data?.ok) {
      console.error('[generateEmailCopy] Ghoste AI returned not ok:', data);
      return null;
    }

    const result = data.result;

    if (!result?.subject || !result?.body) {
      console.error('[generateEmailCopy] Ghoste AI missing subject or body:', result);
      return null;
    }

    return {
      subject: result.subject.trim(),
      body: result.body.trim(),
    };
  } catch (err: any) {
    console.error('[generateEmailCopy] Exception:', err?.message || err);
    return null;
  }
}

/**
 * Generate AI text using fallback to simple template replacement
 *
 * This is a lightweight alternative that doesn't call the AI but does basic variable replacement.
 *
 * @param template - Template string with {{variable}} placeholders
 * @param variables - Variables to replace in template
 * @returns Processed template string
 */
export function simpleTemplateReplace(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }

  return result;
}
