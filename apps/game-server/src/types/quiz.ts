// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/types/quiz.ts
// Types for the Quiz Arena competition mode.
// ─────────────────────────────────────────────────────────────────────────────

export type QuizPhase =
  | "PREPARING"    // Both models generating their 10 questions in parallel
  | "ANSWERING_B"  // Model A's questions being answered by Model B (A grades)
  | "ANSWERING_A"  // Model B's questions being answered by Model A (B grades)
  | "COMPLETED";

export type QuizPlayer = "A" | "B";

/** A single quiz question with all lifecycle fields */
export interface QuizQuestion {
  id: string;
  askedBy: QuizPlayer;   // model that wrote this question
  askedTo: QuizPlayer;   // model that must answer
  tier: 1 | 2 | 3;
  marks: 1 | 2 | 3;     // matches tier
  order: number;         // 1-10 within this asker's set
  question: string;
  expectedAnswer: string;  // set by questioner at generation time
  // Filled during answering phase:
  givenAnswer?: string;
  score?: number;          // 0..marks
  gradingFeedback?: string;
}

export interface QuizState {
  matchId: string;
  topic: string;
  phase: QuizPhase;
  modelA: string;
  modelB: string;
  /** Questions written by A, answered by B */
  questionsFromA: QuizQuestion[];
  /** Questions written by B, answered by A */
  questionsFromB: QuizQuestion[];
  /** A's score: sum of score fields in questionsFromB */
  scoreA: number;
  /** B's score: sum of score fields in questionsFromA */
  scoreB: number;
  winner?: "A" | "B" | "TIE";
  startedAt: number;
  lastUpdatedAt: number;
}
