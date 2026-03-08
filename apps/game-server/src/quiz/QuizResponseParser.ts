// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/quiz/QuizResponseParser.ts
// Parses and validates AI JSON responses for each quiz phase.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type { QuizQuestion, QuizPlayer } from "../types/quiz";

// ── Question generation ───────────────────────────────────────────────────────

interface ParsedQuestion {
  tier: 1 | 2 | 3;
  marks: 1 | 2 | 3;
  question: string;
  expected_answer: string;
}

export interface QuestionGenResult {
  success: true;
  reasoning: string;
  questions: ParsedQuestion[];
}
export interface QuestionGenFailure { success: false; error: string; }

export function parseQuestionGenResponse(
  raw: string,
  askedBy: QuizPlayer,
  askedTo: QuizPlayer,
): ({ success: true; reasoning: string; questions: QuizQuestion[] } | { success: false; error: string }) {
  let parsed: any;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { success: false, error: "No JSON object found in response" };
    parsed = JSON.parse(match[0]);
  } catch {
    return { success: false, error: "Response is not valid JSON" };
  }

  const questions: any[] = parsed.questions;
  if (!Array.isArray(questions)) return { success: false, error: "Missing questions array" };
  if (questions.length !== 10) return { success: false, error: `Expected 10 questions, got ${questions.length}` };

  const tier1 = questions.filter(q => q.tier === 1 || q.tier === "1");
  const tier2 = questions.filter(q => q.tier === 2 || q.tier === "2");
  const tier3 = questions.filter(q => q.tier === 3 || q.tier === "3");
  if (tier1.length !== 4) return { success: false, error: `Expected 4 tier-1 questions, got ${tier1.length}` };
  if (tier2.length !== 4) return { success: false, error: `Expected 4 tier-2 questions, got ${tier2.length}` };
  if (tier3.length !== 2) return { success: false, error: `Expected 2 tier-3 questions, got ${tier3.length}` };

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.question || typeof q.question !== "string") {
      return { success: false, error: `Question ${i + 1} missing question text` };
    }
    if (!q.expected_answer || typeof q.expected_answer !== "string") {
      return { success: false, error: `Question ${i + 1} missing expected_answer` };
    }
  }

  const tierMarksMap: Record<number, 1 | 2 | 3> = { 1: 1, 2: 2, 3: 3 };

  const quizQuestions: QuizQuestion[] = questions.map((q, i) => {
    const tier = parseInt(String(q.tier), 10) as 1 | 2 | 3;
    return {
      id: randomUUID(),
      askedBy,
      askedTo,
      tier,
      marks: tierMarksMap[tier],
      order: i + 1,
      question: String(q.question).trim(),
      expectedAnswer: String(q.expected_answer).trim(),
    };
  });

  return {
    success: true,
    reasoning: String(parsed.reasoning ?? "").trim().slice(0, 500),
    questions: quizQuestions,
  };
}

// ── Answer parsing ────────────────────────────────────────────────────────────

export function parseAnswerResponse(
  raw: string,
): { success: true; reasoning: string; answer: string } | { success: false; error: string } {
  let parsed: any;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { success: false, error: "No JSON object found" };
    parsed = JSON.parse(match[0]);
  } catch {
    return { success: false, error: "Response is not valid JSON" };
  }

  if (!parsed.answer || typeof parsed.answer !== "string" || parsed.answer.trim().length === 0) {
    return { success: false, error: "Missing or empty answer field" };
  }

  return {
    success: true,
    reasoning: String(parsed.reasoning ?? "").trim().slice(0, 500),
    answer: String(parsed.answer).trim().slice(0, 2000),
  };
}

// ── Grading parsing ───────────────────────────────────────────────────────────

export function parseGradingResponse(
  raw: string,
  maxMarks: number,
): { success: true; score: number; feedback: string } | { success: false; error: string } {
  let parsed: any;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { success: false, error: "No JSON object found" };
    parsed = JSON.parse(match[0]);
  } catch {
    return { success: false, error: "Response is not valid JSON" };
  }

  const rawScore = parsed.score;
  const score = parseInt(String(rawScore), 10);
  if (isNaN(score) || score < 0 || score > maxMarks) {
    return { success: false, error: `Invalid score: ${rawScore} (must be 0-${maxMarks})` };
  }

  return {
    success: true,
    score,
    feedback: String(parsed.feedback ?? "").trim().slice(0, 500),
  };
}
