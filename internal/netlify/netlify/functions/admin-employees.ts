import type { Handler } from '@netlify/functions';
import { json, requireAdmin } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';
import { logAdminAction } from './_lib/audit';
import { randomUUID } from 'crypto';

interface PermissionSet {
  can_view: boolean;
  can_edit: boolean;
  can_admin: boolean;
}

interface EmployeeWithPermissions {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  invited_at: string | null;
  accepted_at: string | null;
  last_active_at: string | null;
  permissions: Record<string, PermissionSet>;
}

interface ListResponse {
  ok: true;
  employees: EmployeeWithPermissions[];
}

interface InviteRequest {
  action: 'invite';
  email: string;
  full_name?: string;
  role?: string;
  permissions?: Record<string, PermissionSet>;
}

interface UpdatePermissionsRequest {
  action: 'update-permissions';
  employeeId: string;
  permissions: Record<string, PermissionSet>;
}

interface UpdateRoleRequest {
  action: 'update-role';
  employeeId: string;
  role: string;
}

interface RemoveRequest {
  action: 'remove';
  employeeId: string;
}

interface ResendInviteRequest {
  action: 'resend-invite';
  employeeId: string;
}

type RequestBody = InviteRequest | UpdatePermissionsRequest | UpdateRoleRequest | RemoveRequest | ResendInviteRequest;

const SECTIONS = [
  'overview',
  'users',
  'ai_agent',
  'billing',
  'platforms',
  'creatives',
  'ads',
  'distribution',
  'links',
  'logs',
  'improvements',
  'crm',
  'ads_engine',
];

async function listEmployees(service: any): Promise<EmployeeWithPermissions[]> {
  const { data: employees, error: empErr } = await service
    .from('employees')
    .select('id, email, full_name, role, status, invited_at, accepted_at, last_active_at')
    .order('created_at', { ascending: false });

  if (empErr || !employees) {
    throw new Error(`Failed to fetch employees: ${empErr?.message}`);
  }

  const { data: permissions, error: permErr } = await service
    .from('employee_permissions')
    .select('employee_id, section, can_view, can_edit, can_admin');

  if (permErr) {
    throw new Error(`Failed to fetch permissions: ${permErr?.message}`);
  }

  const permMap = new Map<string, Record<string, PermissionSet>>();
  (permissions ?? []).forEach((p: any) => {
    if (!permMap.has(p.employee_id)) {
      permMap.set(p.employee_id, {});
    }
    permMap.get(p.employee_id)![p.section] = {
      can_view: p.can_view,
      can_edit: p.can_edit,
      can_admin: p.can_admin,
    };
  });

  return employees.map((emp: any) => ({
    id: emp.id,
    email: emp.email,
    full_name: emp.full_name,
    role: emp.role,
    status: emp.status,
    invited_at: emp.invited_at,
    accepted_at: emp.accepted_at,
    last_active_at: emp.last_active_at,
    permissions: permMap.get(emp.id) || {},
  }));
}

