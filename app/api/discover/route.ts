import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ytGet, isoDurationToSeconds } from "@/lib/youtube";

function assertCron(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) throw new Error("Unauthorized");
}

const REGIONS = ["US", "GB", "CA", "AU"];

// Quota-safe caps
const MOST_POPULAR_PER_REGION = 25;
const MAX_CHANNELS_TO_CRAWL_PER_RUN = 80;
const UPLOADS_TO_FETCH_PER_CHANNEL = 25;

// Shorts length constraint
const MIN_SHORT_SECONDS = 10;
const MAX_SHORT_SECONDS = 40;

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  try {
    assertCron(req);

    // 1) seed channels from mostPopular
    const discoveredChannelIds: string[] = [];

    for (const regionCode of REGIONS) {
      const popular = await ytGet("videos", {
        part: "snippet",
        chart: "mostPopular",
        regionCode,
        maxResults: String(MOST_POPULAR_PER_REGION),
      });

      for (const it of popular.items || []) {
        const chId = it?.snippet?.channelId;
        if (chId) discoveredChannelIds.push(chId);
      }
    }

    const uniqueChannelIds = Array.from(new Set(discoveredChannelIds)).slice(0, MAX_CHANNELS_TO_CRAWL_PER_RUN);
    if (uniqueChannelIds.length === 0) {
      return NextResponse.json({ ok: true, crawledChannels: 0, shortsUpserted: 0 });
    }

    // 2) fetch channel details (uploads playlist + stats)
    const channelDetails: any[] = [];
    for (const ids of chunk(uniqueChannelIds, 50)) {
      const c = await ytGet("channels", {
        part: "snippet,statistics,contentDetails",
        id: ids.join(","),
      });
      for (const item of c.items || []) channelDetails.push(item);
    }

    const channelRows = channelDetails.map((ch: any) => ({
      channel_id: ch.id,
      title: ch.snippet?.title ?? null,
      country: ch.snippet?.country ?? null,
      published_at: ch.snippet?.publishedAt ?? null,
      subscriber_count: ch.statistics?.hiddenSubscriberCount ? 0 : Number(ch.statistics?.subscriberCount ?? 0),
      video_count: Number(ch.statistics?.videoCount ?? 0),
      view_count: Number(ch.statistics?.viewCount ?? 0),
      updated_at: new Date().toISOString(),
    }));

    if (channelRows.length) {
      await supabaseAdmin.from("channels").upsert(channelRows, { onConflict: "channel_id" });

      await supabaseAdmin.from("channel_snapshots").insert(
        channelRows.map((r) => ({
          channel_id: r.channel_id,
          captured_at: new Date().toISOString(),
          subscriber_count: r.subscriber_count,
          video_count: r.video_count,
          view_count: r.view_count,
        }))
      );
    }

    // 3) crawl uploads playlist and ingest SHORTS only (10–40s)
    let totalShortsUpserted = 0;
    let channelsCrawled = 0;

    for (const ch of channelDetails) {
      const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) continue;

      channelsCrawled++;

      const pl = await ytGet("playlistItems", {
        part: "contentDetails",
        playlistId: uploadsPlaylistId,
        maxResults: String(UPLOADS_TO_FETCH_PER_CHANNEL),
      });

      const videoIds = Array.from(
        new Set((pl.items || []).map((x: any) => x.contentDetails?.videoId).filter(Boolean))
      );
      if (!videoIds.length) continue;

      for (const ids of chunk(videoIds, 50)) {
        const v = await ytGet("videos", {
          part: "snippet,contentDetails,statistics",
          id: ids.join(","),
        });

        const shortRows = (v.items || [])
          .map((it: any) => {
            const dur = isoDurationToSeconds(it.contentDetails?.duration ?? "PT0S");
            const isShort = dur >= MIN_SHORT_SECONDS && dur <= MAX_SHORT_SECONDS;
            if (!isShort) return null;

            return {
              video_id: it.id,
              channel_id: it.snippet?.channelId ?? ch.id,
              title: it.snippet?.title ?? null,
              published_at: it.snippet?.publishedAt ?? null,
              duration_seconds: dur,
              is_short: true,
              view_count: Number(it.statistics?.viewCount ?? 0),
              like_count: Number(it.statistics?.likeCount ?? 0),
              comment_count: Number(it.statistics?.commentCount ?? 0),
              updated_at: new Date().toISOString(),
            };
          })
          .filter(Boolean) as any[];

        if (!shortRows.length) continue;

        await supabaseAdmin.from("videos").upsert(shortRows, { onConflict: "video_id" });

        await supabaseAdmin.from("video_snapshots").insert(
          shortRows.map((r) => ({
            video_id: r.video_id,
            captured_at: new Date().toISOString(),
            view_count: r.view_count,
            like_count: r.like_count,
            comment_count: r.comment_count,
          }))
        );

        totalShortsUpserted += shortRows.length;
      }
    }

    return NextResponse.json({
      ok: true,
      crawledChannels: channelsCrawled,
      shortsUpserted: totalShortsUpserted,
      shortSeconds: `${MIN_SHORT_SECONDS}-${MAX_SHORT_SECONDS}`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
