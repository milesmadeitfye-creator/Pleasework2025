import type { HandlerEvent } from '@netlify/functions';
import { requireAdmin, json } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'error' | 'security' | 'admin_action';
  severity?: string;
  message: string;
  details?: Record<string, unknown>;
}

interface LogsResponse {
  logs: LogEntry[];
  totalCount: number;
  securityAlerts: Array<{
    type: string;
    severity: string;
    description: string;
    count: number;
  }>;
  lastSweepAt: string;
}

function parseUrl(urlString: string): Record<string, string> {
  const params: Record<string, string> = {};
  try {
    const url = new URL(urlString.startsWith('http') ? urlString : `http://dummy${urlString}`);
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
  } catch {
    // Invalid URL, return empty
  }
  return params;
}

export async function handler(event: HandlerEvent) {
  try {
    const auth = await requireAdmin(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    // Parse query parameters
    const queryString = event.rawUrl?.split('?')[1] || '';
    const params = parseUrl(`?${queryString}`);
    const type = params.type || 'all';
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(params.limit || '50')));
    const offset = (page - 1) * limit;

    const sb = getServiceClient();
    const response: LogsResponse = {
      logs: [],
      totalCount: 0,
      securityAlerts: [],
      lastSweepAt: new Date().toISOString(),
    };

    // AI action audit logs (errors)
    if (type === 'errors' || type === 'all') {
      try {
        const { data: auditLogs, error: auditErr } = await sb
          .from('ai_action_audit_logs')
          .select('id, severity, created_at')
          .eq('severity', 'error')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (!auditErr && auditLogs) {
          auditLogs.forEach((log: any) => {
            response.logs.push({
              id: log.id,
              timestamp: log.created_at,
              type: 'error',
              severity: log.severity,
              message: `AI action error: ${log.severity}`,
              details: { ai_action_id: log.id },
            });
          });
        }
      } catch (err) {
        console.error('[admin-logs] ai audit logs query failed', err);
      }
    }

    // Behavior logs (suspicious patterns)
    if (type === 'security' || type === 'all') {
      try {
        const { data: behaviorLogs, error: behaviorErr } = await sb
          .from('behavior_logs')
          .select('id, user_id, action_type, created_at')
          .order('created_at', { ascending: false })
          .limit(100); // Sample for anomalies

        if (!behaviorErr && behaviorLogs) {
          // Look for suspicious patterns (multiple failures, rapid actions, etc.)
          const actionCounts: Record<string, number> = {};
          const userActions: Record<string, number> = {};

          behaviorLogs.forEach((log: any) => {
            actionCounts[log.action_type] = (actionCounts[log.action_type] || 0) + 1;
            userActions[log.user_id] = (userActions[log.user_id] || 0) + 1;
          });

          // Flag unusual patterns
          Object.entries(actionCounts).forEach(([action, count]) => {
            if (count > 50) {
              response.securityAlerts.push({
                type: 'high_action_frequency',
                severity: 'warning',
                description: `Action "${action}" detected ${count} times in sample`,
                count,
              });
            }
          });

          Object.entries(userActions).forEach(([userId, count]) => {
            if (count > 30) {
              response.securityAlerts.push({
                type: 'high_user_activity',
                severity: 'info',
                description: `User ${userId} has ${count} actions in sample`,
                count,
              });
            }
          });
        }
      } catch (err) {
        console.error('[admin-logs] behavior logs query failed', err);
      }
    }

    // Admin action logs
    if (type === 'all' || type === 'admin') {
      try {
        const { data: adminLogs, error: adminErr } = await sb
          .from('admin_action_logs')
          .select('id, actor_email, actor_role, action, target_email, created_at, payload')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (!adminErr && adminLogs) {
          adminLogs.forEach((log: any) => {
            response.logs.push({
              id: log.id,
              timestamp: log.created_at,
              type: 'admin_action',
              message: `Admin action: ${log.action} by ${log.actor_email}`,
              details: {
                actor_email: log.actor_email,
                actor_role: log.actor_role,
                action: log.action,
                target_email: log.target_email,
                payload: log.payload,
              },
            });
          });
        }
      } catch (err) {
        console.error('[admin-logs] admin logs query failed', err);
      }
    }

    // Get total count for pagination
    try {
      let countQuery = sb.from('admin_action_logs').select('id', { count: 'exact', head: true });

      if (type === 'errors' || type === 'all') {
        countQuery = sb
          .from('ai_action_audit_logs')
          .select('id', { count: 'exact', head: true })
          .eq('severity', 'error');
      }

      const { count } = await countQuery;
      response.totalCount = count || response.logs.length;
    } catch (err) {
      console.error('[admin-logs] count query failed', err);
      response.totalCount = response.logs.length;
    }

    // Sort logs by timestamp
    response.logs.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    });

    return json(200, response);
  } catch (err) {
    console.error('[admin-logs] unhandled error', err);
    return json(500, { error: 'internal_server_error' });
  }
}
