import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ytGet, parseDuration } from "@/lib/youtube";

export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Internal discovery regions only to diversify. Your results are NOT restricted by region.
  const REGIONS = ["US", "GB", "CA", "AU"];

  // Skip channels already updated recently to force novelty
  const recentlySince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentChannels, error: recentErr } = await supabaseAdmin
    .from("channels")
    .select("channel_id")
    .gte("updated_at", recentlySince);

  if (recentErr) {
    return NextResponse.json({ ok: false, error: recentErr.message }, { status: 400 });
  }

  const recentSet = new Set((recentChannels || []).map((r: any) => r.channel_id));

  const now = Date.now();
  const daysAgo = 3 + Math.floor(Math.random() * 8); // 3..10
  const publishedAfter = new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  const discoveredVideoIds = new Set<string>();
  const discoveredChannelIds = new Set<string>();

  // Search for high-view recent content
  for (const region of REGIONS) {
    const s = await ytGet("search", {
      part: "id",
      type: "video",
      order: "viewCount",
      maxResults: 50,
      regionCode: region,
      publishedAfter,
      videoDuration: "short", // < 4 mins; we enforce <=60s after
      safeSearch: "none",
    });

    for (const item of s.items || []) {
      const id = item?.id?.videoId;
      if (id) discoveredVideoIds.add(id);
    }
  }

  const ids = Array.from(discoveredVideoIds);
  if (!ids.length) return NextResponse.json({ ok: true, inserted: 0, reason: "no_search_results" });

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

  let inserted = 0;
  const freshChannelsThisRun = new Set<string>();

  for (const chunk of chunks) {
    const v = await ytGet("videos", {
      part: "snippet,statistics,contentDetails",
      id: chunk.join(","),
      maxResults: 50,
    });

    const channelUpsertsBasic: any[] = [];
    const videoUpserts: any[] = [];

    for (const item of v.items || []) {
      const durationSeconds = parseDuration(item?.contentDetails?.duration || "");
      const isShort = durationSeconds > 0 && durationSeconds <= 60;

      // Shorts only; optional quality filter: ignore <10s
      if (!isShort || durationSeconds < 10) continue;

      const channelId = item?.snippet?.channelId;
      const videoId = item?.id;
      if (!channelId || !videoId) continue;

      // Force novelty: skip channels seen recently
      if (recentSet.has(channelId)) continue;

      discoveredChannelIds.add(channelId);
      freshChannelsThisRun.add(channelId);

      channelUpsertsBasic.push({
        channel_id: channelId,
        title: item?.snippet?.channelTitle || null,
        updated_at: new Date().toISOString(),
      });

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

  // Update channel stats for channels discovered THIS run
  const chIds = Array.from(freshChannelsThisRun);
  for (let i = 0; i < chIds.length; i += 50) {
    const batch = chIds.slice(i, i + 50);
    const c = await ytGet("channels", {
      part: "snippet,statistics",
      id: batch.join(","),
      maxResults: 50,
    });

    const upserts = (c.items || []).map((it: any) => ({
      channel_id: it?.id,
      title: it?.snippet?.title || null,
      subscriber_count: Number(it?.statistics?.subscriberCount || 0),
      video_count: Number(it?.statistics?.videoCount || 0),
      view_count: Number(it?.statistics?.viewCount || 0),
      updated_at: new Date().toISOString(),
    }));

    if (upserts.length) {
      await supabaseAdmin.from("channels").upsert(upserts, { onConflict: "channel_id" });
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    window_days_ago: daysAgo,
    discovered_videos: ids.length,
    fresh_channels: chIds.length,
    note: "refresh returns new channels by skipping recently seen ones",
  });
}
