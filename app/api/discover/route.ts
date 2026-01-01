import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ytGet, parseDuration } from "@/lib/youtube";

export async function POST(req: Request) {
  // Protect endpoint (used by Live Refresh + GitHub cron)
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Internal regions to diversify discovery (NOT shown in UI, NOT restricting your filters)
  const REGIONS = ["US", "GB", "CA", "AU"];

  // Each refresh picks a different slice of the 3–10 day window
  const now = Date.now();
  const daysAgo = 3 + Math.floor(Math.random() * 8); // 3..10
  const publishedAfter = new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  // We will discover up to ~400 candidate videos per refresh (then filter to true shorts)
  const discoveredVideoIds = new Set<string>();
  const discoveredChannelIds = new Set<string>();

  for (const region of REGIONS) {
    // Search for high-view recent content (3–10 days old)
    // videoDuration=short means <4 minutes, but we later enforce <=60 seconds via contentDetails.duration.
    const s = await ytGet("search", {
      part: "id",
      type: "video",
      order: "viewCount",
      maxResults: 50,
      regionCode: region,
      publishedAfter,
      videoDuration: "short",
      safeSearch: "none",
    });

    for (const item of s.items || []) {
      const id = item?.id?.videoId;
      if (id) discoveredVideoIds.add(id);
    }
  }

  const ids = Array.from(discoveredVideoIds);
  if (ids.length === 0) return NextResponse.json({ ok: true, inserted: 0 });

  // Fetch full details for videos (contentDetails for duration + statistics)
  // videos.list max 50 ids per call
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

  let inserted = 0;

  for (const chunk of chunks) {
    const v = await ytGet("videos", {
      part: "snippet,statistics,contentDetails",
      id: chunk.join(","),
      maxResults: 50,
    });

    const videoUpserts: any[] = [];
    const channelUpsertsBasic: any[] = [];

    for (const item of v.items || []) {
      const durationSeconds = parseDuration(item?.contentDetails?.duration || "");
      const isShort = durationSeconds > 0 && durationSeconds <= 60;

      // Optional quality gate: ignore ultra-short junk (you can remove this if you want)
      if (!isShort) continue;
      if (durationSeconds < 10) continue;

      const channelId = item?.snippet?.channelId;
      const videoId = item?.id;
      if (!channelId || !videoId) continue;

      discoveredChannelIds.add(channelId);

      // Upsert channel basic fields (stats updated in next step)
      channelUpsertsBasic.push({
        channel_id: channelId,
        title: item?.snippet?.channelTitle || null,
        updated_at: new Date().toISOString(),
      });

      // Upsert video
      videoUpserts.push({
        video_id: videoId,
        channel_id: channelId,
        title: item?.snippet?.title || null,
        published_at: item?.snippet?.publishedAt || null,
        duration_seconds: durationSeconds,
        is_short: true,
        view_count: Number(item?.statistics?.viewCount || 0),
        like_count: Number(item?.statistics?.likeCount || 0),
        comment_count: Number(item?.statistics?.commentCount || 0),
        updated_at: new Date().toISOString(),
      });
    }

    if (channelUpsertsBasic.length) {
      await supabaseAdmin.from("channels").upsert(channelUpsertsBasic, { onConflict: "channel_id" });
    }

    if (videoUpserts.length) {
      const { error } = await supabaseAdmin.from("videos").upsert(videoUpserts, { onConflict: "video_id" });
      if (!error) inserted += videoUpserts.length;
    }
  }

  // Update channel statistics in batch (subs, total views, video count)
  const chIds = Array.from(discoveredChannelIds);
  for (let i = 0; i < chIds.length; i += 50) {
    const batch = chIds.slice(i, i + 50);
    const c = await ytGet("channels", {
      part: "snippet,statistics",
      id: batch.join(","),
      maxResults: 50,
    });

    const channelStatsUpserts = (c.items || []).map((it: any) => ({
      channel_id: it?.id,
      title: it?.snippet?.title || null,
      subscriber_count: Number(it?.statistics?.subscriberCount || 0),
      video_count: Number(it?.statistics?.videoCount || 0),
      view_count: Number(it?.statistics?.viewCount || 0),
      updated_at: new Date().toISOString(),
    }));

    if (channelStatsUpserts.length) {
      await supabaseAdmin.from("channels").upsert(channelStatsUpserts, { onConflict: "channel_id" });
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    window_days_ago: daysAgo,
    discovered_videos: ids.length,
    discovered_channels: chIds.length,
  });
}
