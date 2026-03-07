// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/api/rateLimit.ts
// In-process rate limiting using a sliding window counter per IP.
// Runs inside the game-server — complements nginx rate limiting.
// Nginx handles the outer limit; this handles the inner process limit,
// which matters when nginx is bypassed (e.g., direct internal calls).
// ─────────────────────────────────────────────────────────────────────────────

import type { IncomingMessage, ServerResponse } from "http";

interface Window {
  count:     number;
  resetAt:   number;   // unix ms
}

interface RateLimitOptions {
  windowMs:  number;   // window size in milliseconds
  maxReqs:   number;   // max requests per window
  message?:  string;
}

export function createRateLimiter(opts: RateLimitOptions) {
  const { windowMs, maxReqs, message = "Too many requests." } = opts;
  const store = new Map<string, Window>();

  // Periodically prune expired entries to prevent unbounded growth
  const pruneInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, win] of store) {
      if (win.resetAt < now) store.delete(key);
    }
  }, windowMs * 2);

  // Don't prevent process exit
  pruneInterval.unref();

  return function rateLimit(req: IncomingMessage, res: ServerResponse): boolean {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ??
      (req.socket as any).remoteAddress ??
      "unknown";

    const now = Date.now();
    let win = store.get(ip);

    // Expired or new window — reset
    if (!win || win.resetAt < now) {
      win = { count: 0, resetAt: now + windowMs };
      store.set(ip, win);
    }

    win.count++;

    const remaining = Math.max(0, maxReqs - win.count);
    const resetSec  = Math.ceil(win.resetAt / 1000);

    if (win.count > maxReqs) {
      const retryAfter = Math.ceil((win.resetAt - now) / 1000);
      res.writeHead(429, {
        "Content-Type":          "application/json",
        "Retry-After":           String(retryAfter),
        "X-RateLimit-Limit":     String(maxReqs),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset":     String(resetSec),
      });
      res.end(JSON.stringify({ error: message }));
      return false;  // blocked
    }

    res.setHeader("X-RateLimit-Limit",     String(maxReqs));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset",     String(resetSec));
    return true;   // allowed
  };
}

// ── Pre-configured limiters ───────────────────────────────────────────────────

/** General API: 120 requests per minute */
export const apiLimiter = createRateLimiter({
  windowMs: 60_000,
  maxReqs:  120,
});

/** Auth endpoints: 20 requests per 15 minutes (brute-force protection) */
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  maxReqs:  20,
  message:  "Too many authentication attempts. Try again in 15 minutes.",
});

/** Match creation: 10 per minute per IP (admin only, but still bounded) */
export const matchLimiter = createRateLimiter({
  windowMs: 60_000,
  maxReqs:  10,
  message:  "Match creation rate limit exceeded.",
});
