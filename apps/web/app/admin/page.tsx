"use client";
// app/admin/page.tsx

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";

// ── Available models ──────────────────────────────────────────────────────────
const CLAUDE_MODELS = [
  { id: "claude-opus-4-6",          label: "Claude Opus 4.6"    },
  { id: "claude-sonnet-4-6",        label: "Claude Sonnet 4.6"  },
  { id: "claude-haiku-4-5-20251001",label: "Claude Haiku 4.5"   },
];

const GPT_MODELS = [
  { id: "gpt-4o-2024-08-06",        label: "GPT-4o"             },
  { id: "gpt-4o-mini-2024-07-18",   label: "GPT-4o mini"        },
  { id: "o3-mini-2025-01-31",       label: "o3-mini"            },
];

const ALL_MODELS = [...CLAUDE_MODELS, ...GPT_MODELS];

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

const QUIZ_PHASE_LABEL: Record<string, string> = {
  PREPARING:   "PREPARING",
  ANSWERING_B: "LIVE",
  ANSWERING_A: "LIVE",
  COMPLETED:   "COMPLETE",
};

const QUIZ_PHASE_COLOR: Record<string, string> = {
  PREPARING:   "var(--amber)",
  ANSWERING_B: "#44ff88",
  ANSWERING_A: "#44ff88",
  COMPLETED:   "var(--text-dim)",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, accent = "var(--text-mid)" }: {
  label: string; value: string | number; accent?: string;
}) {
  return (
    <div style={{
      padding: "16px", background: "var(--bg2)",
      border: "1px solid var(--grid-line)", borderRadius: "4px",
    }}>
      <div style={{ fontSize: "8px", letterSpacing: "3px", color: "var(--text-dim)",
        marginBottom: "8px" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-vt)", fontSize: "36px",
        color: accent, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      fontFamily: "var(--font-hud)", fontSize: "10px", fontWeight: 700,
      letterSpacing: "4px", color: "var(--text-dim)",
      borderBottom: "1px solid var(--grid-line)", paddingBottom: "8px",
      marginBottom: "12px",
    }}>{title}</div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, loading, logout, authFetch } = useAuth();
  const router = useRouter();

  const [stats,           setStats]           = useState<any>(null);
  const [activeMatches,   setActiveMatches]   = useState<any[]>([]);
  const [pastMatches,     setPastMatches]     = useState<any[]>([]);
  const [users,           setUsers]           = useState<any[]>([]);
  const [modelA,          setModelA]          = useState(CLAUDE_MODELS[1].id);
  const [modelB,          setModelB]          = useState(GPT_MODELS[0].id);
  const [launching,       setLaunching]       = useState(false);
  const [launchError,     setLaunchError]     = useState("");
  const [launchSuccess,   setLaunchSuccess]   = useState("");
  const [downloading,     setDownloading]     = useState<string | null>(null);

  // Quiz state
  const [quizzes,         setQuizzes]         = useState<any[]>([]);
  const [quizModelA,      setQuizModelA]      = useState(CLAUDE_MODELS[1].id);
  const [quizModelB,      setQuizModelB]      = useState(GPT_MODELS[0].id);
  const [quizTopic,       setQuizTopic]       = useState("");
  const [quizLaunching,   setQuizLaunching]   = useState(false);
  const [quizError,       setQuizError]       = useState("");
  const [quizSuccess,     setQuizSuccess]     = useState("");

  // Redirect if not admin
  useEffect(() => {
    if (!loading && (!user || user.role !== "ADMIN")) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, matchesRes, pastRes, usersRes, quizzesRes] = await Promise.all([
        authFetch("/api/admin/stats"),
        authFetch("/api/matches"),
        authFetch("/api/matches/history?status=COMPLETED&limit=50"),
        authFetch("/api/admin/users"),
        fetch((process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:3001") + "/api/quiz"),
      ]);
      if (statsRes.ok)   setStats(await statsRes.json());
      if (matchesRes.ok) setActiveMatches((await matchesRes.json()).matches ?? []);
      if (pastRes.ok)    setPastMatches((await pastRes.json()).matches ?? []);
      if (usersRes.ok)   setUsers((await usersRes.json()).users ?? []);
      if (quizzesRes.ok) setQuizzes((await quizzesRes.json()).quizzes ?? []);
    } catch {}
  }, [authFetch]);

  const downloadTranscript = useCallback(async (matchId: string, modelA: string, modelB: string) => {
    setDownloading(matchId);
    try {
      const res = await authFetch(`/api/matches/${matchId}/transcript`);
      if (!res.ok) { alert("Transcript not available for this match."); return; }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data.fullJson ?? data, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `match-${matchId.slice(0, 8)}-transcript.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download transcript.");
    } finally {
      setDownloading(null);
    }
  }, [authFetch]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadData();
      const id = setInterval(loadData, 10_000);
      return () => clearInterval(id);
    }
  }, [user, loadData]);

  const launchMatch = async () => {
    if (modelA === modelB) { setLaunchError("Select two different models."); return; }
    setLaunching(true); setLaunchError(""); setLaunchSuccess("");
    try {
      const res = await authFetch("/api/matches", {
        method: "POST",
        body: JSON.stringify({ modelA, modelB }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLaunchSuccess(`Match launched — ID: ${data.matchId}`);
      loadData();
      // Navigate to the new match after a short delay
      setTimeout(() => router.push(`/match/${data.matchId}`), 1200);
    } catch (e: any) {
      setLaunchError(e.message);
    } finally {
      setLaunching(false);
    }
  };

  const launchQuiz = async () => {
    if (!quizTopic.trim()) { setQuizError("Topic is required."); return; }
    if (quizModelA === quizModelB) { setQuizError("Select two different models."); return; }
    setQuizLaunching(true); setQuizError(""); setQuizSuccess("");
    try {
      const res = await authFetch("/api/quiz", {
        method: "POST",
        body: JSON.stringify({ modelA: quizModelA, modelB: quizModelB, topic: quizTopic.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuizSuccess(`Quiz launched — ID: ${data.quizId}`);
      setQuizTopic("");
      loadData();
      setTimeout(() => router.push(`/quiz/${data.quizId}`), 1200);
    } catch (e: any) {
      setQuizError(e.message);
    } finally {
      setQuizLaunching(false);
    }
  };

  const abortMatch = async (matchId: string) => {
    await authFetch(`/api/matches/${matchId}`, { method: "DELETE" });
    loadData();
  };

  const setUserRole = async (userId: string, role: "ADMIN" | "SPECTATOR") => {
    await authFetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    loadData();
  };

  if (loading || !user) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", color: "var(--text-dim)", fontFamily: "var(--font-mono)",
      fontSize: "12px", letterSpacing: "3px" }}>
      AUTHENTICATING...
    </div>
  );

  const selectStyle: React.CSSProperties = {
    flex: 1, padding: "8px 12px",
    background: "var(--bg3)", border: "1px solid var(--grid-line)",
    borderRadius: "3px", color: "var(--text)",
    fontFamily: "var(--font-mono)", fontSize: "12px", cursor: "pointer",
  };

  return (
    <div style={{ minHeight: "100vh", maxWidth: "1100px", margin: "0 auto",
      padding: "24px", display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "var(--font-hud)", fontSize: "9px", letterSpacing: "6px",
            color: "var(--text-dim)", marginBottom: "4px" }}>OPERATIONS CENTER</div>
          <h1 style={{
            fontFamily: "var(--font-hud)", fontSize: "22px", fontWeight: 900,
            letterSpacing: "3px",
            background: "linear-gradient(90deg, var(--amber), var(--cyan))",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            ADMIN DASHBOARD
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "10px", color: "var(--text-dim)", letterSpacing: "1px" }}>
            {user.email}
          </span>
          <button onClick={logout} style={{
            padding: "7px 14px", background: "transparent",
            border: "1px solid var(--grid-line)", borderRadius: "3px",
            color: "var(--text-dim)", fontFamily: "var(--font-mono)",
            fontSize: "10px", letterSpacing: "2px", cursor: "pointer",
          }}>
            LOGOUT
          </button>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      {stats && (
        <section>
          <SectionHeader title="ARENA STATISTICS" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
            <StatCard label="TOTAL MATCHES"     value={stats.totalMatches}     />
            <StatCard label="COMPLETED"         value={stats.completedMatches} />
            <StatCard label="ACTIVE NOW"        value={activeMatches.length}   accent="var(--amber)" />
            <StatCard label="TOTAL COST (USD)"  value={`$${(stats.totalCostUsd ?? 0).toFixed(3)}`} accent="var(--cyan)" />
          </div>
        </section>
      )}

      {/* ── Launch match ─────────────────────────────────────────────────── */}
      <section>
        <SectionHeader title="LAUNCH MATCH" />
        <div style={{
          padding: "20px", background: "var(--bg2)",
          border: "1px solid var(--amber-dim)", borderRadius: "4px",
          display: "flex", flexDirection: "column", gap: "14px",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "12px",
            alignItems: "center" }}>

            {/* Model A */}
            <div>
              <div style={{ fontSize: "8px", letterSpacing: "3px", color: "var(--amber)",
                marginBottom: "6px" }}>PLAYER A — CLAUDE SLOT</div>
              <select value={modelA} onChange={(e) => setModelA(e.target.value)} style={{
                ...selectStyle, borderColor: "var(--amber-dim)", color: "var(--amber)" }}>
                {ALL_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            <div style={{ fontFamily: "var(--font-hud)", fontSize: "20px", fontWeight: 900,
              color: "var(--text-dim)", textAlign: "center" }}>VS</div>

            {/* Model B */}
            <div>
              <div style={{ fontSize: "8px", letterSpacing: "3px", color: "var(--cyan)",
                marginBottom: "6px" }}>PLAYER B — GPT SLOT</div>
              <select value={modelB} onChange={(e) => setModelB(e.target.value)} style={{
                ...selectStyle, borderColor: "var(--cyan-dim)", color: "var(--cyan)" }}>
                {ALL_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {launchError && (
            <div style={{ padding: "8px 12px", background: "rgba(80,0,0,0.4)",
              border: "1px solid #600000", borderRadius: "3px",
              fontSize: "11px", color: "#ff6060" }}>⚠ {launchError}</div>
          )}
          {launchSuccess && (
            <div style={{ padding: "8px 12px", background: "rgba(0,60,0,0.4)",
              border: "1px solid #006000", borderRadius: "3px",
              fontSize: "11px", color: "#40ff80", letterSpacing: "1px" }}>
              ✓ {launchSuccess}
            </div>
          )}

          <button onClick={launchMatch} disabled={launching} style={{
            padding: "12px 24px", alignSelf: "flex-start",
            background: launching ? "var(--bg3)" : "var(--amber-glow)",
            border: `1px solid ${launching ? "var(--grid-line)" : "var(--amber-dim)"}`,
            borderRadius: "3px",
            color: launching ? "var(--text-dim)" : "var(--amber)",
            fontFamily: "var(--font-mono)", fontSize: "12px",
            letterSpacing: "3px", cursor: launching ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}>
            {launching ? "LAUNCHING..." : "▶ LAUNCH MATCH"}
          </button>
        </div>
      </section>

      {/* ── Active matches ───────────────────────────────────────────────── */}
      <section>
        <SectionHeader title={`ACTIVE MATCHES (${activeMatches.length})`} />
        {activeMatches.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center",
            border: "1px solid var(--grid-line)", borderRadius: "4px",
            fontSize: "11px", color: "var(--text-dim)", letterSpacing: "2px" }}>
            NO ACTIVE MATCHES
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {activeMatches.map((m) => (
              <div key={m.matchId} style={{
                display: "grid", gridTemplateColumns: "1fr auto auto auto",
                gap: "16px", alignItems: "center",
                padding: "10px 14px", background: "var(--bg2)",
                border: "1px solid var(--grid-line)", borderRadius: "4px",
              }}>
                <div>
                  <span style={{ color: "var(--amber)", fontFamily: "var(--font-hud)",
                    fontSize: "11px" }}>{m.modelA}</span>
                  <span style={{ color: "var(--text-dim)", margin: "0 8px", fontSize: "10px" }}>vs</span>
                  <span style={{ color: "var(--cyan)", fontFamily: "var(--font-hud)",
                    fontSize: "11px" }}>{m.modelB}</span>
                </div>
                <span style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "1px" }}>
                  {m.matchId.slice(0, 8).toUpperCase()}
                </span>
                <a href={`/match/${m.matchId}`} style={{
                  fontSize: "10px", letterSpacing: "1px", padding: "4px 10px",
                  border: "1px solid var(--cyan-dim)", borderRadius: "2px",
                  color: "var(--cyan)", textDecoration: "none",
                }}>WATCH</a>
                <button onClick={() => abortMatch(m.matchId)} style={{
                  fontSize: "10px", letterSpacing: "1px", padding: "4px 10px",
                  border: "1px solid #600000", borderRadius: "2px",
                  color: "#ff4444", background: "transparent", cursor: "pointer",
                }}>ABORT</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Past matches ─────────────────────────────────────────────────── */}
      <section>
        <SectionHeader title={`PAST MATCHES (${pastMatches.length})`} />
        {pastMatches.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center",
            border: "1px solid var(--grid-line)", borderRadius: "4px",
            fontSize: "11px", color: "var(--text-dim)", letterSpacing: "2px" }}>
            NO COMPLETED MATCHES
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {pastMatches.map((m) => (
              <div key={m.id} style={{
                display: "grid", gridTemplateColumns: "1fr auto auto auto auto",
                gap: "12px", alignItems: "center",
                padding: "10px 14px", background: "var(--bg2)",
                border: "1px solid var(--grid-line)", borderRadius: "4px",
              }}>
                <div>
                  <span style={{ color: "var(--amber)", fontFamily: "var(--font-hud)", fontSize: "11px" }}>{m.modelA}</span>
                  <span style={{ color: "var(--text-dim)", margin: "0 8px", fontSize: "10px" }}>vs</span>
                  <span style={{ color: "var(--cyan)", fontFamily: "var(--font-hud)", fontSize: "11px" }}>{m.modelB}</span>
                </div>
                <span style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "1px" }}>
                  {(m.id ?? "").slice(0, 8).toUpperCase()}
                </span>
                {m.winner && (
                  <span style={{
                    fontSize: "9px", letterSpacing: "1px", padding: "2px 8px",
                    borderRadius: "2px",
                    color: m.winner === "A" ? "var(--amber)" : "var(--cyan)",
                    border: `1px solid ${m.winner === "A" ? "var(--amber-dim)" : "var(--cyan-dim)"}`,
                  }}>
                    {m.winner === "A" ? m.modelA : m.modelB} WINS
                  </span>
                )}
                <a href={`/match/${m.id}`} style={{
                  fontSize: "10px", letterSpacing: "1px", padding: "4px 10px",
                  border: "1px solid var(--cyan-dim)", borderRadius: "2px",
                  color: "var(--cyan)", textDecoration: "none",
                }}>REPLAY</a>
                <button
                  onClick={() => downloadTranscript(m.id, m.modelA, m.modelB)}
                  disabled={downloading === (m.id)}
                  style={{
                    fontSize: "10px", letterSpacing: "1px", padding: "4px 10px",
                    border: "1px solid #105030", borderRadius: "2px",
                    color: downloading === (m.id) ? "var(--text-dim)" : "#40cc80",
                    background: "transparent", cursor: "pointer",
                  }}
                >
                  {downloading === (m.id) ? "..." : "▼ LOG"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Launch quiz ──────────────────────────────────────────────────── */}
      <section>
        <SectionHeader title="LAUNCH QUIZ" />
        <div style={{
          padding: "20px", background: "var(--bg2)",
          border: "1px solid rgba(255,68,136,0.3)", borderRadius: "4px",
          display: "flex", flexDirection: "column", gap: "14px",
        }}>
          {/* Topic */}
          <div>
            <div style={{ fontSize: "8px", letterSpacing: "3px", color: "#ff4488", marginBottom: "6px" }}>TOPIC</div>
            <input
              value={quizTopic}
              onChange={e => setQuizTopic(e.target.value)}
              placeholder="e.g. Quantum Physics"
              style={{
                width: "100%", background: "var(--bg3)", border: "1px solid rgba(255,68,136,0.3)",
                borderRadius: "3px", padding: "8px 12px", color: "var(--text)",
                fontFamily: "var(--font-mono)", fontSize: "13px", boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "8px" }}>
              {SUGGESTED_TOPICS.map(t => (
                <button key={t} onClick={() => setQuizTopic(t)} style={{
                  fontSize: "9px", padding: "3px 8px",
                  background: "transparent", border: "1px solid var(--grid-line)",
                  borderRadius: "2px", color: "var(--text-dim)", cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Models */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "12px", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "8px", letterSpacing: "3px", color: "var(--amber)", marginBottom: "6px" }}>PLAYER A</div>
              <select value={quizModelA} onChange={e => setQuizModelA(e.target.value)} style={{ ...selectStyle, borderColor: "var(--amber-dim)", color: "var(--amber)" }}>
                {ALL_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div style={{ fontFamily: "var(--font-hud)", fontSize: "20px", fontWeight: 900, color: "var(--text-dim)", textAlign: "center" }}>VS</div>
            <div>
              <div style={{ fontSize: "8px", letterSpacing: "3px", color: "var(--cyan)", marginBottom: "6px" }}>PLAYER B</div>
              <select value={quizModelB} onChange={e => setQuizModelB(e.target.value)} style={{ ...selectStyle, borderColor: "var(--cyan-dim)", color: "var(--cyan)" }}>
                {ALL_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {quizError && (
            <div style={{ padding: "8px 12px", background: "rgba(80,0,0,0.4)", border: "1px solid #600000", borderRadius: "3px", fontSize: "11px", color: "#ff6060" }}>⚠ {quizError}</div>
          )}
          {quizSuccess && (
            <div style={{ padding: "8px 12px", background: "rgba(0,60,0,0.4)", border: "1px solid #006000", borderRadius: "3px", fontSize: "11px", color: "#40ff80", letterSpacing: "1px" }}>✓ {quizSuccess}</div>
          )}

          <button onClick={launchQuiz} disabled={quizLaunching} style={{
            padding: "12px 24px", alignSelf: "flex-start",
            background: quizLaunching ? "var(--bg3)" : "rgba(255,68,136,0.1)",
            border: `1px solid ${quizLaunching ? "var(--grid-line)" : "rgba(255,68,136,0.4)"}`,
            borderRadius: "3px",
            color: quizLaunching ? "var(--text-dim)" : "#ff4488",
            fontFamily: "var(--font-mono)", fontSize: "12px",
            letterSpacing: "3px", cursor: quizLaunching ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}>
            {quizLaunching ? "LAUNCHING..." : "▶ LAUNCH QUIZ"}
          </button>
        </div>
      </section>

      {/* ── Quiz history ─────────────────────────────────────────────────── */}
      <section>
        <SectionHeader title={`QUIZZES (${quizzes.length})`} />
        {quizzes.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", border: "1px solid var(--grid-line)", borderRadius: "4px", fontSize: "11px", color: "var(--text-dim)", letterSpacing: "2px" }}>
            NO QUIZZES YET
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {quizzes.map((q: any) => {
              const isLive = q.status === "ANSWERING_A" || q.status === "ANSWERING_B" || q.status === "PREPARING";
              return (
                <div key={q.id} style={{
                  display: "grid", gridTemplateColumns: "1fr auto auto auto auto",
                  gap: "12px", alignItems: "center",
                  padding: "10px 14px", background: "var(--bg2)",
                  border: `1px solid ${isLive ? "rgba(255,68,136,0.2)" : "var(--grid-line)"}`,
                  borderRadius: "4px",
                }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text)", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {q.topic}
                    </div>
                    <div style={{ fontSize: "9px", color: "var(--text-dim)" }}>
                      <span style={{ color: "var(--amber)" }}>{q.modelA.split("-")[0]}</span>
                      {" vs "}
                      <span style={{ color: "var(--cyan)" }}>{q.modelB.split("-")[0]}</span>
                    </div>
                  </div>

                  {q.status === "COMPLETED" && q.scoreA != null && (
                    <div style={{ fontFamily: "var(--font-hud)", fontSize: "14px", whiteSpace: "nowrap" }}>
                      <span style={{ color: "var(--amber)" }}>{q.scoreA}</span>
                      <span style={{ color: "var(--text-dim)", margin: "0 4px" }}>—</span>
                      <span style={{ color: "var(--cyan)" }}>{q.scoreB}</span>
                    </div>
                  )}

                  <span style={{
                    fontSize: "9px", letterSpacing: "1px", padding: "2px 8px",
                    borderRadius: "2px",
                    color: QUIZ_PHASE_COLOR[q.status] ?? "var(--text-dim)",
                    border: `1px solid ${QUIZ_PHASE_COLOR[q.status] ?? "var(--grid-line)"}22`,
                    animation: isLive ? "pulseDot 1.5s infinite" : "none",
                  }}>
                    {QUIZ_PHASE_LABEL[q.status] ?? q.status}
                  </span>

                  <span style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "1px" }}>
                    {q.id.slice(0, 8).toUpperCase()}
                  </span>

                  <a href={`/quiz/${q.id}`} style={{
                    fontSize: "10px", letterSpacing: "1px", padding: "4px 10px",
                    border: "1px solid rgba(255,68,136,0.3)", borderRadius: "2px",
                    color: "#ff4488", textDecoration: "none",
                  }}>
                    {isLive ? "WATCH" : "REVIEW"}
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── User management ─────────────────────────────────────────────── */}
      <section>
        <SectionHeader title={`USERS (${users.length})`} />
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {users.map((u) => (
            <div key={u.id} style={{
              display: "grid", gridTemplateColumns: "1fr auto auto",
              gap: "16px", alignItems: "center",
              padding: "8px 14px", background: "var(--bg2)",
              border: "1px solid var(--grid-line)", borderRadius: "4px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "11px", color: "var(--text)" }}>{u.email}</span>
                {u.id === user.id && (
                  <span style={{ fontSize: "8px", color: "var(--amber)",
                    letterSpacing: "1px" }}>YOU</span>
                )}
              </div>
              <span style={{
                fontSize: "9px", letterSpacing: "1px", padding: "2px 8px",
                borderRadius: "2px",
                color: u.role === "ADMIN" ? "var(--amber)" : "var(--text-dim)",
                border: `1px solid ${u.role === "ADMIN" ? "var(--amber-dim)" : "var(--grid-line)"}`,
                background: u.role === "ADMIN" ? "var(--amber-glow)" : "transparent",
              }}>
                {u.role}
              </span>
              {u.id !== user.id && (
                <button
                  onClick={() => setUserRole(u.id, u.role === "ADMIN" ? "SPECTATOR" : "ADMIN")}
                  style={{
                    fontSize: "9px", letterSpacing: "1px", padding: "3px 10px",
                    border: "1px solid var(--grid-line)", borderRadius: "2px",
                    background: "transparent", color: "var(--text-dim)", cursor: "pointer",
                  }}
                >
                  {u.role === "ADMIN" ? "DEMOTE" : "PROMOTE"}
                </button>
              )}
              {u.id === user.id && <div />}
            </div>
          ))}
        </div>
      </section>

      {/* ── Model win stats ──────────────────────────────────────────────── */}
      {stats?.modelWinCounts?.length > 0 && (
        <section>
          <SectionHeader title="WIN RECORDS" />
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {stats.modelWinCounts.map((row: any, i: number) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 1fr auto auto",
                gap: "12px", alignItems: "center",
                padding: "8px 14px", background: "var(--bg2)",
                border: "1px solid var(--grid-line)", borderRadius: "4px",
                fontSize: "10px",
              }}>
                <span style={{ color: "var(--amber)" }}>{row.modelA}</span>
                <span style={{ color: "var(--cyan)" }}>{row.modelB}</span>
                <span style={{ color: row.winner === "A" ? "var(--amber)" : "var(--cyan)",
                  fontFamily: "var(--font-hud)", fontSize: "10px" }}>
                  PLAYER {row.winner} WINS
                </span>
                <span style={{ fontFamily: "var(--font-vt)", fontSize: "22px",
                  color: "var(--text-dim)" }}>{row.wins}×</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <style>{`@keyframes pulseDot{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}
