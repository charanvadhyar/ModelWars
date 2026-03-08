// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/quiz/QuizPromptBuilder.ts
// Builds structured JSON prompts for each quiz phase.
// ─────────────────────────────────────────────────────────────────────────────

export const QUIZ_SYSTEM_PROMPT = `You are competing in Model Wars Quiz Arena — an AI vs AI intellectual competition.
Respond ONLY with a single valid JSON object. No markdown code fences, no commentary outside JSON.`;

/**
 * Ask a model to generate 10 questions on the given topic.
 * Distribution: 4 × tier-1 (1 mark), 4 × tier-2 (2 marks), 2 × tier-3 (3 marks).
 */
export function buildQuestionGenPrompt(topic: string): string {
  return JSON.stringify({
    phase: "QUESTION_GENERATION",
    topic,
    task: "Generate exactly 10 quiz questions on this topic. Your opponent must answer them. Try to design questions that reveal depth of understanding — not just trivia.",
    tiers: {
      tier1: { marks: 1, count: 4, style: "Direct factual recall — one clear correct answer" },
      tier2: { marks: 2, count: 4, style: "Conceptual understanding — requires explanation or reasoning" },
      tier3: { marks: 3, count: 2, style: "Analytical or synthesis — complex, multi-part thinking required" },
    },
    response_schema: {
      reasoning: "1-2 sentences on your question selection strategy",
      questions: [
        {
          tier: "1 | 2 | 3",
          marks: "1 | 2 | 3",
          question: "The question text",
          expected_answer: "Model answer used for grading — be complete but concise",
        },
      ],
    },
    notes: [
      "Return EXACTLY 10 questions: 4 tier-1, 4 tier-2, 2 tier-3 (in any order)",
      "questions array must have exactly 10 elements",
      "expected_answer should capture all key points needed for full marks",
    ],
  }, null, 2);
}

/**
 * Retry prompt for malformed question generation responses.
 */
export function buildQuestionGenRetryPrompt(lastResponse: string, error: string): string {
  return JSON.stringify({
    phase: "QUESTION_GENERATION_RETRY",
    error,
    your_previous_response: lastResponse.slice(0, 500),
    instruction: "Your previous response was invalid. Return ONLY a valid JSON object matching the schema. No markdown. No explanation.",
  }, null, 2);
}

/**
 * Ask a model to answer a quiz question.
 */
export function buildAnswerPrompt(
  topic: string,
  question: string,
  tier: number,
  marks: number,
  questionNumber: number,
  totalQuestions: number,
): string {
  return JSON.stringify({
    phase: "ANSWERING",
    topic,
    question_number: `${questionNumber} of ${totalQuestions}`,
    tier,
    marks_available: marks,
    question,
    response_schema: {
      reasoning: "Brief internal reasoning before you answer",
      answer: "Your complete answer — be thorough for higher-mark questions",
    },
    notes: [
      `This is a tier-${tier} question worth ${marks} mark${marks > 1 ? "s" : ""}`,
      marks === 1
        ? "Be precise and direct"
        : marks === 2
        ? "Explain the concept clearly"
        : "Provide detailed analysis with supporting reasoning",
    ],
  }, null, 2);
}

/**
 * Ask the question's author to grade the opponent's answer.
 */
export function buildGradingPrompt(
  topic: string,
  question: string,
  expectedAnswer: string,
  givenAnswer: string,
  maxMarks: number,
): string {
  return JSON.stringify({
    phase: "GRADING",
    topic,
    max_marks: maxMarks,
    question,
    expected_answer: expectedAnswer,
    given_answer: givenAnswer,
    response_schema: {
      score: `Integer from 0 to ${maxMarks}`,
      feedback: "1-2 sentences explaining the score — note what was correct, missing, or wrong",
    },
    grading_guidelines: [
      "Be objective — grade the answer, not the model",
      "Award partial marks for partially correct responses",
      `Score must be an integer: 0, ${Array.from({ length: maxMarks }, (_, i) => i + 1).join(", ")}`,
      "Full marks only if all key points in expected_answer are present",
    ],
  }, null, 2);
}
