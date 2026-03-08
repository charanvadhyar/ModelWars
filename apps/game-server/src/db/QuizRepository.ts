// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/db/QuizRepository.ts
// All database operations for Quiz Arena matches.
// ─────────────────────────────────────────────────────────────────────────────

import sql from "./pool";
import type { QuizState, QuizQuestion } from "../types/quiz";

export class QuizRepository {

  async createQuiz(params: {
    quizId: string;
    topic: string;
    modelA: string;
    modelB: string;
  }): Promise<void> {
    await sql`
      INSERT INTO quiz_matches (id, topic, model_a, model_b, status)
      VALUES (${params.quizId}, ${params.topic}, ${params.modelA}, ${params.modelB}, 'PREPARING')
    `;
  }

  async saveQuestion(quizId: string, question: QuizQuestion): Promise<void> {
    await sql`
      INSERT INTO quiz_questions (
        id, match_id, asked_by, asked_to,
        tier, marks, question_text, expected_answer, question_order
      ) VALUES (
        ${question.id}, ${quizId}, ${question.askedBy}, ${question.askedTo},
        ${question.tier}, ${question.marks},
        ${question.question}, ${question.expectedAnswer}, ${question.order}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async updateAnswer(
    questionId: string,
    givenAnswer: string,
    score: number,
    feedback: string,
  ): Promise<void> {
    await sql`
      UPDATE quiz_questions
      SET given_answer = ${givenAnswer},
          score = ${score},
          grading_feedback = ${feedback}
      WHERE id = ${questionId}
    `;
  }

  async completeQuiz(quizId: string, state: QuizState): Promise<void> {
    await sql`
      UPDATE quiz_matches SET
        status       = 'COMPLETED',
        winner       = ${state.winner ?? null},
        score_a      = ${state.scoreA},
        score_b      = ${state.scoreB},
        completed_at = NOW()
      WHERE id = ${quizId}
    `;
  }

  async getQuiz(quizId: string): Promise<{
    id: string; topic: string; modelA: string; modelB: string;
    status: string; winner: string | null; scoreA: number | null; scoreB: number | null;
    questions: QuizQuestion[];
  } | null> {
    const [quiz] = await sql<any[]>`
      SELECT id, topic, model_a, model_b, status, winner, score_a, score_b
      FROM quiz_matches WHERE id = ${quizId}
    `;
    if (!quiz) return null;

    const rows = await sql<any[]>`
      SELECT id, asked_by, asked_to, tier, marks, question_text, expected_answer,
             given_answer, score, grading_feedback, question_order
      FROM quiz_questions WHERE match_id = ${quizId}
      ORDER BY asked_by, question_order
    `;

    const questions: QuizQuestion[] = rows.map(r => ({
      id:               r.id,
      askedBy:          r.askedBy,
      askedTo:          r.askedTo,
      tier:             r.tier as 1|2|3,
      marks:            r.marks as 1|2|3,
      order:            r.questionOrder,
      question:         r.questionText,
      expectedAnswer:   r.expectedAnswer,
      givenAnswer:      r.givenAnswer ?? undefined,
      score:            r.score ?? undefined,
      gradingFeedback:  r.gradingFeedback ?? undefined,
    }));

    return { ...quiz, questions };
  }

  async listQuizzes(limit = 20, offset = 0): Promise<any[]> {
    return sql`
      SELECT id, topic, model_a, model_b, status, winner, score_a, score_b,
             created_at, completed_at
      FROM quiz_matches
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
}

export const quizRepository = new QuizRepository();
