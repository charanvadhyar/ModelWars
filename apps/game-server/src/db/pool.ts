// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/db/pool.ts
// postgres.js connection pool — single instance for the game server process.
// postgres.js handles pooling internally; default max is 10 connections.
// ─────────────────────────────────────────────────────────────────────────────

import path from "path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

// Load .env from the monorepo root (two levels above apps/game-server/)
loadEnv({ path: path.resolve(__dirname, "../../../../.env"), override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set.");
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 3,                 // Supabase free tier pooler limit is ~15; keep headroom
  idle_timeout: 30,       // keep connections alive longer to avoid churn
  connect_timeout: 30,    // Render + Supabase cold-start can take ~20s
  max_lifetime: 1800,     // recycle connections every 30min
  transform: {
    // Map snake_case DB columns → camelCase JS automatically
    column: postgres.toCamel,
  },
  onnotice: () => {},     // suppress NOTICE messages in tests
});

// Graceful shutdown — drain the pool cleanly on process exit
process.on("beforeExit", async () => {
  await sql.end();
});

export default sql;
