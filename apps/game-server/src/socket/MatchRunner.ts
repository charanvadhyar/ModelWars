// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/socket/MatchRunner.ts  (Phase 4 — DB hooks added)
// Drives a single live match from start to finish.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import { GameEngine } from "../engine/GameEngine";
import { AIOrchestrator, createOrchestrator } from "../ai/AIOrchestrator";
import { MatchEventEmitter } from "./EventEmitter";
import type {
  Player,
  ShipPlacement,
  Move,
  GameState,
} from "../types/game";
import type { StreamChunkCallback } from "../ai/AIClient";

export type MatchRunnerStatus =
  | "IDLE"
  | "RUNNING"
  | "COMPLETED"
  | "ABORTED";

export interface MatchCompleteResult {
  winner: Player;
  totalTurns: number;
  durationMs: number;
  totalCostUsd: number;
  forfeited: boolean;
}

export interface MatchRunnerOptions {
  matchId?: string;
  modelA: string;
  modelB: string;
  emitter: MatchEventEmitter;
  /** Called once ship layouts are generated — use to write initial DB record */
  onMatchStart?: (
    matchId: string,
    layoutA: ShipPlacement[],
    layoutB: ShipPlacement[],
    reasoningA: string,
    reasoningB: string
  ) => Promise<void>;
  /** Called after each move — use to persist move to DB */
  onMoveComplete?: (matchId: string, move: Move) => Promise<void>;
  /** Called when match ends — use to persist result + generate transcript */
  onMatchComplete?: (
    matchId: string,
    result: MatchCompleteResult,
    finalState: GameState
  ) => Promise<void>;
}

export class MatchRunner {
  readonly matchId: string;
  readonly modelA: string;
  readonly modelB: string;

  private engine: GameEngine | null = null;
  private orchestrator: AIOrchestrator | null = null;
  private emitter: MatchEventEmitter;
  private status: MatchRunnerStatus = "IDLE";
  private abortRequested = false;
  private matchForfeited = false;

  private readonly onMatchStart?: MatchRunnerOptions["onMatchStart"];
  private readonly onMoveComplete?: MatchRunnerOptions["onMoveComplete"];
  private readonly onMatchComplete?: MatchRunnerOptions["onMatchComplete"];

  constructor(options: MatchRunnerOptions) {
    this.matchId = options.matchId ?? randomUUID();
    this.modelA = options.modelA;
    this.modelB = options.modelB;
    this.emitter = options.emitter;
    this.onMatchStart = options.onMatchStart;
    this.onMoveComplete = options.onMoveComplete;
    this.onMatchComplete = options.onMatchComplete;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.status !== "IDLE") {
      throw new Error(`Match ${this.matchId} has already been started.`);
    }

    this.status = "RUNNING";

