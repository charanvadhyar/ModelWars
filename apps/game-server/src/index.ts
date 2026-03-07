// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/index.ts  (Phase 6 — auth + router wired)
// ─────────────────────────────────────────────────────────────────────────────

import path from "path";
import { config as loadEnv } from "dotenv";

// Load .env from the monorepo root (two levels above apps/game-server/)
loadEnv({ path: path.resolve(__dirname, "../../../.env"), override: true });

import http from "http";
import { SocketServer } from "./socket/SocketServer";
import { createRouter } from "./api/router";

const PORT         = parseInt(process.env.GAME_SERVER_PORT ?? "3001", 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",");

const httpServer = http.createServer(async (req, res) => {
  // CORS preflight
  res.setHeader("Access-Control-Allow-Origin",  CORS_ORIGINS.join(","));
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const handled = await router(req, res);
  if (!handled) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

const socketServer = new SocketServer(httpServer, { corsOrigins: CORS_ORIGINS });
const router       = createRouter(socketServer);

httpServer.listen(PORT, () => {
  console.log(`[GameServer] Listening on port ${PORT}`);
  console.log(`[GameServer] CORS origins: ${CORS_ORIGINS.join(", ")}`);
  console.log(`[GameServer] Environment: ${process.env.NODE_ENV ?? "development"}`);
});

process.on("SIGTERM", () => { httpServer.close(() => process.exit(0)); });
process.on("SIGINT",  () => { httpServer.close(() => process.exit(0)); });
