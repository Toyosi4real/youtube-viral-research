import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ytGet, parseDuration } from "@/lib/youtube";

export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Create a new discovery run
  const { data: run } = await supabaseAdmin
    .from("discovery_runs")
    .insert({})
    .select()
    .single();

  const runId = run.id;

  const REGIONS = ["US", "GB", "CA", "AU"];
  const publishedAfter = new Date(
    Date.now() - (3 + Math.floor(Math.random() * 7)) * 86400000
  ).toISOString();

  const videoIds = new Set<string>();

  for (const region of REGIONS) {
    const s = await ytGet("search", {
      part: "id",
      type: "video",
      order: "viewCount",
      videoDuration: "short",
      maxResults: 50,
      regionCode: region,
      publishedAfter
    });

    s.items?.forEach((i: any) => {
      if (i?.id?.videoId) videoIds.add(i.id.videoId);
    });
  }

  for (const chunk of Array.from(videoIds).reduce<string[][]>((a, c, i) => {
    if (i % 50 === 0) a.push([]);
    a[a.length - 1].push(c);
    return a;
  }, [])) {
    const v = await ytGet("videos", {
      part: "snippet,statistics,contentDetails",
      id: chunk.join(",")
    });

    for (const item of v.items || []) {
      const duration = parseDuration(item.contentDetails.duration);
      if (duration > 60 || duration < 10) continue;

      await supabaseAdmin.from("channels").upsert({
        channel_id: item.snippet.channelId,
        title: item.snippet.channelTitle,
        discovery_run_id: runId,
        updated_at: new Date().toISOString()
      });

      await supabaseAdmin.from("videos").upsert({
        video_id: item.id,
        channel_id: item.snippet.channelId,
        is_short: true,
        duration_seconds: duration,
        published_at: item.snippet.publishedAt,
        view_count: Number(item.statistics.viewCount || 0)
      });
    }
  }

  return NextResponse.json({ ok: true, runId });
}
