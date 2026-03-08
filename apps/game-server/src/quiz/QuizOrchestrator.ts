// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/quiz/QuizOrchestrator.ts
// Handles all AI calls for a single quiz match:
//   1. Question generation (both models in parallel)
//   2. Answering each question sequentially
//   3. Grading each answer (the questioner grades)
// ─────────────────────────────────────────────────────────────────────────────

import type { AIClient, StreamChunkCallback } from "../ai/AIClient";
import type { AIMessage } from "../ai/AIClient";
import type { QuizQuestion, QuizPlayer } from "../types/quiz";
import {
  QUIZ_SYSTEM_PROMPT,
  buildQuestionGenPrompt,
  buildQuestionGenRetryPrompt,
  buildAnswerPrompt,
  buildGradingPrompt,
} from "./QuizPromptBuilder";
import {
  parseQuestionGenResponse,
  parseAnswerResponse,
  parseGradingResponse,
} from "./QuizResponseParser";

const MAX_RETRIES = 3;

export interface QuizOrchestratorCallbacks {
  onAnswerChunk: (player: QuizPlayer, model: string, questionId: string, text: string, done: boolean) => void;
}

export class QuizOrchestrator {
  private readonly clientA: AIClient;
  private readonly clientB: AIClient;

  constructor(clientA: AIClient, clientB: AIClient) {
    this.clientA = clientA;
    this.clientB = clientB;
  }

  private client(player: QuizPlayer): AIClient {
    return player === "A" ? this.clientA : this.clientB;
  }

  // ── Phase 1: Question generation ───────────────────────────────────────────

  /**
   * Ask a model to generate its 10 quiz questions.
   * Returns validated QuizQuestion[] (fallback: generate trivial placeholder questions).
   */
  async generateQuestions(
    player: QuizPlayer,
    topic: string,
    modelName: string,
  ): Promise<{ questions: QuizQuestion[]; reasoning: string }> {
    const client = this.client(player);
    const opponent: QuizPlayer = player === "A" ? "B" : "A";
    const messages: AIMessage[] = [{ role: "user", content: buildQuestionGenPrompt(topic) }];
    let lastRaw = "";

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        messages.push({ role: "user", content: buildQuestionGenRetryPrompt(lastRaw, "Invalid question format") });
      }

      let response;
      try {
        response = await client.complete(messages, (_t, _d) => {});
      } catch (err: any) {
        console.error(`[Quiz] Player ${player} question gen API error:`, err.message);
        break;
      }

      lastRaw = response.text;
      messages.push({ role: "assistant", content: response.text });

