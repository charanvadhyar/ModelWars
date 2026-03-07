// app/matches/page.tsx — server component, fetches match list

import Link from "next/link";

async function getMatches() {
  const SERVER = process.env.GAME_SERVER_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${SERVER}/api/matches`, { cache:"no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.matches ?? [];
  } catch {
    return [];
  }
}

function statusBadge(status: string) {
  const colors: Record<string, [string,string]> = {
    IN_PROGRESS: ["#ff4444", "rgba(255,40,40,0.1)"],
    COMPLETED:   ["var(--text-dim)", "transparent"],
    PENDING:     ["var(--amber)", "var(--amber-glow)"],
  };
  const [fg, bg] = colors[status] ?? ["var(--text-dim)", "transparent"];
  return (
    <span style={{
      fontSize:"8px", letterSpacing:"1px", padding:"2px 6px",
      border:`1px solid ${fg}`, borderRadius:"2px",
      color: fg, background: bg,
    }}>
      {status === "IN_PROGRESS" ? "● LIVE" : status}
    </span>
  );
}

function shortModel(m: string): string {
  if (!m) return "?";
  if (m.startsWith("claude")) {
    const v = m.match(/claude-(\w+)/)?.[1]?.toUpperCase() ?? "";
    return `CLAUDE ${v}`;
  }
  if (m.startsWith("gpt")) return m.toUpperCase();
  return m.toUpperCase();
}

export default async function MatchesPage() {
  const matches = await getMatches();

  return (
    <div style={{ minHeight:"100vh", padding:"24px", maxWidth:"900px", margin:"0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom:"24px" }}>
        <Link href="/" style={{
          fontSize:"10px", letterSpacing:"2px", color:"var(--text-dim)",
          textDecoration:"none", display:"inline-block", marginBottom:"16px",
        }}>
          ← BACK
        </Link>
        <div style={{
          fontFamily:"var(--font-hud)", fontSize:"11px", letterSpacing:"6px",
          color:"var(--text-dim)", marginBottom:"4px",
        }}>
          ARENA RECORDS
        </div>
        <h1 style={{
          fontFamily:"var(--font-hud)", fontSize:"24px", fontWeight:900,
          letterSpacing:"3px",
          background:"linear-gradient(90deg, var(--amber), var(--cyan))",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
        }}>
          MATCH HISTORY
        </h1>
      </div>

      {/* Match list */}
      {matches.length === 0 ? (
        <div style={{
          padding:"32px", textAlign:"center",
          border:"1px solid var(--grid-line)", borderRadius:"4px",
          color:"var(--text-dim)", fontSize:"12px", letterSpacing:"2px",
        }}>
          NO MATCHES ON RECORD
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
          {matches.map((match: any) => (
            <Link
              key={match.matchId ?? match.id}
              href={`/match/${match.matchId ?? match.id}`}
              style={{
                display:"grid",
                gridTemplateColumns:"1fr auto auto auto",
                gap:"16px", alignItems:"center",
                padding:"12px 16px",
                background:"var(--bg2)",
                border:"1px solid var(--grid-line)",
                borderRadius:"4px",
                textDecoration:"none",
                color:"inherit",
                transition:"border-color 0.2s",
              }}
            >
              {/* Models */}
              <div>
                <span style={{
                  fontFamily:"var(--font-hud)", fontSize:"11px",
                  color:"var(--amber)", fontWeight:700,
                }}>
                  {shortModel(match.modelA)}
                </span>
                <span style={{ color:"var(--text-dim)", margin:"0 8px", fontSize:"10px" }}>vs</span>
                <span style={{
                  fontFamily:"var(--font-hud)", fontSize:"11px",
                  color:"var(--cyan)", fontWeight:700,
                }}>
                  {shortModel(match.modelB)}
                </span>
              </div>

              {/* Status */}
              <div>{statusBadge(match.status)}</div>

              {/* Turns */}
              <div style={{ fontSize:"10px", color:"var(--text-dim)", textAlign:"right" }}>
                {match.totalTurns ? `${match.totalTurns} TURNS` : "—"}
              </div>

              {/* Watch */}
              <div style={{
                fontSize:"10px", letterSpacing:"1px", padding:"4px 10px",
                border:"1px solid var(--grid-line)", borderRadius:"2px",
                color:"var(--text-dim)",
              }}>
                WATCH →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
