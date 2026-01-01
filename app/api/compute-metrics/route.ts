import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function assertCron(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) throw new Error("Unauthorized");
}

export async function POST(req: Request) {
  try {
    assertCron(req);

    const { error } = await supabaseAdmin.rpc("refresh_channel_metrics", {
      p_recent_days: 14,
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
