"use client";
// app/blog/quiz/[id]/page.tsx — Full quiz match post

import { useState, useEffect } from "react";
import Link from "next/link";

const SERVER = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:3001";

interface QuizEntry {
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

interface MatchSummary {
  id: string;
  modelA: string;
  modelB: string;
  winner: string | null;
  topic?: string;
  scoreA?: number;
  scoreB?: number;
  createdAt: string;
  completedAt: string | null;
}

interface PostData {
  match: MatchSummary;
  questions: QuizEntry[];
}

interface Params { params: { id: string } }

const TIER_LABEL: Record<number, string> = { 1: "TIER I", 2: "TIER II", 3: "TIER III" };
const TIER_COLOR: Record<number, string> = { 1: "var(--cyan)", 2: "var(--amber)", 3: "#ff4488" };

export default function QuizPostPage({ params }: Params) {
  const quizId = params.id;
  const [data, setData]       = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    fetch(`${SERVER}/api/blog/quiz/${quizId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [quizId]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "3px", fontSize: "11px", animation: "pulseDot 1.2s infinite" }}>
      LOADING QUIZ DATA...
      <style>{`@keyframes pulseDot{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", color: "#ff4444", fontSize: "12px" }}>
      {error || "Quiz not found."}
    </div>
  );

  const { match, questions } = data;
  const maxScore = 4 * 1 + 4 * 2 + 2 * 3; // 18

  // Split by phase: A asked questions (B answers), then B asked questions (A answers)
  const phaseAQ = questions.filter(q => q.askedBy === "A").sort((a, b) => a.order - b.order);
  const phaseBQ = questions.filter(q => q.askedBy === "B").sort((a, b) => a.order - b.order);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-mono)", padding: "24px 20px" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>

        <Link href="/blog" style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--text-dim)", textDecoration: "none" }}>
          ← INTELLIGENCE LOG
        </Link>

