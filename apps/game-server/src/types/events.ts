// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/types/events.ts
// Typed WebSocket events (inlined from packages/shared/types/events.ts for self-contained build)
// ─────────────────────────────────────────────────────────────────────────────

import type { GameState, Move, Player, HeatmapGrid, ShipPlacement } from "./game";
import type { QuizState, QuizQuestion, QuizPhase } from "./quiz";

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

  // ── Quiz Arena events ───────────────────────────────────────────────────────
  QUIZ_STATE_UPDATE:    (payload: QuizStateUpdatePayload)    => void;
  QUIZ_QUESTION_REVEAL: (payload: QuizQuestionRevealPayload) => void;
  QUIZ_ANSWER_CHUNK:    (payload: QuizAnswerChunkPayload)    => void;
  QUIZ_ANSWER_GRADED:   (payload: QuizAnswerGradedPayload)   => void;
  QUIZ_PHASE_CHANGE:    (payload: QuizPhaseChangePayload)    => void;
  QUIZ_OVER:            (payload: QuizOverPayload)           => void;
}

export interface ClientToServerEvents {
  JOIN_MATCH:  (matchId: string) => void;
  LEAVE_MATCH: (matchId: string) => void;
  JOIN_QUIZ:   (quizId: string)  => void;
  LEAVE_QUIZ:  (quizId: string)  => void;
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

// ── Quiz payload shapes ───────────────────────────────────────────────────────

export interface QuizStateUpdatePayload {
  matchId: string;
  state: QuizState;
}

export interface QuizQuestionRevealPayload {
  matchId: string;
  question: QuizQuestion;
  questionNumber: number;  // 1-10
  totalQuestions: number;
}

export interface QuizAnswerChunkPayload {
  matchId: string;
  questionId: string;
  player: string;   // who is answering
  model: string;
  text: string;
  done: boolean;
}

export interface QuizAnswerGradedPayload {
  matchId: string;
  questionId: string;
  givenAnswer: string;
  score: number;
  maxMarks: number;
  gradingFeedback: string;
}

export interface QuizPhaseChangePayload {
  matchId: string;
  phase: QuizPhase;
  scoreA: number;
  scoreB: number;
}

export interface QuizOverPayload {
  matchId: string;
  winner: "A" | "B" | "TIE";
  scoreA: number;
  scoreB: number;
  modelA: string;
  modelB: string;
  topic: string;
  durationMs: number;
}
