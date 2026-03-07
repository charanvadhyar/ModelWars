// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/ai/AIOrchestrator.ts
// Drives one AI turn end-to-end:
//   1. Build the prompt from current game state
//   2. Call the active player's AI client with streaming
//   3. Parse and validate the response (up to MAX_RETRIES attempts)
//   4. Fall back to a random valid move after MAX_RETRIES failures
//   5. Track cumulative cost and enforce the per-match hard cap
//   6. Return structured move data for GameEngine.applyMove()
// ─────────────────────────────────────────────────────────────────────────────

import type { Player, GameState, HeatmapGrid } from "../types/game";
import type { AIClient, StreamChunkCallback } from "./AIClient";
import { estimateCostUsd, MATCH_COST_HARD_CAP_USD } from "./AIClient";
import { buildTurnPrompt, buildRetryPrompt, SYSTEM_PROMPT } from "./PromptBuilder";
import { parseModelResponse } from "./ResponseParser";
import { validateMove, pickRandomValidMove } from "../engine/MoveValidator";
import type { AIMessage } from "./AIClient";

const MAX_RETRIES = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrchestratorTurnResult {
  coord: string;
  reasoning: string;
  strategyTag?: string;
  heatmap: HeatmapGrid;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  /** True if the server had to pick a random move due to repeated AI failures */
  isFallback: boolean;
  /** Estimated USD cost for this turn */
  costUsd: number;
}

export interface OrchestratorCallbacks {
  /** Called with each reasoning chunk — forward to WebSocket emitter */
  onReasoningChunk: StreamChunkCallback;
  /** Called when a retry is triggered — useful for logging / UI */
  onRetry?: (attempt: number, reason: string) => void;
  /** Called when a fallback move is used */
  onFallback?: (reason: string) => void;
}

// ── AIOrchestrator class ──────────────────────────────────────────────────────

export class AIOrchestrator {
  private readonly clientA: AIClient;
  private readonly clientB: AIClient;

  /** Running cost total for this match (USD) */
  private cumulativeCostUsd = 0;

  constructor(clientA: AIClient, clientB: AIClient) {
    this.clientA = clientA;
    this.clientB = clientB;
  }

