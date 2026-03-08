// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/db/MatchRepository.ts
// All database operations using raw postgres.js tagged template queries.
// No ORM — every query is explicit, readable, and fast.
// ─────────────────────────────────────────────────────────────────────────────

import sql from "./pool";
import type {
  Move,
  ShipPlacement,
  Player,
  GameState,
} from "../types/game";
import type { MatchCompleteResult } from "../socket/MatchRunner";
import { estimateCostUsd } from "../ai/AIClient";

// ── Cost helpers ──────────────────────────────────────────────────────────────

/** Store cost as integer micro-USD to avoid float precision issues */
function toMicroUsd(usd: number): number {
  return Math.round(usd * 1_000_000);
}

/** Flatten 10×10 heatmap → 100-element array for compact JSONB storage */
function flattenHeatmap(grid: number[][]): number[] {
  return grid.flat();
}

// ── DB row types (what postgres.js returns after toCamel transform) ────────────

interface MatchRow {
  id: string;
  status: string;
  modelA: string;
  modelB: string;
  winner: string | null;
  totalTurns: number | null;
  durationMs: number | null;
  totalCostUs: number | null;
  shipLayoutA: ShipPlacement[];
  shipLayoutB: ShipPlacement[];
  placementReasoningA: string | null;
  placementReasoningB: string | null;
  forfeited: boolean;
  createdById: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

interface MoveRow {
  id: string;
  matchId: string;
  turnNumber: number;
  player: string;
  coordinate: string;
  result: string;
  shipSunkId: string | null;
  reasoning: string;
  strategyTag: string | null;
  heatmap: number[];
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costUs: number;
  isFallback: boolean;
  createdAt: Date;
}

// ── MatchRepository ───────────────────────────────────────────────────────────

export class MatchRepository {

  // ── Match lifecycle ────────────────────────────────────────────────────────

  /**
   * Create the initial match record before the first turn.
   */
  async createMatch(params: {
    matchId: string;
    modelA: string;
    modelB: string;
    shipLayoutA: ShipPlacement[];
    shipLayoutB: ShipPlacement[];
    placementReasoningA?: string;
    placementReasoningB?: string;
    createdById?: string;
  }): Promise<void> {
    await sql`
      INSERT INTO matches (
        id, status, model_a, model_b,
        ship_layout_a, ship_layout_b,
        placement_reasoning_a, placement_reasoning_b,
        created_by_id, started_at
      ) VALUES (
        ${params.matchId},
        'IN_PROGRESS',
        ${params.modelA},
        ${params.modelB},
        ${sql.json(params.shipLayoutA)},
        ${sql.json(params.shipLayoutB)},
        ${params.placementReasoningA ?? null},
        ${params.placementReasoningB ?? null},
        ${params.createdById ?? null},
        NOW()
      )
    `;
  }

  /**
   * Persist one move after it is applied to the game engine.
   * Called every turn — kept as lean as possible.
   */
  async recordMove(matchId: string, move: Move): Promise<void> {
    const costUs = toMicroUsd(
      estimateCostUsd("", move.promptTokens, move.completionTokens)
    );

    await sql`
      INSERT INTO moves (
        match_id, turn_number, player,
        coordinate, result, ship_sunk_id,
        reasoning, strategy_tag,
        heatmap,
        prompt_tokens, completion_tokens, latency_ms,
        cost_us, is_fallback
      ) VALUES (
        ${matchId},
        ${move.turnNumber},
        ${move.player},
        ${move.coord},
        ${move.result},
        ${move.shipSunkId ?? null},
        ${move.reasoning},
        ${move.strategyTag ?? null},
        ${sql.json(flattenHeatmap(move.heatmap))},
        ${move.promptTokens},
        ${move.completionTokens},
        ${move.latencyMs},
        ${costUs},
        ${false}
      )
    `;
  }

  /**
   * Mark match as completed and write its transcript atomically.
   */
  async completeMatch(
    matchId: string,
    result: MatchCompleteResult,
    finalState: GameState
  ): Promise<string> {
    const transcriptId = crypto.randomUUID();

    // Fetch placement data already stored at match start
    const [placement] = await sql<[{
      shipLayoutA: ShipPlacement[];
      shipLayoutB: ShipPlacement[];
      placementReasoningA: string | null;
      placementReasoningB: string | null;
    }]>`
      SELECT ship_layout_a, ship_layout_b, placement_reasoning_a, placement_reasoning_b
      FROM matches WHERE id = ${matchId}
    `;

    const transcriptJson = buildTranscriptJson(matchId, result, finalState, placement ?? null);

    await sql.begin(async (tx) => {
      await tx`
        UPDATE matches SET
          status        = 'COMPLETED',
          winner        = ${result.winner},
          total_turns   = ${result.totalTurns},
          duration_ms   = ${result.durationMs},
          total_cost_us = ${toMicroUsd(result.totalCostUsd)},
          forfeited     = ${result.forfeited},
          completed_at  = NOW()
        WHERE id = ${matchId}
      `;

      await tx`
        INSERT INTO transcripts (id, match_id, full_json)
        VALUES (
          ${transcriptId},
          ${matchId},
          ${sql.json(transcriptJson)}
        )
      `;
    });

    return transcriptId;
  }

