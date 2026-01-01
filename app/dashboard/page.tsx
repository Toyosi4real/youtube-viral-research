"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type SortKey =
  | "bestRatio" | "worstRatio"
  | "mostViews" | "leastViews"
  | "bestAvg" | "worstAvg"
  | "mostSubs" | "leastSubs"
  | "mostVideos" | "leastVideos"
  | "newestFirst" | "oldestFirst"
  | "none";

const SORTS: { label: string; value: SortKey }[] = [
  { label: "Best Ratio", value: "bestRatio" },
  { label: "Worst Ratio", value: "worstRatio" },
  { label: "Most views", value: "mostViews" },
  { label: "Least views", value: "leastViews" },
  { label: "Best Average Avg", value: "bestAvg" },
  { label: "Worst Average Avg", value: "worstAvg" },
  { label: "Most Subscribers", value: "mostSubs" },
  { label: "Least Subscribers", value: "leastSubs" },
  { label: "Most videos", value: "mostVideos" },
  { label: "Least videos", value: "leastVideos" },
  { label: "Newest first (by first upload)", value: "newestFirst" },
  { label: "Oldest first (by first upload)", value: "oldestFirst" },
];

export default function DashboardPage() {
  const [primarySort, setPrimarySort] = useState<SortKey>("bestRatio");
  const [secondarySort, setSecondarySort] = useState<SortKey>("none");

  const [enhancedOnly, setEnhancedOnly] = useState(true);
  const [activeRecently, setActiveRecently] = useState(false);

  const [minRecentAvg, setMinRecentAvg] = useState(0);
  const [maxRecentAvg, setMaxRecentAvg] = useState(5_000_000);

  const [minSubs, setMinSubs] = useState(0);
  const [maxSubs, setMaxSubs] = useState(5_000_000);

  const [minVideos, setMinVideos] = useState(0);
  const [maxVideos, setMaxVideos] = useState(1000);

  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("primarySort", primarySort);
    p.set("secondarySort", secondarySort);
    p.set("enhancedOnly", String(enhancedOnly));
    p.set("activeRecently", String(activeRecently));
    p.set("minRecentAvg", String(minRecentAvg));
    p.set("maxRecentAvg", String(maxRecentAvg));
    p.set("minSubs", String(minSubs));
    p.set("maxSubs", String(maxSubs));
    p.set("minVideos", String(minVideos));
    p.set("maxVideos", String(maxVideos));
    return p.toString();
  }, [primarySort, secondarySort, enhancedOnly, activeRecently, minRecentAvg, maxRecentAvg, minSubs, maxSubs, minVideos, maxVideos]);

  async function load() {
    setErr(null);
    const res = await fetch(`/api/channels?${qs}`);
    const j = await res.json();
    if (!j.ok) setErr(j.error || "Error");
    else setRows(j.results || []);
  }

  useEffect(() => { load(); }, [qs]);

  async function signOut() {
    await supabaseBrowser.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Channel Finder (Shorts Only)</h1>
        <button onClick={signOut}>Sign out</button>
      </div>

      <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginTop: 12 }}>
        <div>
          <label>Primary Sort</label>
          <select value={primarySort} onChange={(e) => setPrimarySort(e.target.value as SortKey)} style={{ width: "100%" }}>
            {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label>Secondary Sort</label>
          <select value={secondarySort} onChange={(e) => setSecondarySort(e.target.value as SortKey)} style={{ width: "100%" }}>
            <option value="none">No secondary sort</option>
            {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={enhancedOnly} onChange={(e) => setEnhancedOnly(e.target.checked)} />
          Enhanced Only (recent AVG exists)
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={activeRecently} onChange={(e) => setActiveRecently(e.target.checked)} />
          Active Recently (4+ shorts in last 14 days)
        </label>

        <div>
          <label>Recent AVG Range</label>
          <input type="number" value={minRecentAvg} onChange={(e) => setMinRecentAvg(Number(e.target.value))} style={{ width: "100%" }} />
          <input type="number" value={maxRecentAvg} onChange={(e) => setMaxRecentAvg(Number(e.target.value))} style={{ width: "100%", marginTop: 6 }} />
        </div>

        <div>
          <label>Subscribers Range</label>
          <input type="number" value={minSubs} onChange={(e) => setMinSubs(Number(e.target.value))} style={{ width: "100%" }} />
          <input type="number" value={maxSubs} onChange={(e) => setMaxSubs(Number(e.target.value))} style={{ width: "100%", marginTop: 6 }} />
        </div>

        <div>
          <label>Videos Range</label>
          <input type="number" value={minVideos} onChange={(e) => setMinVideos(Number(e.target.value))} style={{ width: "100%" }} />
          <input type="number" value={maxVideos} onChange={(e) => setMaxVideos(Number(e.target.value))} style={{ width: "100%", marginTop: 6 }} />
        </div>

        <div style={{ display: "flex", alignItems: "end" }}>
          <button onClick={load} style={{ width: "100%" }}>Refresh</button>
        </div>
      </section>

      {err && <p style={{ marginTop: 12 }}>{err}</p>}

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ddd" }}>
              <th align="left">Channel</th>
              <th align="right">Subs</th>
              <th align="right">Total Views</th>
              <th align="right">Videos</th>
              <th align="right">Recent AVG</th>
              <th align="right">Recent Count</th>
              <th align="right">Ratio</th>
              <th align="left">First Upload</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.channel_id} style={{ borderTop: "1px solid #eee" }}>
                <td>{r.title}</td>
                <td align="right">{r.subscriber_count ?? "-"}</td>
                <td align="right">{r.view_count ?? "-"}</td>
                <td align="right">{r.video_count ?? "-"}</td>
                <td align="right">{r.channel_metrics?.recent_avg_views ?? "-"}</td>
                <td align="right">{r.channel_metrics?.recent_short_count ?? "-"}</td>
                <td align="right">{typeof r.channel_metrics?.ratio_views_per_sub === "number" ? r.channel_metrics.ratio_views_per_sub.toFixed(4) : "-"}</td>
                <td>{r.first_upload_at ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}