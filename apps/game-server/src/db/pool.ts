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
  max: 10,                // max pool connections
  idle_timeout: 20,       // close idle connections after 20s
  connect_timeout: 10,    // fail fast if DB is unreachable
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
