// YouTube API helper with API key rotation
// No external dependencies (Turbopack-safe)

function getKeys(): string[] {
  const raw =
    process.env.YOUTUBE_API_KEYS ||
    process.env.YOUTUBE_API_KEY ||
    "";
  return raw
    .split(",")
    .map((k) => k.trim())
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
  if (!keys.length) {
    throw new Error("Missing YOUTUBE_API_KEYS or YOUTUBE_API_KEY");
  }

  let lastErr: any = null;

  for (const key of keys) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    url.searchParams.set("key", key);

    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    });

    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = await res.json().catch(() => ({}));

    if (res.ok && !json?.error) return json;

    if (isQuotaError(json)) {
      lastErr = json;
      continue; // rotate key
    }

    throw new Error(json?.error?.message || "YouTube API error");
  }

  throw new Error(
    lastErr?.error?.message ||
      "All YouTube API keys exhausted (quota/rate limit)"
  );
}

/**
 * Parse ISO 8601 duration (PT#H#M#S) into seconds
 * Example: PT1M30S -> 90
 */
export function parseDuration(duration: string): number {
  if (!duration || typeof duration !== "string") return 0;

  const match = duration.match(
    /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
  );

  if (!match) return 0;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
}
