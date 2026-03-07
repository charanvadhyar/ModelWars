// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/socket/SocketServer.ts  (Phase 4 — DB wired)
// Sets up the Socket.io server, handles client connections,
// manages match rooms, and persists match state via MatchRepository.
// ─────────────────────────────────────────────────────────────────────────────

import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { MatchEventEmitter } from "./EventEmitter";
import { MatchRegistry } from "./MatchRegistry";
import { MatchRunner } from "./MatchRunner";
import { matchRepository } from "../db/MatchRepository";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "../types/events";

export interface SocketServerOptions {
  corsOrigins: string[];
}

export interface CreateMatchOptions {
  modelA: string;
  modelB: string;
  matchId?: string;
  createdById?: string;
}

export class SocketServer {
  private readonly io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  readonly emitter: MatchEventEmitter;
  readonly registry: MatchRegistry;

  constructor(httpServer: HttpServer, options: SocketServerOptions) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: options.corsOrigins,
        methods: ["GET", "POST"],
      },
      pingTimeout: 20000,
      pingInterval: 10000,
      transports: ["websocket", "polling"],
    });

    this.emitter = new MatchEventEmitter(this.io as unknown as SocketIOServer);
    this.registry = new MatchRegistry();

    this.attachHandlers();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async createMatch(options: CreateMatchOptions): Promise<string> {
    const runner = new MatchRunner({
      matchId: options.matchId,
      modelA: options.modelA,
      modelB: options.modelB,
      emitter: this.emitter,

      // ── Phase 4: DB hooks ──────────────────────────────────────────────────

      onMatchStart: async (matchId, layoutA, layoutB) => {
        await matchRepository.createMatch({
          matchId,
          modelA: options.modelA,
          modelB: options.modelB,
          shipLayoutA: layoutA,
          shipLayoutB: layoutB,
          createdById: options.createdById,
        });
      },

      onMoveComplete: async (matchId, move) => {
        await matchRepository.recordMove(matchId, move).catch((err) => {
          // Non-fatal — log and continue. Don't crash the game loop over a DB write.
          console.error(`[DB] Failed to persist move ${move.turnNumber}:`, err);
        });
      },

      onMatchComplete: async (matchId, result, finalState) => {
        try {
          const transcriptId = await matchRepository.completeMatch(
            matchId,
            result,
            finalState
          );
          console.log(`[DB] Match ${matchId} persisted. Transcript: ${transcriptId}`);
        } catch (err) {
          console.error(`[DB] Failed to persist match completion for ${matchId}:`, err);
        }
        // Clean up registry after delay regardless of DB success
        setTimeout(() => this.registry.remove(matchId), 30_000);
      },
    });

    this.registry.register(runner);

    runner.start().catch((err) => {
      console.error(`[SocketServer] Match ${runner.matchId} crashed:`, err);
      this.registry.remove(runner.matchId);
    });

    return runner.matchId;
  }

  abortMatch(matchId: string): boolean {
    const runner = this.registry.get(matchId);
    if (!runner) return false;
    runner.abort();
    this.registry.remove(matchId);
    return true;
  }

  get activeMatchCount(): number {
    return this.registry.activeMatches().length;
  }

  // ── Socket.io connection handling ─────────────────────────────────────────

  private attachHandlers(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log(`[WS] Client connected: ${socket.id}`);

      socket.on("JOIN_MATCH", async (matchId: string) => {
        if (typeof matchId !== "string" || matchId.length > 64) {
          socket.emit("ERROR", {
            code: "INVALID_MATCH_ID",
            message: "Invalid match ID format.",
            recoverable: false,
          });
          return;
        }

        // Check live registry first, then DB for completed matches
        const runner = this.registry.get(matchId);
        const matchExists =
          runner != null ||
          (await matchRepository.getMatch(matchId).then((m) => m != null).catch(() => false));

        if (!matchExists) {
          socket.emit("ERROR", {
            code: "MATCH_NOT_FOUND",
            message: `Match "${matchId}" does not exist or has ended.`,
            recoverable: false,
          });
          return;
        }

        await socket.join(matchId);
        console.log(`[WS] ${socket.id} joined match ${matchId}`);

        // Send current board state to late joiners
        const engine = (runner as any)?.engine;
        if (engine) {
          socket.emit("GAME_STATE_UPDATE", {
            matchId,
            state: engine.getState(),
          });
        }

        await this.emitter.broadcastSpectatorCount(matchId);
      });

      socket.on("LEAVE_MATCH", async (matchId: string) => {
        await socket.leave(matchId);
        await this.emitter.broadcastSpectatorCount(matchId);
      });

      socket.on("disconnect", async () => {
        const rooms = [...socket.rooms].filter((r) => r !== socket.id);
        for (const matchId of rooms) {
          await this.emitter.broadcastSpectatorCount(matchId);
        }
      });
    });
  }
}