        {/* Header */}
        <div style={{ margin: "16px 0 24px", paddingBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#ff4488", marginBottom: "8px" }}>QUIZ ARENA · MATCH TRANSCRIPT</div>
          {match.topic && (
            <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--text-dim)", marginBottom: "8px" }}>
              TOPIC: {match.topic.toUpperCase()}
            </div>
          )}
          <h1 style={{ fontFamily: "var(--font-hud)", fontSize: "20px", fontWeight: 900, letterSpacing: "3px", color: "var(--text)", margin: "0 0 12px" }}>
            {match.modelA.split("-").slice(0,2).join("-").toUpperCase()} vs {match.modelB.split("-").slice(0,2).join("-").toUpperCase()}
          </h1>

          {/* Scoreboard */}
          <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "3px" }}>
              <span style={{ fontFamily: "var(--font-hud)", fontSize: "28px", color: match.winner === "A" ? "var(--amber)" : "var(--text)" }}>
                {match.scoreA ?? 0}
              </span>
              <span style={{ color: "var(--text-dim)", fontSize: "12px" }}>—</span>
              <span style={{ fontFamily: "var(--font-hud)", fontSize: "28px", color: match.winner === "B" ? "var(--cyan)" : "var(--text)" }}>
                {match.scoreB ?? 0}
              </span>
              <span style={{ fontSize: "9px", color: "var(--text-dim)", marginLeft: "4px" }}>/ {maxScore}</span>
            </div>
            <div>
              <div style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "2px", marginBottom: "2px" }}>WINNER</div>
              <div style={{ fontSize: "13px", color: match.winner === "A" ? "var(--amber)" : match.winner === "B" ? "var(--cyan)" : "var(--text-dim)" }}>
                {match.winner === "A" ? match.modelA.split("-")[0].toUpperCase()
                 : match.winner === "B" ? match.modelB.split("-")[0].toUpperCase()
                 : match.winner === "TIE" ? "DRAW"
                 : "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "2px", marginBottom: "2px" }}>DATE</div>
              <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                {new Date(match.completedAt ?? match.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Phase A: Model A's questions, answered by Model B */}
        {phaseAQ.length > 0 && (
          <PhaseSection
            title={`${match.modelA.split("-")[0].toUpperCase()} CHALLENGES ${match.modelB.split("-")[0].toUpperCase()}`}
            subtitle={`Questions by ${match.modelA} · Answered by ${match.modelB}`}
            questions={phaseAQ}
            accentColor="var(--amber)"
          />
        )}

        {/* Phase B: Model B's questions, answered by Model A */}
        {phaseBQ.length > 0 && (
          <PhaseSection
            title={`${match.modelB.split("-")[0].toUpperCase()} CHALLENGES ${match.modelA.split("-")[0].toUpperCase()}`}
            subtitle={`Questions by ${match.modelB} · Answered by ${match.modelA}`}
            questions={phaseBQ}
            accentColor="var(--cyan)"
            style={{ marginTop: "32px" }}
          />
        )}
      </div>

      <style>{`@keyframes pulseDot{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}

function PhaseSection({ title, subtitle, questions, accentColor, style: extraStyle }: {
  title: string;
  subtitle: string;
  questions: QuizEntry[];
  accentColor: string;
  style?: React.CSSProperties;
}) {
  const phaseScore = questions.reduce((sum, q) => sum + (q.score ?? 0), 0);
  const phaseMax   = questions.reduce((sum, q) => sum + q.marks, 0);

  return (
    <div style={extraStyle}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "12px" }}>
        <div>
          <div style={{ fontSize: "10px", letterSpacing: "3px", color: accentColor, marginBottom: "2px" }}>{title}</div>
          <div style={{ fontSize: "9px", color: "var(--text-dim)" }}>{subtitle}</div>
        </div>
        <div style={{ marginLeft: "auto", fontFamily: "var(--font-hud)", fontSize: "18px", color: accentColor }}>
          {phaseScore}<span style={{ fontSize: "12px", color: "var(--text-dim)" }}>/{phaseMax}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {questions.map(q => (
          <QuizEntryCard key={`${q.askedBy}-${q.order}`} entry={q} accentColor={accentColor} />
        ))}
      </div>
    </div>
  );
}

function QuizEntryCard({ entry, accentColor }: { entry: QuizEntry; accentColor: string }) {
  const [expanded, setExpanded] = useState(false);
  const tierColor  = TIER_COLOR[entry.tier];
  const scored     = entry.score != null;
  const scoreColor = !scored ? "var(--text-dim)"
                   : entry.score === entry.marks ? "#44ff88"
                   : entry.score === 0 ? "#ff4444"
                   : "var(--amber)";

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{ cursor: "pointer", border: `1px solid rgba(255,255,255,0.06)`, borderRadius: "3px", overflow: "hidden" }}
    >
      {/* Row header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "rgba(255,255,255,0.02)" }}>
        <span style={{ fontSize: "9px", letterSpacing: "2px", color: tierColor, minWidth: "50px" }}>
          {TIER_LABEL[entry.tier]}
        </span>
        <span style={{ flex: 1, fontSize: "11px", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.question}
        </span>
        <span style={{ fontFamily: "var(--font-hud)", fontSize: "14px", color: scoreColor, minWidth: "44px", textAlign: "right", whiteSpace: "nowrap" }}>
          {scored ? `${entry.score}/${entry.marks}` : `—/${entry.marks}`}
        </span>
        <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: "11px", lineHeight: 1.7 }}>
          <div style={{ marginBottom: "8px" }}>
            <div style={{ fontSize: "9px", letterSpacing: "2px", color: tierColor, marginBottom: "4px" }}>QUESTION</div>
            <div style={{ color: "var(--text)" }}>{entry.question}</div>
          </div>

          {entry.givenAnswer && (
            <div style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "2px", color: accentColor, marginBottom: "4px" }}>
                ANSWER BY {entry.askedToModel.split("-")[0].toUpperCase()}
              </div>
              <div style={{ color: "var(--text-dim)", whiteSpace: "pre-wrap" }}>{entry.givenAnswer}</div>
            </div>
          )}

          {entry.expectedAnswer && (
            <div style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(255,255,255,0.25)", marginBottom: "4px" }}>EXPECTED</div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>{entry.expectedAnswer}</div>
            </div>
          )}

          {entry.gradingFeedback && (
            <div style={{ padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: "2px", borderLeft: `2px solid ${scoreColor}`, fontSize: "10px", color: "var(--text-dim)", fontStyle: "italic" }}>
              ◈ {entry.gradingFeedback}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
