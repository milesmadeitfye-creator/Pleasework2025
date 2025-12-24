/**
 * Environment Debug Page
 *
 * Shows VITE_* environment variables to verify netlify.toml is being read correctly.
 * DO NOT expose sensitive server-side secrets here.
 */

import React from "react";

export function EnvDebugPage() {
  const env = import.meta.env;

  const rows = [
    ["MODE", env.MODE],
    ["DEV", String(env.DEV)],
    ["PROD", String(env.PROD)],
    ["VITE_SITE_URL", env.VITE_SITE_URL],
    ["VITE_FUNCTIONS_ORIGIN", env.VITE_FUNCTIONS_ORIGIN],
    ["VITE_SUPABASE_URL", env.VITE_SUPABASE_URL],
    [
      "VITE_SUPABASE_ANON_KEY",
      env.VITE_SUPABASE_ANON_KEY
        ? `${env.VITE_SUPABASE_ANON_KEY.slice(0, 6)}... (len=${
            env.VITE_SUPABASE_ANON_KEY.length
          })`
        : "MISSING",
    ],
    ["VITE_META_APP_ID", env.VITE_META_APP_ID],
    ["VITE_META_REDIRECT_URI", env.VITE_META_REDIRECT_URI],
    ["VITE_OAUTH_REDIRECT", env.VITE_OAUTH_REDIRECT],
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Environment Debug</h1>
        <p className="mt-2 text-sm text-slate-400">
          This page shows selected VITE_* env values from the built app. Use it
          to verify that netlify.toml is being read correctly.
        </p>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">
                  Variable
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, value]) => (
                <tr key={key} className="border-b border-slate-800 last:border-none">
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">
                    {key}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-100 break-all">
                    {value || <span className="text-red-400 font-semibold">MISSING</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
          <p className="text-xs text-yellow-400">
            <strong>⚠️ Security Note:</strong> Remove this page or protect it before going to production
            if you don&apos;t want anyone to know your Supabase URL. The anon key is already
            public in the client bundle, so showing its length here is safe.
          </p>
        </div>

        <div className="mt-4">
          <a
            href="/"
            className="inline-flex items-center text-sm text-slate-400 hover:text-slate-200"
          >
            ← Back to home
          </a>
        </div>
      </div>
    </div>
  );
}
