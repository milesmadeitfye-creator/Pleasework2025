import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Row = {
  day: string; // YYYY-MM-DD
  ad_account_id: string | null;
  success_count: number;
  error_count: number;
  last_error: string | null;
};

const SUCCESS_TARGET = 1500;
const ERROR_RATE_TARGET = 0.1;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmtDays(n: number) {
  if (!isFinite(n) || n < 0) return "—";
  if (n < 1) return "< 1 day";
  if (n < 2) return "1–2 days";
  return `${Math.ceil(n)} days`;
}

export default function MetaApprovalTracker({ className = "" }: { className?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [runNowBusy, setRunNowBusy] = useState(false);
  const [runNowResult, setRunNowResult] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugTestResult, setDebugTestResult] = useState<any>(null);

  async function loadRows() {
    setLoading(true);
    setErr(null);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }

    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("meta_api_activity_daily")
      .select("day, ad_account_id, success_count, error_count, last_error")
      .gte("day", sinceStr)
      .order("day", { ascending: true });

    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows(((data as any) || []) as Row[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await loadRows();
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const computed = useMemo(() => {
    const totalSuccess = rows.reduce((a, r) => a + (r.success_count || 0), 0);
    const totalError = rows.reduce((a, r) => a + (r.error_count || 0), 0);
    const total = totalSuccess + totalError;
    const errorRate = total ? totalError / total : 0;

    const progress = SUCCESS_TARGET ? clamp(totalSuccess / SUCCESS_TARGET, 0, 1) : 0;

    const lastErr = [...rows].reverse().find((r) => r.last_error)?.last_error || null;

    // Group by day
    const byDay = rows.reduce<Record<string, { success: number; error: number }>>((acc, r) => {
      const d = r.day;
      acc[d] = acc[d] || { success: 0, error: 0 };
      acc[d].success += r.success_count || 0;
      acc[d].error += r.error_count || 0;
      return acc;
    }, {});

    const daily = Object.entries(byDay)
      .map(([day, v]) => {
        const dayTotal = v.success + v.error;
        return {
          day,
          success: v.success,
          error: v.error,
          errorRate: dayTotal ? v.error / dayTotal : 0,
        };
      })
      .sort((a, b) => a.day.localeCompare(b.day));

    // Average daily success over last 3 active days (non-zero), fallback to last 7
    const activeDays = daily.filter((d) => d.success > 0 || d.error > 0);
    const tail = activeDays.slice(-3);
    const tail7 = activeDays.slice(-7);

    const avgDailySuccess =
      (tail.length ? tail : tail7).reduce((a, d) => a + d.success, 0) /
      Math.max(1, (tail.length ? tail : tail7).length);

    const remaining = Math.max(0, SUCCESS_TARGET - totalSuccess);
    const etaDays = avgDailySuccess > 0 ? remaining / avgDailySuccess : Infinity;

    const readyToResubmit = totalSuccess >= SUCCESS_TARGET && errorRate <= ERROR_RATE_TARGET;

    return {
      totalSuccess,
      totalError,
      errorRate,
      progress,
      lastErr,
      daily,
      avgDailySuccess,
      remaining,
      etaDays,
      readyToResubmit,
    };
  }, [rows]);

  const errorRatePct = Math.round(computed.errorRate * 1000) / 10;
  const progressPct = Math.round(computed.progress * 100);

  async function runDebugTest() {
    try {
      setRunNowBusy(true);
      setDebugTestResult(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch("/.netlify/functions/meta-ping-test", {
        method: "POST",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
      });

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, stage: "parse_error", raw: text };
      }

      setDebugTestResult(data);
    } catch (e: any) {
      setDebugTestResult({
        ok: false,
        stage: "error",
        error: e?.message || String(e),
      });
    } finally {
      setRunNowBusy(false);
    }
  }

  async function runNow() {
    try {
      setRunNowBusy(true);
      setRunNowResult(null);

      // Get auth token
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setRunNowResult({
          ok: false,
          status: 401,
          message: "No auth token - please log in",
          debug_id: "no-token",
          stage: "auth_missing",
          details: { error: "Not authenticated" },
        });
        setRunNowBusy(false);
        return;
      }

      const res = await fetch("/.netlify/functions/meta-activity-pinger", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const text = await res.text();
      let data: any;
      let parseError = false;

      try {
        data = JSON.parse(text);
      } catch {
        parseError = true;
        // If HTML error page (generic Netlify 500)
        if (text.includes('<!doctype') || text.includes('<html')) {
          data = {
            raw: "Netlify returned HTML error page (generic 500)",
            htmlSnippet: text.substring(0, 200),
            message: "Function crashed before returning JSON - check Netlify logs",
            stage: "function_crash",
          };
        } else {
          data = {
            raw: text,
            message: "Response was not valid JSON",
            stage: "parse_error",
          };
        }
      }

      if (!res.ok) {
        setRunNowResult({
          ok: false,
          message: data?.message || data?.error?.message || `HTTP ${res.status}`,
          debug_id: data?.request_id || data?.debug_id || "no-id",
          stage: data?.stage || `http_${res.status}`,
          details: data,
          status: res.status,
          parseError,
        });
      } else {
        // Check if backend returned ok: false (soft error)
        const backendOk = data?.ok !== false;
        setRunNowResult({
          ok: backendOk,
          message: backendOk ? (data?.message || "Run completed") : (data?.message || "Backend returned error"),
          debug_id: data?.request_id || data?.debug_id || "no-id",
          stage: data?.stage || "done",
          details: data,
          status: res.status,
          parseError,
        });
        // Only refresh if backend says success
        if (backendOk) {
          await loadRows();
        }
      }
    } catch (e: any) {
      console.error('[MetaApprovalTracker] runNow error:', e);
      setRunNowResult({
        ok: false,
        status: 0,
        message: e?.message || "Network error",
        debug_id: "unknown",
        stage: "network_error",
        details: {
          error: e?.message || String(e),
          stack: e?.stack || "",
        },
      });
    } finally {
      setRunNowBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={`rounded-2xl border border-white/10 bg-white/5 p-5 ${className}`}>
        <div className="text-white font-semibold">Meta Approval Tracker</div>
        <div className="mt-2 text-white/60 text-sm">Loading last 15 days…</div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-5 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-white font-semibold text-lg">Meta Approval Tracker</div>

            {computed.readyToResubmit ? (
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                Ready to Resubmit ✅
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border border-white/15 bg-white/5 text-white/70">
                In progress
              </span>
            )}
          </div>

          <div className="text-white/60 text-sm mt-1">
            Last 15 days of successful Marketing API calls + error rate. Goal: <b>1,500 successful</b> and{" "}
            <b>&lt; 10%</b> errors.
          </div>

          <div className="mt-2 text-xs text-white/60">
            Estimated time remaining at current rate:{" "}
            <span className="text-white/80 font-semibold">{fmtDays(computed.etaDays)}</span>
            {isFinite(computed.avgDailySuccess) && computed.avgDailySuccess > 0 ? (
              <span className="ml-2 text-white/50">(~{Math.round(computed.avgDailySuccess)}/day)</span>
            ) : null}
          </div>
        </div>

        <div className="text-right">
          <div
            className={`text-xs font-semibold ${
              computed.totalSuccess >= SUCCESS_TARGET ? "text-emerald-300" : "text-white/70"
            }`}
          >
            {computed.totalSuccess}/{SUCCESS_TARGET} successful
          </div>
          <div
            className={`text-xs font-semibold ${
              computed.errorRate <= ERROR_RATE_TARGET ? "text-emerald-300" : "text-red-300"
            }`}
          >
            {errorRatePct}% error rate
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={runNow}
              disabled={runNowBusy}
              className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold border ${
                runNowBusy ? "opacity-60 cursor-not-allowed" : "hover:bg-white/10"
              } border-white/15 bg-white/5 text-white`}
              title="Manually run the Meta activity pinger once"
            >
              {runNowBusy ? "Running…" : "Run Ping Now"}
            </button>
            <button
              type="button"
              onClick={() => setShowDebug(!showDebug)}
              className="inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-[10px] font-semibold border border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/5 hover:text-white/80"
            >
              {showDebug ? "Hide Debug" : "Show Debug"}
            </button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="h-2 w-full rounded-full bg-black/30 border border-white/10 overflow-hidden">
          <div className="h-full bg-white/40" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-white/60">
          <span>{progressPct}% complete</span>
          <span>{computed.remaining > 0 ? `${computed.remaining} remaining` : "✅ target reached"}</span>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
          <div className="text-sm font-semibold text-yellow-200 mb-2">Debug Tools</div>
          <div className="text-xs text-white/60 mb-3">
            Test functions with minimal code to isolate issues
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={runDebugTest}
              disabled={runNowBusy}
              className={`rounded-lg px-3 py-2 text-xs font-semibold border ${
                runNowBusy ? "opacity-60" : "hover:bg-white/10"
              } border-white/15 bg-white/5 text-white`}
            >
              Test Echo
            </button>
          </div>
          {debugTestResult && (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] font-semibold text-white/70 mb-1">Echo Test Result:</div>
              <pre className="text-[10px] text-white/60 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {JSON.stringify(debugTestResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Run result display */}
      {runNowResult ? (
        <div
          className={`mt-4 rounded-xl border p-4 ${
            runNowResult.ok
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-red-500/30 bg-red-500/10"
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="text-sm font-semibold text-white">
              {runNowResult.ok ? "✅ Run Successful" : "❌ Run Failed"}
            </div>
            <div className="flex items-center gap-2">
              {runNowResult.parseError && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border border-yellow-500/30 bg-yellow-500/10 text-yellow-200">
                  Parse Error
                </span>
              )}
              <div className="text-[10px] text-white/50 font-mono">
                {runNowResult.debug_id || "no-id"}
              </div>
            </div>
          </div>

          {/* Stage badge */}
          {runNowResult.stage ? (
            <div className="mb-2">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono border border-white/15 bg-white/5 text-white/70">
                stage: {runNowResult.stage}
              </span>
              {runNowResult.status > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono border border-white/15 bg-white/5 text-white/70">
                  HTTP {runNowResult.status}
                </span>
              )}
            </div>
          ) : null}

          {/* Message */}
          <div className={`text-xs mb-2 ${runNowResult.ok ? "text-white/80" : "text-red-200"}`}>
            {runNowResult.message || "No message"}
          </div>

          {/* HTML snippet if present */}
          {runNowResult.details?.htmlSnippet ? (
            <div className="mt-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-2">
              <div className="text-[10px] font-semibold text-yellow-200 mb-1">
                Received HTML instead of JSON (function crashed):
              </div>
              <div className="text-[9px] text-white/60 font-mono break-all">
                {runNowResult.details.htmlSnippet}...
              </div>
              <div className="text-[10px] text-yellow-200 mt-2">
                → Check Netlify function logs for stack trace
              </div>
            </div>
          ) : null}

          {/* Calls array */}
          {runNowResult.details?.calls && Array.isArray(runNowResult.details.calls) ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs font-semibold text-white/70">API Calls Made:</div>
              {runNowResult.details.calls.map((call: any, i: number) => (
                <div
                  key={i}
                  className={`rounded-lg border p-2 ${
                    call.ok
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : call.skipped
                      ? "border-white/10 bg-white/5"
                      : "border-red-500/20 bg-red-500/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="font-mono text-white/70">{call.stage}</span>
                    {call.ok !== undefined && (
                      <span className={call.ok ? "text-emerald-300" : "text-red-300"}>
                        {call.ok ? "✓" : "✗"} {call.status}
                      </span>
                    )}
                    {call.skipped && <span className="text-white/50">skipped</span>}
                  </div>
                  {call.reason && (
                    <div className="text-[10px] text-white/50 mt-1">{call.reason}</div>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {/* Full details collapsible */}
          {runNowResult.details ? (
            <details className="mt-3 text-[11px]">
              <summary className="cursor-pointer text-white/60 hover:text-white/80 font-semibold">
                Full Response JSON
              </summary>
              <pre className="mt-2 text-[10px] text-white/70 whitespace-pre-wrap break-all max-h-64 overflow-y-auto bg-black/20 p-2 rounded border border-white/10">
                {JSON.stringify(runNowResult.details, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {/* Most recent error */}
      {computed.lastErr ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-xs font-semibold text-white/70 mb-1">Most recent error</div>
          <div className="text-xs text-white/60 break-words">{computed.lastErr}</div>
        </div>
      ) : null}

      {/* Daily breakdown */}
      <div className="mt-5">
        <div className="text-sm font-semibold text-white/80 mb-2">Daily breakdown (last 15 days)</div>

        {err ? (
          <div className="text-xs text-red-300">Tracker error: {err}</div>
        ) : computed.daily.length === 0 ? (
          <div className="text-sm text-white/60">No activity recorded yet. Scheduler may not have run.</div>
        ) : (
          <div className="space-y-2">
            {computed.daily.map((d) => {
              const total = d.success + d.error;
              const dayErrPct = total ? Math.round((d.error / total) * 1000) / 10 : 0;
              const ok = dayErrPct <= 10;
              return (
                <div
                  key={d.day}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div className="text-xs text-white/70">{d.day}</div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-white/70">{d.success} success</div>
                    <div className={`text-xs font-semibold ${ok ? "text-emerald-200" : "text-red-200"}`}>
                      {dayErrPct}% err
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
