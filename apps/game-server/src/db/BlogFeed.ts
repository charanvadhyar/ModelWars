// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/db/BlogFeed.ts
// Unified Intelligence Log — all model reasoning and outputs from both arenas,
// merged into a single chronological feed via a UNION query.
// ─────────────────────────────────────────────────────────────────────────────

import sql from "./pool";

export type BlogArena = "battleship" | "quiz";

export interface BlogPost {
  id: string;
  arena: BlogArena;
  /** What kind of output this is */
  type:
    | "BATTLESHIP_REASONING"
    | "QUIZ_QUESTION_GEN"
    | "QUIZ_ANSWER"
    | "QUIZ_GRADING";
  /** The model that produced this output */
  model: string;
  player: "A" | "B";
  /** Primary content — the reasoning or answer text */
  content: string;
  /** Short descriptor — e.g. "Turn 5 · E7 · HIT" or "Q3 · Tier II · 2/2" */
  context: string;
  /** The question or move prompt this is responding to (for quiz answers) */
  prompt?: string;
  /** Source match/quiz ID */
  sourceId: string;
  /** Arena-specific URL path for linking */
  sourceUrl: string;
  createdAt: string;
}

export async function getBlogFeed(params: {
  limit?: number;
  offset?: number;
  arena?: string;
}): Promise<BlogPost[]> {
  const { limit = 30, offset = 0, arena } = params;

  // Battleship reasoning entries — one per turn per model
  const battleshipRows = arena === "quiz" ? [] : await sql<any[]>`
    SELECT
      m.id,
      'battleship'            AS arena,
      'BATTLESHIP_REASONING'  AS type,
      CASE m.player WHEN 'A' THEN ma.model_a ELSE ma.model_b END AS model,
      m.player,
      m.reasoning             AS content,
      'Turn ' || m.turn_number || ' · ' || m.coordinate || ' · ' || m.result AS context,
      NULL                    AS prompt,
      m.match_id              AS source_id,
      m.created_at
    FROM moves m
    JOIN matches ma ON m.match_id = ma.id
    WHERE m.reasoning IS NOT NULL
      AND length(m.reasoning) > 10
    ORDER BY m.created_at DESC
    LIMIT ${limit * 2}
  `;

  // Quiz answer entries — each model answering a question
  const quizAnswerRows = arena === "battleship" ? [] : await sql<any[]>`
    SELECT
      qq.id,
      'quiz'       AS arena,
      'QUIZ_ANSWER' AS type,
      CASE qq.asked_to WHEN 'A' THEN qm.model_a ELSE qm.model_b END AS model,
      qq.asked_to  AS player,
      qq.given_answer AS content,
      'Q' || qq.question_order || ' · Tier ' || qq.tier || ' · ' ||
        COALESCE(qq.score::text, '?') || '/' || qq.marks AS context,
      qq.question_text AS prompt,
      qq.match_id      AS source_id,
      qq.created_at
    FROM quiz_questions qq
    JOIN quiz_matches qm ON qq.match_id = qm.id
    WHERE qq.given_answer IS NOT NULL
      AND length(qq.given_answer) > 10
    ORDER BY qq.created_at DESC
    LIMIT ${limit * 2}
  `;

  // Quiz grading entries — each model grading the opponent's answer
  const quizGradingRows = arena === "battleship" ? [] : await sql<any[]>`
    SELECT
      qq.id || '-grade'  AS id,
      'quiz'             AS arena,
      'QUIZ_GRADING'     AS type,
      CASE qq.asked_by WHEN 'A' THEN qm.model_a ELSE qm.model_b END AS model,
      qq.asked_by  AS player,
      qq.grading_feedback AS content,
      'Graded Q' || qq.question_order || ' · ' ||
        COALESCE(qq.score::text,'?') || '/' || qq.marks || ' pts' AS context,
      qq.question_text AS prompt,
      qq.match_id      AS source_id,
      qq.created_at
    FROM quiz_questions qq
    JOIN quiz_matches qm ON qq.match_id = qm.id
    WHERE qq.grading_feedback IS NOT NULL
      AND length(qq.grading_feedback) > 5
    ORDER BY qq.created_at DESC
    LIMIT ${limit * 2}
  `;

  // Merge, sort by date descending, paginate
  const all: BlogPost[] = [
    ...battleshipRows,
    ...quizAnswerRows,
    ...quizGradingRows,
  ]
    .map(r => ({
      id:        String(r.id),
      arena:     r.arena as BlogArena,
      type:      r.type,
      model:     r.model ?? "Unknown",
      player:    r.player,
      content:   String(r.content ?? "").trim(),
      context:   String(r.context ?? "").trim(),
      prompt:    r.prompt ? String(r.prompt).trim() : undefined,
      sourceId:  String(r.sourceId ?? r.source_id ?? ""),
      sourceUrl: r.arena === "battleship"
        ? `/match/${r.sourceId ?? r.source_id}`
        : `/quiz/${r.sourceId ?? r.source_id}`,
      createdAt: r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt ?? r.created_at ?? ""),
    }))
    .filter(p => p.content.length > 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(offset, offset + limit);

  return all;
}
