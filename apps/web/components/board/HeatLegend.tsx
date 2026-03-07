"use client";
// components/board/HeatLegend.tsx
export function HeatLegend() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"6px", marginTop:"6px", padding:"0 2px" }}>
      <span style={{ fontSize:"8px", color:"var(--text-dim)", letterSpacing:"1px", whiteSpace:"nowrap" }}>
        PROBABILITY
      </span>
      <div style={{
        flex: 1, height: "4px", borderRadius: "2px",
        background: "linear-gradient(90deg,#0a1a2a,#003060,#006090,#30c890,#b0dc00,#ffa000,#ff5000)",
      }} />
      <span style={{ fontSize:"8px", color:"var(--text-dim)", letterSpacing:"1px", whiteSpace:"nowrap" }}>
        HIGH
      </span>
    </div>
  );
}
