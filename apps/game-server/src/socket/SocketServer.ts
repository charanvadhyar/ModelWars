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
import { QuizRunner } from "../quiz/QuizRunner";
import { matchRepository } from "../db/MatchRepository";
import { quizRepository } from "../db/QuizRepository";
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

export interface CreateQuizOptions {
  modelA: string;
  modelB: string;
  topic: string;
  quizId?: string;
  createdById?: string;
}

export class SocketServer {
  private readonly io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  readonly emitter: MatchEventEmitter;
  readonly registry: MatchRegistry;
  private readonly quizzes = new Map<string, QuizRunner>();

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

      onMatchStart: async (matchId, layoutA, layoutB, reasoningA, reasoningB) => {
        await matchRepository.createMatch({
          matchId,
          modelA: options.modelA,
          modelB: options.modelB,
          shipLayoutA: layoutA,
          shipLayoutB: layoutB,
          placementReasoningA: reasoningA,
          placementReasoningB: reasoningB,
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

  async createQuiz(options: CreateQuizOptions): Promise<string> {
    const runner = new QuizRunner({
      quizId:  options.quizId,
      topic:   options.topic,
      modelA:  options.modelA,
      modelB:  options.modelB,
      emitter: this.emitter,

      onQuizStart: async (quizId, topic) => {
        await quizRepository.createQuiz({
          quizId,
          topic,
          modelA: options.modelA,
          modelB: options.modelB,
        });
      },

      onQuestionAsked: async (quizId, question) => {
        await quizRepository.saveQuestion(quizId, question).catch((err) => {
          console.error(`[DB] Failed to save quiz question ${question.id}:`, err);
        });
      },

      onAnswerGraded: async (quizId, questionId, answer, score, feedback) => {
        await quizRepository.updateAnswer(questionId, answer, score, feedback).catch((err) => {
          console.error(`[DB] Failed to update quiz answer ${questionId}:`, err);
        });
      },

      onQuizComplete: async (quizId, state) => {
        await quizRepository.completeQuiz(quizId, state).catch((err) => {
          console.error(`[DB] Failed to complete quiz ${quizId}:`, err);
        });
        setTimeout(() => this.quizzes.delete(quizId), 30_000);
      },
    });

    this.quizzes.set(runner.quizId, runner);

    runner.start().catch((err) => {
      console.error(`[SocketServer] Quiz ${runner.quizId} crashed:`, err);
      this.quizzes.delete(runner.quizId);
    });

    return runner.quizId;
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

      // ── Quiz socket events ─────────────────────────────────────────────────

      socket.on("JOIN_QUIZ", async (quizId: string) => {
        if (typeof quizId !== "string" || quizId.length > 64) {
          socket.emit("ERROR", { code: "INVALID_QUIZ_ID", message: "Invalid quiz ID format.", recoverable: false });
          return;
        }

        const liveRunner = this.quizzes.get(quizId);
        const exists = liveRunner != null ||
          (await quizRepository.getQuiz(quizId).then(q => q != null).catch(() => false));

        if (!exists) {
          socket.emit("ERROR", { code: "QUIZ_NOT_FOUND", message: `Quiz "${quizId}" not found.`, recoverable: false });
          return;
        }

        await socket.join(quizId);

        // Send current state to late joiners
        if (liveRunner) {
          socket.emit("QUIZ_STATE_UPDATE", { matchId: quizId, state: liveRunner.getState() });
        }
      });

      socket.on("LEAVE_QUIZ", async (quizId: string) => {
        await socket.leave(quizId);
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
