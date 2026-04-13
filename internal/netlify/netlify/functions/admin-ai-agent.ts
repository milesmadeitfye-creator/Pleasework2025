import type { HandlerEvent } from '@netlify/functions';
import { requireAdmin, json } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';
import { logAdminAction } from './_lib/audit';

interface AiAgentResponse {
  status?: 'ok';
  action?: string;
  data?: Record<string, unknown>;
  error?: string;
}

interface AutonousTaskStats {
  total: number;
  statusCounts: Record<string, number>;
  recentTasks: Array<{
    id: string;
    user_id: string;
    trigger_type: string;
    status: string;
    created_at?: string;
  }>;
}

interface ImprovementEntry {
  id: string;
  actor_email: string;
  action: string;
  target_email?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
}

export async function handler(event: HandlerEvent) {
  try {
    const auth = await requireAdmin(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    const method = event.httpMethod || 'GET';
    if (method !== 'POST' && method !== 'GET') {
      return json(405, { error: 'method_not_allowed' });
    }

    let body: any = {};
    if (method === 'POST' && event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (err) {
        return json(400, { error: 'invalid_json' });
      }
    }

    const action = body.action || 'status';
    const sb = getServiceClient();
    const response: AiAgentResponse = { action };

    if (action === 'status') {
      try {
        // Get autonomous tasks stats
        const { data: tasks, error: tasksErr } = await sb
          .from('autonomous_tasks')
          .select('id, user_id, trigger_type, status, created_at');

        const stats: AutonousTaskStats = {
          total: 0,
          statusCounts: {},
          recentTasks: [],
        };

        if (!tasksErr && tasks) {
          stats.total = tasks.length;

          const statusCounts: Record<string, number> = {};
          tasks.forEach((t: any) => {
            statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
          });
          stats.statusCounts = statusCounts;

          stats.recentTasks = tasks
            .sort((a: any, b: any) => {
              const aDate = new Date(a.created_at || 0).getTime();
              const bDate = new Date(b.created_at || 0).getTime();
              return bDate - aDate;
            })
            .slice(0, 10)
            .map((t: any) => ({
              id: t.id,
              user_id: t.user_id,
              trigger_type: t.trigger_type,
              status: t.status,
              created_at: t.created_at,
            }));
        }

        response.data = {
          autonomousTasksStats: stats,
          systemHealth: {
            timestamp: new Date().toISOString(),
            status: 'operational',
          },
        };
      } catch (err) {
        console.error('[admin-ai-agent] status query failed', err);
        response.data = { error: 'status_query_failed' };
      }
    }

    if (action === 'run-task') {
      try {
        const payload = body.payload || {};
        const { data: inserted, error: insertErr } = await sb
          .from('autonomous_tasks')
          .insert([
            {
              user_id: auth.admin.userId,
              trigger_type: 'manual',
              status: 'pending',
              payload: payload,
              result: null,
            },
          ])
          .select('id');

        if (insertErr) {
          return json(500, { error: 'failed_to_create_task' });
        }

        // Audit log
        await logAdminAction(auth.admin, {
          action: 'ai_agent_task_created',
          payload: { task_id: inserted?.[0]?.id, trigger_type: 'manual' },
        });

        response.data = { taskId: inserted?.[0]?.id };
      } catch (err) {
        console.error('[admin-ai-agent] run-task failed', err);
        return json(500, { error: 'failed_to_run_task' });
      }
    }

    if (action === 'queue-improvement') {
      try {
        const payload = body.payload || {};
        const improvementName = payload.name || 'system_improvement_queued';

        // Log as an admin action (serves as the queue)
        await sb.from('admin_action_logs').insert([
          {
            actor_email: auth.admin.email,
            actor_role: auth.admin.role,
            action: `system_improvement_${improvementName}`,
            target_user_id: null,
            target_email: null,
            payload: payload,
            ip_address: auth.admin.ip,
            user_agent: auth.admin.userAgent,
          },
        ]);

        response.data = { queued: true, improvement: improvementName };
      } catch (err) {
        console.error('[admin-ai-agent] queue-improvement failed', err);
        return json(500, { error: 'failed_to_queue_improvement' });
      }
    }

    if (action === 'list-improvements') {
      try {
        const { data: improvements, error: impErr } = await sb
          .from('admin_action_logs')
          .select('id, actor_email, action, target_email, payload, created_at')
          .like('action', 'system_improvement_%')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!impErr && improvements) {
          const list: ImprovementEntry[] = improvements.map((i: any) => ({
            id: i.id,
            actor_email: i.actor_email,
            action: i.action,
            target_email: i.target_email,
            payload: i.payload,
            created_at: i.created_at,
          }));
          response.data = { improvements: list, count: list.length };
        } else {
          response.data = { improvements: [], count: 0 };
        }
      } catch (err) {
        console.error('[admin-ai-agent] list-improvements failed', err);
        response.data = { improvements: [], count: 0 };
      }
    }

    response.status = 'ok';
    return json(200, response);
  } catch (err) {
    console.error('[admin-ai-agent] unhandled error', err);
    return json(500, { error: 'internal_server_error' });
  }
}
