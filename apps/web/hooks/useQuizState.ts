"use client";
// hooks/useQuizState.ts

import { useState, useEffect } from "react";

export interface QuizQuestion {
  id: string;
  askedBy: "A" | "B";
  askedTo: "A" | "B";
  tier: 1 | 2 | 3;
  marks: 1 | 2 | 3;
  order: number;
  question: string;
  expectedAnswer: string;
  givenAnswer?: string;
  score?: number;
  gradingFeedback?: string;
}

export interface QuizViewState {
  quizId: string;
  topic: string;
  phase: "PREPARING" | "ANSWERING_B" | "ANSWERING_A" | "COMPLETED" | "";
  modelA: string;
  modelB: string;
  questionsFromA: QuizQuestion[];
  questionsFromB: QuizQuestion[];
  scoreA: number;
  scoreB: number;
  winner?: "A" | "B" | "TIE";
  // Current question being answered
  activeQuestion: QuizQuestion | null;
  activeQuestionNumber: number;
  activeAnswerText: string;
  // Grading result for the last answered question
  lastGraded: { questionId: string; score: number; maxMarks: number; feedback: string } | null;
  connected: boolean;
}

const INITIAL: QuizViewState = {
  quizId: "",
  topic: "",
  phase: "",
  modelA: "",
  modelB: "",
  questionsFromA: [],
  questionsFromB: [],
  scoreA: 0,
  scoreB: 0,
  activeQuestion: null,
  activeQuestionNumber: 0,
  activeAnswerText: "",
  lastGraded: null,
  connected: false,
};

export function useQuizState(
  on: (event: string, handler: (...args: any[]) => void) => () => void,
  quizId: string,
) {
  const [state, setState] = useState<QuizViewState>({ ...INITIAL, quizId });

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(on("QUIZ_STATE_UPDATE", ({ state: qs }: any) => {
      setState(prev => ({
        ...prev,
        topic:          qs.topic          ?? prev.topic,
        phase:          qs.phase          ?? prev.phase,
        modelA:         qs.modelA         ?? prev.modelA,
        modelB:         qs.modelB         ?? prev.modelB,
        questionsFromA: qs.questionsFromA ?? prev.questionsFromA,
        questionsFromB: qs.questionsFromB ?? prev.questionsFromB,
        scoreA:         qs.scoreA         ?? prev.scoreA,
        scoreB:         qs.scoreB         ?? prev.scoreB,
        winner:         qs.winner,
        connected:      true,
      }));
    }));

    unsubs.push(on("QUIZ_QUESTION_REVEAL", ({ question, questionNumber }: any) => {
      setState(prev => ({
        ...prev,
        activeQuestion:       question,
        activeQuestionNumber: questionNumber,
        activeAnswerText:     "",
        lastGraded:           null,
      }));
    }));

    unsubs.push(on("QUIZ_ANSWER_CHUNK", ({ text, done }: any) => {
      if (done) return; // final text set by QUIZ_ANSWER_GRADED
      setState(prev => ({ ...prev, activeAnswerText: prev.activeAnswerText + text }));
    }));

    unsubs.push(on("QUIZ_ANSWER_GRADED", ({ questionId, givenAnswer, score, maxMarks, gradingFeedback }: any) => {
      setState(prev => {
        // Update the question in the list with the graded answer
        const updateQ = (qs: QuizQuestion[]) => qs.map(q =>
          q.id === questionId ? { ...q, givenAnswer, score, gradingFeedback } : q
        );
        return {
          ...prev,
          questionsFromA:  updateQ(prev.questionsFromA),
          questionsFromB:  updateQ(prev.questionsFromB),
          activeAnswerText: givenAnswer,
          lastGraded: { questionId, score, maxMarks, feedback: gradingFeedback },
        };
      });
    }));

    unsubs.push(on("QUIZ_PHASE_CHANGE", ({ phase, scoreA, scoreB }: any) => {
      setState(prev => ({
        ...prev,
        phase,
        scoreA,
        scoreB,
        activeQuestion: null,
        activeAnswerText: "",
      }));
    }));

    unsubs.push(on("QUIZ_OVER", ({ winner, scoreA, scoreB }: any) => {
      setState(prev => ({
        ...prev,
        phase: "COMPLETED",
        winner,
        scoreA,
        scoreB,
        activeQuestion: null,
      }));
    }));

    return () => unsubs.forEach(u => u());
  }, [on]);

  return state;
}
