// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/ai/ClaudeClient.ts
// Anthropic Claude API client with streaming support.
// Tokens are batched every ~150ms and emitted via callback to avoid
// fan-out overhead when broadcasting to 500+ spectators per turn.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type {
  AIClient,
  AIClientOptions,
  AIMessage,
  AIResponse,
  StreamChunkCallback,
} from "./AIClient";

export class ClaudeClient implements AIClient {
  readonly model: string;
  private readonly client: Anthropic;
  private readonly systemPrompt: string;
  private readonly timeoutMs: number;
  private readonly chunkIntervalMs: number;

  constructor(options: AIClientOptions) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is not set."
      );
    }

    this.model = options.model;
    this.systemPrompt = options.systemPrompt;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.chunkIntervalMs = options.chunkIntervalMs ?? 150;

    this.client = new Anthropic({ apiKey });
  }

  async complete(
    messages: AIMessage[],
    onChunk: StreamChunkCallback
  ): Promise<AIResponse> {
    const startedAt = Date.now();
    let fullText = "";
    let promptTokens = 0;
    let completionTokens = 0;

    // Token batch buffer — flushed every chunkIntervalMs
    let buffer = "";
    let flushTimer: ReturnType<typeof setInterval> | null = null;

    const flush = (done: boolean) => {
      if (buffer.length > 0 || done) {
        const chunk = buffer;
        buffer = "";
        onChunk(chunk, done);
      }
    };

    // Set up abort controller for timeout
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, this.timeoutMs);

    try {
      flushTimer = setInterval(() => flush(false), this.chunkIntervalMs);

      const stream = await this.client.messages.stream(
        {
          model: this.model,
          max_tokens: 2048,
          system: this.systemPrompt,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
        { signal: abortController.signal }
      );

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          buffer += event.delta.text;
          fullText += event.delta.text;
        }

        if (event.type === "message_delta" && event.usage) {
          completionTokens = event.usage.output_tokens;
        }

        if (event.type === "message_start" && event.message.usage) {
          promptTokens = event.message.usage.input_tokens;
        }
      }

      // Final flush
      if (flushTimer) clearInterval(flushTimer);
      flush(true);

      return {
        text: fullText,
        promptTokens,
        completionTokens,
        latencyMs: Date.now() - startedAt,
        model: this.model,
      };
    } catch (error: any) {
      if (flushTimer) clearInterval(flushTimer);
      flush(true);
      clearTimeout(timeoutHandle);

      if (abortController.signal.aborted) {
        throw new Error(
          `Claude API timeout after ${this.timeoutMs}ms for model ${this.model}`
        );
      }

      // Surface rate limit clearly
      if (error?.status === 429) {
        throw new Error(
          `Claude API rate limit hit (429). Retry after backoff. Model: ${this.model}`
        );
      }

      throw new Error(`Claude API error: ${error?.message ?? String(error)}`);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
