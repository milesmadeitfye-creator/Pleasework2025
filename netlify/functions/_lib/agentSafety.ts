import { supabaseAdmin } from '../_supabaseAdmin';

export interface AgentRunLog {
  userId: string;
  toolName: string;
  input: any;
  output?: any;
  status: 'success' | 'error' | 'pending';
  errorMessage?: string;
  durationMs?: number;
}

export async function checkRateLimit(userId: string): Promise<boolean> {
  const sb = supabaseAdmin();

  try {
    const { data, error } = await sb.rpc('check_agent_rate_limit', {
      p_user_id: userId
    });

    if (error) {
      console.error('[agentSafety] Rate limit check error:', error);
      return true; // Allow on error to not block users
    }

    return data === true;
  } catch (err) {
    console.error('[agentSafety] Rate limit check failed:', err);
    return true; // Allow on error
  }
}

export async function logAgentRun(log: AgentRunLog): Promise<void> {
  const sb = supabaseAdmin();

  try {
    const { error } = await sb.from('agent_runs').insert({
      user_id: log.userId,
      tool_name: log.toolName,
      input: log.input || null,
      output: log.output || null,
      status: log.status,
      error_message: log.errorMessage || null,
      duration_ms: log.durationMs || null
    });

    if (error) {
      console.error('[agentSafety] Failed to log agent run:', error);
    }
  } catch (err) {
    console.error('[agentSafety] Log agent run failed:', err);
  }
}

export function sanitizeToolInput(input: any): any {
  if (!input || typeof input !== 'object') {
    return input;
  }

  const sanitized = { ...input };

  // Remove sensitive fields
  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'api_key',
    'apiKey',
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'private_key',
    'privateKey'
  ];

  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      delete sanitized[key];
    }
  }

  return sanitized;
}

export function validateToolInput(toolName: string, input: any): { valid: boolean; error?: string } {
  // Basic validation
  if (!toolName) {
    return { valid: false, error: 'Tool name is required' };
  }

  // Validate input is an object
  if (input && typeof input !== 'object') {
    return { valid: false, error: 'Tool input must be an object' };
  }

  // Tool-specific validation
  switch (toolName) {
    case 'meta_ads_draft':
    case 'meta_ads_publish':
      if (!input?.campaigns || !Array.isArray(input.campaigns)) {
        return { valid: false, error: 'campaigns array is required' };
      }
      if (input.campaigns.length === 0) {
        return { valid: false, error: 'At least one campaign is required' };
      }
      if (input.campaigns.length > 10) {
        return { valid: false, error: 'Maximum 10 campaigns per request' };
      }
      break;

    case 'schedule_events':
      if (!input?.events || !Array.isArray(input.events)) {
        return { valid: false, error: 'events array is required' };
      }
      if (input.events.length === 0) {
        return { valid: false, error: 'At least one event is required' };
      }
      if (input.events.length > 50) {
        return { valid: false, error: 'Maximum 50 events per request' };
      }
      break;

    case 'smartlink_create':
    case 'presave_create':
    case 'email_capture_create':
      if (!input?.title || typeof input.title !== 'string') {
        return { valid: false, error: 'title is required' };
      }
      if (input.title.length > 200) {
        return { valid: false, error: 'title must be under 200 characters' };
      }
      break;

    case 'split_create':
      if (!input?.song_title) {
        return { valid: false, error: 'song_title is required' };
      }
      if (!input?.participants || !Array.isArray(input.participants)) {
        return { valid: false, error: 'participants array is required' };
      }
      if (input.participants.length > 20) {
        return { valid: false, error: 'Maximum 20 participants per split' };
      }
      break;
  }

  return { valid: true };
}

export async function getAgentStats(userId: string) {
  const sb = supabaseAdmin();

  try {
    // Get run stats for last 24h
    const { data: runs } = await sb
      .from('agent_runs')
      .select('tool_name, status, created_at')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    const totalRuns = runs?.length || 0;
    const successfulRuns = runs?.filter(r => r.status === 'success').length || 0;
    const failedRuns = runs?.filter(r => r.status === 'error').length || 0;

    const toolUsage: Record<string, number> = {};
    runs?.forEach(r => {
      toolUsage[r.tool_name] = (toolUsage[r.tool_name] || 0) + 1;
    });

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      successRate: totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0,
      toolUsage,
      mostUsedTool: Object.entries(toolUsage).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    };
  } catch (err) {
    console.error('[agentSafety] Failed to get agent stats:', err);
    return null;
  }
}
