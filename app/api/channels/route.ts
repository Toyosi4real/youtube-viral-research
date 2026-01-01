import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SortKey =
  | "bestRatio" | "worstRatio"
  | "mostViews" | "leastViews"
  | "bestAvg" | "worstAvg"
  | "mostSubs" | "leastSubs"
  | "mostVideos" | "leastVideos"
  | "newestFirst" | "oldestFirst"
  | "none";

function applySort(q: any, sort: SortKey) {
  switch (sort) {
    case "bestRatio":
      return q.order("ratio_views_per_sub", { ascending: false, foreignTable: "channel_metrics" });
    case "worstRatio":
      return q.order("ratio_views_per_sub", { ascending: true, foreignTable: "channel_metrics" });
    case "bestAvg":
      return q.order("recent_avg_views", { ascending: false, foreignTable: "channel_metrics" });
    case "worstAvg":
      return q.order("recent_avg_views", { ascending: true, foreignTable: "channel_metrics" });
    case "mostViews":
      return q.order("view_count", { ascending: false });
    case "leastViews":
      return q.order("view_count", { ascending: true });
    case "mostSubs":
      return q.order("subscriber_count", { ascending: false });
    case "leastSubs":
      return q.order("subscriber_count", { ascending: true });
    case "mostVideos":
      return q.order("video_count", { ascending: false });
    case "leastVideos":
      return q.order("video_count", { ascending: true });
    case "newestFirst":
      return q.order("first_upload_at", { ascending: false });
    case "oldestFirst":
      return q.order("first_upload_at", { ascending: true });
    default:
      return q;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const refresh = url.searchParams.get("refresh") === "1";

  if (refresh) {
    if (!process.env.CRON_SECRET) {
      return NextResponse.json({ ok: false, error: "Server missing CRON_SECRET env var" }, { status: 400 });
    }

    const origin = url.origin;
    const h = { "x-cron-secret": process.env.CRON_SECRET! };

    const d = await fetch(`${origin}/api/discover`, { method: "POST", headers: h, cache: "no-store" });
    const dj = await d.json().catch(() => ({}));
    if (!dj.ok) return NextResponse.json({ ok: false, error: `Discover failed: ${dj.error || "unknown"}` }, { status: 400 });

    const m = await fetch(`${origin}/api/compute-metrics`, { method: "POST", headers: h, cache: "no-store" });
    const mj = await m.json().catch(() => ({}));
    if (!mj.ok) return NextResponse.json({ ok: false, error: `Metrics failed: ${mj.error || "unknown"}` }, { status: 400 });
  }

  const primarySort = (url.searchParams.get("primarySort") || "bestRatio") as SortKey;
  const secondarySort = (url.searchParams.get("secondarySort") || "none") as SortKey;

  const enhancedOnly = url.searchParams.get("enhancedOnly") === "true";
  const activeRecently = url.searchParams.get("activeRecently") === "true";

  const minRecentAvg = Number(url.searchParams.get("minRecentAvg") || 0);
  const maxRecentAvg = Number(url.searchParams.get("maxRecentAvg") || 5_000_000);

  const minSubs = Number(url.searchParams.get("minSubs") || 0);
  const maxSubs = Number(url.searchParams.get("maxSubs") || 5_000_000);

  const minVideos = Number(url.searchParams.get("minVideos") || 0);
  const maxVideos = Number(url.searchParams.get("maxVideos") || 1000);

  const searchTitle = (url.searchParams.get("searchTitle") || "").trim();

  // Shorts activity window: 14 days
  const sinceShort = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // No-long-video window: 5 months ~ 150 days
  const sinceLong = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString();

  // Must have at least 1 short in last 14 days
  const { data: shortCh, error: shortErr } = await supabaseAdmin
    .from("videos")
    .select("channel_id")
    .eq("is_short", true)
    .gte("published_at", sinceShort);

  if (shortErr) return NextResponse.json({ ok: false, error: shortErr.message }, { status: 400 });

  const shortSet = new Set((shortCh || []).map((x: any) => x.channel_id));

  // Must have zero long videos in last 5 months
  const { data: longCh, error: longErr } = await supabaseAdmin
    .from("videos")
    .select("channel_id")
    .eq("is_short", false)
    .gte("published_at", sinceLong);

  if (longErr) return NextResponse.json({ ok: false, error: longErr.message }, { status: 400 });

  const longSet = new Set((longCh || []).map((x: any) => x.channel_id));

  const eligibleIds = Array.from(shortSet).filter((id) => !longSet.has(id));

  if (eligibleIds.length === 0) return NextResponse.json({ ok: true, results: [] });

  let q = supabaseAdmin
    .from("channels")
    .select(`
      channel_id,title,subscriber_count,video_count,view_count,first_upload_at,updated_at,
      channel_metrics (recent_days,recent_short_count,recent_avg_views,recent_total_views,ratio_views_per_sub,computed_at)
    `)
    .in("channel_id", eligibleIds);

  // If this request was a Live Refresh, show ONLY newly refreshed channels
  if (refresh) {
    const freshSince = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // last 2 hours
    q = q.gte("updated_at", freshSince);
  }

  q = q.gte("subscriber_count", minSubs).lte("subscriber_count", maxSubs);
  q = q.gte("video_count", minVideos).lte("video_count", maxVideos);

  if (searchTitle) q = q.ilike("title", `%${searchTitle}%`);

  if (enhancedOnly) {
    q = q.not("channel_metrics.recent_avg_views", "is", null);
    q = q.gte("channel_metrics.recent_avg_views", minRecentAvg).lte("channel_metrics.recent_avg_views", maxRecentAvg);
    if (activeRecently) q = q.gte("channel_metrics.recent_short_count", 4);
  }

  q = applySort(q, primarySort);
  if (secondarySort !== "none") q = applySort(q, secondarySort);

  const { data, error } = await q.limit(200);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, results: data || [] });
}
