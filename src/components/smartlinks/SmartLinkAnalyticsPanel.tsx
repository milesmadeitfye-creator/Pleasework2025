import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type RollupRow = {
  id: string;
  smartlink_id: string;
  owner_user_id: string;
  day: string; // YYYY-MM-DD
  platform: string; // all | spotify | apple | etc
  views: number;
  clicks: number;
  unique_views: number;
  unique_clicks: number;
};

function fmtPct(n: number) {
  if (!isFinite(n)) return "0%";
  return `${Math.round(n * 1000) / 10}%`;
}

function fmtNum(n: number) {
  return new Intl.NumberFormat().format(n || 0);
}

export default function SmartLinkAnalyticsPanel({
  smartLinkId,
}: {
  smartLinkId: string;
}) {
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<RollupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  async function load() {
    setLoading(true);
    setError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Not signed in.");
      setLoading(false);
      return;
    }

    const url = `/.netlify/functions/smartlink-analytics?smartlink_id=${encodeURIComponent(
      smartLinkId
    )}&days=${days}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const j = await res.json();
    if (!j.ok) {
      setError(j.error?.message || j.error || "Failed to load analytics");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(j.rows || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!smartLinkId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartLinkId, days]);

  const allDaily = useMemo(
    () => rows.filter((r) => r.platform === "all"),
    [rows]
  );

  const platformDaily = useMemo(
    () => rows.filter((r) => r.platform !== "all"),
    [rows]
  );

  const totals = useMemo(() => {
    let views = 0,
      clicks = 0,
      uviews = 0,
      uclicks = 0;

    for (const r of allDaily) {
      views += r.views || 0;
      clicks += r.clicks || 0;
      uviews += r.unique_views || 0;
      uclicks += r.unique_clicks || 0;
    }

    const ctr = views > 0 ? clicks / views : 0;
    return { views, clicks, uviews, uclicks, ctr };
  }, [allDaily]);

  const platformTotals = useMemo(() => {
    const map = new Map<
      string,
      { platform: string; views: number; clicks: number; unique_clicks: number }
    >();

    for (const r of platformDaily) {
      const key = r.platform;
      const cur = map.get(key) || { platform: key, views: 0, clicks: 0, unique_clicks: 0 };
      cur.views += r.views || 0;
      cur.clicks += r.clicks || 0;
      cur.unique_clicks += r.unique_clicks || 0;
      map.set(key, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.clicks - a.clicks);
  }, [platformDaily]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Smart Link Analytics</div>
          <div style={{ opacity: 0.7, marginTop: 4 }}>
            Views, outbound clicks, uniques, and platform breakdown.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Range</div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "white",
              padding: "8px 10px",
              borderRadius: 10,
            }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>

          <button
            onClick={load}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 14, opacity: 0.75 }}>Loading analytics…</div>
      ) : error ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,80,80,0.35)",
            background: "rgba(255,80,80,0.10)",
            color: "white",
          }}
        >
          {error}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            <KpiCard label="Views" value={fmtNum(totals.views)} sub={`Unique: ${fmtNum(totals.uviews)}`} />
            <KpiCard label="Clicks" value={fmtNum(totals.clicks)} sub={`Unique: ${fmtNum(totals.uclicks)}`} />
            <KpiCard
              label="CTR"
              value={fmtPct(totals.ctr)}
              sub="Clicks / Views"
            />
            <KpiCard
              label="Top Platform"
              value={platformTotals[0]?.platform ? prettyPlatform(platformTotals[0].platform) : "—"}
              sub={platformTotals[0]?.clicks ? `${fmtNum(platformTotals[0].clicks)} clicks` : "No clicks yet"}
            />
          </div>

          {/* Daily table */}
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <div style={{ fontWeight: 700 }}>Daily Performance</div>
              <div style={{ opacity: 0.7, fontSize: 13 }}>Totals (all platforms)</div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Day</th>
                    <th style={thStyle}>Views</th>
                    <th style={thStyle}>Clicks</th>
                    <th style={thStyle}>Unique Clicks</th>
                    <th style={thStyle}>CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {allDaily.length === 0 ? (
                    <tr>
                      <td style={tdStyle} colSpan={5}>
                        No analytics yet.
                      </td>
                    </tr>
                  ) : (
                    allDaily.map((r) => {
                      const ctr = r.views > 0 ? r.clicks / r.views : 0;
                      return (
                        <tr key={r.id}>
                          <td style={tdStyle}>{r.day}</td>
                          <td style={tdStyle}>{fmtNum(r.views)}</td>
                          <td style={tdStyle}>{fmtNum(r.clicks)}</td>
                          <td style={tdStyle}>{fmtNum(r.unique_clicks)}</td>
                          <td style={tdStyle}>{fmtPct(ctr)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Platform breakdown */}
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <div style={{ fontWeight: 700 }}>Platform Breakdown</div>
              <div style={{ opacity: 0.7, fontSize: 13 }}>Clicks by destination</div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Platform</th>
                    <th style={thStyle}>Views</th>
                    <th style={thStyle}>Clicks</th>
                    <th style={thStyle}>Unique Clicks</th>
                    <th style={thStyle}>CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {platformTotals.length === 0 ? (
                    <tr>
                      <td style={tdStyle} colSpan={5}>
                        No platform clicks yet.
                      </td>
                    </tr>
                  ) : (
                    platformTotals.map((p) => {
                      const ctr = p.views > 0 ? p.clicks / p.views : 0;
                      return (
                        <tr key={p.platform}>
                          <td style={tdStyle}>{prettyPlatform(p.platform)}</td>
                          <td style={tdStyle}>{fmtNum(p.views)}</td>
                          <td style={tdStyle}>{fmtNum(p.clicks)}</td>
                          <td style={tdStyle}>{fmtNum(p.unique_clicks)}</td>
                          <td style={tdStyle}>{fmtPct(ctr)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        padding: 14,
        minHeight: 86,
      }}
    >
      <div style={{ opacity: 0.7, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{value}</div>
      {sub ? <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>{sub}</div> : null}
    </div>
  );
}

function prettyPlatform(p: string) {
  const s = (p || "").toLowerCase();
  const map: Record<string, string> = {
    spotify: "Spotify",
    apple: "Apple Music",
    applemusic: "Apple Music",
    apple_music: "Apple Music",
    youtube: "YouTube",
    youtubemusic: "YouTube Music",
    youtube_music: "YouTube Music",
    tidal: "TIDAL",
    deezer: "Deezer",
    amazon: "Amazon Music",
    soundcloud: "SoundCloud",
    pandora: "Pandora",
    audiomack: "Audiomack",
    "all": "All",
  };
  return map[s] || p;
}

const panelStyle: React.CSSProperties = {
  marginTop: 12,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  padding: 14,
};

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 10,
  marginBottom: 10,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 560,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  opacity: 0.7,
  padding: "10px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  fontSize: 13,
  opacity: 0.92,
};
