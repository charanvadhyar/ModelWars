"use client";
// app/match/[id]/page.tsx — Live spectator page

import { useState, useEffect, useCallback } from "react";
import { useSocket } from "../../../hooks/useSocket";
import { useGameState } from "../../../hooks/useGameState";
import { useAuth } from "../../../hooks/useAuth";
import { PlayerPanel }  from "../../../components/match/PlayerPanel";
import { CenterPanel }  from "../../../components/match/CenterPanel";

interface Params { params: { id: string } }

export default function MatchPage({ params }: Params) {
  const matchId = params.id;
  const { status, on } = useSocket(matchId);
  const gs = useGameState(on, status === "connected");
  const { user, authFetch } = useAuth();

  const handleAbort = useCallback(async () => {
    if (!confirm("Abort this match?")) return;
    await authFetch(`/api/matches/${matchId}`, { method: "DELETE" });
  }, [matchId, authFetch]);

  // Build move log from game state history
  const [moveLog, setMoveLog] = useState<any[]>([]);
  useEffect(() => {
    on("MOVE_RESULT", (payload: any) => {
      const m = payload.move;
      if (!m) return;
      setMoveLog(prev => [...prev, {
        turn:   m.turnNumber,
        player: m.player,
        coord:  m.coord,
        result: m.result,
        model:  m.player === "A" ? gs.modelA : gs.modelB,
      }]);
    });
  }, [on, gs.modelA, gs.modelB]);

  // Track forfeit — set when AI_FORFEIT error received before game over
  const [forfeitedPlayer, setForfeitedPlayer] = useState<"A" | "B" | null>(null);
  useEffect(() => {
    return on("ERROR", (payload: any) => {
      if (payload.code === "AI_FORFEIT") {
        // The current player at time of forfeit is the loser
        setForfeitedPlayer(gs.currentPlayer);
      }
    });
  }, [on, gs.currentPlayer]);

  // Accumulate full reasoning per completed turn
  const [reasoningLog, setReasoningLog] = useState<{ turn: number; player: "A"|"B"; model: string; reasoning: string }[]>([]);
  useEffect(() => {
    return on("REASONING_CHUNK", (payload: any) => {
      if (!payload.done || !payload.text) return;
      setReasoningLog(prev => [...prev, {
        turn:      payload.turn ?? prev.length + 1,
        player:    payload.player,
        model:     payload.player === "A" ? gs.modelA : gs.modelB,
        reasoning: payload.fullText ?? payload.text,
      }]);
    });
  }, [on, gs.modelA, gs.modelB]);

  const handleDownload = useCallback(() => {
    const lines: string[] = [
      `MATCH ${matchId.toUpperCase()}`,
      `Downloaded: ${new Date().toISOString()}`,
      `Models: ${gs.modelA} vs ${gs.modelB}`,
      `Total turns: ${gs.turn}`,
      `Winner: ${gs.winner ?? "—"}`,
      "",
      "═══ MOVE LOG ═══",
      ...moveLog.map(m =>
        `T${String(m.turn).padStart(2,"0")} [${m.player}] ${m.model} → ${m.coord} : ${m.result}`
      ),
      "",
      "═══ REASONING LOG ═══",
      ...reasoningLog.map(r => [
        `--- Turn ${r.turn} | Player ${r.player} | ${r.model} ---`,
        r.reasoning,
        "",
      ].join("\n")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `match-${matchId.slice(0,8)}-log.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [matchId, moveLog, reasoningLog, gs.modelA, gs.modelB, gs.turn, gs.winner]);

  const isAmberActive = gs.currentPlayer === "A";
  const isCyanActive  = gs.currentPlayer === "B";

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{
        padding:"14px 20px 10px",
        borderBottom:"1px solid rgba(255,255,255,0.05)",
        textAlign:"center", position:"relative", flexShrink:0,
      }}>
        <div style={{
          fontFamily:"var(--font-hud)", fontSize:"10px", letterSpacing:"8px",
          color:"var(--text-dim)", marginBottom:"4px",
        }}>
          CLASSIFIED OPERATION
        </div>
        <div style={{
          fontFamily:"var(--font-hud)", fontSize:"28px", fontWeight:900, letterSpacing:"4px",
          background:"linear-gradient(90deg, var(--amber), var(--cyan))",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
        }}>
          MODEL WARS
        </div>

        {/* Status bar */}
        <div style={{
          display:"flex", justifyContent:"center", alignItems:"center",
          gap:"20px", marginTop:"6px", fontSize:"10px", letterSpacing:"2px", color:"var(--text-dim)",
        }}>
          {/* Connection status */}
          <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
            <span style={{
              width:"5px", height:"5px", borderRadius:"50%", display:"inline-block",
              background: status === "connected" ? "#ff4444" : "#334455",
              animation: status === "connected" ? "pulseDot 1.2s infinite" : "none",
            }} />
            <span style={{ color: status === "connected" ? "#ff4444" : "var(--text-dim)" }}>
              {status === "connected" ? "LIVE" : status.toUpperCase()}
            </span>
          </div>

          <span>BATTLESHIP ARENA</span>

          <span style={{ fontFamily:"var(--font-mono)", fontSize:"9px" }}>
            MATCH {matchId.slice(0, 8).toUpperCase()}
          </span>

          {status === "connected" && !gs.connected && !gs.isGameOver && (
            <span style={{ color:"var(--cyan)", letterSpacing:"2px", animation:"pulseDot 1.2s infinite" }}>
              ◈ PLACING FLEET
            </span>
          )}
          {gs.isGameOver && (
            <span style={{ color:"var(--amber)", letterSpacing:"2px" }}>■ MATCH COMPLETE</span>
          )}
        </div>

        {/* Error toast — recoverable errors */}
        {gs.errors.filter(e => e.recoverable).slice(-1).map((err, i) => (
          <div key={i} style={{
            position:"absolute", bottom:"-30px", left:"50%", transform:"translateX(-50%)",
            fontSize:"10px", letterSpacing:"1px", color:"#cc8800",
            background:"rgba(50,30,0,0.9)", border:"1px solid #664400",
            padding:"4px 12px", borderRadius:"2px", whiteSpace:"nowrap", zIndex:10,
          }}>
            ⚠ {err.message}
          </div>
        ))}
      </header>

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <main style={{
        flex:1, display:"grid",
        gridTemplateColumns:"1fr 200px 1fr",
        gap:"0",
        padding:"16px",
        maxWidth:"1320px", margin:"0 auto", width:"100%",
        alignItems:"start",
      }}>

        {/* ── LEFT: Claude / Player A ──────────────────────────────────── */}
        <PlayerPanel
          color="amber"
          model={gs.modelA}
          attackGrid={gs.playerA.attackGrid}
          defenseGrid={gs.playerA.defenseGrid}
          heatmap={gs.heatmapA}
          fleet={gs.playerA.fleet}
          shipLayout={gs.playerA.shipLayout}
          reasoningText={gs.reasoning.textA}
          isActive={isAmberActive}
          isStreaming={gs.reasoning.isStreaming && gs.reasoning.activePlayer === "A"}
          hits={gs.playerA.hits}
          lastCoord={gs.lastMoveCoord}
          side="left"
        />

        {/* ── CENTER ──────────────────────────────────────────────────── */}
        <CenterPanel
          turn={gs.turn}
          currentPlayer={gs.currentPlayer}
          modelA={gs.modelA}
          modelB={gs.modelB}
          spectators={gs.spectators}
          moveLog={moveLog}
          isGameOver={gs.isGameOver}
          winner={gs.winner}
          forfeitedPlayer={forfeitedPlayer}
          onAbort={user?.role === "ADMIN" ? handleAbort : undefined}
          onDownload={moveLog.length > 0 || reasoningLog.length > 0 ? handleDownload : undefined}
        />

        {/* ── RIGHT: GPT / Player B ────────────────────────────────────── */}
        <PlayerPanel
          color="cyan"
          model={gs.modelB}
          attackGrid={gs.playerB.attackGrid}
          defenseGrid={gs.playerB.defenseGrid}
          heatmap={gs.heatmapB}
          fleet={gs.playerB.fleet}
          shipLayout={gs.playerB.shipLayout}
          reasoningText={gs.reasoning.textB}
          isActive={isCyanActive}
          isStreaming={gs.reasoning.isStreaming && gs.reasoning.activePlayer === "B"}
          hits={gs.playerB.hits}
          lastCoord={gs.lastMoveCoord}
          side="right"
        />
      </main>

      <style>{`
        @keyframes pulseDot {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.3; transform:scale(0.7); }
        }
      `}</style>
    </div>
  );
}
