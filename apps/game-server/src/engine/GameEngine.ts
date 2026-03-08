import { randomUUID } from "crypto";
// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/engine/GameEngine.ts
// Orchestrates a full Battleship match between two AI players.
// Owns the state machine, turn sequencing, and win detection.
// Does NOT call AI APIs — that is AIOrchestrator's job.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type Player,
  type Move,
  type GameState,
  type ShipPlacement,
  type HeatmapGrid,
  type ShotResult,
} from "../types/game";
import { BoardState } from "./BoardState";
import { validateMove, pickRandomValidMove } from "./MoveValidator";
import { generateRandomLayout } from "./ShipPlacer";


export interface ApplyMoveInput {
  player: Player;
  coord: string;
  reasoning: string;
  strategyTag?: string;
  heatmap: HeatmapGrid;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  /** If true, coord was chosen by the server (AI validation fallback) */
  isFallback?: boolean;
}

export interface ApplyMoveResult {
  move: Move;
  gameOver: boolean;
  winner?: Player;
}

export interface GameEngineOptions {
  matchId?: string;
  modelA: string;
  modelB: string;
  /** Override layouts (e.g. for tests or replay) */
  layoutA?: ShipPlacement[];
  layoutB?: ShipPlacement[];
}

export class GameEngine {
  readonly matchId: string;
  readonly modelA: string;
  readonly modelB: string;

  private readonly boardA: BoardState;
  private readonly boardB: BoardState;
  private readonly layoutA: ShipPlacement[];
  private readonly layoutB: ShipPlacement[];

  private turn: number = 0;
  private activePlayer: Player = "A";
  private moveHistory: Move[] = [];
  private winner: Player | undefined;
  private startedAt: number;

  constructor(options: GameEngineOptions) {
    this.matchId = options.matchId ?? randomUUID();
    this.modelA = options.modelA;
    this.modelB = options.modelB;

    this.layoutA = options.layoutA ?? generateRandomLayout();
    this.layoutB = options.layoutB ?? generateRandomLayout();

    this.boardA = new BoardState(this.layoutA);
    this.boardB = new BoardState(this.layoutB);

    this.startedAt = Date.now();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Apply a validated (or fallback) move to the game.
   * The caller (AIOrchestrator) is responsible for validation before calling this.
   */
  applyMove(input: ApplyMoveInput): ApplyMoveResult {
    if (this.winner !== undefined) {
      throw new Error("Game is already over.");
    }

    if (input.player !== this.activePlayer) {
      throw new Error(
        `It is Player ${this.activePlayer}'s turn, but move submitted for Player ${input.player}.`
      );
    }

    // Validate the coord one final time (guards against bugs in orchestrator)
    const targetBoard = input.player === "A" ? this.boardB : this.boardA;
    const validationResult = validateMove(input.coord, targetBoard.getGrid());

    let finalCoord = input.coord;
    let isFallback = input.isFallback ?? false;

    if (!validationResult.valid) {
      // This should not happen if AIOrchestrator did its job — use fallback
      finalCoord = pickRandomValidMove(targetBoard.getGrid());
      isFallback = true;
    }

    // Apply the shot
    const { result, shipSunkId } = targetBoard.receiveShot(finalCoord);

    this.turn += 1;

    const move: Move = {
      turnNumber: this.turn,
      player: input.player,
      coord: finalCoord,
      result,
      shipSunkId: shipSunkId as Move["shipSunkId"],
      reasoning: input.reasoning,
      strategyTag: input.strategyTag,
      heatmap: input.heatmap,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      latencyMs: input.latencyMs,
      timestamp: Date.now(),
    };

    this.moveHistory.push(move);

    // Check for win
    if (targetBoard.isDefeated()) {
      this.winner = input.player;
      return { move, gameOver: true, winner: input.player };
    }

    // Advance turn
    this.activePlayer = this.activePlayer === "A" ? "B" : "A";
    return { move, gameOver: false };
  }

  /**
   * Get the targeting grid for a player (what they have shot at).
   */
  getTargetingGrid(player: Player) {
    return player === "A"
      ? this.boardB.getGrid()
      : this.boardA.getGrid();
  }

  /**
   * Get the own board grid for a player (where their ships are).
   */
  getOwnGrid(player: Player) {
    return player === "A"
      ? this.boardA.getGrid()
      : this.boardB.getGrid();
  }

  /**
   * Serialise full game state for WebSocket broadcast.
   */
  getState(): GameState {
    return {
      matchId: this.matchId,
      status: this.winner ? "COMPLETED" : "IN_PROGRESS",
      turn: this.turn,
      activePlayer: this.activePlayer,
      modelA: this.modelA,
      modelB: this.modelB,
      playerA: {
        targetingGrid: this.boardB.getGrid(),
        ownGrid: this.boardA.getGrid(),
        fleet: this.boardA.getFleetStatus(),
        shotsHit: this.moveHistory
          .filter((m) => m.player === "A" && m.result !== "MISS")
          .length,
        shotsMissed: this.moveHistory
          .filter((m) => m.player === "A" && m.result === "MISS")
          .length,
      },
      playerB: {
        targetingGrid: this.boardA.getGrid(),
        ownGrid: this.boardB.getGrid(),
        fleet: this.boardB.getFleetStatus(),
        shotsHit: this.moveHistory
          .filter((m) => m.player === "B" && m.result !== "MISS")
          .length,
        shotsMissed: this.moveHistory
          .filter((m) => m.player === "B" && m.result === "MISS")
          .length,
      },
      moveHistory: [...this.moveHistory],
      winner: this.winner,
      startedAt: this.startedAt,
      lastUpdatedAt: Date.now(),
    };
  }

  /** Current active player */
  get currentPlayer(): Player {
    return this.activePlayer;
  }

  /** True if the game has a winner */
  get isOver(): boolean {
    return this.winner !== undefined;
  }

  /** Ship layouts for broadcast at match start */
  getLayouts(): { layoutA: ShipPlacement[]; layoutB: ShipPlacement[] } {
    return { layoutA: [...this.layoutA], layoutB: [...this.layoutB] };
  }

  /** Full move history */
  getMoveHistory(): Move[] {
    return [...this.moveHistory];
  }

  /**
   * Declare a forfeit — the losing player's model failed to produce valid moves.
   * The opponent is awarded the win immediately.
   */
  forfeit(losingPlayer: Player): void {
    if (this.winner !== undefined) return;
    this.winner = losingPlayer === "A" ? "B" : "A";
  }

  /** Duration in ms since match start */
  getDurationMs(): number {
    return Date.now() - this.startedAt;
  }
}