      const parsed = parseQuestionGenResponse(response.text, player, opponent);
      if (parsed.success) {
        console.log(`[Quiz] Player ${player} (${modelName}) generated ${parsed.questions.length} questions`);
        return { questions: parsed.questions, reasoning: parsed.reasoning };
      }
      console.warn(`[Quiz] Player ${player} gen attempt ${attempt} failed: ${parsed.error}`);
    }

    // Fallback: generate placeholder questions so the match can continue
    console.warn(`[Quiz] Player ${player} using fallback questions`);
    return {
      questions: buildFallbackQuestions(player, opponent, topic),
      reasoning: "[Fallback questions — model failed to generate valid set]",
    };
  }

  // ── Phase 2: Answering ─────────────────────────────────────────────────────

  /**
   * Ask a model to answer a question.
   * Streams the answer text via callbacks.onAnswerChunk.
   */
  async answerQuestion(
    question: QuizQuestion,
    topic: string,
    modelName: string,
    questionNumber: number,
    totalQuestions: number,
    callbacks: QuizOrchestratorCallbacks,
  ): Promise<string> {
    const answerer = question.askedTo;
    const client = this.client(answerer);

    const messages: AIMessage[] = [
      {
        role: "user",
        content: buildAnswerPrompt(topic, question.question, question.tier, question.marks, questionNumber, totalQuestions),
      },
    ];

    let lastRaw = "";

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let response;
      try {
        // Stream chunks to spectators
        const streamCallback: StreamChunkCallback = (text, done) => {
          callbacks.onAnswerChunk(answerer, modelName, question.id, text, done);
        };
        response = await client.complete(messages, streamCallback);
      } catch (err: any) {
        console.error(`[Quiz] Answer API error for Q${question.id}:`, err.message);
        return "[API error — could not retrieve answer]";
      }

      lastRaw = response.text;
      const parsed = parseAnswerResponse(response.text);
      if (parsed.success) {
        // Emit the clean answer text as final chunk
        callbacks.onAnswerChunk(answerer, modelName, question.id, parsed.answer, true);
        return parsed.answer;
      }
      messages.push({ role: "assistant", content: response.text });
      messages.push({ role: "user", content: `Your response was invalid JSON. Please return only a JSON object with "reasoning" and "answer" fields.` });
    }

    return lastRaw.slice(0, 500) || "[No answer provided]";
  }

  // ── Phase 3: Grading ───────────────────────────────────────────────────────

  /**
   * Ask the model that wrote the question to grade the opponent's answer.
   * Returns score (0..marks) and feedback string.
   */
  async gradeAnswer(
    question: QuizQuestion,
    givenAnswer: string,
    topic: string,
  ): Promise<{ score: number; feedback: string }> {
    const grader = question.askedBy;  // questioner grades
    const client = this.client(grader);

    const messages: AIMessage[] = [
      {
        role: "user",
        content: buildGradingPrompt(
          topic,
          question.question,
          question.expectedAnswer,
          givenAnswer,
          question.marks,
        ),
      },
    ];

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let response;
      try {
        response = await client.complete(messages, (_t, _d) => {});
      } catch (err: any) {
        console.error(`[Quiz] Grading API error for Q${question.id}:`, err.message);
        // Conservative fallback: award half marks on error
        return { score: Math.floor(question.marks / 2), feedback: "[Grading error — partial marks awarded]" };
      }

      const parsed = parseGradingResponse(response.text, question.marks);
      if (parsed.success) {
        return { score: parsed.score, feedback: parsed.feedback };
      }

      messages.push({ role: "assistant", content: response.text });
      messages.push({ role: "user", content: `Invalid grading response. Return JSON with "score" (0-${question.marks}) and "feedback" fields only.` });
    }

    return { score: 0, feedback: "[Could not parse grade — 0 awarded]" };
  }
}

// ── Fallback question set ─────────────────────────────────────────────────────

function buildFallbackQuestions(
  askedBy: QuizPlayer,
  askedTo: QuizPlayer,
  topic: string,
): QuizQuestion[] {
  const { randomUUID } = require("crypto");
  const tiers: [1 | 2 | 3, 1 | 2 | 3][] = [
    [1,1],[1,1],[1,1],[1,1],
    [2,2],[2,2],[2,2],[2,2],
    [3,3],[3,3],
  ];
  return tiers.map(([tier, marks], i) => ({
    id: randomUUID(),
    askedBy,
    askedTo,
    tier,
    marks,
    order: i + 1,
    question: `Describe a key concept related to "${topic}". (Question ${i + 1})`,
    expectedAnswer: `A thoughtful explanation of a key concept in ${topic}.`,
  }));
}

// ── Factory ───────────────────────────────────────────────────────────────────

export async function createQuizOrchestrator(
  modelA: string,
  modelB: string,
): Promise<QuizOrchestrator> {
  const { ClaudeClient } = await import("../ai/ClaudeClient");
  const { GPTClient }    = await import("../ai/GPTClient");

  function makeClient(model: string): AIClient {
    if (model.startsWith("claude")) return new ClaudeClient({ model, systemPrompt: QUIZ_SYSTEM_PROMPT });
    if (model.startsWith("gpt") || model.startsWith("o1") || model.startsWith("o3")) {
      return new GPTClient({ model, systemPrompt: QUIZ_SYSTEM_PROMPT });
    }
    throw new Error(`Unknown model: "${model}"`);
  }

  return new QuizOrchestrator(makeClient(modelA), makeClient(modelB));
}
