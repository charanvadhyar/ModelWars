// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/types/events.ts
// Typed WebSocket events (inlined from packages/shared/types/events.ts for self-contained build)
// ─────────────────────────────────────────────────────────────────────────────

import type { GameState, Move, Player, HeatmapGrid, ShipPlacement } from "./game";

export interface ServerToClientEvents {
  /** Full board snapshot — sent on join and after each move */
  GAME_STATE_UPDATE: (payload: GameStateUpdatePayload) => void;

  /** Token batch from model reasoning — 150ms chunks */
  REASONING_CHUNK: (payload: ReasoningChunkPayload) => void;

  /** Result of the last move */
  MOVE_RESULT: (payload: MoveResultPayload) => void;

  /** Updated probability heatmap after a move */
  HEATMAP_UPDATE: (payload: HeatmapUpdatePayload) => void;

  /** Match has ended */
  GAME_OVER: (payload: GameOverPayload) => void;

  /** Current spectator count in the room */
  SPECTATOR_COUNT: (payload: SpectatorCountPayload) => void;

  /** Match is starting — sent once */
  MATCH_START: (payload: MatchStartPayload) => void;

  /** Server-side error */
  ERROR: (payload: ErrorPayload) => void;
}

export interface ClientToServerEvents {
  /** Join a match room as a spectator */
  JOIN_MATCH: (matchId: string) => void;

  /** Leave a match room */
  LEAVE_MATCH: (matchId: string) => void;
}

// ── Payload shapes ────────────────────────────────────────────────────────────

export interface GameStateUpdatePayload {
  matchId: string;
  state: GameState;
}

export interface ReasoningChunkPayload {
  matchId: string;
  player: Player;
  model: string;
  /** Batched tokens joined into a single string */
  text: string;
  turnNumber: number;
  /** True if this is the final chunk for this turn */
  done: boolean;
}

export interface MoveResultPayload {
  matchId: string;
  move: Move;
}

export interface HeatmapUpdatePayload {
  matchId: string;
  player: Player;
  grid: HeatmapGrid;
  turnNumber: number;
}

export interface GameOverPayload {
  matchId: string;
  winner: Player;
  totalTurns: number;
  durationMs: number;
  transcriptId: string;
}

export interface SpectatorCountPayload {
  matchId: string;
  count: number;
}

export interface MatchStartPayload {
  matchId: string;
  modelA: string;
  modelB: string;
  /** Both ship layouts visible to spectators from the start */
  shipLayoutA: ShipPlacement[];
  shipLayoutB: ShipPlacement[];
}

export interface ErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
}
