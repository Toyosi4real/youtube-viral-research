import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";

  let runId: string | null = null;

  if (refresh) {
    const h = { "x-cron-secret": process.env.CRON_SECRET! };
    const r = await fetch(`${url.origin}/api/discover`, { method: "POST", headers: h });
    const j = await r.json();
    runId = j.runId;
  } else {
    const { data } = await supabaseAdmin
      .from("discovery_runs")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    runId = data?.id;
  }

  if (!runId) return NextResponse.json({ ok: true, results: [] });

  const { data, error } = await supabaseAdmin
    .from("channels")
    .select(`
      channel_id,
      title,
      subscriber_count,
      view_count,
      channel_metrics (*)
    `)
    .eq("discovery_run_id", runId)
    .limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message });
  }

  return NextResponse.json({ ok: true, results: data });
}
