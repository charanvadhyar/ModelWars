// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/socket/EventEmitter.ts
// Typed wrapper around Socket.io's room broadcast API.
// All game-to-client events flow through this class — never raw io.to() calls.
// ─────────────────────────────────────────────────────────────────────────────

import type { Server } from "socket.io";
import type {
  GameStateUpdatePayload,
  ReasoningChunkPayload,
  MoveResultPayload,
  HeatmapUpdatePayload,
  GameOverPayload,
  SpectatorCountPayload,
  MatchStartPayload,
  ErrorPayload,
} from "../../../../packages/shared/types/events";

export class MatchEventEmitter {
  private readonly io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  // ── Match lifecycle ────────────────────────────────────────────────────────

  matchStart(matchId: string, payload: MatchStartPayload): void {
    this.io.to(matchId).emit("MATCH_START", payload);
  }

  gameStateUpdate(matchId: string, payload: GameStateUpdatePayload): void {
    this.io.to(matchId).emit("GAME_STATE_UPDATE", payload);
  }

  gameOver(matchId: string, payload: GameOverPayload): void {
    this.io.to(matchId).emit("GAME_OVER", payload);
  }

  // ── Per-turn events ────────────────────────────────────────────────────────

  moveResult(matchId: string, payload: MoveResultPayload): void {
    this.io.to(matchId).emit("MOVE_RESULT", payload);
  }

  heatmapUpdate(matchId: string, payload: HeatmapUpdatePayload): void {
    this.io.to(matchId).emit("HEATMAP_UPDATE", payload);
  }

  /**
   * Emit a reasoning chunk to all spectators in the match room.
   * Called by AIOrchestrator's onReasoningChunk callback every ~150ms.
   */
  reasoningChunk(matchId: string, payload: ReasoningChunkPayload): void {
    this.io.to(matchId).emit("REASONING_CHUNK", payload);
  }

  // ── Room meta ──────────────────────────────────────────────────────────────

  spectatorCount(matchId: string, payload: SpectatorCountPayload): void {
    this.io.to(matchId).emit("SPECTATOR_COUNT", payload);
  }

  error(matchId: string, payload: ErrorPayload): void {
    this.io.to(matchId).emit("ERROR", payload);
  }

  /**
   * Broadcast spectator count whenever someone joins or leaves the room.
   */
  async broadcastSpectatorCount(matchId: string): Promise<void> {
    const sockets = await this.io.in(matchId).fetchSockets();
    this.spectatorCount(matchId, { matchId, count: sockets.length });
  }
}
