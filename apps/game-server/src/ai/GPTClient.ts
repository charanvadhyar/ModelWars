// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/ai/GPTClient.ts
// OpenAI GPT API client with streaming support.
// Identical external interface to ClaudeClient — AIOrchestrator
// treats both interchangeably via the AIClient interface.
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import type {
  AIClient,
  AIClientOptions,
  AIMessage,
  AIResponse,
  StreamChunkCallback,
} from "./AIClient";

export class GPTClient implements AIClient {
  readonly model: string;
  private readonly client: OpenAI;
  private readonly systemPrompt: string;
  private readonly timeoutMs: number;
  private readonly chunkIntervalMs: number;

  constructor(options: AIClientOptions) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is not set."
      );
    }

    this.model = options.model;
    this.systemPrompt = options.systemPrompt;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.chunkIntervalMs = options.chunkIntervalMs ?? 150;

    this.client = new OpenAI({ apiKey });
  }

  async complete(
    messages: AIMessage[],
    onChunk: StreamChunkCallback
  ): Promise<AIResponse> {
    const startedAt = Date.now();
    let fullText = "";
    let promptTokens = 0;
    let completionTokens = 0;

    let buffer = "";
    let flushTimer: ReturnType<typeof setInterval> | null = null;

    const flush = (done: boolean) => {
      if (buffer.length > 0 || done) {
        const chunk = buffer;
        buffer = "";
        onChunk(chunk, done);
      }
    };

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, this.timeoutMs);

    try {
      flushTimer = setInterval(() => flush(false), this.chunkIntervalMs);

      // OpenAI messages format: system message prepended
      const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: this.systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          max_tokens: 1024,
          messages: openAiMessages,
          stream: true,
          stream_options: { include_usage: true },
          response_format: { type: "json_object" }, // enforce JSON mode
        },
        { signal: abortController.signal }
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          buffer += delta;
          fullText += delta;
        }

        // Usage arrives in the final chunk
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
        }
      }

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
          `OpenAI API timeout after ${this.timeoutMs}ms for model ${this.model}`
        );
      }

      if (error?.status === 429) {
        throw new Error(
          `OpenAI API rate limit hit (429). Retry after backoff. Model: ${this.model}`
        );
      }

      throw new Error(`OpenAI API error: ${error?.message ?? String(error)}`);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
