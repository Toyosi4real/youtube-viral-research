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
      return q.order("ratio_views_per_sub", { ascending: false, nullsFirst: false, foreignTable: "channel_metrics" });
    case "worstRatio":
      return q.order("ratio_views_per_sub", { ascending: true, nullsFirst: false, foreignTable: "channel_metrics" });

    case "bestAvg":
      return q.order("recent_avg_views", { ascending: false, nullsFirst: false, foreignTable: "channel_metrics" });
    case "worstAvg":
      return q.order("recent_avg_views", { ascending: true, nullsFirst: false, foreignTable: "channel_metrics" });

    case "mostViews":
      return q.order("view_count", { ascending: false }); // total channel views
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

    // newest/oldest by FIRST UPLOAD (based on Shorts ingested)
    case "newestFirst":
      return q.order("first_upload_at", { ascending: false, nullsFirst: false });
    case "oldestFirst":
      return q.order("first_upload_at", { ascending: true, nullsFirst: false });

    default:
      return q;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);

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

  let q = supabaseAdmin
    .from("channels")
    .select(`
      channel_id,title,country,subscriber_count,video_count,view_count,first_upload_at,
      channel_metrics!inner(recent_days,recent_short_count,recent_avg_views,recent_total_views,ratio_views_per_sub,computed_at)
    `);

  // sliders
  q = q.gte("subscriber_count", minSubs).lte("subscriber_count", maxSubs);
  q = q.gte("video_count", minVideos).lte("video_count", maxVideos);
  q = q.gte("channel_metrics.recent_avg_views", minRecentAvg)
       .lte("channel_metrics.recent_avg_views", maxRecentAvg);

  // checkboxes
  if (enhancedOnly) q = q.not("channel_metrics.recent_avg_views", "is", null);
  if (activeRecently) q = q.gte("channel_metrics.recent_short_count", 4);

  // primary + optional secondary sort
  q = applySort(q, primarySort);
  if (secondarySort !== "none") q = applySort(q, secondarySort);

  const { data, error } = await q.limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, results: data || [] });
}
