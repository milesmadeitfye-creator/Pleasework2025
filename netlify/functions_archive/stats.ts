import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const handler: Handler = async (event) => {
  try {
    const url = new URL((event as any).rawUrl ?? `https://x.local${event.path}${event.rawQuery ? "?" + event.rawQuery : ""}`);
    const track_id = url.searchParams.get("track_id");
    if (!track_id) return { statusCode: 400, body: "track_id required" };

    const platform = url.searchParams.get("platform");
    const since = url.searchParams.get("since") || "30 days";

    await supabase.rpc("refresh_click_stats");

    let q = supabase.from("mv_click_stats")
      .select("platform, day, clicks, mobile_clicks, app_attempts, fallbacks")
      .eq("track_id", track_id)
      .gte("day", new Date(Date.now() - 30*24*3600*1000).toISOString().slice(0,10));

    if (platform) q = q.eq("platform", platform);

    const { data: summary } = await q.order("day", { ascending: true });

    let totals: any = {};
    if (summary) {
      totals = summary.reduce((acc:any, row:any) => {
        acc.clicks = (acc.clicks||0) + row.clicks;
        acc.mobile_clicks = (acc.mobile_clicks||0) + row.mobile_clicks;
        acc.app_attempts = (acc.app_attempts||0) + row.app_attempts;
        acc.fallbacks = (acc.fallbacks||0) + row.fallbacks;
        return acc;
      }, {});
    }

    return {
      statusCode: 200,
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ totals, daily: summary||[] })
    };
  } catch (e:any) {
    return { statusCode: 500, body: e.message || "Internal error" };
  }
};
