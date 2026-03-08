// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/api/router.ts
// HTTP route handler — maps (method, path) → async handler functions.
// Called by the HTTP server in index.ts.
// All business logic lives in the specific handlers; this is pure routing.
// ─────────────────────────────────────────────────────────────────────────────

import type { IncomingMessage, ServerResponse } from "http";
import { requireAdmin, requireAuth } from "../auth/jwt";
import { userRepository } from "../db/UserRepository";
import { matchRepository } from "../db/MatchRepository";
import { quizRepository } from "../db/QuizRepository";
import { getBlogFeed } from "../db/BlogFeed";
import type { SocketServer } from "../socket/SocketServer";
import { apiLimiter, authLimiter, matchLimiter } from "./rateLimit";

// ── Body parser helper ────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ── Route handler factory ────────────────────────────────────────────────────

export function createRouter(socketServer: SocketServer) {

  return async function handle(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<boolean> {
    const method = req.method ?? "GET";
    const url    = req.url?.split("?")[0] ?? "/";

    // ── Public routes ────────────────────────────────────────────────────────

    // GET /health
    if (method === "GET" && url === "/health") {
      json(res, 200, {
        status:       "ok",
        activeMatches: socketServer.activeMatchCount,
        uptime:       process.uptime(),
      });
      return true;
    }

    // POST /api/auth/login
    if (method === "POST" && url === "/api/auth/login") {
      if (!authLimiter(req, res)) return true;
      try {
        const { email, password } = await readBody(req);
        if (!email || !password) {
          json(res, 400, { error: "email and password are required." });
          return true;
        }
        const result = await userRepository.login(email, password);
        if (!result) {
          json(res, 401, { error: "Invalid credentials." });
          return true;
        }
        json(res, 200, result);
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // POST /api/auth/register (creates SPECTATOR accounts; first user gets ADMIN)
    if (method === "POST" && url === "/api/auth/register") {
      if (!authLimiter(req, res)) return true;
      try {
        const { email, password } = await readBody(req);
        if (!email || !password) {
          json(res, 400, { error: "email and password are required." });
          return true;
        }
        if (password.length < 8) {
          json(res, 400, { error: "Password must be at least 8 characters." });
          return true;
        }

        // First user ever becomes ADMIN (bootstrap)
        const [{ count }] = await (await import("../db/pool")).default<[{count:string}]>`
          SELECT COUNT(*)::text FROM users
        `;
        const role = parseInt(count, 10) === 0 ? "ADMIN" : "SPECTATOR";

        const user = await userRepository.createUser({ email, password, role });
        const { token } = (await userRepository.login(email, password))!;
        json(res, 201, { token, user });
      } catch (e: any) {
        if (e.message?.includes("unique") || e.code === "23505") {
          json(res, 409, { error: "Email already registered." });
        } else {
          json(res, 500, { error: e.message });
        }
      }
      return true;
    }

    // GET /api/matches  — public list
    if (method === "GET" && url === "/api/matches") {
      try {
        const active = socketServer.registry.activeMatches().map((r) => ({
          matchId: r.matchId,
          modelA:  r.modelA,
          modelB:  r.modelB,
          status:  r.currentStatus,
        }));
        json(res, 200, { matches: active, count: active.length });
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // GET /api/matches/history  — paginated history from DB
    if (method === "GET" && url.startsWith("/api/matches/history")) {
      try {
        const qs     = new URLSearchParams(req.url?.split("?")[1] ?? "");
        const limit  = Math.min(parseInt(qs.get("limit")  ?? "20", 10), 100);
        const offset = parseInt(qs.get("offset") ?? "0", 10);
        const status = qs.get("status") ?? undefined;
        const result = await matchRepository.listMatches({ limit, offset, status });
        json(res, 200, result);
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // GET /api/matches/:id/transcript
    if (method === "GET" && url.match(/^\/api\/matches\/[^/]+\/transcript$/)) {
      const matchId = url.split("/")[3];
      try {
        const transcript = await matchRepository.getTranscript(matchId);
        if (!transcript) { json(res, 404, { error: "Transcript not found." }); return true; }
        json(res, 200, transcript);
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // ── Auth-required routes ─────────────────────────────────────────────────

    // POST /api/matches  — create a new match (ADMIN only)
    if (method === "POST" && url === "/api/matches") {
      if (!requireAdmin(req, res)) return true;
      if (!matchLimiter(req, res)) return true;
      try {
        const { modelA, modelB } = await readBody(req);
        if (!modelA || !modelB) {
          json(res, 400, { error: "modelA and modelB are required." });
          return true;
        }
        const matchId = await socketServer.createMatch({
          modelA,
          modelB,
          createdById: (req as any).user.sub,
        });
        json(res, 201, { matchId, modelA, modelB });
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // DELETE /api/matches/:id  — abort a match (ADMIN only)
    if (method === "DELETE" && url.match(/^\/api\/matches\/[^/]+$/)) {
      if (!requireAdmin(req, res)) return true;
      const matchId = url.split("/")[3];
      const aborted = socketServer.abortMatch(matchId);
      json(res, aborted ? 200 : 404, {
        success: aborted,
        message: aborted ? "Match aborted." : "Match not found.",
      });
      return true;
    }

    // GET /api/admin/stats  — aggregate stats (ADMIN only)
    if (method === "GET" && url === "/api/admin/stats") {
      if (!requireAdmin(req, res)) return true;
      try {
        const stats = await matchRepository.getStats();
        json(res, 200, stats);
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // GET /api/admin/users  — user list (ADMIN only)
    if (method === "GET" && url === "/api/admin/users") {
      if (!requireAdmin(req, res)) return true;
      try {
        const users = await userRepository.listUsers();
        json(res, 200, { users });
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // PATCH /api/admin/users/:id/role  — promote/demote (ADMIN only)
    if (method === "PATCH" && url.match(/^\/api\/admin\/users\/[^/]+\/role$/)) {
      if (!requireAdmin(req, res)) return true;
      const userId = url.split("/")[4];
      try {
        const { role } = await readBody(req);
        if (role !== "ADMIN" && role !== "SPECTATOR") {
          json(res, 400, { error: "role must be ADMIN or SPECTATOR." });
          return true;
        }
        await userRepository.setRole(userId, role);
        json(res, 200, { success: true, userId, role });
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // GET /api/me  — current user info
    if (method === "GET" && url === "/api/me") {
      if (!requireAuth(req, res)) return true;
      try {
        const user = await userRepository.findById((req as any).user.sub);
        if (!user) { json(res, 404, { error: "User not found." }); return true; }
        json(res, 200, { user });
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // ── Quiz Arena routes ─────────────────────────────────────────────────────

    // POST /api/quiz  — start a new quiz (ADMIN only)
    if (method === "POST" && url === "/api/quiz") {
      if (!requireAdmin(req, res)) return true;
      if (!matchLimiter(req, res)) return true;
      try {
        const { modelA, modelB, topic } = await readBody(req);
        if (!modelA || !modelB || !topic) {
          json(res, 400, { error: "modelA, modelB and topic are required." });
          return true;
        }
        const quizId = await socketServer.createQuiz({
          modelA,
          modelB,
          topic: String(topic).trim().slice(0, 200),
          createdById: (req as any).user.sub,
        });
        json(res, 201, { quizId, modelA, modelB, topic });
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // GET /api/quiz  — list recent quizzes (public)
    if (method === "GET" && url.startsWith("/api/quiz") && !url.match(/^\/api\/quiz\/[^/]+/)) {
      try {
        const quizzes = await quizRepository.listQuizzes(20, 0);
        json(res, 200, { quizzes });
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // GET /api/quiz/:id  — quiz state
    if (method === "GET" && url.match(/^\/api\/quiz\/[^/]+$/)) {
      const quizId = url.split("/")[3];
      try {
        const quiz = await quizRepository.getQuiz(quizId);
        if (!quiz) { json(res, 404, { error: "Quiz not found." }); return true; }
        json(res, 200, quiz);
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // ── Intelligence Log (Blog) ────────────────────────────────────────────────

    // GET /api/blog  — unified feed of all model outputs (public)
    if (method === "GET" && url.startsWith("/api/blog")) {
      try {
        const qs     = new URLSearchParams(req.url?.split("?")[1] ?? "");
        const limit  = Math.min(parseInt(qs.get("limit")  ?? "30", 10), 100);
        const offset = parseInt(qs.get("offset") ?? "0", 10);
        const arena  = qs.get("arena") ?? undefined;  // "battleship" | "quiz" | undefined
        const posts  = await getBlogFeed({ limit, offset, arena });
        json(res, 200, { posts, limit, offset });
      } catch (e: any) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // Route not matched — return false so caller can 404
    return false;
  };
}
