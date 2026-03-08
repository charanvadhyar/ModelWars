// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/quiz/QuizRunner.ts
// Drives a single quiz match end-to-end.
// Phase flow:
//   PREPARING → ANSWERING_B (A's Qs to B) → ANSWERING_A (B's Qs to A) → COMPLETED
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type { QuizState, QuizQuestion, QuizPlayer } from "../types/quiz";
import { QuizOrchestrator, createQuizOrchestrator } from "./QuizOrchestrator";
import { MatchEventEmitter } from "../socket/EventEmitter";

export interface QuizRunnerOptions {
  quizId?: string;
  topic: string;
  modelA: string;
  modelB: string;
  emitter: MatchEventEmitter;
  onQuizStart?:    (quizId: string, topic: string) => Promise<void>;
  onQuestionAsked?(quizId: string, question: QuizQuestion) => Promise<void>;
  onAnswerGraded?: (quizId: string, questionId: string, answer: string, score: number, feedback: string) => Promise<void>;
  onQuizComplete?: (quizId: string, state: QuizState) => Promise<void>;
}

export class QuizRunner {
  readonly quizId: string;
  readonly topic: string;
  readonly modelA: string;
  readonly modelB: string;

  private state: QuizState;
  private emitter: MatchEventEmitter;
  private orchestrator: QuizOrchestrator | null = null;
  private aborted = false;
  private startedAt = 0;

  private readonly onQuizStart?:    QuizRunnerOptions["onQuizStart"];
  private readonly onQuestionAsked?: QuizRunnerOptions["onQuestionAsked"];
  private readonly onAnswerGraded?:  QuizRunnerOptions["onAnswerGraded"];
  private readonly onQuizComplete?:  QuizRunnerOptions["onQuizComplete"];

  constructor(options: QuizRunnerOptions) {
    this.quizId  = options.quizId ?? randomUUID();
    this.topic   = options.topic;
    this.modelA  = options.modelA;
    this.modelB  = options.modelB;
    this.emitter = options.emitter;
    this.onQuizStart    = options.onQuizStart;
    this.onQuestionAsked = options.onQuestionAsked;
    this.onAnswerGraded  = options.onAnswerGraded;
    this.onQuizComplete  = options.onQuizComplete;

    this.startedAt = Date.now();
    this.state = {
      matchId: this.quizId,
      topic: this.topic,
      phase: "PREPARING",
      modelA: this.modelA,
      modelB: this.modelB,
      questionsFromA: [],
      questionsFromB: [],
      scoreA: 0,
      scoreB: 0,
      startedAt: this.startedAt,
      lastUpdatedAt: this.startedAt,
    };
  }

  async start(): Promise<void> {
    console.log(`[Quiz ${this.quizId}] Starting — topic: "${this.topic}"`);

    this.orchestrator = await createQuizOrchestrator(this.modelA, this.modelB);

    await this.onQuizStart?.(this.quizId, this.topic);
    this.broadcastState();

    // ── Phase 1: Both models generate questions in parallel ─────────────────
    this.emitPhaseChange("PREPARING");
    console.log(`[Quiz ${this.quizId}] Generating questions...`);

    const [resultA, resultB] = await Promise.all([
      this.orchestrator.generateQuestions("A", this.topic, this.modelA),
      this.orchestrator.generateQuestions("B", this.topic, this.modelB),
    ]);

    this.state.questionsFromA = resultA.questions;
    this.state.questionsFromB = resultB.questions;
    this.touch();
    this.broadcastState();

    if (this.aborted) return;

    // ── Phase 2: Model B answers Model A's questions ────────────────────────
    await this.runAnsweringPhase("ANSWERING_B", this.state.questionsFromA, this.modelB);
    if (this.aborted) return;

    // ── Phase 3: Model A answers Model B's questions ────────────────────────
    await this.runAnsweringPhase("ANSWERING_A", this.state.questionsFromB, this.modelA);
    if (this.aborted) return;

    // ── Complete ────────────────────────────────────────────────────────────
    this.state.phase = "COMPLETED";
    this.state.winner = this.determineWinner();
    this.touch();

    this.emitter.quizOver(this.quizId, {
      matchId:  this.quizId,
      winner:   this.state.winner,
      scoreA:   this.state.scoreA,
      scoreB:   this.state.scoreB,
      modelA:   this.modelA,
      modelB:   this.modelB,
      topic:    this.topic,
      durationMs: Date.now() - this.startedAt,
    });

    this.broadcastState();
    await this.onQuizComplete?.(this.quizId, this.state);

    console.log(`[Quiz ${this.quizId}] Complete — Winner: ${this.state.winner} | A: ${this.state.scoreA} | B: ${this.state.scoreB}`);
  }

  abort(): void {
    this.aborted = true;
  }

  getState(): QuizState {
    return { ...this.state };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async runAnsweringPhase(
    phase: "ANSWERING_B" | "ANSWERING_A",
    questions: QuizQuestion[],
    answeringModel: string,
  ): Promise<void> {
    this.state.phase = phase;
    this.touch();
    this.emitPhaseChange(phase);

    const total = questions.length;

    for (let i = 0; i < total; i++) {
      if (this.aborted) return;

      const question = questions[i];

      // Reveal question to spectators
      this.emitter.quizQuestionReveal(this.quizId, {
        matchId:         this.quizId,
        question,
        questionNumber:  i + 1,
        totalQuestions:  total,
      });

      await this.onQuestionAsked?.(this.quizId, question);

      // Get answer (streams to spectators via callbacks)
      const givenAnswer = await this.orchestrator!.answerQuestion(
        question,
        this.topic,
        answeringModel,
        i + 1,
        total,
        {
          onAnswerChunk: (player, model, qId, text, done) => {
            this.emitter.quizAnswerChunk(this.quizId, {
              matchId: this.quizId,
              questionId: qId,
              player,
              model,
              text,
              done,
            });
          },
        },
      );

      // Grade the answer
      const { score, feedback } = await this.orchestrator!.gradeAnswer(question, givenAnswer, this.topic);

      // Update question record
      question.givenAnswer      = givenAnswer;
      question.score            = score;
      question.gradingFeedback  = feedback;

      // Update running scores
      if (question.askedTo === "B") {
        this.state.scoreB += score;
      } else {
        this.state.scoreA += score;
      }

      this.touch();

      // Broadcast grading result
      this.emitter.quizAnswerGraded(this.quizId, {
        matchId:        this.quizId,
        questionId:     question.id,
        givenAnswer,
        score,
        maxMarks:       question.marks,
        gradingFeedback: feedback,
      });

      await this.onAnswerGraded?.(this.quizId, question.id, givenAnswer, score, feedback);

      this.broadcastState();

      // Small yield between questions
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  }

  private determineWinner(): "A" | "B" | "TIE" {
    if (this.state.scoreA > this.state.scoreB) return "A";
    if (this.state.scoreB > this.state.scoreA) return "B";
    return "TIE";
  }

  private touch(): void {
    this.state.lastUpdatedAt = Date.now();
  }

  private broadcastState(): void {
    this.emitter.quizStateUpdate(this.quizId, {
      matchId: this.quizId,
      state: { ...this.state },
    });
  }

  private emitPhaseChange(phase: QuizState["phase"]): void {
    this.emitter.quizPhaseChange(this.quizId, {
      matchId: this.quizId,
      phase,
      scoreA: this.state.scoreA,
      scoreB: this.state.scoreB,
    });
  }
}
