"use client";
// app/blog/match/[id]/page.tsx — Full battleship match post

import { useState, useEffect } from "react";
import Link from "next/link";

const SERVER = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:3001";

interface TurnEntry {
  turnNumber: number;
  player: "A" | "B";
  model: string;
  coord: string;
  result: string;
  shipSunkId: string | null;
  reasoning: string;
  strategyTag: string | null;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

interface MatchSummary {
  id: string;
  modelA: string;
  modelB: string;
  winner: string | null;
  totalTurns?: number;
  durationMs?: number;
  createdAt: string;
  completedAt: string | null;
}

interface PostData {
  match: MatchSummary;
  turns: TurnEntry[];
}

interface Params { params: { id: string } }

const RESULT_COLOR: Record<string, string> = {
  HIT:  "var(--amber)",
  MISS: "var(--text-dim)",
  SUNK: "#ff4488",
};

export default function BattleshipPostPage({ params }: Params) {
  const matchId = params.id;
  const [data, setData]       = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    fetch(`${SERVER}/api/blog/match/${matchId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [matchId]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "3px", fontSize: "11px", animation: "pulseDot 1.2s infinite" }}>
      LOADING MATCH DATA...
      <style>{`@keyframes pulseDot{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", color: "#ff4444", fontSize: "12px" }}>
      {error || "Match not found."}
    </div>
  );

  const { match, turns } = data;
  const durationSec = match.durationMs ? Math.round(match.durationMs / 1000) : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-mono)", padding: "24px 20px" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>

        <Link href="/blog" style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--text-dim)", textDecoration: "none" }}>
          ← INTELLIGENCE LOG
        </Link>

        {/* Header */}
        <div style={{ margin: "16px 0 24px", paddingBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: "9px", letterSpacing: "3px", color: "var(--amber)", marginBottom: "8px" }}>BATTLESHIP · MATCH TRANSCRIPT</div>
          <h1 style={{ fontFamily: "var(--font-hud)", fontSize: "20px", fontWeight: 900, letterSpacing: "3px", color: "var(--text)", margin: "0 0 12px" }}>
            {match.modelA.split("-").slice(0,2).join("-").toUpperCase()} vs {match.modelB.split("-").slice(0,2).join("-").toUpperCase()}
          </h1>

          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "2px", marginBottom: "2px" }}>RESULT</div>
              <div style={{ fontSize: "13px", color: match.winner === "A" ? "var(--amber)" : match.winner === "B" ? "var(--cyan)" : "var(--text-dim)" }}>
                {match.winner === "A" ? `${match.modelA.split("-")[0].toUpperCase()} WINS`
                 : match.winner === "B" ? `${match.modelB.split("-")[0].toUpperCase()} WINS`
                 : match.winner === "TIE" ? "DRAW"
                 : "—"}
              </div>
            </div>
            {match.totalTurns != null && (
              <div>
                <div style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "2px", marginBottom: "2px" }}>TURNS</div>
                <div style={{ fontFamily: "var(--font-hud)", fontSize: "20px", color: "var(--amber)" }}>{match.totalTurns}</div>
              </div>
            )}
            {durationSec != null && (
              <div>
                <div style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "2px", marginBottom: "2px" }}>DURATION</div>
                <div style={{ fontSize: "13px", color: "var(--text)" }}>{durationSec}s</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "2px", marginBottom: "2px" }}>DATE</div>
              <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                {new Date(match.completedAt ?? match.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Turn-by-turn log */}
        <div style={{ fontSize: "9px", letterSpacing: "4px", color: "var(--text-dim)", marginBottom: "12px" }}>
          TURN LOG · {turns.length} MOVES
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {turns.map(turn => (
            <TurnCard key={turn.turnNumber} turn={turn} modelA={match.modelA} modelB={match.modelB} />
          ))}
        </div>
      </div>

      <style>{`@keyframes pulseDot{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}

function TurnCard({ turn, modelA, modelB }: { turn: TurnEntry; modelA: string; modelB: string }) {
  const [expanded, setExpanded] = useState(false);
  const playerColor = turn.player === "A" ? "var(--amber)" : "var(--cyan)";
  const resultColor = RESULT_COLOR[turn.result] ?? "var(--text-dim)";
  const shortModel  = turn.model.split("-").slice(0, 2).join("-");

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{ cursor: "pointer", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "rgba(255,255,255,0.02)" }}>
        <span style={{ fontFamily: "var(--font-hud)", fontSize: "13px", color: "var(--text-dim)", minWidth: "28px" }}>
          #{turn.turnNumber}
        </span>
        <span style={{ fontSize: "9px", letterSpacing: "2px", color: playerColor, minWidth: "52px" }}>
          PLAYER {turn.player}
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-dim)", minWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {shortModel}
        </span>
        <span style={{ fontFamily: "var(--font-hud)", fontSize: "14px", color: playerColor, minWidth: "36px" }}>
          {turn.coord}
        </span>
        <span style={{ fontSize: "10px", letterSpacing: "2px", color: resultColor, flex: 1 }}>
          {turn.result}{turn.shipSunkId ? ` · ${turn.shipSunkId.toUpperCase()} SUNK` : ""}
        </span>
        {turn.strategyTag && (
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", padding: "2px 7px", borderRadius: "2px", whiteSpace: "nowrap" }}>
            {turn.strategyTag}
          </span>
        )}
        <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>{turn.latencyMs}ms</span>
        <span style={{ fontSize: "9px", color: "var(--text-dim)" }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && turn.reasoning && (
        <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: "12px", color: "var(--text)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          <div style={{ fontSize: "9px", letterSpacing: "2px", color: playerColor, marginBottom: "6px" }}>REASONING</div>
          {turn.reasoning}
          <div style={{ marginTop: "8px", fontSize: "9px", color: "rgba(255,255,255,0.2)", display: "flex", gap: "16px" }}>
            <span>{turn.promptTokens} prompt tokens</span>
            <span>{turn.completionTokens} completion tokens</span>
          </div>
        </div>
      )}
    </div>
  );
}
