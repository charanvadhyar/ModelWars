"use client";
// components/board/FleetStatus.tsx

interface Ship { id: string; size: number; sunk: boolean; hits?: number; }
interface Props { fleet: Ship[]; color: "amber" | "cyan"; }

const SHIP_NAMES: Record<string, string> = {
  CARRIER: "CARRIER", BATTLESHIP: "BATTLESHIP", CRUISER: "CRUISER",
  SUBMARINE: "SUBMARINE", DESTROYER: "DESTROYER",
};

export function FleetStatus({ fleet, color }: Props) {
  const accent = color === "amber" ? "var(--amber)" : "var(--cyan)";
  const dim    = color === "amber" ? "var(--amber-dim)" : "var(--cyan-dim)";

  if (!fleet.length) {
    return (
      <div style={{ padding:"10px 14px", background:"var(--bg2)",
        border:`1px solid ${dim}`, borderRadius:"4px" }}>
        <div style={{ fontSize:"9px", letterSpacing:"3px", color:"var(--text-dim)", marginBottom:"8px" }}>
          FLEET STATUS
        </div>
        <div style={{ fontSize:"10px", color:"var(--text-dim)" }}>AWAITING DEPLOYMENT...</div>
      </div>
    );
  }

  return (
    <div style={{ padding:"10px 14px", background:"var(--bg2)",
      border:`1px solid ${dim}`, borderRadius:"4px" }}>
      <div style={{ fontSize:"9px", letterSpacing:"3px", color:"var(--text-dim)", marginBottom:"8px" }}>
        FLEET STATUS
      </div>
      {fleet.map((ship) => (
        <div key={ship.id} style={{
          display:"flex", alignItems:"center", gap:"8px",
          marginBottom:"5px",
        }}>
          <span style={{ fontSize:"9px", color: ship.sunk ? "var(--text-dim)" : accent,
            minWidth:"82px", letterSpacing:"0.5px", fontFamily:"var(--font-mono)",
            textDecoration: ship.sunk ? "line-through" : "none",
          }}>
            {SHIP_NAMES[ship.id] ?? ship.id}
          </span>
          <div style={{ display:"flex", gap:"2px" }}>
            {Array.from({ length: ship.size }, (_, i) => {
              const isHit = ship.hits !== undefined ? i < ship.hits : ship.sunk;
              return (
                <div key={i} style={{
                  width:"10px", height:"10px", borderRadius:"1px",
                  background: isHit || ship.sunk ? "#1a2535" : accent,
                  border: `1px solid ${isHit || ship.sunk ? "#2a3040" : "transparent"}`,
                  boxShadow: (!isHit && !ship.sunk) ? `0 0 4px ${dim}` : "none",
                  transition: "all 0.3s",
                }} />
              );
            })}
          </div>
          {ship.sunk && (
            <span style={{ fontSize:"8px", color:"#ff4040", letterSpacing:"1px" }}>SUNK</span>
          )}
        </div>
      ))}
    </div>
  );
}
