// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/auth/password.ts
// Password hashing using Node's built-in scrypt (no bcrypt dependency).
// Format: "scrypt$N$r$p$salt$hash" — all base64url encoded.
// ─────────────────────────────────────────────────────────────────────────────

import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// scrypt parameters — tuned for ~100ms on modern hardware
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LEN = 64;

/**
 * Hash a plaintext password. Returns the full encoded string for DB storage.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  const salt = randomBytes(32);
  const hash = await scryptAsync(plaintext, salt, KEY_LEN, PARAMS) as Buffer;

  const encoded = [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");

  return encoded;
}

/**
 * Verify a plaintext password against a stored hash.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyPassword(
  plaintext: string,
  stored: string
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const [, N, r, p, saltB64, hashB64] = parts;
    const salt     = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(hashB64, "base64url");
    const params   = {
      N: parseInt(N, 10),
      r: parseInt(r, 10),
      p: parseInt(p, 10),
    };

    const actual = await scryptAsync(plaintext, salt, KEY_LEN, params) as Buffer;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