  /**
   * Update match status (e.g. ARCHIVED, ABORTED).
   */
  async updateStatus(matchId: string, status: string): Promise<void> {
    await sql`
      UPDATE matches SET status = ${status} WHERE id = ${matchId}
    `;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Fetch a match with its full move list.
   */
  async getMatch(matchId: string): Promise<(MatchRow & { moves: MoveRow[] }) | null> {
    const [match] = await sql<MatchRow[]>`
      SELECT * FROM matches WHERE id = ${matchId}
    `;
    if (!match) return null;

    const moves = await sql<MoveRow[]>`
      SELECT * FROM moves
      WHERE match_id = ${matchId}
      ORDER BY turn_number ASC
    `;

    return { ...match, moves };
  }

  /**
   * Fetch the pre-built transcript JSON for a match.
   */
  async getTranscript(matchId: string): Promise<{ id: string; fullJson: object } | null> {
    const [row] = await sql<{ id: string; fullJson: object }[]>`
      SELECT id, full_json FROM transcripts WHERE match_id = ${matchId}
    `;
    return row ?? null;
  }

  /**
   * Paginated match list for the history page.
   */
  async listMatches(params: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {}): Promise<{
    matches: (MatchRow & { totalCostUsd: number | null })[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const { limit = 20, offset = 0, status } = params;

    const whereClause = status
      ? sql`WHERE status = ${status}`
      : sql``;

    const [rows, [{ count }]] = await Promise.all([
      sql<MatchRow[]>`
        SELECT
          id, status, model_a, model_b, winner,
          total_turns, duration_ms, total_cost_us,
          started_at, completed_at, created_at
        FROM matches
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql<[{ count: string }]>`
        SELECT COUNT(*)::text FROM matches ${whereClause}
      `,
    ]);

    return {
      matches: rows.map((r) => ({
        ...r,
        totalCostUsd: r.totalCostUs != null ? r.totalCostUs / 1_000_000 : null,
      })),
      total: parseInt(count, 10),
      limit,
      offset,
    };
  }

  /**
   * Admin dashboard stats.
   */
  async getStats(): Promise<{
    totalMatches: number;
    completedMatches: number;
    totalCostUsd: number;
    modelWinCounts: { modelA: string; modelB: string; winner: string; wins: number }[];
  }> {
    const [[{ total }], [{ completed }], [{ costUs }], winRows] = await Promise.all([
      sql<[{ total: string }]>`
        SELECT COUNT(*)::text AS total FROM matches
      `,
      sql<[{ completed: string }]>`
        SELECT COUNT(*)::text AS completed FROM matches WHERE status = 'COMPLETED'
      `,
      sql<[{ costUs: string }]>`
        SELECT COALESCE(SUM(total_cost_us), 0)::text AS "cost_us"
        FROM matches WHERE status = 'COMPLETED'
      `,
      sql<{ modelA: string; modelB: string; winner: string; wins: string }[]>`
        SELECT model_a, model_b, winner, COUNT(*)::text AS wins
        FROM matches
        WHERE status = 'COMPLETED' AND winner IS NOT NULL
        GROUP BY model_a, model_b, winner
        ORDER BY wins DESC
      `,
    ]);

    return {
      totalMatches:    parseInt(total, 10),
      completedMatches: parseInt(completed, 10),
      totalCostUsd:    parseInt(costUs, 10) / 1_000_000,
      modelWinCounts:  winRows.map((r) => ({ ...r, wins: parseInt(r.wins, 10) })),
    };
  }

  /**
   * Per-move cost breakdown (admin / cost monitoring).
   */
  async getMoveCosts(matchId: string) {
    const rows = await sql<{
      turnNumber: number;
      player: string;
      promptTokens: number;
      completionTokens: number;
      costUs: number;
      latencyMs: number;
      isFallback: boolean;
    }[]>`
      SELECT
        turn_number, player,
        prompt_tokens, completion_tokens,
        cost_us, latency_ms, is_fallback
      FROM moves
      WHERE match_id = ${matchId}
      ORDER BY turn_number ASC
    `;

    return rows.map((r) => ({ ...r, costUsd: r.costUs / 1_000_000 }));
  }
}

// ── Transcript builder ────────────────────────────────────────────────────────

function buildTranscriptJson(
  matchId: string,
  result: MatchCompleteResult,
  finalState: GameState,
  placement: {
    shipLayoutA: ShipPlacement[];
    shipLayoutB: ShipPlacement[];
    placementReasoningA: string | null;
    placementReasoningB: string | null;
  } | null
): object {
  return {
    version:      "2.0",
    matchId,
    modelA:       finalState.modelA,
    modelB:       finalState.modelB,
    winner:       result.winner,
    forfeited:    result.forfeited,
    totalTurns:   result.totalTurns,
    durationMs:   result.durationMs,
    totalCostUsd: result.totalCostUsd,
    exportedAt:   new Date().toISOString(),

    // Ship placement phase
    placement: placement ? {
      layoutA:    placement.shipLayoutA,
      layoutB:    placement.shipLayoutB,
      reasoningA: placement.placementReasoningA ?? null,
      reasoningB: placement.placementReasoningB ?? null,
    } : null,

    // Full move-by-move record with heatmaps
    moves: finalState.moveHistory.map((m) => ({
      turn:             m.turnNumber,
      player:           m.player,
      coord:            m.coord,
      result:           m.result,
      shipSunkId:       m.shipSunkId ?? null,
      reasoning:        m.reasoning,
      strategyTag:      m.strategyTag ?? null,
      heatmap:          m.heatmap,          // full 10×10 grid
      promptTokens:     m.promptTokens,
      completionTokens: m.completionTokens,
      latencyMs:        m.latencyMs,
      timestamp:        m.timestamp,
    })),

    // Final fleet state for both players
    finalFleetA: finalState.playerA.fleet,
    finalFleetB: finalState.playerB.fleet,
  };
}

export const matchRepository = new MatchRepository();
