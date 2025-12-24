import { useState } from 'react';
import { AlertCircle, CheckCircle, XCircle, RefreshCw, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatUSD } from '../utils/formatCredits';

interface AdsApiResult {
  endpoint: string;
  success: boolean;
  statusCode: number;
  data?: any;
  error?: string;
  timing: number;
}

interface DiagnosticsResponse {
  success: boolean;
  results: Record<string, AdsApiResult>;
  summary: {
    adAccountCount: number;
    campaignCount: number;
    adsetCount: number;
    adCount: number;
    hasInsights: boolean;
    insights?: any;
  };
  timestamp: string;
}

export default function AdsDiagnostics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiagnosticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      console.log('[AdsDiagnostics] Starting diagnostics...');

      if (!user) {
        throw new Error('Please sign in to run diagnostics');
      }

      console.log('[AdsDiagnostics] Fetching Meta connection from meta_connections...');

      const { data: integration, error: integrationError } = await supabase
        .from('meta_connections')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (integrationError) {
        console.error('[AdsDiagnostics] Error fetching integration:', integrationError);
        throw new Error('Failed to check Meta connection. Please try again.');
      }

      if (!integration) {
        throw new Error('No Meta integration found. Please connect Meta in Connected Accounts.');
      }

      if (!integration.access_token) {
        throw new Error('Meta integration found but access token is missing. Please reconnect Meta in Connected Accounts.');
      }

      const externalAccountId = integration.meta_user_id;

      if (!externalAccountId) {
        console.warn('[AdsDiagnostics] No external_account_id, proceeding anyway');
      }

      console.log('[AdsDiagnostics] Calling test-ads-api function...');

      const response = await fetch('/.netlify/functions/test-ads-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: integration.access_token,
          user_id: externalAccountId || user.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Provide helpful messages for common errors
        if (response.status === 404) {
          throw new Error('Diagnostics API endpoint not found. The function may not be deployed yet.');
        } else if (response.status === 401 || response.status === 403) {
          throw new Error('Meta access token may be expired or invalid. Try reconnecting Meta in Connected Accounts.');
        } else if (response.status === 400) {
          throw new Error(errorData.message || 'Invalid request. Please check your Meta connection.');
        }

        throw new Error(errorData.message || `API call failed: ${response.status} ${response.statusText}`);
      }

      const resultData = await response.json();
      console.log('[AdsDiagnostics] Results:', resultData);

      // Check if user has no ad accounts but API worked
      if (resultData.summary && resultData.summary.adAccountCount === 0) {
        setError('Meta is connected but you have no ad accounts. Create an ad account in Meta Business Manager to use Ads API features.');
        setResults(resultData);
      } else {
        setResults(resultData);
      }
    } catch (err: any) {
      console.error('[AdsDiagnostics] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = () => {
    if (!results) return 'gray';
    if (results.success) return 'green';

    const successCount = Object.values(results.results).filter(r => r.success).length;
    const totalCount = Object.values(results.results).length;

    if (successCount === 0) return 'red';
    if (successCount < totalCount) return 'yellow';
    return 'green';
  };

  const statusColor = getStatusColor();
  const statusText = results
    ? results.success
      ? 'All API calls successful'
      : 'Some API calls failed'
    : 'Not tested';

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Facebook Ads API Diagnostics</h2>
        </div>
        <button
          onClick={runDiagnostics}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Running...' : 'Run Diagnostics'}
        </button>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Meta Ads API Status:</span>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
              statusColor === 'green'
                ? 'bg-green-100 text-green-800'
                : statusColor === 'yellow'
                ? 'bg-yellow-100 text-yellow-800'
                : statusColor === 'red'
                ? 'bg-red-100 text-red-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {statusColor === 'green' && <CheckCircle className="w-4 h-4" />}
            {statusColor === 'yellow' && <AlertCircle className="w-4 h-4" />}
            {statusColor === 'red' && <XCircle className="w-4 h-4" />}
            {statusText}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              {error.includes('No Meta integration found') && (
                <a
                  href="/dashboard?tab=accounts"
                  className="mt-2 inline-block text-sm text-red-700 underline hover:text-red-800"
                >
                  Go to Connected Accounts
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {results && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Ad Accounts</div>
              <div className="text-2xl font-bold text-blue-600">
                {results.summary.adAccountCount}
              </div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Campaigns</div>
              <div className="text-2xl font-bold text-purple-600">
                {results.summary.campaignCount}
              </div>
            </div>
            <div className="bg-indigo-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Ad Sets</div>
              <div className="text-2xl font-bold text-indigo-600">
                {results.summary.adsetCount}
              </div>
            </div>
            <div className="bg-pink-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Ads</div>
              <div className="text-2xl font-bold text-pink-600">
                {results.summary.adCount}
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Insights</div>
              <div className="text-2xl font-bold text-green-600">
                {results.summary.hasInsights ? '✓' : '✗'}
              </div>
            </div>
          </div>

          {results.summary.insights && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3">Account Insights</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-gray-600">Impressions</div>
                  <div className="text-lg font-bold text-gray-900">
                    {Number(results.summary.insights.impressions || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Clicks</div>
                  <div className="text-lg font-bold text-gray-900">
                    {Number(results.summary.insights.clicks || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Spend</div>
                  <div className="text-lg font-bold text-gray-900">
                    {formatUSD(results.summary.insights.spend, 2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Reach</div>
                  <div className="text-lg font-bold text-gray-900">
                    {Number(results.summary.insights.reach || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-gray-900 mb-3">API Call Details</h3>
            <div className="space-y-2">
              {Object.entries(results.results).map(([key, result]) => (
                <div
                  key={key}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    result.success
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {result.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                    <div>
                      <div className="font-medium text-gray-900">{result.endpoint}</div>
                      {result.error && (
                        <div className="text-sm text-red-600 mt-1">{result.error}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">
                      Status: {result.statusCode || 'N/A'}
                    </div>
                    <div className="text-xs text-gray-500">{result.timing}ms</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-500 text-right">
            Last run: {new Date(results.timestamp).toLocaleString()}
          </div>
        </div>
      )}

      {!loading && !results && !error && (
        <div className="text-center py-12">
          <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">
            Run diagnostics to test your Facebook Ads API integration
          </p>
          <p className="text-sm text-gray-500">
            This will verify your access to ad accounts, campaigns, ads, and insights
          </p>
        </div>
      )}
    </div>
  );
}