    try {
      this.orchestrator = await createOrchestrator(this.modelA, this.modelB);

      // ── Fleet placement phase — both models choose positions in parallel ───
      console.log(`[Match ${this.matchId}] Fleet placement phase starting...`);
      const [resultA, resultB] = await Promise.all([
        this.orchestrator.placeFleet("A", {
          onReasoningChunk: (text, done) => {
            this.emitter.reasoningChunk(this.matchId, {
              matchId: this.matchId, player: "A", model: this.modelA,
              text, turnNumber: 0, done,
            });
          },
          onFallback: (reason) => {
            console.warn(`[Match ${this.matchId}] Player A placement fallback: ${reason}`);
          },
        }),
        this.orchestrator.placeFleet("B", {
          onReasoningChunk: (text, done) => {
            this.emitter.reasoningChunk(this.matchId, {
              matchId: this.matchId, player: "B", model: this.modelB,
              text, turnNumber: 0, done,
            });
          },
          onFallback: (reason) => {
            console.warn(`[Match ${this.matchId}] Player B placement fallback: ${reason}`);
          },
        }),
      ]);
      const layoutA = resultA.placements;
      const layoutB = resultB.placements;
      console.log(`[Match ${this.matchId}] Fleet placement complete.`);

      this.engine = new GameEngine({
        matchId: this.matchId,
        modelA: this.modelA,
        modelB: this.modelB,
        layoutA,
        layoutB,
      });

      // Persist initial match record before first turn
      await this.onMatchStart?.(this.matchId, layoutA, layoutB, resultA.reasoning, resultB.reasoning);

      // Broadcast match start with both ship layouts visible to spectators
      this.emitter.matchStart(this.matchId, {
        matchId: this.matchId,
        modelA: this.modelA,
        modelB: this.modelB,
        shipLayoutA: layoutA,
        shipLayoutB: layoutB,
      });

      this.emitter.gameStateUpdate(this.matchId, {
        matchId: this.matchId,
        state: this.engine.getState(),
      });

      // Main game loop
      while (!this.engine.isOver && !this.abortRequested) {
        await this.runOneTurn();
      }

      if (!this.abortRequested) {
        await this.handleGameOver();
      }
    } catch (err: any) {
      this.status = "ABORTED";
      this.emitter.error(this.matchId, {
        code: "MATCH_ERROR",
        message: err.message ?? "Unknown match error",
        recoverable: false,
      });
      throw err;
    }
  }

  abort(): void {
    this.abortRequested = true;
    this.status = "ABORTED";
  }

  get currentStatus(): MatchRunnerStatus {
    return this.status;
  }

  // ── Private: one full AI turn ──────────────────────────────────────────────

  private async runOneTurn(): Promise<void> {
    const engine = this.engine!;
    const orchestrator = this.orchestrator!;
    const player = engine.currentPlayer;
    const model = player === "A" ? this.modelA : this.modelB;
    const state = engine.getState();

    const onReasoningChunk: StreamChunkCallback = (text, done) => {
      this.emitter.reasoningChunk(this.matchId, {
        matchId: this.matchId,
        player,
        model,
        text,
        turnNumber: state.turn + 1,
        done,
      });
    };

    const turnResult = await orchestrator.executeTurn(player, state, {
      onReasoningChunk,
      onRetry: (attempt, reason) => {
        console.warn(
          `[Match ${this.matchId}] Turn ${state.turn + 1} retry ${attempt} for ${model}: ${reason}`
        );
        this.emitter.error(this.matchId, {
          code: "AI_RETRY",
          message: `${model} re-prompting (attempt ${attempt}/3).`,
          recoverable: true,
        });
      },
      onFallback: (reason) => {
        console.error(`[Match ${this.matchId}] Fallback/forfeit for ${model}: ${reason}`);
        this.emitter.error(this.matchId, {
          code: "AI_FORFEIT",
          message: `${model} failed to produce a valid move after 3 attempts — match forfeited.`,
          recoverable: false,
        });
      },
    });

    // If the model forfeited (retries exhausted or API error), end match immediately
    if (turnResult.forfeited) {
      this.matchForfeited = true;
      engine.forfeit(player);
      return;
    }

    const { move, gameOver } = engine.applyMove({
      player,
      coord: turnResult.coord,
      reasoning: turnResult.reasoning,
      strategyTag: turnResult.strategyTag,
      heatmap: turnResult.heatmap,
      promptTokens: turnResult.promptTokens,
      completionTokens: turnResult.completionTokens,
      latencyMs: turnResult.latencyMs,
      isFallback: turnResult.isFallback,
    });

    // Broadcast turn results
    this.emitter.moveResult(this.matchId, { matchId: this.matchId, move });
    this.emitter.heatmapUpdate(this.matchId, {
      matchId: this.matchId,
      player,
      grid: turnResult.heatmap,
      turnNumber: move.turnNumber,
    });
    this.emitter.gameStateUpdate(this.matchId, {
      matchId: this.matchId,
      state: engine.getState(),
    });

    // Persist move to DB (non-fatal on failure)
    await this.onMoveComplete?.(this.matchId, move);

    await sleep(50);
  }

  // ── Private: end-of-game ──────────────────────────────────────────────────

  private async handleGameOver(): Promise<void> {
    const engine = this.engine!;
    const orchestrator = this.orchestrator!;
    const finalState = engine.getState();

    const winner = finalState.winner!;
    const totalTurns = finalState.turn;
    const durationMs = engine.getDurationMs();
    const totalCostUsd = orchestrator.matchCostUsd;

    this.status = "COMPLETED";

    // Emit game over — transcriptId will be the real DB ID once onMatchComplete resolves
    // We emit a placeholder and let the frontend poll for transcript
    this.emitter.gameOver(this.matchId, {
      matchId: this.matchId,
      winner,
      totalTurns,
      durationMs,
      transcriptId: this.matchId, // matchId doubles as transcript lookup key
    });

    this.emitter.gameStateUpdate(this.matchId, {
      matchId: this.matchId,
      state: finalState,
    });

    // Persist to DB
    await this.onMatchComplete?.(
      this.matchId,
      { winner, totalTurns, durationMs, totalCostUsd, forfeited: this.matchForfeited },
      finalState
    );

    console.log(
      `[Match ${this.matchId}] Complete — Winner: ${winner} | Turns: ${totalTurns} | Cost: $${totalCostUsd.toFixed(4)}`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