  /**
   * Execute one full AI turn for the given player.
   * Handles prompt construction, streaming, parsing, retries, and fallback.
   */
  async executeTurn(
    player: Player,
    state: GameState,
    callbacks: OrchestratorCallbacks
  ): Promise<OrchestratorTurnResult> {
    // ── Cost cap check ───────────────────────────────────────────────────────
    if (this.cumulativeCostUsd >= MATCH_COST_HARD_CAP_USD) {
      const coord = pickRandomValidMove(
        player === "A" ? state.playerA.targetingGrid : state.playerB.targetingGrid
      );
      callbacks.onFallback?.(
        `Match cost cap of $${MATCH_COST_HARD_CAP_USD} reached. Using random move.`
      );
      return this.makeFallbackResult(coord, "Cost cap reached.");
    }

    const client = player === "A" ? this.clientA : this.clientB;
    const targetingGrid =
      player === "A"
        ? state.playerA.targetingGrid
        : state.playerB.targetingGrid;

    // Conversation history — grows with each retry this turn
    const messages: AIMessage[] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalLatencyMs = 0;
    let lastRawResponse = "";

    // ── Retry loop ───────────────────────────────────────────────────────────
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // Build prompt for this attempt
      const userContent =
        attempt === 1
          ? buildTurnPrompt({ state, player })
          : buildRetryPrompt(lastRawResponse, "See validation_error field.", attempt);

      messages.push({ role: "user", content: userContent });

      // Only stream reasoning chunks on the first attempt
      // On retries, suppress streaming (response is likely malformed prose)
      const chunkCallback: StreamChunkCallback =
        attempt === 1
          ? callbacks.onReasoningChunk
          : (_text, _done) => {};

      let response;
      try {
        response = await client.complete(messages, chunkCallback);
      } catch (err: any) {
        // API error (timeout, rate limit, etc.) — use fallback immediately
        callbacks.onFallback?.(err.message);
        const coord = pickRandomValidMove(targetingGrid);
        return this.makeFallbackResult(coord, err.message);
      }

      totalPromptTokens += response.promptTokens;
      totalCompletionTokens += response.completionTokens;
      totalLatencyMs += response.latencyMs;
      lastRawResponse = response.text;

      // Add assistant response to history for potential retry context
      messages.push({ role: "assistant", content: response.text });

      // ── Parse response ─────────────────────────────────────────────────────
      const parsed = parseModelResponse(response.text);

      if (!parsed.success) {
        callbacks.onRetry?.(attempt, parsed.error);
        continue; // retry
      }

      // ── Validate move against board state ──────────────────────────────────
      const moveValidation = validateMove(parsed.move.target, targetingGrid);

      if (!moveValidation.valid) {
        callbacks.onRetry?.(attempt, moveValidation.reason);
        // Add the validation error to the conversation so the model understands
        messages.push({
          role: "user",
          content: buildRetryPrompt(
            response.text,
            moveValidation.reason,
            attempt
          ),
        });
        // Remove the last assistant message since we're re-prompting
        // (avoid double-user-message by re-pushing below)
        messages.pop(); // remove injected user message
        // Replace last assistant message to keep turn structure clean
        continue;
      }

      // ── Success ────────────────────────────────────────────────────────────
      const costUsd = estimateCostUsd(
        client.model,
        totalPromptTokens,
        totalCompletionTokens
      );
      this.cumulativeCostUsd += costUsd;

      return {
        coord: parsed.move.target,
        reasoning: parsed.move.reasoning,
        strategyTag: parsed.move.strategyTag,
        heatmap: parsed.move.heatmap,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        latencyMs: totalLatencyMs,
        isFallback: false,
        costUsd,
      };
    }

    // ── All retries exhausted — use fallback ───────────────────────────────
    callbacks.onFallback?.(
      `AI failed to produce a valid move after ${MAX_RETRIES} attempts. Using random move.`
    );
    const coord = pickRandomValidMove(targetingGrid);
    return this.makeFallbackResult(coord, `Exhausted ${MAX_RETRIES} retries.`);
  }

  /** Current cumulative match cost in USD */
  get matchCostUsd(): number {
    return this.cumulativeCostUsd;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private makeFallbackResult(
    coord: string,
    reason: string
  ): OrchestratorTurnResult {
    return {
      coord,
      reasoning: `[Server fallback] ${reason}`,
      heatmap: Array.from({ length: 10 }, () => Array(10).fill(0.01)),
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 0,
      isFallback: true,
      costUsd: 0,
    };
  }
}

// ── Factory function ──────────────────────────────────────────────────────────

/**
 * Create an AIOrchestrator from model name strings.
 * Automatically selects ClaudeClient or GPTClient based on model name prefix.
 */
export async function createOrchestrator(
  modelA: string,
  modelB: string
): Promise<AIOrchestrator> {
  // Dynamic imports to avoid loading unused SDKs
  const { ClaudeClient } = await import("./ClaudeClient");
  const { GPTClient } = await import("./GPTClient");

  function makeClient(model: string): AIClient {
    if (model.startsWith("claude")) {
      return new ClaudeClient({ model, systemPrompt: SYSTEM_PROMPT });
    }
    if (model.startsWith("gpt") || model.startsWith("o1") || model.startsWith("o3")) {
      return new GPTClient({ model, systemPrompt: SYSTEM_PROMPT });
    }
    throw new Error(
      `Unknown model prefix for "${model}". Expected "claude-*" or "gpt-*".`
    );
  }

  return new AIOrchestrator(makeClient(modelA), makeClient(modelB));
}
