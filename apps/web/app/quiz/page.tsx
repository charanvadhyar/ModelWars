"use client";
// app/quiz/page.tsx — Quiz Arena listing + admin launch panel

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "../../hooks/useAuth";
import { useRouter } from "next/navigation";

const SERVER = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:3001";

const MODELS = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "gpt-4o",
  "gpt-4o-mini-2024-07-18",
];

const SUGGESTED_TOPICS = [
  "Machine Learning & Neural Networks",
  "World History 1900–2000",
  "Quantum Physics",
  "Philosophy of Mind",
  "Climate Science",
  "Mathematics & Number Theory",
  "Evolutionary Biology",
  "Computer Science Fundamentals",
  "Economics & Game Theory",
  "Astronomy & Cosmology",
];

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
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const [quizzes, setQuizzes]     = useState<any[]>([]);
  const [modelA, setModelA]       = useState(MODELS[0]);
  const [modelB, setModelB]       = useState(MODELS[4]);
  const [topic, setTopic]         = useState("");
  const [launching, setLaunching] = useState(false);
  const [error, setError]         = useState("");

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

  const handleLaunch = async () => {
    if (!topic.trim()) { setError("Topic is required."); return; }
    if (modelA === modelB) { setError("Models must be different."); return; }
    setLaunching(true);
    setError("");
    try {
      const res = await authFetch(`${SERVER}/api/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelA, modelB, topic: topic.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to launch quiz."); return; }
      router.push(`/quiz/${data.quizId}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLaunching(false);
    }
  };

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

        {/* Admin launch panel */}
        {user?.role === "ADMIN" && (
          <div style={{ border: "1px solid rgba(255,68,136,0.3)", borderRadius: "4px", padding: "20px", background: "rgba(255,68,136,0.04)" }}>
            <div style={{ fontSize: "10px", letterSpacing: "4px", color: "#ff4488", marginBottom: "16px" }}>LAUNCH QUIZ</div>

            {/* Topic input */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--text-dim)", marginBottom: "6px" }}>TOPIC</div>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. Quantum Physics"
                style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "3px", padding: "8px 12px", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "13px", boxSizing: "border-box" }}
              />
              {/* Suggested topics */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {SUGGESTED_TOPICS.map(t => (
                  <button key={t} onClick={() => setTopic(t)} style={{ fontSize: "9px", padding: "3px 8px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "2px", color: "var(--text-dim)", cursor: "pointer", fontFamily: "var(--font-mono)" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Model selectors */}
            <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
              {[
                { label: "PLAYER A", value: modelA, set: setModelA, color: "var(--amber)" },
                { label: "PLAYER B", value: modelB, set: setModelB, color: "var(--cyan)" },
              ].map(({ label, value, set, color }) => (
                <div key={label} style={{ flex: 1 }}>
                  <div style={{ fontSize: "9px", letterSpacing: "2px", color, marginBottom: "6px" }}>{label}</div>
                  <select value={value} onChange={e => set(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${color}44`, borderRadius: "3px", padding: "7px 10px", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                    {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {error && <div style={{ fontSize: "11px", color: "#ff4444", marginBottom: "10px" }}>⚠ {error}</div>}

            <button
              onClick={handleLaunch}
              disabled={launching}
              style={{ width: "100%", padding: "10px", background: launching ? "rgba(255,68,136,0.1)" : "rgba(255,68,136,0.15)", border: "1px solid rgba(255,68,136,0.4)", borderRadius: "3px", color: "#ff4488", fontFamily: "var(--font-mono)", fontSize: "12px", letterSpacing: "3px", cursor: launching ? "not-allowed" : "pointer" }}
            >
              {launching ? "LAUNCHING..." : "START QUIZ"}
            </button>
          </div>
        )}

        {/* Quiz history */}
        <div>
          <div style={{ fontSize: "9px", letterSpacing: "4px", color: "var(--text-dim)", marginBottom: "12px" }}>RECENT QUIZZES</div>
          {quizzes.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--text-dim)", textAlign: "center", padding: "24px" }}>No quizzes yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {quizzes.map((q: any) => (
                <Link key={q.id} href={`/quiz/${q.id}`} style={{ textDecoration: "none" }}>
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
