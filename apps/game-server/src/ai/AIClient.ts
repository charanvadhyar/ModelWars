// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/ai/AIClient.ts
// Shared interface and types for all AI model clients.
// Both ClaudeClient and GPTClient implement this contract.
// ─────────────────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamChunkCallback {
  /** Called every ~150ms with batched token text */
  (text: string, done: boolean): void;
}

export interface AIResponse {
  text: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  model: string;
}

export interface AIClientOptions {
  model: string;
  systemPrompt: string;
  /** Turn timeout in ms — client should abort and throw after this */
  timeoutMs?: number;
  /** Chunk interval for batching streamed tokens (ms) */
  chunkIntervalMs?: number;
}

export interface AIClient {
  readonly model: string;

  /**
   * Send a conversation turn and stream the response.
   * Tokens are batched and emitted via onChunk every ~chunkIntervalMs.
   * Resolves with the complete response once streaming is done.
   *
   * @param messages   Full conversation history for this turn
   * @param onChunk    Callback receiving batched token text
   */
  complete(
    messages: AIMessage[],
    onChunk: StreamChunkCallback
  ): Promise<AIResponse>;
}

// ── Cost estimation utilities ──────────────────────────────────────────────────

/** Pricing per 1M tokens — update as providers change rates */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-opus-4-20250514":   { input: 15.00, output: 75.00 },
  "claude-sonnet-4-20250514": { input: 3.00,  output: 15.00 },
  "claude-haiku-4-5-20251001":{ input: 0.80,  output: 4.00  },
  // OpenAI
  "gpt-4o-2024-08-06":        { input: 5.00,  output: 15.00 },
  "gpt-4o-mini-2024-07-18":   { input: 0.15,  output: 0.60  },
};

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output
  );
}

/** Hard cap per match in USD */
export const MATCH_COST_HARD_CAP_USD = 1.50;
