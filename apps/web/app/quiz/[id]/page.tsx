"use client";
// app/quiz/[id]/page.tsx — Live Quiz Arena spectator page

import { useState, useEffect, useRef } from "react";
import { useQuizSocket } from "../../../hooks/useQuizSocket";
import { useQuizState } from "../../../hooks/useQuizState";
import type { QuizQuestion } from "../../../hooks/useQuizState";

interface Params { params: { id: string } }

const TIER_LABEL: Record<number, string> = { 1: "TIER I", 2: "TIER II", 3: "TIER III" };
const TIER_COLOR: Record<number, string> = { 1: "var(--cyan)", 2: "var(--amber)", 3: "#ff4488" };

export default function QuizPage({ params }: Params) {
  const quizId  = params.id;
  const { status, on } = useQuizSocket(quizId);
  const qs = useQuizState(on, quizId);

  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qs.questionsFromA.length, qs.questionsFromB.length]);

  const allAnsweredQuestions = [
    ...qs.questionsFromA.filter(q => q.givenAnswer !== undefined),
    ...qs.questionsFromB.filter(q => q.givenAnswer !== undefined),
  ].sort((a, b) => {
    // Sort by phase then order
    const phaseOrder = (q: QuizQuestion) => (q.askedBy === "A" ? 0 : 1) * 100 + q.order;
    return phaseOrder(a) - phaseOrder(b);
  });

  const phaseLabel: Record<string, string> = {
    PREPARING:   "GENERATING QUESTIONS",
    ANSWERING_B: `${qs.modelB.split("-")[0].toUpperCase()} ANSWERING`,
    ANSWERING_A: `${qs.modelA.split("-")[0].toUpperCase()} ANSWERING`,
    COMPLETED:   "MATCH COMPLETE",
  };

  const maxPossibleScore = 4 * 1 + 4 * 2 + 2 * 3; // 18

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", fontFamily: "var(--font-mono)" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ padding: "14px 20px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", textAlign: "center", flexShrink: 0 }}>
        <div style={{ fontFamily: "var(--font-hud)", fontSize: "10px", letterSpacing: "8px", color: "var(--text-dim)", marginBottom: "4px" }}>
          CLASSIFIED OPERATION
        </div>
        <h1 style={{ fontFamily: "var(--font-hud)", fontSize: "28px", fontWeight: 900, letterSpacing: "4px", background: "linear-gradient(90deg, var(--amber), #ff4488)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", margin: 0 }}>
          QUIZ ARENA
        </h1>
        <div style={{ fontSize: "11px", letterSpacing: "3px", color: "var(--text-dim)", marginTop: "6px" }}>
          {qs.topic ? `TOPIC: ${qs.topic.toUpperCase()}` : `QUIZ ${quizId.slice(0, 8).toUpperCase()}`}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "8px", fontSize: "10px", letterSpacing: "2px", color: "var(--text-dim)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "5px", height: "5px", borderRadius: "50%", display: "inline-block", background: status === "connected" ? "#ff4488" : "#334455", animation: status === "connected" ? "pulseDot 1.2s infinite" : "none" }} />
            <span style={{ color: status === "connected" ? "#ff4488" : "var(--text-dim)" }}>{status === "connected" ? "LIVE" : status.toUpperCase()}</span>
          </span>
          {qs.phase && (
            <span style={{ color: "var(--amber)", animation: qs.phase !== "COMPLETED" ? "pulseDot 1.2s infinite" : "none" }}>
              ◈ {phaseLabel[qs.phase] ?? qs.phase}
            </span>
          )}
        </div>
      </header>

      {/* ── Scoreboard ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "center", gap: "0", padding: "16px 20px 8px", flexShrink: 0 }}>
        {/* Model A */}
        <div style={{ flex: 1, maxWidth: "280px", padding: "14px 20px", background: "rgba(255,170,0,0.05)", border: "1px solid rgba(255,170,0,0.2)", borderRight: "none", borderRadius: "3px 0 0 3px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--amber)", marginBottom: "4px" }}>PLAYER A</div>
          <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{qs.modelA || "—"}</div>
          <div style={{ fontFamily: "var(--font-hud)", fontSize: "36px", color: qs.winner === "A" ? "var(--amber)" : "var(--text)", letterSpacing: "2px" }}>{qs.scoreA}</div>
          <div style={{ fontSize: "9px", color: "var(--text-dim)", marginTop: "2px" }}>/ {maxPossibleScore} MAX</div>
          {qs.winner === "A" && <div style={{ marginTop: "8px", fontSize: "10px", letterSpacing: "3px", color: "var(--amber)" }}>◈ WINNER</div>}
        </div>

        {/* Center divider */}
        <div style={{ width: "80px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", fontSize: "11px", letterSpacing: "2px", color: "var(--text-dim)" }}>
          {qs.winner === "TIE" ? "TIE" : "VS"}
        </div>

        {/* Model B */}
        <div style={{ flex: 1, maxWidth: "280px", padding: "14px 20px", background: "rgba(0,220,255,0.05)", border: "1px solid rgba(0,220,255,0.2)", borderLeft: "none", borderRadius: "0 3px 3px 0", textAlign: "center" }}>
          <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--cyan)", marginBottom: "4px" }}>PLAYER B</div>
          <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{qs.modelB || "—"}</div>
          <div style={{ fontFamily: "var(--font-hud)", fontSize: "36px", color: qs.winner === "B" ? "var(--cyan)" : "var(--text)", letterSpacing: "2px" }}>{qs.scoreB}</div>
          <div style={{ fontSize: "9px", color: "var(--text-dim)", marginTop: "2px" }}>/ {maxPossibleScore} MAX</div>
          {qs.winner === "B" && <div style={{ marginTop: "8px", fontSize: "10px", letterSpacing: "3px", color: "var(--cyan)" }}>◈ WINNER</div>}
        </div>
      </div>

      {/* ── Active question ─────────────────────────────────────────────────── */}
      {qs.activeQuestion && qs.phase !== "COMPLETED" && (
        <div style={{ padding: "0 20px 12px", maxWidth: "800px", margin: "0 auto", width: "100%" }}>
          <div style={{ border: `1px solid ${TIER_COLOR[qs.activeQuestion.tier]}`, borderRadius: "4px", padding: "16px 20px", background: `${TIER_COLOR[qs.activeQuestion.tier]}08` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ fontSize: "9px", letterSpacing: "3px", color: TIER_COLOR[qs.activeQuestion.tier] }}>
                {TIER_LABEL[qs.activeQuestion.tier]} · {qs.activeQuestion.marks} MARK{qs.activeQuestion.marks > 1 ? "S" : ""}
              </span>
              <span style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--text-dim)" }}>
                Q{qs.activeQuestionNumber} / 10 · {qs.activeQuestion.askedTo === "A" ? qs.modelA : qs.modelB} ANSWERING
              </span>
            </div>
            <div style={{ fontSize: "14px", color: "var(--text)", lineHeight: 1.6, marginBottom: "12px" }}>
              {qs.activeQuestion.question}
            </div>
            {qs.activeAnswerText && (
              <div style={{ fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.6, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "10px", fontStyle: "italic" }}>
                {qs.activeAnswerText}
                {!qs.lastGraded && <span style={{ animation: "pulseDot 1s infinite", display: "inline-block", marginLeft: "4px" }}>▊</span>}
              </div>
            )}
            {qs.lastGraded && qs.lastGraded.questionId === qs.activeQuestion.id && (
              <div style={{ marginTop: "10px", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "2px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>{qs.lastGraded.feedback}</span>
                <span style={{ fontFamily: "var(--font-hud)", fontSize: "18px", color: qs.lastGraded.score === qs.lastGraded.maxMarks ? "#44ff88" : qs.lastGraded.score === 0 ? "#ff4444" : "var(--amber)", marginLeft: "16px", whiteSpace: "nowrap" }}>
                  {qs.lastGraded.score} / {qs.lastGraded.maxMarks}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Preparing state ─────────────────────────────────────────────────── */}
      {qs.phase === "PREPARING" && !qs.activeQuestion && (
        <div style={{ textAlign: "center", padding: "24px", color: "var(--text-dim)", fontSize: "11px", letterSpacing: "3px" }}>
          <div style={{ animation: "pulseDot 1.2s infinite" }}>◈ MODELS GENERATING QUESTIONS...</div>
          <div style={{ marginTop: "8px", fontSize: "10px" }}>10 QUESTIONS · 3 TIERS · TOPIC: {qs.topic.toUpperCase()}</div>
        </div>
      )}

      {/* ── Question log ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: "8px 20px 24px", maxWidth: "800px", margin: "0 auto", width: "100%", overflowY: "auto" }}>
        {allAnsweredQuestions.length > 0 && (
          <>
            <div style={{ fontSize: "9px", letterSpacing: "4px", color: "var(--text-dim)", marginBottom: "10px" }}>QUESTION LOG</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {allAnsweredQuestions.map(q => (
                <QuestionLogRow key={q.id} question={q} modelA={qs.modelA} modelB={qs.modelB} />
              ))}
            </div>
            <div ref={logEndRef} />
          </>
        )}

        {/* Final result */}
        {qs.phase === "COMPLETED" && qs.winner && (
          <div style={{ marginTop: "24px", textAlign: "center", padding: "24px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px" }}>
            <div style={{ fontFamily: "var(--font-hud)", fontSize: "11px", letterSpacing: "6px", color: "var(--text-dim)", marginBottom: "8px" }}>FINAL RESULT</div>
            {qs.winner === "TIE" ? (
              <div style={{ fontFamily: "var(--font-hud)", fontSize: "28px", color: "var(--amber)", letterSpacing: "4px" }}>DRAW</div>
            ) : (
              <>
                <div style={{ fontFamily: "var(--font-hud)", fontSize: "28px", letterSpacing: "4px", color: qs.winner === "A" ? "var(--amber)" : "var(--cyan)" }}>
                  PLAYER {qs.winner} WINS
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "4px" }}>
                  {qs.winner === "A" ? qs.modelA : qs.modelB}
                </div>
              </>
            )}
            <div style={{ marginTop: "16px", fontFamily: "var(--font-hud)", fontSize: "20px", letterSpacing: "2px" }}>
              <span style={{ color: "var(--amber)" }}>{qs.scoreA}</span>
              <span style={{ color: "var(--text-dim)", margin: "0 12px" }}>—</span>
              <span style={{ color: "var(--cyan)" }}>{qs.scoreB}</span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulseDot {
          0%,100% { opacity:1; } 50% { opacity:0.3; }
        }
      `}</style>
    </div>
  );
}

function QuestionLogRow({ question, modelA, modelB }: {
  question: QuizQuestion;
  modelA: string;
  modelB: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const answererModel = question.askedTo === "A" ? modelA : modelB;
  const scoreColor = question.score === question.marks ? "#44ff88" : question.score === 0 ? "#ff4444" : "var(--amber)";
  const tierColor = TIER_COLOR[question.tier];

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{ cursor: "pointer", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden", transition: "border-color 0.2s" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "rgba(255,255,255,0.02)" }}>
        <span style={{ fontSize: "9px", letterSpacing: "2px", color: tierColor, minWidth: "50px" }}>{TIER_LABEL[question.tier]}</span>
        <span style={{ flex: 1, fontSize: "11px", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {question.question}
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-dim)", minWidth: "80px", textAlign: "right" }}>
          {answererModel.split("-")[0].toUpperCase()}
        </span>
        <span style={{ fontFamily: "var(--font-hud)", fontSize: "14px", color: scoreColor, minWidth: "40px", textAlign: "right" }}>
          {question.score ?? "—"}/{question.marks}
        </span>
        <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: "11px", lineHeight: 1.7 }}>
          <div style={{ color: "var(--text-dim)", marginBottom: "6px" }}>
            <span style={{ color: tierColor, letterSpacing: "1px" }}>ANSWER: </span>
            {question.givenAnswer}
          </div>
          {question.gradingFeedback && (
            <div style={{ color: "var(--text-dim)", fontSize: "10px", fontStyle: "italic" }}>
              ◈ {question.gradingFeedback}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
