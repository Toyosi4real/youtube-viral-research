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
  { label: "Newest channel (by first upload)", value: "newestFirst" },
  { label: "Oldest channel (by first upload)", value: "oldestFirst" },
];

function fmt(n?: number) {
  if (typeof n !== "number") return "-";
  return n.toLocaleString();
}

export default function DashboardPage() {
  const [tab, setTab] = useState<"discover" | "saved">("discover");
  const [userId, setUserId] = useState<string | null>(null);

  // filters
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

  // results
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
      if (data.user?.id) await loadSavedIds();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSavedIds() {
    const { data, error } = await supabaseBrowser.from("saved_channels").select("channel_id");
    if (!error && data) setSavedIds(new Set(data.map((x) => x.channel_id)));
  }

  async function loadSavedList() {
    setSavedErr(null);
    setSavedLoading(true);

    const { data, error } = await supabaseBrowser
      .from("saved_channels")
      .select(`
        channel_id,
        channels:channel_id (
          channel_id,title,subscriber_count,video_count,view_count,first_upload_at,
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

    const out = (data || []).map((r: any) => r.channels).filter(Boolean);
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

  useEffect(() => {
    if (tab === "saved") loadSavedList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <main className="min-h-screen text-white overflow-hidden">
      {/* Neon background */}
      <div className="fixed inset-0 -z-10 bg-[#05060a]">
        <div className="absolute inset-0 opacity-70 bg-[radial-gradient(ellipse_at_top,_rgba(34,255,170,0.22),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(139,92,246,0.22),_transparent_55%)]" />
        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(34,255,170,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.12)_1px,transparent_1px)] [background-size:60px_60px] animate-[gridmove_10s_linear_infinite]" />
        <div className="absolute -top-24 left-10 h-72 w-72 rounded-full bg-emerald-400/12 blur-3xl animate-[float_6s_ease-in-out_infinite]" />
        <div className="absolute top-32 right-14 h-80 w-80 rounded-full bg-violet-500/12 blur-3xl animate-[float_7s_ease-in-out_infinite]" />
        <style>{`
          @keyframes float { 0%,100%{ transform: translateY(0px)} 50%{ transform: translateY(18px)} }
          @keyframes gridmove { 0%{ transform: translateY(0)} 100%{ transform: translateY(60px)} }
          @keyframes shimmer { 0%{ background-position: -200% 0 } 100%{ background-position: 200% 0 } }
        `}</style>
      </div>

      {/* Navbar */}
      <header className="mx-auto max-w-6xl px-4 pt-6">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md px-5 py-4 shadow-[0_0_70px_rgba(34,255,170,0.08)]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[radial-gradient(circle_at_30%_30%,rgba(34,255,170,0.95),rgba(139,92,246,0.75))] shadow-[0_0_28px_rgba(34,255,170,0.28)]" />
            <div>
              <div className="text-lg font-semibold tracking-wide">
                Kelvin YouTube Short Channel Finder
              </div>
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

      <section className="mx-auto max-w-6xl px-4 py-10">
        {tab === "discover" ? (
          <>
            {/* Filters */}
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md shadow-[0_0_60px_rgba(34,255,170,0.08)] overflow-hidden">
              <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xl font-semibold">Filters</div>
                  <div className="text-sm text-white/60">
                    Results are channels that posted Shorts recently (no long videos recently).
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => applyFilters(false)}
                    className="rounded-2xl px-5 py-3 text-sm font-semibold
                               bg-[linear-gradient(135deg,rgba(34,255,170,0.25),rgba(139,92,246,0.25))]
                               border border-white/15 hover:border-white/25 transition
                               shadow-[0_0_24px_rgba(34,255,170,0.18)]"
                  >
                    {loading ? "Applying..." : "Apply Filters"}
                  </button>

                  <button
                    onClick={() => applyFilters(true)}
                    className="rounded-2xl px-5 py-3 text-sm font-semibold
                               border border-emerald-400/25 bg-emerald-400/10 hover:bg-emerald-400/15 transition
                               shadow-[0_0_22px_rgba(34,255,170,0.14)]"
                  >
                    {loading ? "Refreshing..." : "Live Refresh"}
                  </button>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
                <SelectBox title="PRIMARY SORT" value={primarySort} onChange={setPrimarySort} col="lg:col-span-3" />
                <SelectBox title="SECONDARY SORT" value={secondarySort} onChange={setSecondarySort} col="lg:col-span-3" includeNone />

                <CheckBoxCard title="Enhanced Only" desc="Use Recent AVG + Ratio data" checked={enhancedOnly} onChange={setEnhancedOnly} col="lg:col-span-3" />
                <CheckBoxCard title="Active Recently" desc="4+ Shorts in last 14 days" checked={activeRecently} onChange={setActiveRecently} col="lg:col-span-3" />

                <RangeBox title="RECENT AVG RANGE" min={minRecentAvg} max={maxRecentAvg} setMin={setMinRecentAvg} setMax={setMaxRecentAvg} hint="0 → 5,000,000+" col="lg:col-span-4" />
                <RangeBox title="SUBSCRIBERS RANGE" min={minSubs} max={maxSubs} setMin={setMinSubs} setMax={setMaxSubs} hint="0 → 5,000,000+" col="lg:col-span-4" />
                <RangeBox title="VIDEOS RANGE" min={minVideos} max={maxVideos} setMin={setMinVideos} setMax={setMaxVideos} hint="0 → 1000+" col="lg:col-span-4" />

                <div className="lg:col-span-12 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="text-sm font-semibold">Search Channel Titles</div>
                    <input
                      value={searchTitle}
                      onChange={(e) => setSearchTitle(e.target.value)}
                      placeholder="Search..."
                      className="w-full md:max-w-md rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[rgba(34,255,170,0.55)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="mt-8">
              {!hasSearched ? (
                <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md p-10 text-center">
                  <div className="mx-auto h-14 w-14 rounded-2xl bg-[radial-gradient(circle_at_30%_30%,rgba(34,255,170,0.85),rgba(139,92,246,0.65))] shadow-[0_0_30px_rgba(34,255,170,0.25)] animate-pulse" />
                  <div className="mt-4 text-xl font-semibold">Apply Filters</div>
                </div>
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold">Results</div>
                      <div className="text-xs text-white/60">
                        {loading ? "Loading…" : `${rows.length} channels`}
                      </div>
                    </div>
                    {err && <div className="text-sm text-red-300">{err}</div>}
                  </div>

                  <div className="p-6">
                    {loading ? (
                      <CardSkeletonGrid />
                    ) : rows.length === 0 ? (
                      <div className="px-6 py-10 text-center text-white/60">
                        No channels match your filters.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {rows.map((r) => {
                          const m = Array.isArray(r.channel_metrics) ? r.channel_metrics[0] : r.channel_metrics;
                          const ratio = typeof m?.ratio_views_per_sub === "number" ? m.ratio_views_per_sub : null;
                          const saved = savedIds.has(r.channel_id);
                          return (
                            <ChannelCard
                              key={r.channel_id}
                              r={r}
                              m={m}
                              ratio={ratio}
                              saved={saved}
                              onToggleSave={() => toggleSave(r.channel_id)}
                            />
                          );
                        })}
                      </div>
                    )}
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
                </div>

                <button
                  onClick={loadSavedList}
                  className="rounded-2xl px-5 py-3 text-sm font-semibold border border-white/10 bg-white/5 hover:bg-white/10 transition"
                >
                  Refresh
                </button>
              </div>

              {savedErr && <div className="px-6 py-4 text-sm text-red-300">{savedErr}</div>}

              <div className="p-6">
                {savedLoading ? (
                  <CardSkeletonGrid />
                ) : savedRows.length === 0 ? (
                  <div className="px-6 py-10 text-center text-white/60">
                    No saved channels.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {savedRows.map((r) => {
                      const m = Array.isArray(r.channel_metrics) ? r.channel_metrics[0] : r.channel_metrics;
                      const ratio = typeof m?.ratio_views_per_sub === "number" ? m.ratio_views_per_sub : null;

                      return (
                        <ChannelCard
                          key={r.channel_id}
                          r={r}
                          m={m}
                          ratio={ratio}
                          saved={true}
                          onToggleSave={async () => {
                            await toggleSave(r.channel_id);
                            await loadSavedList();
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function SelectBox(props: {
  title: string;
  value: SortKey;
  onChange: (v: SortKey) => void;
  col: string;
  includeNone?: boolean;
}) {
  return (
    <div className={`${props.col}`}>
      <label className="text-xs text-white/70">{props.title}</label>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as SortKey)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[rgba(34,255,170,0.55)]"
      >
        {props.includeNone && <option value="none" className="bg-[#0b0d14]">No secondary sort</option>}
        {SORTS.map((s) => (
          <option key={s.value} value={s.value} className="bg-[#0b0d14]">{s.label}</option>
        ))}
      </select>
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
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[rgba(34,255,170,0.55)]"
          />
        </div>
        <div>
          <div className="text-[11px] text-white/60">Max</div>
          <input
            type="number"
            value={props.max}
            onChange={(e) => props.setMax(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[rgba(34,255,170,0.55)]"
          />
        </div>
      </div>
    </div>
  );
}

function CardSkeletonGrid() {
  const items = Array.from({ length: 9 }, (_, i) => i);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {items.map((i) => (
        <div key={i} className="rounded-3xl border border-white/10 bg-white/5 p-5 overflow-hidden relative">
          <div className="absolute inset-0 opacity-35 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)] [background-size:200%_100%] animate-[shimmer_1.2s_linear_infinite]" />
          <div className="h-4 w-2/3 bg-white/10 rounded" />
          <div className="mt-2 h-3 w-1/2 bg-white/10 rounded" />
          <div className="mt-6 h-20 bg-white/10 rounded-2xl" />
          <div className="mt-4 h-9 w-28 bg-white/10 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function ChannelCard(props: {
  r: any;
  m: any;
  ratio: number | null;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const { r, m, ratio, saved, onToggleSave } = props;

  const firstUpload = r.first_upload_at ? new Date(r.first_upload_at).toISOString().slice(0, 10) : "-";
  const yt = `https://www.youtube.com/channel/${r.channel_id}`;

  return (
    <div
      className="group rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md p-5
                 shadow-[0_0_40px_rgba(34,255,170,0.06)]
                 hover:shadow-[0_0_60px_rgba(34,255,170,0.14)]
                 transition transform hover:-translate-y-1"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold leading-snug line-clamp-2">{r.title || "Untitled channel"}</div>
          <div className="mt-1 text-xs text-white/55">{r.channel_id}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Subs" value={fmt(r.subscriber_count)} />
        <Stat label="Total Views" value={fmt(r.view_count)} />
        <Stat label="Videos" value={fmt(r.video_count)} />
        <Stat label="First Upload" value={firstUpload} />
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
        <Row label="Recent AVG (14d)" value={fmt(m?.recent_avg_views)} />
        <Row label="Shorts Count (14d)" value={fmt(m?.recent_short_count)} />
        <Row label="Ratio" value={ratio === null ? "-" : ratio.toFixed(4)} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <a
          href={yt}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl px-3 py-2 text-xs font-semibold border border-emerald-400/25 bg-emerald-400/10 hover:bg-emerald-400/15 transition"
        >
          Open Channel
        </a>

        <button
          onClick={onToggleSave}
          className={`rounded-xl px-3 py-2 text-xs font-semibold border transition ${
            saved
              ? "border-emerald-400/30 bg-emerald-400/10"
              : "border-white/10 bg-white/5 hover:bg-white/10"
          }`}
        >
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[11px] text-white/55">{props.label}</div>
      <div className="mt-1 text-sm font-semibold">{props.value}</div>
    </div>
  );
}

function Row(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-xs text-white/60">{props.label}</div>
      <div className="text-sm font-semibold">{props.value}</div>
    </div>
  );
}
