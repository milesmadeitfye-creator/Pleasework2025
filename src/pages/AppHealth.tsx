/**
 * App Health Diagnostics Page
 *
 * In-app diagnostics UI for viewing errors, running health checks,
 * and exporting error reports without needing console access.
 */

import { useState, useEffect } from "react";
import {
  getDiagLogs,
  clearDiagLogs,
  getEnvSummary,
  checkWebSocketSafety,
  logDiag,
  DiagEvent,
  DiagLevel,
  DiagType,
} from "../lib/diagnostics";
import { getWebSocketStatus } from "../lib/ws";
import { getEnvFlags } from "../lib/safeEnv";
import { supabase } from "../lib/supabase";

type FilterType = "all" | "errors" | "warnings" | "network" | "supabase" | "ws";

export default function AppHealth() {
  const [logs, setLogs] = useState<DiagEvent[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [envSummary, setEnvSummary] = useState<any>(null);
  const [wsSafety, setWsSafety] = useState<any>(null);
  const [wsStatus, setWsStatus] = useState<any>(null);
  const [selfTestRunning, setSelfTestRunning] = useState(false);
  const [selfTestResults, setSelfTestResults] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setLogs(getDiagLogs());
    setEnvSummary(getEnvSummary());
    setWsSafety(checkWebSocketSafety());
    setWsStatus(getWebSocketStatus());
  };

  const handleClearLogs = () => {
    clearDiagLogs();
    loadData();
  };

  const handleCopyReport = () => {
    const report = {
      reportId: Math.random().toString(36).substring(2, 10),
      timestamp: new Date().toISOString(),
      environment: {
        ...envSummary,
        envFlags: getEnvFlags(),
        wsStatus,
        wsSafety,
      },
      selfTest: selfTestResults,
      logs: logs.slice(0, 100),
    };

    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    alert("Report copied to clipboard!");
  };

  const runSelfTest = async () => {
    setSelfTestRunning(true);
    const results: any = {
      timestamp: new Date().toISOString(),
      tests: [],
    };

    // Test 1: Health endpoint
    try {
      const healthRes = await fetch("/.netlify/functions/health");
      const healthData = await healthRes.json();
      results.tests.push({
        name: "Health Endpoint",
        passed: healthRes.ok && healthData.ok,
        data: healthData,
      });
    } catch (error: any) {
      results.tests.push({
        name: "Health Endpoint",
        passed: false,
        error: error.message,
      });
    }

    // Test 2: Supabase connectivity
    try {
      const { error } = await supabase.from("profiles").select("id").limit(1);
      results.tests.push({
        name: "Supabase Connectivity",
        passed: !error,
        error: error?.message,
      });
    } catch (error: any) {
      results.tests.push({
        name: "Supabase Connectivity",
        passed: false,
        error: error.message,
      });
    }

    // Test 3: Local storage
    try {
      const testKey = "__test_storage__";
      localStorage.setItem(testKey, "test");
      const value = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      results.tests.push({
        name: "Local Storage",
        passed: value === "test",
      });
    } catch (error: any) {
      results.tests.push({
        name: "Local Storage",
        passed: false,
        error: error.message,
      });
    }

    setSelfTestResults(results);
    setSelfTestRunning(false);

    // Log results
    logDiag({
      level: "info",
      type: "runtime",
      message: "Self-test completed",
      extra: results,
    });

    loadData();
  };

  const filteredLogs = logs
    .filter((log) => {
      if (filter === "all") return true;
      if (filter === "errors") return log.level === "error";
      if (filter === "warnings") return log.level === "warn";
      if (filter === "network") return log.type === "network";
      if (filter === "supabase") return log.type === "supabase";
      if (filter === "ws") return log.type === "ws";
      return true;
    })
    .slice(0, 100);

  const levelColor = (level: DiagLevel) => {
    if (level === "error") return "text-red-400 bg-red-500/10 border-red-500/30";
    if (level === "warn") return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
    return "text-blue-400 bg-blue-500/10 border-blue-500/30";
  };

  const typeColor = (type: DiagType) => {
    const colors: Record<DiagType, string> = {
      runtime: "bg-purple-500/20 text-purple-300",
      promise: "bg-pink-500/20 text-pink-300",
      react: "bg-red-500/20 text-red-300",
      network: "bg-blue-500/20 text-blue-300",
      supabase: "bg-green-500/20 text-green-300",
      meta: "bg-indigo-500/20 text-indigo-300",
      ws: "bg-orange-500/20 text-orange-300",
      build: "bg-gray-500/20 text-gray-300",
    };
    return colors[type] || "bg-gray-500/20 text-gray-300";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">App Health Diagnostics</h1>
          <p className="text-slate-400">
            System diagnostics, error logs, and health checks
          </p>
        </div>

        {/* Environment Summary */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">Environment</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-slate-400">Protocol</div>
              <div className="text-white font-mono">{envSummary?.protocol}</div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Hostname</div>
              <div className="text-white font-mono text-sm">{envSummary?.hostname}</div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Build Mode</div>
              <div className="text-white font-mono">{envSummary?.buildMode}</div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Online</div>
              <div className={envSummary?.online ? "text-green-400" : "text-red-400"}>
                {envSummary?.online ? "Yes" : "No"}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Supabase</div>
              <div className={envSummary?.supabaseConfigured ? "text-green-400" : "text-red-400"}>
                {envSummary?.supabaseConfigured ? "Configured" : "Not configured"}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Context</div>
              <div className="text-white font-mono">{envSummary?.netlifyContext}</div>
            </div>
          </div>
        </div>

        {/* WebSocket Safety */}
        {wsSafety && !wsSafety.safe && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold text-red-400 mb-2">WebSocket Security Issues</h2>
            <ul className="space-y-2">
              {wsSafety.issues.map((issue: string, i: number) => (
                <li key={i} className="text-red-300 flex items-start">
                  <span className="mr-2">⚠️</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* WebSocket Status */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">WebSocket Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-slate-400">Supported</div>
              <div className={wsStatus?.supported ? "text-green-400" : "text-red-400"}>
                {wsStatus?.supported ? "Yes" : "No"}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Secure</div>
              <div className={wsStatus?.secure ? "text-green-400" : "text-yellow-400"}>
                {wsStatus?.secure ? "Yes" : "HTTP"}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Ready</div>
              <div className={wsStatus?.ready ? "text-green-400" : "text-yellow-400"}>
                {wsStatus?.ready ? "Ready" : "Not ready"}
              </div>
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-4">{wsStatus?.message}</p>
        </div>

        {/* Self Test */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Self Test</h2>
            <button
              onClick={runSelfTest}
              disabled={selfTestRunning}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200"
            >
              {selfTestRunning ? "Running..." : "Run Tests"}
            </button>
          </div>

          {selfTestResults && (
            <div className="space-y-2">
              {selfTestResults.tests.map((test: any, i: number) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg border ${
                    test.passed
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-red-500/10 border-red-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">{test.name}</span>
                    <span className={test.passed ? "text-green-400" : "text-red-400"}>
                      {test.passed ? "✓ Passed" : "✗ Failed"}
                    </span>
                  </div>
                  {test.error && (
                    <div className="text-sm text-red-300 mt-1">{test.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={handleCopyReport}
            className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200"
          >
            Copy Report
          </button>
          <button
            onClick={handleClearLogs}
            className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200"
          >
            Clear Logs
          </button>
          <button
            onClick={loadData}
            className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200"
          >
            Refresh
          </button>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(["all", "errors", "warnings", "network", "supabase", "ws"] as FilterType[]).map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  filter === f
                    ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            )
          )}
        </div>

        {/* Logs */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">
            Logs ({filteredLogs.length})
          </h2>

          {filteredLogs.length === 0 && (
            <div className="text-center py-12 text-slate-400">No logs to display</div>
          )}

          <div className="space-y-3">
            {filteredLogs.map((log, i) => (
              <div
                key={i}
                className={`p-4 rounded-lg border ${levelColor(log.level)}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-mono ${typeColor(log.type)}`}>
                      {log.type}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {new Date(log.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">{log.path}</span>
                </div>

                <div className="text-white font-medium mb-1">{log.message}</div>

                {log.stack && (
                  <details className="mt-2">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">
                      Stack trace
                    </summary>
                    <pre className="text-xs text-slate-400 mt-2 overflow-x-auto">
                      {log.stack}
                    </pre>
                  </details>
                )}

                {log.extra && (
                  <details className="mt-2">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">
                      Extra data
                    </summary>
                    <pre className="text-xs text-slate-400 mt-2 overflow-x-auto">
                      {JSON.stringify(log.extra, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
