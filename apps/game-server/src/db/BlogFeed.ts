// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/db/BlogFeed.ts
// Intelligence Log — one post per match/quiz, with full reasoning inside.
// ─────────────────────────────────────────────────────────────────────────────

import sql from "./pool";

export type BlogArena = "battleship" | "quiz";

export interface BlogMatchSummary {
  id: string;
  arena: BlogArena;
  modelA: string;
  modelB: string;
  winner: string | null;
  // battleship-specific
  totalTurns?: number;
  durationMs?: number;
  // quiz-specific
  topic?: string;
  scoreA?: number;
  scoreB?: number;
  createdAt: string;
  completedAt: string | null;
}

export interface BattleshipTurnEntry {
  turnNumber: number;
  player: "A" | "B";
  model: string;
  coord: string;
  result: string;
  shipSunkId: string | null;
  reasoning: string;
  strategyTag: string | null;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export interface QuizEntryBlock {
  order: number;
  askedBy: "A" | "B";
  askedByModel: string;
  askedTo: "A" | "B";
  askedToModel: string;
  tier: number;
  marks: number;
  question: string;
  expectedAnswer: string;
  givenAnswer: string | null;
  score: number | null;
  gradingFeedback: string | null;
}

// ── Listing ───────────────────────────────────────────────────────────────────

export async function getBlogListing(params: {
  limit?: number;
  offset?: number;
  arena?: string;
}): Promise<BlogMatchSummary[]> {
  const { limit = 20, offset = 0, arena } = params;

  const battleshipRows = arena === "quiz" ? [] : await sql<any[]>`
    SELECT
      id, 'battleship' AS arena,
      model_a, model_b, winner,
      total_turns, duration_ms,
      NULL AS topic, NULL AS score_a, NULL AS score_b,
      created_at, completed_at
    FROM matches
    WHERE status = 'COMPLETED'
    ORDER BY completed_at DESC
    LIMIT ${limit}
  `;

  const quizRows = arena === "battleship" ? [] : await sql<any[]>`
    SELECT
      id, 'quiz' AS arena,
      model_a, model_b, winner,
      NULL AS total_turns, NULL AS duration_ms,
      topic, score_a, score_b,
      created_at, completed_at
    FROM quiz_matches
    WHERE status = 'COMPLETED'
    ORDER BY completed_at DESC
    LIMIT ${limit}
  `;

  return [...battleshipRows, ...quizRows]
    .map(r => ({
      id:          r.id,
      arena:       r.arena as BlogArena,
      modelA:      r.modelA ?? r.model_a,
      modelB:      r.modelB ?? r.model_b,
      winner:      r.winner ?? null,
      totalTurns:  r.totalTurns ?? r.total_turns ?? undefined,
      durationMs:  r.durationMs ?? r.duration_ms ?? undefined,
      topic:       r.topic ?? undefined,
      scoreA:      r.scoreA ?? r.score_a ?? undefined,
      scoreB:      r.scoreB ?? r.score_b ?? undefined,
      createdAt:   (r.createdAt ?? r.created_at ?? new Date()).toISOString?.() ?? String(r.createdAt ?? r.created_at),
      completedAt: r.completedAt ?? r.completed_at
        ? (r.completedAt ?? r.completed_at).toISOString?.() ?? String(r.completedAt ?? r.completed_at)
        : null,
    }))
    .sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime())
    .slice(offset, offset + limit);
}

// ── Match detail ──────────────────────────────────────────────────────────────

export async function getBattleshipPost(matchId: string): Promise<{
  match: BlogMatchSummary;
  turns: BattleshipTurnEntry[];
} | null> {
  const [match] = await sql<any[]>`
    SELECT id, model_a, model_b, winner, total_turns, duration_ms, created_at, completed_at
    FROM matches WHERE id = ${matchId}
  `;
  if (!match) return null;

  const moves = await sql<any[]>`
    SELECT turn_number, player, coordinate, result, ship_sunk_id,
           reasoning, strategy_tag,
           prompt_tokens, completion_tokens, latency_ms
    FROM moves WHERE match_id = ${matchId}
    ORDER BY turn_number ASC
  `;

  const modelA = match.modelA ?? match.model_a;
  const modelB = match.modelB ?? match.model_b;

  return {
    match: {
      id:         match.id,
      arena:      "battleship",
      modelA,
      modelB,
      winner:     match.winner ?? null,
      totalTurns: match.totalTurns ?? match.total_turns,
      durationMs: match.durationMs ?? match.duration_ms,
      createdAt:  (match.createdAt ?? match.created_at).toISOString(),
      completedAt: match.completedAt ?? match.completed_at
        ? (match.completedAt ?? match.completed_at).toISOString()
        : null,
    },
    turns: moves.map(m => ({
      turnNumber:       m.turnNumber ?? m.turn_number,
      player:           m.player,
      model:            m.player === "A" ? modelA : modelB,
      coord:            m.coordinate,
      result:           m.result,
      shipSunkId:       m.shipSunkId ?? m.ship_sunk_id ?? null,
      reasoning:        m.reasoning ?? "",
      strategyTag:      m.strategyTag ?? m.strategy_tag ?? null,
      promptTokens:     m.promptTokens ?? m.prompt_tokens,
      completionTokens: m.completionTokens ?? m.completion_tokens,
      latencyMs:        m.latencyMs ?? m.latency_ms,
    })),
  };
}

export async function getQuizPost(quizId: string): Promise<{
  match: BlogMatchSummary;
  questions: QuizEntryBlock[];
} | null> {
  const [quiz] = await sql<any[]>`
    SELECT id, model_a, model_b, winner, topic, score_a, score_b, created_at, completed_at
    FROM quiz_matches WHERE id = ${quizId}
  `;
  if (!quiz) return null;

  const questions = await sql<any[]>`
    SELECT asked_by, asked_to, tier, marks, question_text, expected_answer,
           given_answer, score, grading_feedback, question_order
    FROM quiz_questions WHERE match_id = ${quizId}
    ORDER BY asked_by, question_order ASC
  `;

  const modelA = quiz.modelA ?? quiz.model_a;
  const modelB = quiz.modelB ?? quiz.model_b;

  return {
    match: {
      id:          quiz.id,
      arena:       "quiz",
      modelA,
      modelB,
      winner:      quiz.winner ?? null,
      topic:       quiz.topic,
      scoreA:      quiz.scoreA ?? quiz.score_a,
      scoreB:      quiz.scoreB ?? quiz.score_b,
      createdAt:   (quiz.createdAt ?? quiz.created_at).toISOString(),
      completedAt: quiz.completedAt ?? quiz.completed_at
        ? (quiz.completedAt ?? quiz.completed_at).toISOString()
        : null,
    },
    questions: questions.map(q => ({
      order:         q.questionOrder ?? q.question_order,
      askedBy:       q.askedBy ?? q.asked_by,
      askedByModel:  (q.askedBy ?? q.asked_by) === "A" ? modelA : modelB,
      askedTo:       q.askedTo ?? q.asked_to,
      askedToModel:  (q.askedTo ?? q.asked_to) === "A" ? modelA : modelB,
      tier:          q.tier,
      marks:         q.marks,
      question:      q.questionText ?? q.question_text,
      expectedAnswer: q.expectedAnswer ?? q.expected_answer,
      givenAnswer:   q.givenAnswer ?? q.given_answer ?? null,
      score:         q.score ?? null,
      gradingFeedback: q.gradingFeedback ?? q.grading_feedback ?? null,
    })),
  };
}
