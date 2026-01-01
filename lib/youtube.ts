const YT = "https://www.googleapis.com/youtube/v3";

export async function ytGet(path: string, params: Record<string, string>) {
  const url = new URL(`${YT}/${path}`);
  params.key = process.env.YOUTUBE_API_KEY!;
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`YT ${path} failed: ${res.status}`);
  return res.json();
}

export function isoDurationToSeconds(d: string): number {
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || "0", 10) * 3600) +
         (parseInt(m[2] || "0", 10) * 60) +
          parseInt(m[3] || "0", 10);
}
