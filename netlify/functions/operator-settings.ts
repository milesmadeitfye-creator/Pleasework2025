import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { _headers } from './_headers';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const DEFAULT_SETTINGS = {
  enabled: false,
  mode: 'auto_full' as const,
  daily_spend_cap_cents: 0, // 0 = no cap
  max_budget_change_pct: 30,
  min_impressions_for_kill: 1000,
  cooldown_hours: 2, // min 1 hour
};

// Validation: ensure numbers are valid and within bounds
function validateSettings(settings: Partial<OperatorSettings>): OperatorSettings {
  return {
    enabled: settings.enabled ?? DEFAULT_SETTINGS.enabled,
    mode: settings.mode ?? DEFAULT_SETTINGS.mode,
    daily_spend_cap_cents: Math.max(0, Math.floor(settings.daily_spend_cap_cents ?? DEFAULT_SETTINGS.daily_spend_cap_cents)),
    max_budget_change_pct: Math.min(50, Math.max(5, Math.floor(settings.max_budget_change_pct ?? DEFAULT_SETTINGS.max_budget_change_pct))),
    min_impressions_for_kill: Math.max(100, Math.floor(settings.min_impressions_for_kill ?? DEFAULT_SETTINGS.min_impressions_for_kill)),
    cooldown_hours: Math.max(1, Math.floor(settings.cooldown_hours ?? DEFAULT_SETTINGS.cooldown_hours)),
  };
}

interface OperatorSettings {
  enabled: boolean;
  mode: 'suggest_only' | 'auto_safe' | 'auto_full';
  daily_spend_cap_cents: number;
  max_budget_change_pct: number;
  min_impressions_for_kill: number;
  cooldown_hours: number;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: _headers, body: '' };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: _headers,
        body: JSON.stringify({ error: 'unauthorized', detail: 'Missing or invalid Authorization header' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: _headers,
        body: JSON.stringify({ error: 'unauthorized', detail: 'Invalid token' }),
      };
    }

    const userId = user.id;

    if (event.httpMethod === 'GET') {
      try {
        const { data, error } = await supabase
          .from('ai_operator_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.warn('[operator-settings] GET query failed:', error.message);
          return {
            statusCode: 200,
            headers: _headers,
            body: JSON.stringify({
              ok: true,
              settings: DEFAULT_SETTINGS,
              warning: 'Using default settings (table unavailable)',
            }),
          };
        }

        if (!data) {
          // Auto-create settings row with defaults for first-time users
          console.log('[operator-settings] No settings found, creating defaults for user:', userId);

          const { data: newSettings, error: insertError } = await supabase
            .from('ai_operator_settings')
            .insert({
              user_id: userId,
              enabled: DEFAULT_SETTINGS.enabled,
              mode: DEFAULT_SETTINGS.mode,
              daily_spend_cap_cents: DEFAULT_SETTINGS.daily_spend_cap_cents,
              max_budget_change_pct: DEFAULT_SETTINGS.max_budget_change_pct,
              min_impressions_for_kill: DEFAULT_SETTINGS.min_impressions_for_kill,
              cooldown_hours: DEFAULT_SETTINGS.cooldown_hours,
            })
            .select()
            .single();

          if (insertError) {
            console.warn('[operator-settings] Failed to auto-create settings:', insertError.message);
            return {
              statusCode: 200,
              headers: _headers,
              body: JSON.stringify({
                ok: true,
                settings: DEFAULT_SETTINGS,
                warning: 'Using default settings (auto-create failed)',
              }),
            };
          }

          console.log('[operator-settings] Settings created successfully for user:', userId);
          return {
            statusCode: 200,
            headers: _headers,
            body: JSON.stringify({
              ok: true,
              settings: validateSettings(newSettings),
              initialized: true,
            }),
          };
        }

        // Validate and normalize settings to prevent NaN
        const settings = validateSettings({
          enabled: data.enabled,
          mode: data.mode,
          daily_spend_cap_cents: data.daily_spend_cap_cents,
          max_budget_change_pct: data.max_budget_change_pct,
          min_impressions_for_kill: data.min_impressions_for_kill,
          cooldown_hours: data.cooldown_hours,
        });

        return {
          statusCode: 200,
          headers: _headers,
          body: JSON.stringify({ ok: true, settings }),
        };
      } catch (error: any) {
        console.error('[operator-settings] GET unexpected error:', error);
        return {
          statusCode: 200,
          headers: _headers,
          body: JSON.stringify({
            ok: true,
            settings: DEFAULT_SETTINGS,
            warning: `Using default settings (error: ${error.message})`,
          }),
        };
      }
    }

    if (event.httpMethod === 'PUT') {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: _headers,
          body: JSON.stringify({ error: 'bad_request', detail: 'Missing request body' }),
        };
      }

      const rawUpdates = JSON.parse(event.body) as Partial<OperatorSettings>;

      // Validate updates to prevent NaN and invalid values
      const validatedUpdates = validateSettings(rawUpdates);

      try {
        const { data, error } = await supabase
          .from('ai_operator_settings')
          .upsert({
            user_id: userId,
            enabled: validatedUpdates.enabled,
            mode: validatedUpdates.mode,
            daily_spend_cap_cents: validatedUpdates.daily_spend_cap_cents,
            max_budget_change_pct: validatedUpdates.max_budget_change_pct,
            min_impressions_for_kill: validatedUpdates.min_impressions_for_kill,
            cooldown_hours: validatedUpdates.cooldown_hours,
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          console.warn('[operator-settings] PUT upsert failed:', error.message);
          return {
            statusCode: 200,
            headers: _headers,
            body: JSON.stringify({
              ok: true,
              settings: validatedUpdates,
              warning: 'Settings not persisted (table unavailable)',
            }),
          };
        }

        // Validate returned data to prevent NaN
        const settings = validateSettings(data);

        return {
          statusCode: 200,
          headers: _headers,
          body: JSON.stringify({ ok: true, settings }),
        };
      } catch (error: any) {
        console.error('[operator-settings] PUT unexpected error:', error);
        return {
          statusCode: 200,
          headers: _headers,
          body: JSON.stringify({
            ok: true,
            settings: validatedUpdates,
            warning: `Settings not persisted (error: ${error.message})`,
          }),
        };
      }
    }

    return {
      statusCode: 405,
      headers: _headers,
      body: JSON.stringify({ error: 'method_not_allowed', detail: 'Only GET and PUT are supported' }),
    };
  } catch (error: any) {
    console.error('[operator-settings] Fatal error:', error);
    return {
      statusCode: 500,
      headers: _headers,
      body: JSON.stringify({
        ok: false,
        error: 'operator_settings_error',
        detail: error.message,
        hint: 'Check server logs for details',
      }),
    };
  }
};
