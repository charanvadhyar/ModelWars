"use client";
// components/match/CenterPanel.tsx

interface LogEntry { turn: number; player: "A"|"B"; coord: string; result: string; model: string; }
interface Props {
  turn:          number;
  currentPlayer: "A" | "B";
  modelA:        string;
  modelB:        string;
  spectators:    number;
  moveLog:       LogEntry[];
  isGameOver:    boolean;
  winner:        "A" | "B" | null;
  onAbort?:      () => void;
  onDownload?:   () => void;
}

function shortModel(m: string): string {
  if (!m) return "—";
  if (m.startsWith("claude")) return "CLAUDE";
  if (m.startsWith("gpt-4o-mini")) return "GPT-MINI";
  if (m.startsWith("gpt-4o"))     return "GPT-4o";
  if (m.startsWith("gpt"))        return "GPT";
  if (m.startsWith("o3"))         return "O3";
  if (m.startsWith("o1"))         return "O1";
  return m.slice(0, 7).toUpperCase();
}

export function CenterPanel({
  turn, currentPlayer, modelA, modelB,
  spectators, moveLog, isGameOver, winner, onAbort, onDownload,
}: Props) {
  const isAmber  = currentPlayer === "A";
  const accent   = isAmber ? "var(--amber)" : "var(--cyan)";
  const glow     = isAmber ? "var(--amber-glow)" : "var(--cyan-glow)";
  const dim      = isAmber ? "var(--amber-dim)" : "var(--cyan-dim)";

  return (
    <div style={{
      display:"flex", flexDirection:"column",
      alignItems:"center", gap:"16px",
      padding:"0 10px",
    }}>
      {/* VS */}
      <div style={{
        fontFamily:"var(--font-hud)", fontSize:"28px", fontWeight:900,
        color:"#1a2535", letterSpacing:"2px", textAlign:"center", lineHeight:1,
      }}>VS</div>

      {/* Turn indicator */}
      {!isGameOver && (
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:"9px", letterSpacing:"3px", color:"var(--text-dim)", marginBottom:"4px" }}>
            ACTIVE
          </div>
          <div style={{
            fontFamily:"var(--font-hud)", fontSize:"11px", fontWeight:700,
            letterSpacing:"1px", padding:"6px 12px", borderRadius:"3px",
            color: accent, background: glow, border:`1px solid ${dim}`,
          }}>
            {currentPlayer === "A" ? shortModel(modelA) : shortModel(modelB)}
          </div>
          <div style={{
            fontSize:"20px", marginTop:"6px", color: accent,
            animation:"arrowPulse 1s infinite",
          }}>▼</div>
        </div>
      )}

      {/* Game over banner */}
      {isGameOver && winner && (
        <div style={{
          textAlign:"center", padding:"8px 12px",
          background: winner === "A" ? "var(--amber-glow)" : "var(--cyan-glow)",
          border:`1px solid ${winner === "A" ? "var(--amber-dim)" : "var(--cyan-dim)"}`,
          borderRadius:"4px",
        }}>
          <div style={{ fontSize:"9px", letterSpacing:"3px", color:"var(--text-dim)", marginBottom:"3px" }}>
            VICTOR
          </div>
          <div style={{
            fontFamily:"var(--font-hud)", fontSize:"13px", fontWeight:900,
            color: winner === "A" ? "var(--amber)" : "var(--cyan)",
          }}>
            {winner === "A" ? shortModel(modelA) : shortModel(modelB)}
          </div>
        </div>
      )}

      {/* Move counter */}
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:"9px", letterSpacing:"3px", color:"var(--text-dim)" }}>MOVE</div>
        <div style={{ fontFamily:"var(--font-vt)", fontSize:"40px", color:"#1e3045", lineHeight:1 }}>
          {String(turn).padStart(2, "0")}
        </div>
      </div>

      {/* Spectators */}
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:"9px", letterSpacing:"3px", color:"var(--text-dim)", marginBottom:"2px" }}>
          WATCHING
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"6px", justifyContent:"center" }}>
          <span style={{
            width:"6px", height:"6px", borderRadius:"50%",
            background:"#ff4444", animation:"pulseDot 1.2s infinite", display:"inline-block",
          }} />
          <span style={{ fontFamily:"var(--font-vt)", fontSize:"22px", color:"#ff4444" }}>
            {spectators}
          </span>
        </div>
      </div>

      {/* Move log */}
      <div style={{
        width:"100%", background:"var(--bg2)",
        border:"1px solid var(--grid-line)", borderRadius:"4px",
        padding:"10px", maxHeight:"200px", overflowY:"auto",
        flex:1,
      }}>
        <div style={{ fontSize:"9px", letterSpacing:"3px", color:"var(--text-dim)", marginBottom:"8px" }}>
          BATTLE LOG
        </div>
        {moveLog.length === 0 && (
          <div style={{ fontSize:"10px", color:"var(--text-dim)" }}>AWAITING FIRST SHOT...</div>
        )}
        {[...moveLog].reverse().map((entry) => {
          const isHit = entry.result === "HIT" || entry.result.startsWith("SUNK");
          return (
            <div key={entry.turn} style={{
              fontSize:"10px", lineHeight:"1.8", display:"flex", gap:"6px",
              color: isHit ? "#604020" : "#2a4050",
              animation:"fadeIn 0.3s ease-out",
            }}>
              <span style={{ color:"var(--text-dim)", minWidth:"20px" }}>
                {String(entry.turn).padStart(2,"0")}
              </span>
              <span style={{ color: entry.player === "A" ? "var(--amber)" : "var(--cyan)" }}>
                {shortModel(entry.model)}
              </span>
              <span style={{ color:"var(--text-dim)" }}>→</span>
              <span>{entry.coord}</span>
              <span style={{
                color: entry.result === "HIT"           ? "#ff6040" :
                       entry.result.startsWith("SUNK")  ? "#ff3000" : "var(--text-dim)",
                fontWeight: isHit ? "bold" : "normal",
              }}>
                {entry.result}
              </span>
            </div>
          );
        })}
      </div>

      {/* Download log button — shown once there's data */}
      {onDownload && (
        <button onClick={onDownload} style={{
          width:"100%", padding:"8px",
          fontFamily:"var(--font-mono)", fontSize:"11px", letterSpacing:"2px",
          background:"rgba(0,80,40,0.15)", color:"#40cc80",
          border:"1px solid #105030", borderRadius:"3px",
          cursor:"pointer", textTransform:"uppercase",
          transition:"all 0.2s",
        }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,80,40,0.3)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,80,40,0.15)")}
        >
          ▼ DOWNLOAD LOG
        </button>
      )}

      {/* Abort button — only rendered when callback provided and game is active */}
      {onAbort && !isGameOver && (
        <button onClick={onAbort} style={{
          width:"100%", padding:"8px",
          fontFamily:"var(--font-mono)", fontSize:"11px", letterSpacing:"2px",
          background:"rgba(180,20,20,0.15)", color:"#ff4444",
          border:"1px solid #601010", borderRadius:"3px",
          cursor:"pointer", textTransform:"uppercase",
          transition:"all 0.2s",
        }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(180,20,20,0.3)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(180,20,20,0.15)")}
        >
          ■ ABORT MATCH
        </button>
      )}

      <style>{`
        @keyframes arrowPulse {
          0%,100% { opacity:1; transform:translateY(0); }
          50%      { opacity:0.3; transform:translateY(3px); }
        }
        @keyframes pulseDot {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.3; transform:scale(0.7); }
        }
        @keyframes fadeIn {
          from { opacity:0; transform:translateY(3px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </div>
  );
}
