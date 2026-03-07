// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/tests/rateLimit.test.ts
// Unit tests for the sliding-window rate limiter.
// No HTTP server needed — tests the limiter function directly.
// ─────────────────────────────────────────────────────────────────────────────

import { createRateLimiter } from "../src/api/rateLimit";

// ── Minimal test runner ───────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures: string[] = [];
const pending: Promise<void>[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  pending.push(
    Promise.resolve().then(fn)
      .then(() => { console.log(`  ✓ ${name}`); passed++; })
      .catch((e: any) => {
        console.log(`  ✗ ${name}\n    → ${e.message}`);
        failed++; failures.push(name);
      })
  );
}

function expect(val: any) {
  return {
    toBe:      (e: any) => { if (val !== e) throw new Error(`Expected ${JSON.stringify(e)}, got ${JSON.stringify(val)}`); },
    toBeTruthy: () => { if (!val) throw new Error(`Expected truthy, got ${JSON.stringify(val)}`); },
    toBeFalsy:  () => { if (val)  throw new Error(`Expected falsy, got ${JSON.stringify(val)}`); },
    toBeGreaterThan: (n: number) => { if (val <= n) throw new Error(`Expected ${val} > ${n}`); },
    toContain: (s: string) => { if (!String(val).includes(s)) throw new Error(`"${val}" doesn't contain "${s}"`); },
  };
}

function describe(label: string, fn: () => void) { console.log(`\n${label}`); fn(); }

// ── Mock request/response helpers ─────────────────────────────────────────────

function fakeReq(ip = "1.2.3.4"): any {
  return {
    headers: { "x-forwarded-for": ip },
    socket: { remoteAddress: ip },
  };
}

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead: (code: number, hdrs?: Record<string, string>) => void;
  end: (body?: string) => void;
  setHeader: (k: string, v: string) => void;
  getHeader: (k: string) => string | undefined;
}

function fakeRes(): FakeRes {
  const r: FakeRes = {
    statusCode: 200, headers: {}, body: "",
    writeHead(code, hdrs = {}) { r.statusCode = code; Object.assign(r.headers, hdrs); },
    end(body = "")              { r.body = body; },
    setHeader(k, v)             { r.headers[k] = v; },
    getHeader(k)                { return r.headers[k]; },
  };
  return r;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createRateLimiter — basic allow/block", () => {
  test("allows requests up to the limit", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxReqs: 3 });
    for (let i = 0; i < 3; i++) {
      const allowed = limiter(fakeReq("10.0.0.1"), fakeRes() as any);
      expect(allowed).toBeTruthy();
    }
  });

  test("blocks the request after limit exceeded", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxReqs: 2 });
    limiter(fakeReq("10.0.0.2"), fakeRes() as any);
    limiter(fakeReq("10.0.0.2"), fakeRes() as any);
    const res = fakeRes();
    const allowed = limiter(fakeReq("10.0.0.2"), res as any);
    expect(allowed).toBeFalsy();
    expect(res.statusCode).toBe(429);
  });

  test("different IPs have independent counters", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxReqs: 1 });
    // IP A exhausts its limit
    limiter(fakeReq("10.1.0.1"), fakeRes() as any);
    const resA = fakeRes();
    expect(limiter(fakeReq("10.1.0.1"), resA as any)).toBeFalsy();
    // IP B still has capacity
    expect(limiter(fakeReq("10.1.0.2"), fakeRes() as any)).toBeTruthy();
  });

  test("uses x-forwarded-for header for IP extraction", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxReqs: 1 });
    const req = { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" }, socket: {} };
    expect(limiter(req as any, fakeRes() as any)).toBeTruthy();
    const res = fakeRes();
    expect(limiter(req as any, res as any)).toBeFalsy();
    expect(res.statusCode).toBe(429);
  });
});

describe("createRateLimiter — response headers", () => {
  test("sets X-RateLimit-Limit header", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxReqs: 10 });
    const res = fakeRes();
    limiter(fakeReq("10.2.0.1"), res as any);
    expect(res.headers["X-RateLimit-Limit"]).toBe("10");
  });

  test("decrements X-RateLimit-Remaining on each request", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxReqs: 5 });
    const ip = "10.2.0.2";
    for (let i = 0; i < 4; i++) {
      const res = fakeRes();
      limiter(fakeReq(ip), res as any);
      expect(res.headers["X-RateLimit-Remaining"]).toBe(String(5 - (i + 1)));
    }
  });

  test("sets Retry-After header on 429 response", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxReqs: 1 });
    const ip = "10.2.0.3";
    limiter(fakeReq(ip), fakeRes() as any);
    const res = fakeRes();
    limiter(fakeReq(ip), res as any);
    expect(parseInt(res.headers["Retry-After"] ?? "0")).toBeGreaterThan(0);
  });

  test("429 response body contains error message", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxReqs: 1, message: "Slow down." });
    const ip = "10.2.0.4";
    limiter(fakeReq(ip), fakeRes() as any);
    const res = fakeRes();
    limiter(fakeReq(ip), res as any);
    expect(res.body).toContain("Slow down.");
  });
});

describe("createRateLimiter — window reset", () => {
  test("resets counter after window expires", async () => {
    const limiter = createRateLimiter({ windowMs: 50, maxReqs: 2 });
    const ip = "10.3.0.1";
    limiter(fakeReq(ip), fakeRes() as any);
    limiter(fakeReq(ip), fakeRes() as any);
    // Exhausted — 3rd should block
    expect(limiter(fakeReq(ip), fakeRes() as any)).toBeFalsy();
    // Wait for window to expire
    await new Promise(r => setTimeout(r, 60));
    // Should be allowed again
    expect(limiter(fakeReq(ip), fakeRes() as any)).toBeTruthy();
  });
});

describe("createRateLimiter — edge cases", () => {
  test("maxReqs of 0 blocks all requests immediately", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxReqs: 0 });
    expect(limiter(fakeReq("10.4.0.1"), fakeRes() as any)).toBeFalsy();
  });

  test("large maxReqs allows many requests", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxReqs: 1000 });
    const ip = "10.4.0.2";
    for (let i = 0; i < 100; i++) {
      expect(limiter(fakeReq(ip), fakeRes() as any)).toBeTruthy();
    }
  });

  test("falls back to socket remoteAddress if no x-forwarded-for", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxReqs: 1 });
    const req = { headers: {}, socket: { remoteAddress: "192.168.1.1" } };
    expect(limiter(req as any, fakeRes() as any)).toBeTruthy();
    expect(limiter(req as any, fakeRes() as any)).toBeFalsy();
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────

Promise.all(pending).then(() => {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length) { failures.forEach(f => console.log(`  ✗ ${f}`)); process.exit(1); }
  else console.log("All tests passed ✓");
});
