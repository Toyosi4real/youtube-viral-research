type YtJson = any;

function getKeys(): string[] {
  const raw = (process.env.YOUTUBE_API_KEYS || process.env.YOUTUBE_API_KEY || "").trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function pickStartIndex(keys: string[], salt: string) {
  // deterministic-ish rotation per minute
  const minute = Math.floor(Date.now() / 60000);
  let h = 0;
  const str = `${salt}:${minute}`;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return keys.length ? (h % keys.length) : 0;
}

function isQuotaError(json: any) {
  const reason = json?.error?.errors?.[0]?.reason;
  return (
    reason === "quotaExceeded" ||
    reason === "dailyLimitExceeded" ||
    reason === "userRateLimitExceeded" ||
    reason === "rateLimitExceeded"
  );
}

export async function ytGet(path: string, params: Record<string, string>): Promise<YtJson> {
  const keys = getKeys();
  if (!keys.length) {
    throw new Error("Missing YOUTUBE_API_KEYS or YOUTUBE_API_KEY env var");
  }

  const start = pickStartIndex(keys, path);
  let lastErr = "";

  for (let attempt = 0; attempt < Math.min(keys.length, 5); attempt++) {
    const key = keys[(start + attempt) % keys.length];

    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    url.searchParams.set("key", key);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = await res.json().catch(() => ({}));

    if (res.ok && !json?.error) return json;

    // retry on quota-related errors with next key
    if (isQuotaError(json)) {
      lastErr = `Quota error with key index ${(start + attempt) % keys.length}: ${JSON.stringify(json?.error)}`;
      continue;
    }

    // non-quota error: stop
    lastErr = `YouTube API error ${res.status}: ${JSON.stringify(json?.error || json)}`;
    break;
  }

  throw new Error(lastErr || "YouTube API failed");
}

// ISO 8601 duration like "PT12S", "PT1M03S"
export function isoDurationToSeconds(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return h * 3600 + min * 60 + s;
}
