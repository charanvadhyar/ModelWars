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

  // Redirect if not admin
  useEffect(() => {
    if (!loading && (!user || user.role !== "ADMIN")) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, matchesRes, pastRes, usersRes] = await Promise.all([
        authFetch("/api/admin/stats"),
        authFetch("/api/matches"),
        authFetch("/api/matches/history?status=COMPLETED&limit=50"),
        authFetch("/api/admin/users"),
      ]);
      if (statsRes.ok)   setStats(await statsRes.json());
      if (matchesRes.ok) setActiveMatches((await matchesRes.json()).matches ?? []);
      if (pastRes.ok)    setPastMatches((await pastRes.json()).matches ?? []);
      if (usersRes.ok)   setUsers((await usersRes.json()).users ?? []);
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
    </div>
  );
}
