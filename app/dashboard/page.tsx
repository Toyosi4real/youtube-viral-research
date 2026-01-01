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

function fmt(n?: number) {
  if (typeof n !== "number") return "-";
  return n.toLocaleString();
}

export default function DashboardPage() {
  const [tab, setTab] = useState<"discover" | "saved">("discover");

  // user
  const [userId, setUserId] = useState<string | null>(null);

  // draft filters
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

  const [searchTitle, setSearchTitle] = useState("");

  // results (discover)
  const [rows, setRows] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // saved
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedRows, setSavedRows] = useState<any[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedErr, setSavedErr] = useState<string | null>(null);

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
    if (searchTitle.trim()) p.set("searchTitle", searchTitle.trim());
    return p.toString();
  }, [
    primarySort, secondarySort, enhancedOnly, activeRecently,
    minRecentAvg, maxRecentAvg, minSubs, maxSubs, minVideos, maxVideos, searchTitle
  ]);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.auth.getUser();
      setUserId(data.user?.id ?? null);
      if (data.user?.id) {
        await loadSavedIds();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSavedIds() {
    const { data, error } = await supabaseBrowser
      .from("saved_channels")
      .select("channel_id");

    if (!error && data) {
      setSavedIds(new Set(data.map((x) => x.channel_id)));
    }
  }

  async function loadSavedList() {
    setSavedErr(null);
    setSavedLoading(true);

    // join saved_channels -> channels -> metrics
    const { data, error } = await supabaseBrowser
      .from("saved_channels")
      .select(`
        channel_id,
        channels:channel_id (
          channel_id,title,country,subscriber_count,video_count,view_count,first_upload_at,
          channel_metrics (recent_days,recent_short_count,recent_avg_views,recent_total_views,ratio_views_per_sub,computed_at)
        )
      `)
      .order("created_at", { ascending: false });

    setSavedLoading(false);

    if (error) {
      setSavedErr(error.message);
      setSavedRows([]);
      return;
    }

    const out = (data || [])
      .map((r: any) => r.channels)
      .filter(Boolean);

    setSavedRows(out);
  }

  async function toggleSave(channelId: string) {
    if (!userId) return;

    const isSaved = savedIds.has(channelId);

    if (isSaved) {
      const { error } = await supabaseBrowser
        .from("saved_channels")
        .delete()
        .eq("user_id", userId)
        .eq("channel_id", channelId);

      if (!error) {
        const next = new Set(savedIds);
        next.delete(channelId);
        setSavedIds(next);
      }
      return;
    }

    const { error } = await supabaseBrowser
      .from("saved_channels")
      .insert({ user_id: userId, channel_id: channelId });

    if (!error) {
      const next = new Set(savedIds);
      next.add(channelId);
      setSavedIds(next);
    }
  }

  async function applyFilters(refreshFirst: boolean) {
    setErr(null);
    setHasSearched(true);
    setLoading(true);

    try {
      const refreshParam = refreshFirst ? "&refresh=1" : "";
      const res = await fetch(`/api/channels?${qs}${refreshParam}`, { cache: "no-store" });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Request failed");
      setRows(j.results || []);
      await loadSavedIds();
    } catch (e: any) {
      setErr(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabaseBrowser.auth.signOut();
    window.location.href = "/login";
  }

  // when switching to saved tab, load list once
  useEffect(() => {
    if (tab === "saved") loadSavedList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <main className="min-h-screen text-white">
      {/* Neon background + subtle animation */}
      <div className="fixed inset-0 -z-10 bg-[#05060a]">
        <div className="absolute inset-0 opacity-70 bg-[radial-gradient(ellipse_at_top,_rgba(34,255,170,0.20),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(139,92,246,0.20),_transparent_55%)]" />
        <div className="absolute inset-0 opacity-30 bg-[linear-gradient(to_right,rgba(34,255,170,0.10),transparent_35%,rgba(139,92,246,0.10))]" />
        <div className="absolute -top-24 left-10 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-24 right-10 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl animate-pulse" />
      </div>

      {/* Top navbar */}
      <header className="mx-auto max-w-6xl px-4 pt-6">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md px-5 py-4 shadow-[0_0_60px_rgba(34,255,170,0.06)]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[radial-gradient(circle_at_30%_30%,rgba(34,255,170,0.9),rgba(139,92,246,0.7))] shadow-[0_0_24px_rgba(34,255,170,0.25)]" />
            <div>
              <div className="text-lg font-semibold tracking-wide">ViewHunt</div>
              <div className="text-xs text-white/60">Shorts Finder • 10–40s • US/GB/CA/AU</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab("discover")}
              className={`rounded-xl px-4 py-2 text-sm border transition ${
                tab === "discover"
                  ? "border-emerald-400/30 bg-emerald-400/10 shadow-[0_0_18px_rgba(34,255,170,0.18)]"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              Discover
            </button>
            <button
              onClick={() => setTab("saved")}
              className={`rounded-xl px-4 py-2 text-sm border transition ${
                tab === "saved"
                  ? "border-emerald-400/30 bg-emerald-400/10 shadow-[0_0_18px_rgba(34,255,170,0.18)]"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              Saved
            </button>

            <button
              onClick={signOut}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        {tab === "discover" ? (
          <>
            {/* Filters card */}
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md shadow-[0_0_60px_rgba(34,255,170,0.08)] overflow-hidden">
              <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xl font-semibold">Channel Filters</div>
                  <div className="text-sm text-white/60">
                    Recent AVG window: 14 days • Shorts length: 10–40 seconds
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => applyFilters(false)}
                    className="group relative rounded-2xl px-5 py-3 text-sm font-semibold
                               bg-[linear-gradient(135deg,rgba(34,255,170,0.25),rgba(139,92,246,0.25))]
                               border border-white/15 hover:border-white/25 transition
                               shadow-[0_0_24px_rgba(34,255,170,0.18)]"
                  >
                    <span className="relative z-10">{loading ? "Applying..." : "Apply Filters"}</span>
                    <span className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition
                                     bg-[radial-gradient(circle_at_30%_30%,rgba(34,255,170,0.25),transparent_60%)]" />
                  </button>

                  <button
                    onClick={() => applyFilters(true)}
                    className="rounded-2xl px-5 py-3 text-sm font-semibold
                               border border-emerald-400/25 bg-emerald-400/10 hover:bg-emerald-400/15 transition
                               shadow-[0_0_22px_rgba(34,255,170,0.14)]"
                    title="Live refresh: pulls latest data from YouTube first"
                  >
                    {loading ? "Refreshing..." : "Live Refresh"}
                  </button>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-3">
                  <label className="text-xs text-white/70">PRIMARY SORT</label>
                  <select
                    value={primarySort}
                    onChange={(e) => setPrimarySort(e.target.value as SortKey)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[rgba(34,255,170,0.55)]
                               shadow-[0_0_18px_rgba(34,255,170,0.08)]"
                  >
                    {SORTS.map((s) => (
                      <option key={s.value} value={s.value} className="bg-[#0b0d14]">
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-3">
                  <label className="text-xs text-white/70">SECONDARY SORT</label>
                  <select
                    value={secondarySort}
                    onChange={(e) => setSecondarySort(e.target.value as SortKey)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[rgba(34,255,170,0.55)]
                               shadow-[0_0_18px_rgba(34,255,170,0.08)]"
                  >
                    <option value="none" className="bg-[#0b0d14]">No secondary sort</option>
                    {SORTS.map((s) => (
                      <option key={s.value} value={s.value} className="bg-[#0b0d14]">
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <CheckBoxCard
                  title="Enhanced Only"
                  desc="Show only channels with Recent AVG data"
                  checked={enhancedOnly}
                  onChange={setEnhancedOnly}
                  col="lg:col-span-3"
                />

                <CheckBoxCard
                  title="Active Recently"
                  desc="4+ shorts posted in last 14 days"
                  checked={activeRecently}
                  onChange={setActiveRecently}
                  col="lg:col-span-3"
                />

                <RangeBox title="RECENT AVG RANGE" min={minRecentAvg} max={maxRecentAvg} setMin={setMinRecentAvg} setMax={setMaxRecentAvg} hint="0 → 5,000,000+" col="lg:col-span-4" />
                <RangeBox title="SUBSCRIBERS RANGE" min={minSubs} max={maxSubs} setMin={setMinSubs} setMax={setMaxSubs} hint="0 → 5,000,000+" col="lg:col-span-4" />
                <RangeBox title="VIDEOS RANGE" min={minVideos} max={maxVideos} setMin={setMinVideos} setMax={setMaxVideos} hint="0 → 1000+" col="lg:col-span-4" />

                <div className="lg:col-span-12 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Search Channel Titles</div>
                      <div className="text-xs text-white/60">Optional. Filters your results after Apply.</div>
                    </div>
                    <input
                      value={searchTitle}
                      onChange={(e) => setSearchTitle(e.target.value)}
                      placeholder="Search a niche… (e.g. fitness, ai, skincare)"
                      className="w-full md:max-w-md rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[rgba(34,255,170,0.55)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="mt-8">
              {!hasSearched ? (
                <EmptyState />
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold">Results</div>
                      <div className="text-xs text-white/60">{loading ? "Loading…" : `${rows.length} channels`}</div>
                    </div>
                    {err && <div className="text-sm text-red-300">{err}</div>}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-white/70">
                        <tr className="border-b border-white/10">
                          <th className="text-left px-6 py-3">Channel</th>
                          <th className="text-right px-4 py-3">Subs</th>
                          <th className="text-right px-4 py-3">Total Views</th>
                          <th className="text-right px-4 py-3">Videos</th>
                          <th className="text-right px-4 py-3">Recent AVG</th>
                          <th className="text-right px-4 py-3">Recent Count</th>
                          <th className="text-right px-4 py-3">Ratio</th>
                          <th className="text-left px-6 py-3">First Upload</th>
                          <th className="text-right px-6 py-3">Save</th>
                        </tr>
                      </thead>

                      <tbody className="text-white/90">
                        {rows.map((r) => {
                          const m = r.channel_metrics || {};
                          const ratio = typeof m.ratio_views_per_sub === "number" ? m.ratio_views_per_sub : null;
                          const saved = savedIds.has(r.channel_id);

                          return (
                            <tr key={r.channel_id} className="border-b border-white/5 hover:bg-white/5 transition">
                              <td className="px-6 py-4">
                                <div className="font-semibold">{r.title}</div>
                                <div className="text-xs text-white/50">{r.channel_id}</div>
                              </td>
                              <td className="px-4 py-4 text-right">{fmt(r.subscriber_count)}</td>
                              <td className="px-4 py-4 text-right">{fmt(r.view_count)}</td>
                              <td className="px-4 py-4 text-right">{fmt(r.video_count)}</td>
                              <td className="px-4 py-4 text-right">{fmt(m.recent_avg_views)}</td>
                              <td className="px-4 py-4 text-right">{fmt(m.recent_short_count)}</td>
                              <td className="px-4 py-4 text-right">
                                {ratio === null ? (
                                  "-"
                                ) : (
                                  <span className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-200
                                                   shadow-[0_0_18px_rgba(34,255,170,0.18)]">
                                    {ratio.toFixed(4)}
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4">{r.first_upload_at ? new Date(r.first_upload_at).toISOString().slice(0, 10) : "-"}</td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  onClick={() => toggleSave(r.channel_id)}
                                  className={`rounded-xl px-3 py-2 text-xs font-semibold border transition ${
                                    saved
                                      ? "border-emerald-400/30 bg-emerald-400/10 shadow-[0_0_18px_rgba(34,255,170,0.16)]"
                                      : "border-white/10 bg-white/5 hover:bg-white/10"
                                  }`}
                                >
                                  {saved ? "Saved" : "Save"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {!loading && rows.length === 0 && (
                          <tr>
                            <td colSpan={9} className="px-6 py-10 text-center text-white/60">
                              No channels match your filters. Widen ranges and try again.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-6 py-4 text-xs text-white/50">
                    Live Refresh pulls the latest Shorts (10–40s) from YouTube first, then applies your filters.
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Saved */}
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden">
              <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xl font-semibold">Saved Channels</div>
                  <div className="text-sm text-white/60">Your shortlist across sessions.</div>
                </div>

                <button
                  onClick={loadSavedList}
                  className="rounded-2xl px-5 py-3 text-sm font-semibold border border-white/10 bg-white/5 hover:bg-white/10 transition"
                >
                  Refresh Saved
                </button>
              </div>

              {savedErr && <div className="px-6 py-4 text-sm text-red-300">{savedErr}</div>}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-white/70">
                    <tr className="border-b border-white/10">
                      <th className="text-left px-6 py-3">Channel</th>
                      <th className="text-right px-4 py-3">Subs</th>
                      <th className="text-right px-4 py-3">Total Views</th>
                      <th className="text-right px-4 py-3">Videos</th>
                      <th className="text-right px-4 py-3">Recent AVG</th>
                      <th className="text-right px-4 py-3">Recent Count</th>
                      <th className="text-right px-4 py-3">Ratio</th>
                      <th className="text-left px-6 py-3">First Upload</th>
                      <th className="text-right px-6 py-3">Remove</th>
                    </tr>
                  </thead>

                  <tbody className="text-white/90">
                    {savedRows.map((r) => {
                      const m = (r.channel_metrics && r.channel_metrics[0]) ? r.channel_metrics[0] : (r.channel_metrics || {});
                      const ratio = typeof m?.ratio_views_per_sub === "number" ? m.ratio_views_per_sub : null;

                      return (
                        <tr key={r.channel_id} className="border-b border-white/5 hover:bg-white/5 transition">
                          <td className="px-6 py-4">
                            <div className="font-semibold">{r.title}</div>
                            <div className="text-xs text-white/50">{r.channel_id}</div>
                          </td>
                          <td className="px-4 py-4 text-right">{fmt(r.subscriber_count)}</td>
                          <td className="px-4 py-4 text-right">{fmt(r.view_count)}</td>
                          <td className="px-4 py-4 text-right">{fmt(r.video_count)}</td>
                          <td className="px-4 py-4 text-right">{fmt(m?.recent_avg_views)}</td>
                          <td className="px-4 py-4 text-right">{fmt(m?.recent_short_count)}</td>
                          <td className="px-4 py-4 text-right">
                            {ratio === null ? "-" : (
                              <span className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-200
                                               shadow-[0_0_18px_rgba(34,255,170,0.18)]">
                                {ratio.toFixed(4)}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">{r.first_upload_at ? new Date(r.first_upload_at).toISOString().slice(0, 10) : "-"}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={async () => {
                                await toggleSave(r.channel_id);
                                await loadSavedList();
                              }}
                              className="rounded-xl px-3 py-2 text-xs font-semibold border border-white/10 bg-white/5 hover:bg-white/10 transition"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {!savedLoading && savedRows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-6 py-10 text-center text-white/60">
                          No saved channels yet. Go to Discover and click “Save”.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-4 text-xs text-white/50">
                Saved channels are private to your account (RLS enabled).
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md p-10 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-[radial-gradient(circle_at_30%_30%,rgba(34,255,170,0.85),rgba(139,92,246,0.65))] shadow-[0_0_30px_rgba(34,255,170,0.25)] animate-pulse" />
      <div className="mt-4 text-xl font-semibold">Apply Filters to view channels</div>
      <div className="mt-1 text-sm text-white/60">
        Set your ranges and sorting, then click <span className="text-white/90 font-semibold">Apply Filters</span>.
      </div>
    </div>
  );
}

function CheckBoxCard(props: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  col: string;
}) {
  return (
    <div className={`${props.col} flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3`}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        className="h-4 w-4 accent-emerald-400"
      />
      <div>
        <div className="text-sm font-semibold">{props.title}</div>
        <div className="text-xs text-white/60">{props.desc}</div>
      </div>
    </div>
  );
}

function RangeBox(props: {
  title: string;
  min: number;
  max: number;
  setMin: (v: number) => void;
  setMax: (v: number) => void;
  hint: string;
  col: string;
}) {
  return (
    <div className={`${props.col} rounded-2xl border border-white/10 bg-black/20 p-4`}>
      <div>
        <div className="text-xs text-white/70">{props.title}</div>
        <div className="text-[11px] text-white/50">{props.hint}</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-white/60">Min</div>
          <input
            type="number"
            value={props.min}
            onChange={(e) => props.setMin(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[rgba(34,255,170,0.55)] transition"
          />
        </div>
        <div>
          <div className="text-[11px] text-white/60">Max</div>
          <input
            type="number"
            value={props.max}
            onChange={(e) => props.setMax(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[rgba(34,255,170,0.55)] transition"
          />
        </div>
      </div>
    </div>
  );
}