async function handleInvite(
  service: any,
  admin: any,
  payload: InviteRequest,
): Promise<any> {
  const { email, full_name = '', role = 'member', permissions = {} } = payload;

  // Generate invite token
  const inviteToken = randomUUID();

  // Check if email already exists
  const { data: existing } = await service
    .from('employees')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    return json(409, { error: 'email_exists' });
  }

  // Insert employee
  const { data: newEmp, error: empErr } = await service
    .from('employees')
    .insert({
      email,
      full_name,
      role,
      status: 'invited',
      invite_token: inviteToken,
      invited_by: admin.userId,
      invited_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (empErr || !newEmp) {
    return json(500, { error: 'failed_to_create_employee', detail: empErr?.message });
  }

  // Insert permissions for each section
  const permissionsToInsert = SECTIONS.map((section) => ({
    employee_id: newEmp.id,
    section,
    can_view: permissions[section]?.can_view ?? false,
    can_edit: permissions[section]?.can_edit ?? false,
    can_admin: permissions[section]?.can_admin ?? false,
  }));

  const { error: permErr } = await service
    .from('employee_permissions')
    .insert(permissionsToInsert);

  if (permErr) {
    // Clean up the employee
    await service.from('employees').delete().eq('id', newEmp.id);
    return json(500, { error: 'failed_to_create_permissions', detail: permErr?.message });
  }

  // Log the action
  await logAdminAction(admin, {
    action: 'employee_invite',
    targetEmail: email,
    payload: { role, sections: Object.keys(permissions) },
  });

  const inviteLink = `https://internal.ghoste.one/?access=ghoste&invite=${inviteToken}`;

  return json(200, {
    ok: true,
    employee: newEmp,
    inviteLink,
  });
}

async function handleUpdatePermissions(
  service: any,
  admin: any,
  payload: UpdatePermissionsRequest,
): Promise<any> {
  const { employeeId, permissions } = payload;

  // Verify employee exists
  const { data: emp } = await service
    .from('employees')
    .select('email')
    .eq('id', employeeId)
    .maybeSingle();

  if (!emp) {
    return json(404, { error: 'employee_not_found' });
  }

  // Upsert permissions
  const permissionsToUpsert = SECTIONS.map((section) => ({
    employee_id: employeeId,
    section,
    can_view: permissions[section]?.can_view ?? false,
    can_edit: permissions[section]?.can_edit ?? false,
    can_admin: permissions[section]?.can_admin ?? false,
  }));

  const { error: permErr } = await service
    .from('employee_permissions')
    .upsert(permissionsToUpsert, { onConflict: 'employee_id,section' });

  if (permErr) {
    return json(500, { error: 'failed_to_update_permissions', detail: permErr?.message });
  }

  // Log the action
  await logAdminAction(admin, {
    action: 'employee_update_permissions',
    targetEmail: emp.email,
    payload: { employeeId, sections: Object.keys(permissions) },
  });

  return json(200, { ok: true });
}

async function handleUpdateRole(
  service: any,
  admin: any,
  payload: UpdateRoleRequest,
): Promise<any> {
  const { employeeId, role } = payload;

  // Verify employee exists
  const { data: emp } = await service
    .from('employees')
    .select('email')
    .eq('id', employeeId)
    .maybeSingle();

  if (!emp) {
    return json(404, { error: 'employee_not_found' });
  }

  const { error: updateErr } = await service
    .from('employees')
    .update({ role })
    .eq('id', employeeId);

  if (updateErr) {
    return json(500, { error: 'failed_to_update_role', detail: updateErr?.message });
  }

  // Log the action
  await logAdminAction(admin, {
    action: 'employee_update_role',
    targetEmail: emp.email,
    payload: { employeeId, role },
  });

  return json(200, { ok: true });
}

async function handleRemove(
  service: any,
  admin: any,
  payload: RemoveRequest,
): Promise<any> {
  const { employeeId } = payload;

  // Verify employee exists
  const { data: emp } = await service
    .from('employees')
    .select('email')
    .eq('id', employeeId)
    .maybeSingle();

  if (!emp) {
    return json(404, { error: 'employee_not_found' });
  }

  // Delete employee (cascades to permissions)
  const { error: delErr } = await service
    .from('employees')
    .delete()
    .eq('id', employeeId);

  if (delErr) {
    return json(500, { error: 'failed_to_remove_employee', detail: delErr?.message });
  }

  // Log the action
  await logAdminAction(admin, {
    action: 'employee_remove',
    targetEmail: emp.email,
    payload: { employeeId },
  });

  return json(200, { ok: true });
}

async function handleResendInvite(
  service: any,
  admin: any,
  payload: ResendInviteRequest,
): Promise<any> {
  const { employeeId } = payload;

  // Verify employee exists and is in invited state
  const { data: emp } = await service
    .from('employees')
    .select('email, status')
    .eq('id', employeeId)
    .maybeSingle();

  if (!emp) {
    return json(404, { error: 'employee_not_found' });
  }

  if (emp.status !== 'invited') {
    return json(400, { error: 'employee_not_invited' });
  }

  // Generate new invite token
  const newToken = randomUUID();

  const { error: updateErr } = await service
    .from('employees')
    .update({ invite_token: newToken })
    .eq('id', employeeId);

  if (updateErr) {
    return json(500, { error: 'failed_to_resend_invite', detail: updateErr?.message });
  }

  // Log the action
  await logAdminAction(admin, {
    action: 'employee_resend_invite',
    targetEmail: emp.email,
    payload: { employeeId },
  });

  const inviteLink = `https://internal.ghoste.one/?access=ghoste&invite=${newToken}`;

  return json(200, {
    ok: true,
    inviteLink,
  });
}

export const handler: Handler = async (event) => {
  const auth = await requireAdmin(event);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const service = getServiceClient();

  try {
    if (event.httpMethod === 'GET') {
      const employees = await listEmployees(service);
      return json(200, {
        ok: true,
        employees,
      } as ListResponse);
    }

    if (event.httpMethod === 'POST') {
      let body: RequestBody;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return json(400, { error: 'invalid_json' });
      }

      const action = (body as any).action;

      if (action === 'invite') {
        return await handleInvite(service, auth.admin, body as InviteRequest);
      }

      if (action === 'update-permissions') {
        return await handleUpdatePermissions(service, auth.admin, body as UpdatePermissionsRequest);
      }

      if (action === 'update-role') {
        return await handleUpdateRole(service, auth.admin, body as UpdateRoleRequest);
      }

      if (action === 'remove') {
        return await handleRemove(service, auth.admin, body as RemoveRequest);
      }

      if (action === 'resend-invite') {
        return await handleResendInvite(service, auth.admin, body as ResendInviteRequest);
      }

      return json(400, { error: 'unknown_action' });
    }

    return json(405, { error: 'method_not_allowed' });
  } catch (err) {
    console.error('[admin-employees] error', err);
    return json(500, {
      error: 'internal_error',
      detail: err instanceof Error ? err.message : 'Unknown error',
    });
  }
};
