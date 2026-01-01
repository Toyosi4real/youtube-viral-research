import isodate from "isodate";

function getKeys(): string[] {
  const raw = process.env.YOUTUBE_API_KEYS || process.env.YOUTUBE_API_KEY || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

export async function ytGet(path: string, params: Record<string, any>) {
  const keys = getKeys();
  if (!keys.length) throw new Error("Missing YOUTUBE_API_KEYS (comma-separated) or YOUTUBE_API_KEY");

  // Try each key until one works
  let lastError: any = null;

  for (const key of keys) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    url.searchParams.set("key", key);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });

    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = await res.json().catch(() => ({}));

    // Success
    if (res.ok && !json?.error) return json;

    // If quota/rate error, rotate to next key
    if (isQuotaError(json)) {
      lastError = json;
      continue;
    }

    // Hard error: stop
    throw new Error(json?.error?.message || `YouTube API error (${res.status})`);
  }

  throw new Error(lastError?.error?.message || "All YouTube API keys exhausted (quota/rate limit).");
}

export function parseDuration(duration: string) {
  try {
    return isodate.parse_duration(duration).total_seconds();
  } catch {
    return 0;
  }
}
