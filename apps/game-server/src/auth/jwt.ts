// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/auth/jwt.ts
// Minimal JWT implementation using Node's built-in crypto.
// No dependencies — avoids jsonwebtoken's large bundle and audit issues.
// HS256 only; tokens expire after JWT_EXPIRY_DAYS (default 7).
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";

const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
const EXPIRY_DAYS = parseInt(process.env.JWT_EXPIRY_DAYS ?? "7", 10);

if (SECRET === "dev-secret-change-in-production" && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET must be set in production.");
}

// ── Token structure ───────────────────────────────────────────────────────────

export interface JwtPayload {
  sub:  string;      // user ID
  role: "SPECTATOR" | "ADMIN";
  iat:  number;      // issued at (unix seconds)
  exp:  number;      // expiry (unix seconds)
}

// ── Encoding helpers ──────────────────────────────────────────────────────────

function b64url(input: string | Buffer): string {
  const b64 = typeof input === "string"
    ? Buffer.from(input).toString("base64")
    : input.toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function sign(header: string, payload: string): string {
  return createHmac("sha256", SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Issue a signed JWT for the given user.
 */
export function issueToken(userId: string, role: "SPECTATOR" | "ADMIN"): string {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    sub:  userId,
    role,
    iat:  now,
    exp:  now + EXPIRY_DAYS * 86_400,
  } satisfies JwtPayload));
  const sig = sign(header, payload);
  return `${header}.${payload}.${sig}`;
}

/**
 * Verify a JWT string. Returns payload or null.
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const [header, payload, sig] = token.split(".");
    if (!header || !payload || !sig) return null;

    // Constant-time signature check
    const expected = Buffer.from(sign(header, payload));
    const actual   = Buffer.from(sig);
    if (expected.length !== actual.length) return null;
    if (!timingSafeEqual(expected, actual)) return null;

    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as JwtPayload;

    // Expiry check
    if (data.exp < Math.floor(Date.now() / 1000)) return null;

    return data;
  } catch {
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header.
 */
export function extractBearer(req: IncomingMessage): string | null {
  const header = req.headers["authorization"] ?? "";
  const match  = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

// ── HTTP middleware helpers ────────────────────────────────────────────────────

export interface AuthedRequest extends IncomingMessage {
  user: JwtPayload;
}

/**
 * requireAuth — returns 401 and false if token is missing/invalid.
 * Returns true and attaches req.user if valid.
 */
export function requireAuth(
  req: IncomingMessage,
  res: ServerResponse
): req is AuthedRequest {
  const token = extractBearer(req);
  if (!token) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Authentication required." }));
    return false;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid or expired token." }));
    return false;
  }

  (req as AuthedRequest).user = payload;
  return true;
}

/**
 * requireAdmin — 403 if authenticated but not ADMIN role.
 */
export function requireAdmin(
  req: IncomingMessage,
  res: ServerResponse
): req is AuthedRequest {
  if (!requireAuth(req, res)) return false;

  const authed = req as AuthedRequest;
  if (authed.user.role !== "ADMIN") {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Admin access required." }));
    return false;
  }

  return true;
}
