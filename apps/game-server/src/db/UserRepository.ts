// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/db/UserRepository.ts
// User account DB operations via postgres.js.
// ─────────────────────────────────────────────────────────────────────────────

import sql from "./pool";
import { hashPassword, verifyPassword } from "../auth/password";
import { issueToken } from "../auth/jwt";

interface UserRow {
  id:           string;
  email:        string;
  passwordHash: string;
  role:         "SPECTATOR" | "ADMIN";
  createdAt:    Date;
}

export class UserRepository {
  /**
   * Create a new user. Throws if email already exists.
   */
  async createUser(params: {
    email:     string;
    password:  string;
    role?:     "SPECTATOR" | "ADMIN";
  }): Promise<{ id: string; email: string; role: string }> {
    const passwordHash = await hashPassword(params.password);
    const role = params.role ?? "SPECTATOR";

    const [user] = await sql<UserRow[]>`
      INSERT INTO users (email, password_hash, role)
      VALUES (${params.email.toLowerCase().trim()}, ${passwordHash}, ${role})
      RETURNING id, email, role
    `;
    return user;
  }

  /**
   * Authenticate a user. Returns a signed JWT or null on failure.
   * Always runs verifyPassword even if user not found (prevents
   * timing-based user enumeration).
   */
  async login(
    email: string,
    password: string
  ): Promise<{ token: string; user: { id: string; email: string; role: string } } | null> {
    const [user] = await sql<UserRow[]>`
      SELECT id, email, password_hash, role
      FROM users
      WHERE email = ${email.toLowerCase().trim()}
    `;

    // Always hash-check even for missing users — constant time
    const dummyHash =
      "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA$" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

    const storedHash = user?.passwordHash ?? dummyHash;
    const valid = await verifyPassword(password, storedHash);

    if (!user || !valid) return null;

    const token = issueToken(user.id, user.role);
    return {
      token,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  /**
   * Look up a user by ID (used by auth middleware).
   */
  async findById(id: string): Promise<{ id: string; email: string; role: string } | null> {
    const [user] = await sql<{ id: string; email: string; role: string }[]>`
      SELECT id, email, role FROM users WHERE id = ${id}
    `;
    return user ?? null;
  }

  /**
   * Promote a user to ADMIN (admin-only action).
   */
  async setRole(userId: string, role: "SPECTATOR" | "ADMIN"): Promise<void> {
    await sql`UPDATE users SET role = ${role} WHERE id = ${userId}`;
  }

  /**
   * List all users (admin dashboard).
   */
  async listUsers(): Promise<{ id: string; email: string; role: string; createdAt: Date }[]> {
    return sql`
      SELECT id, email, role, created_at
      FROM users
      ORDER BY created_at DESC
    `;
  }
}

export const userRepository = new UserRepository();
