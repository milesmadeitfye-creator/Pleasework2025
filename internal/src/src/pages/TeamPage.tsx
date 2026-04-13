import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Lock,
  MoreHorizontal,
  Plus,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

interface PermissionSet {
  can_view: boolean;
  can_edit: boolean;
  can_admin: boolean;
}

interface Employee {
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
  employees: Employee[];
}

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

const SECTION_LABELS: Record<string, string> = {
  overview: 'Overview',
  users: 'Users',
  ai_agent: 'AI Agent',
  billing: 'Billing',
  platforms: 'Platforms',
  creatives: 'Creatives',
  ads: 'Ads',
  distribution: 'Distribution',
  links: 'Links',
  logs: 'Logs',
  improvements: 'Improvements',
  crm: 'CRM',
  ads_engine: 'Ads Engine',
};

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'support', label: 'Support' },
  { value: 'member', label: 'Member' },
];

function getRoleColor(role: string): string {
  switch (role) {
    case 'super_admin':
      return 'bg-brand-600 text-white';
    case 'admin':
      return 'bg-ok text-white';
    case 'manager':
      return 'bg-warn text-white';
    case 'support':
      return 'text-fg-soft border border-line';
    case 'member':
    default:
      return 'text-fg-mute border border-line';
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-ok/10 text-ok border border-ok/20';
    case 'invited':
      return 'bg-warn/10 text-warn border border-warn/20';
    case 'suspended':
      return 'bg-err/10 text-err border border-err/20';
    default:
      return 'bg-ink-2 text-fg-mute border border-line';
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  isLoading: boolean;
}

function InviteModal({ isOpen, onClose, onSubmit, isLoading }: InviteModalProps) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('member');
  const [permissions, setPermissions] = useState<Record<string, PermissionSet>>(() => {
    const perms: Record<string, PermissionSet> = {};
    SECTIONS.forEach((section) => {
      perms[section] = { can_view: false, can_edit: false, can_admin: false };
    });
    return perms;
  });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePermissionChange = (section: string, key: 'can_view' | 'can_edit' | 'can_admin', value: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  const handleSubmit = async () => {
    if (!email) {
      setError('Email is required');
      return;
    }
    setError(null);
    try {
      const result = await onSubmit({
        action: 'invite',
        email,
        full_name: fullName || undefined,
        role,
        permissions,
      });
      if (result?.inviteLink) {
        setInviteLink(result.inviteLink);
        setEmail('');
        setFullName('');
        setRole('member');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-ink-0 rounded-lg border border-line max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Invite Employee</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-ink-2 rounded transition-colors"
            disabled={isLoading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded bg-err/10 text-err border border-err/20 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {inviteLink ? (
          <div className="space-y-4">
            <div className="p-4 bg-ok/10 border border-ok/20 rounded-lg">
              <p className="text-sm font-semibold text-ok mb-2">Invite sent!</p>
              <p className="text-xs text-fg-soft mb-3">Share this link with the employee:</p>
              <div className="flex items-center gap-2 bg-ink-1 border border-line rounded p-3">
                <code className="text-xs flex-1 break-all font-mono text-fg-mute">{inviteLink}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink);
                  }}
                  className="p-2 hover:bg-ink-2 rounded transition-colors flex-shrink-0"
                  title="Copy invite link"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-fg-soft uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="input mt-1.5"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-fg-soft uppercase tracking-wide">Full Name (optional)</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className="input mt-1.5"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-fg-soft uppercase tracking-wide">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="input mt-1.5"
                disabled={isLoading}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-fg-soft uppercase tracking-wide mb-3 block">Permissions</label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {SECTIONS.map((section) => (
                  <div key={section} className="p-3 border border-line rounded-lg bg-ink-1">
                    <p className="text-sm font-medium text-fg mb-2">{SECTION_LABELS[section]}</p>
                    <div className="flex items-center gap-4 ml-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={permissions[section]?.can_view ?? false}
                          onChange={(e) => handlePermissionChange(section, 'can_view', e.target.checked)}
                          disabled={isLoading}
                        />
                        <span className="text-xs text-fg-soft">View</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={permissions[section]?.can_edit ?? false}
                          onChange={(e) => handlePermissionChange(section, 'can_edit', e.target.checked)}
                          disabled={isLoading}
                        />
                        <span className="text-xs text-fg-soft">Edit</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={permissions[section]?.can_admin ?? false}
                          onChange={(e) => handlePermissionChange(section, 'can_admin', e.target.checked)}
                          disabled={isLoading}
                        />
                        <span className="text-xs text-fg-soft">Admin</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-line rounded-lg hover:bg-ink-2 transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? 'Inviting…' : 'Send Invite'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface EditModalProps {
  employee: Employee | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  isLoading: boolean;
}

function EditPermissionsModal({ employee, isOpen, onClose, onSubmit, isLoading }: EditModalProps) {
  const [permissions, setPermissions] = useState<Record<string, PermissionSet>>({});
  const [role, setRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (employee) {
      setPermissions(employee.permissions ?? {});
      setRole(employee.role ?? '');
      setSaved(false);
      setError(null);
    }
  }, [employee]);

  const handlePermissionChange = (section: string, key: 'can_view' | 'can_edit' | 'can_admin', value: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
    setSaved(false);
  };

  const handleSavePermissions = async () => {
    if (!employee) return;
    setError(null);
    try {
      await onSubmit({
        action: 'update-permissions',
        employeeId: employee.id,
        permissions,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleSaveRole = async () => {
    if (!employee) return;
    setError(null);
    try {
      await onSubmit({
        action: 'update-role',
        employeeId: employee.id,
        role,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (!isOpen || !employee) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-ink-0 rounded-lg border border-line max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Manage Employee</h2>
            <p className="text-xs text-fg-mute">{employee.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-ink-2 rounded transition-colors"
            disabled={isLoading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded bg-err/10 text-err border border-err/20 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {saved && (
          <div className="mb-4 p-3 rounded bg-ok/10 text-ok border border-ok/20 text-sm flex items-center gap-2">
            <Check className="h-4 w-4" />
            Changes saved!
          </div>
        )}

        <div className="space-y-6">
          <div>
            <label className="text-xs font-medium text-fg-soft uppercase tracking-wide">Role</label>
            <div className="flex items-center gap-2 mt-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="input flex-1"
                disabled={isLoading}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSaveRole}
                className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
                disabled={isLoading}
              >
                Save
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-fg-soft uppercase tracking-wide mb-3 block">Permissions</label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {SECTIONS.map((section) => (
                <div key={section} className="p-3 border border-line rounded-lg bg-ink-1">
                  <p className="text-sm font-medium text-fg mb-2">{SECTION_LABELS[section]}</p>
                  <div className="flex items-center gap-4 ml-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissions[section]?.can_view ?? false}
                        onChange={(e) => handlePermissionChange(section, 'can_view', e.target.checked)}
                        disabled={isLoading}
                      />
                      <span className="text-xs text-fg-soft">View</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissions[section]?.can_edit ?? false}
                        onChange={(e) => handlePermissionChange(section, 'can_edit', e.target.checked)}
                        disabled={isLoading}
                      />
                      <span className="text-xs text-fg-soft">Edit</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissions[section]?.can_admin ?? false}
                        onChange={(e) => handlePermissionChange(section, 'can_admin', e.target.checked)}
                        disabled={isLoading}
                      />
                      <span className="text-xs text-fg-soft">Admin</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              onClick={handleSavePermissions}
              className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Saving…' : 'Save Permissions'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-line rounded-lg hover:bg-ink-2 transition-colors"
              disabled={isLoading}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { identity } = useAdminAuth();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<ListResponse>('/.netlify/functions/admin-employees');
      setEmployees(res?.employees ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load employees');
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const handleInvite = async (data: any) => {
    setActionLoading(true);
    try {
      const res = await api<any>('/.netlify/functions/admin-employees', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await loadEmployees();
      return res;
    } finally {
      setActionLoading(false);
    }
  };

  const handleAction = async (data: any) => {
    setActionLoading(true);
    try {
      await api<any>('/.netlify/functions/admin-employees', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await loadEmployees();
    } finally {
      setActionLoading(false);
    }
  };

  const canManage = identity?.role === 'super_admin' || identity?.role === 'admin';

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="text-fg-mute">Loading employees…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Team Management</h1>
          <p className="text-xs text-fg-mute">
            {employees ? `${(employees ?? []).length} employee${(employees?.length ?? 0) !== 1 ? 's' : ''}` : 'Loading…'}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setInviteModalOpen(true)}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Invite Employee
          </button>
        )}
      </header>

      {error && (
        <div className="rounded-lg border border-line bg-err/10 p-4 text-sm text-err flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {employees && (employees ?? []).length > 0 ? (
        <div className="rounded-lg border border-line bg-ink-1 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-ink-2">
                  <th className="px-6 py-3 text-left font-semibold text-fg-soft">Email</th>
                  <th className="px-6 py-3 text-left font-semibold text-fg-soft">Name</th>
                  <th className="px-6 py-3 text-left font-semibold text-fg-soft">Role</th>
                  <th className="px-6 py-3 text-left font-semibold text-fg-soft">Status</th>
                  <th className="px-6 py-3 text-left font-semibold text-fg-soft">Last Active</th>
                  {canManage && <th className="px-6 py-3 text-left font-semibold text-fg-soft">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {(employees ?? []).map((emp) => (
                  <tr key={emp.id} className="border-b border-line hover:bg-ink-2 transition-colors">
                    <td className="px-6 py-3 text-fg font-medium">{emp.email}</td>
                    <td className="px-6 py-3 text-fg-soft">{emp.full_name ?? '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getRoleColor(emp.role)}`}>
                        {emp.role}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(emp.status)}`}>
                        {emp.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-fg-soft text-xs">{formatDate(emp.last_active_at ?? emp.accepted_at ?? emp.invited_at)}</td>
                    {canManage && (
                      <td className="px-6 py-3">
                        <button
                          onClick={() => {
                            setEditEmployee(emp);
                            setEditModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-line hover:bg-ink-2 transition-colors text-xs font-medium"
                          disabled={actionLoading}
                        >
                          <Lock className="h-3 w-3" />
                          Manage
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-ink-1 p-12 text-center">
          <p className="text-fg-mute text-sm">No employees yet</p>
          {canManage && (
            <button
              onClick={() => setInviteModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Invite First Employee
            </button>
          )}
        </div>
      )}

      <InviteModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onSubmit={handleInvite}
        isLoading={actionLoading}
      />

      <EditPermissionsModal
        employee={editEmployee}
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditEmployee(null);
        }}
        onSubmit={handleAction}
        isLoading={actionLoading}
      />
    </div>
  );
}
