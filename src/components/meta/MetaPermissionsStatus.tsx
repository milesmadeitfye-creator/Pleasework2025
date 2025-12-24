import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  META_REQUIRED_SCOPES,
  CRITICAL_SCOPES,
  getScopeDescription,
} from '../../lib/metaScopes';

type PermissionsData = {
  granted: string[];
  declined: string[];
  missing: string[];
  lastCheck: string | null;
};

export function MetaPermissionsStatus() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const loadPermissions = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load from meta_credentials
        const { data, error: fetchError } = await supabase
          .from('meta_credentials')
          .select('granted_permissions, declined_permissions, last_permission_check')
          .eq('user_id', user.id)
          .maybeSingle();

        if (fetchError) {
          throw fetchError;
        }

        if (!data) {
          setPermissions(null);
          return;
        }

        const granted = Array.isArray(data.granted_permissions)
          ? data.granted_permissions
          : [];
        const declined = Array.isArray(data.declined_permissions)
          ? data.declined_permissions
          : [];

        // Calculate missing scopes
        const missing = META_REQUIRED_SCOPES.filter(
          (scope) => !granted.includes(scope) && !declined.includes(scope)
        );

        setPermissions({
          granted,
          declined,
          missing,
          lastCheck: data.last_permission_check,
        });
      } catch (err: any) {
        console.error('[MetaPermissionsStatus] Error loading permissions:', err);
        setError(err.message || 'Failed to load permissions');
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();
  }, [user]);

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Meta Permissions</h3>
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Meta Permissions</h3>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!permissions) {
    return (
      <div className="bg-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Meta Permissions</h3>
        <p className="text-sm text-slate-400">Connect Meta to view permissions</p>
      </div>
    );
  }

  const hasAdsPermissions = CRITICAL_SCOPES.ADS.every((scope) =>
    permissions.granted.includes(scope)
  );
  const missingAdsScopes = CRITICAL_SCOPES.ADS.filter(
    (scope) => !permissions.granted.includes(scope)
  );

  return (
    <div className="bg-slate-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">Meta Permissions</h3>
        {permissions.lastCheck && (
          <span className="text-xs text-slate-500">
            Checked {new Date(permissions.lastCheck).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Ads Permissions Status */}
      <div className="bg-slate-900 rounded p-3">
        <div className="flex items-center gap-2 mb-2">
          {hasAdsPermissions ? (
            <CheckCircle className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-yellow-400" />
          )}
          <span className="text-sm font-medium text-slate-300">
            Ads Permissions
          </span>
        </div>

        {hasAdsPermissions ? (
          <p className="text-xs text-green-400">
            All ads permissions granted ✓
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-yellow-400">
              Missing critical ads permissions:
            </p>
            <ul className="text-xs text-slate-400 space-y-0.5 ml-4">
              {missingAdsScopes.map((scope) => (
                <li key={scope}>• {scope}</li>
              ))}
            </ul>
            {missingAdsScopes.includes('ads_management') && (
              <div className="mt-2 flex items-start gap-2 text-xs text-amber-400">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>ads_management</strong> requires Advanced Access via App Review.
                  We request it automatically, but Meta may not grant it until approved.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Granted Permissions */}
      {permissions.granted.length > 0 && (
        <details className="bg-slate-900 rounded p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-300 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            Granted ({permissions.granted.length})
          </summary>
          <ul className="mt-2 text-xs text-slate-400 space-y-1">
            {permissions.granted.map((scope) => (
              <li key={scope} className="flex items-start gap-2">
                <span className="text-green-400">✓</span>
                <div>
                  <span className="font-mono">{scope}</span>
                  <span className="text-slate-500"> — {getScopeDescription(scope)}</span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Declined Permissions */}
      {permissions.declined.length > 0 && (
        <details className="bg-slate-900 rounded p-3">
          <summary className="cursor-pointer text-sm font-medium text-red-400 flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            Declined ({permissions.declined.length})
          </summary>
          <ul className="mt-2 text-xs text-slate-400 space-y-1">
            {permissions.declined.map((scope) => (
              <li key={scope} className="flex items-start gap-2">
                <span className="text-red-400">✗</span>
                <div>
                  <span className="font-mono">{scope}</span>
                  <span className="text-slate-500"> — {getScopeDescription(scope)}</span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Missing Permissions */}
      {permissions.missing.length > 0 && (
        <details className="bg-slate-900 rounded p-3">
          <summary className="cursor-pointer text-sm font-medium text-yellow-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Pending ({permissions.missing.length})
          </summary>
          <ul className="mt-2 text-xs text-slate-400 space-y-1">
            {permissions.missing.map((scope) => (
              <li key={scope} className="flex items-start gap-2">
                <span className="text-yellow-400">⋯</span>
                <div>
                  <span className="font-mono">{scope}</span>
                  <span className="text-slate-500"> — {getScopeDescription(scope)}</span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="pt-2 border-t border-slate-700">
        <p className="text-xs text-slate-500">
          Reconnect Meta to update permissions.
          All permissions are requested automatically via OAuth.
        </p>
      </div>
    </div>
  );
}
