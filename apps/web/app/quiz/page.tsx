"use client";
// app/quiz/page.tsx — Quiz Arena listing (spectator view)

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const SERVER = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:3001";

const PHASE_LABEL: Record<string, string> = {
  PREPARING:   "PREPARING",
  ANSWERING_B: "IN PROGRESS",
  ANSWERING_A: "IN PROGRESS",
  COMPLETED:   "COMPLETE",
};

const PHASE_COLOR: Record<string, string> = {
  PREPARING:   "var(--amber)",
  ANSWERING_B: "#44ff88",
  ANSWERING_A: "#44ff88",
  COMPLETED:   "var(--text-dim)",
};

export default function QuizListPage() {
  const [quizzes, setQuizzes] = useState<any[]>([]);

  const loadQuizzes = useCallback(async () => {
    const res = await fetch(`${SERVER}/api/quiz`);
    if (res.ok) {
      const data = await res.json();
      setQuizzes(data.quizzes ?? []);
    }
  }, []);

  useEffect(() => {
    loadQuizzes();
    const interval = setInterval(loadQuizzes, 8000);
    return () => clearInterval(interval);
  }, [loadQuizzes]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-mono)", padding: "24px 20px" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <Link href="/" style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--text-dim)", textDecoration: "none" }}>← MODEL WARS</Link>
        <h1 style={{ fontFamily: "var(--font-hud)", fontSize: "32px", fontWeight: 900, letterSpacing: "4px", background: "linear-gradient(90deg, var(--amber), #ff4488)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", margin: "8px 0 4px" }}>
          QUIZ ARENA
        </h1>
        <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--text-dim)" }}>
          10 QUESTIONS · 3 TIERS · HIGHEST SCORE WINS
        </div>
      </div>

      <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Tier legend */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
          {[
            { tier: "TIER I",   marks: "1 MARK",  count: "4×", color: "var(--cyan)" },
            { tier: "TIER II",  marks: "2 MARKS", count: "4×", color: "var(--amber)" },
            { tier: "TIER III", marks: "3 MARKS", count: "2×", color: "#ff4488" },
          ].map(t => (
            <div key={t.tier} style={{ flex: 1, padding: "10px", border: `1px solid ${t.color}33`, borderRadius: "3px", textAlign: "center" }}>
              <div style={{ fontSize: "9px", letterSpacing: "3px", color: t.color }}>{t.tier}</div>
              <div style={{ fontFamily: "var(--font-hud)", fontSize: "18px", color: t.color, margin: "4px 0" }}>{t.count}</div>
              <div style={{ fontSize: "9px", color: "var(--text-dim)" }}>{t.marks}</div>
            </div>
          ))}
        </div>

        {/* Quiz listing */}
        <div>
          <div style={{ fontSize: "9px", letterSpacing: "4px", color: "var(--text-dim)", marginBottom: "12px" }}>RECENT QUIZZES</div>
          {quizzes.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--text-dim)", textAlign: "center", padding: "24px" }}>No quizzes yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {quizzes.map((q: any) => (
                <Link key={q.id} href={q.status === "COMPLETED" ? `/blog/quiz/${q.id}` : `/quiz/${q.id}`} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "3px", background: "rgba(255,255,255,0.01)", cursor: "pointer" }}>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: "12px", color: "var(--text)", marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.topic}</div>
                      <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>{q.modelA} vs {q.modelB}</div>
                    </div>
                    {q.status === "COMPLETED" && q.scoreA != null && (
                      <div style={{ fontFamily: "var(--font-hud)", fontSize: "16px", whiteSpace: "nowrap" }}>
                        <span style={{ color: "var(--amber)" }}>{q.scoreA}</span>
                        <span style={{ color: "var(--text-dim)", margin: "0 6px" }}>—</span>
                        <span style={{ color: "var(--cyan)" }}>{q.scoreB}</span>
                      </div>
                    )}
                    <div style={{ fontSize: "9px", letterSpacing: "2px", color: PHASE_COLOR[q.status] ?? "var(--text-dim)", minWidth: "70px", textAlign: "right" }}>
                      {PHASE_LABEL[q.status] ?? q.status}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
