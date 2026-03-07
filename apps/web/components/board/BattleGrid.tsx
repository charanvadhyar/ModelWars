"use client";
// components/board/BattleGrid.tsx

import { useMemo, useRef, useEffect } from "react";

type CellValue = "UNKNOWN" | "HIT" | "MISS" | "SUNK";
type Grid10x10  = CellValue[][];
type Heatmap    = number[][];
type ShipLayout = { row: number; col: number; size: number; orientation: "H" | "V"; id: string }[];

interface Props {
  grid:         Grid10x10;
  heatmap?:     Heatmap;
  shipLayout?:  ShipLayout;
  showShips?:   boolean;
  color:        "amber" | "cyan";
  lastCoord?:   string | null;
}

const ROWS = "ABCDEFGHIJ";

function coordToRC(coord: string): [number, number] | null {
  const m = coord?.trim().toUpperCase().match(/^([A-J])(10|[1-9])$/);
  if (!m) return null;
  return [ROWS.indexOf(m[1]), parseInt(m[2]) - 1];
}

function heatToStyle(v: number): string | null {
  if (v < 0.005) return null;
  if (v < 0.05)  return "rgba(0,80,120,0.4)";
  if (v < 0.12)  return "rgba(0,100,180,0.5)";
  if (v < 0.22)  return "rgba(0,150,200,0.5)";
  if (v < 0.35)  return "rgba(50,200,150,0.5)";
  if (v < 0.50)  return "rgba(180,220,0,0.5)";
  if (v < 0.70)  return "rgba(255,160,0,0.5)";
  return                 "rgba(255,80,0,0.6)";
}

function buildShipCells(layout: ShipLayout): Set<string> {
  const s = new Set<string>();
  for (const { row, col, size, orientation } of layout) {
    for (let i = 0; i < size; i++) {
      const r = orientation === "V" ? row + i : row;
      const c = orientation === "H" ? col + i : col;
      s.add(`${r},${c}`);
    }
  }
  return s;
}

export function BattleGrid({ grid, heatmap, shipLayout = [], showShips = false, color, lastCoord }: Props) {
  const lastRC   = lastCoord ? coordToRC(lastCoord) : null;
  const shipCells = useMemo(() => buildShipCells(shipLayout), [shipLayout]);
  const accent    = color === "amber" ? "var(--amber)" : "var(--cyan)";
  const dimBorder = color === "amber" ? "var(--amber-dim)" : "var(--cyan-dim)";

  return (
    <div style={{ width: "100%", userSelect: "none" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "20px repeat(10, 1fr)",
        gridTemplateRows:    "20px repeat(10, 1fr)",
        gap: "2px",
        width: "100%",
        aspectRatio: "11/11",
      }}>
        {/* Corner */}
        <div />
        {/* Col headers A-J */}
        {Array.from({ length: 10 }, (_, c) => (
          <div key={c} style={{ display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:"9px", color:"var(--text-dim)", fontFamily:"var(--font-mono)" }}>
            {ROWS[c]}
          </div>
        ))}

        {/* Rows */}
        {grid.map((row, r) => (
          <>
            <div key={`r${r}`} style={{ display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:"9px", color:"var(--text-dim)", fontFamily:"var(--font-mono)" }}>
              {r + 1}
            </div>
            {row.map((cell, c) => {
              const isLast  = lastRC?.[0] === r && lastRC?.[1] === c;
              const hasShip = showShips && shipCells.has(`${r},${c}`);
              const heat    = heatmap?.[r]?.[c] ?? 0;
              const heatBg  = heatToStyle(heat);

              let bg = "var(--bg3)";
              let border = "1px solid var(--grid-line)";
              let content: React.ReactNode = null;
              let anim: React.CSSProperties = {};

              if (cell === "SUNK") {
                bg = "radial-gradient(circle, #ff6b35, #cc2200)"; border = "1px solid #ff4400";
                content = <span style={{position:"absolute",inset:0,display:"flex",
                  alignItems:"center",justifyContent:"center",color:"#ffaa00",fontSize:"9px",fontWeight:"bold"}}>✕</span>;
              } else if (cell === "HIT") {
                bg = "radial-gradient(circle, #ff6b35, #cc2200)";
                border = "1px solid #ff4400";
                if (isLast) anim = { animation: "hitFlash 0.5s ease-out, sonarPing 0.8s ease-out" };
                content = <span style={{position:"absolute",inset:0,display:"flex",
                  alignItems:"center",justifyContent:"center",color:"#ffaa00",fontSize:"9px",fontWeight:"bold"}}>✕</span>;
              } else if (cell === "MISS") {
                bg = "#1a2a3a"; border = "1px solid #1a3040";
                if (isLast) anim = { animation: "missPing 0.6s ease-out" };
                content = <span style={{position:"absolute",inset:0,display:"flex",
                  alignItems:"center",justifyContent:"center",color:"#2a4a6a",fontSize:"14px",lineHeight:1}}>·</span>;
              } else if (hasShip) {
                bg = "#111e2e"; border = `1px solid ${dimBorder}`;
              } else if (heatBg) {
                bg = heatBg; border = "1px solid transparent";
              }

              return (
                <div key={`${r},${c}`}
                  title={`${ROWS[r]}${c+1}${heat>0.005 ? ` P=${(heat*100).toFixed(1)}%` : ""}`}
                  style={{
                    position:"relative", aspectRatio:"1", borderRadius:"2px",
                    background: bg, border, cursor:"default",
                    transition: "background 0.2s",
                    ...anim,
                  }}
                >
                  {content}
                </div>
              );
            })}
          </>
        ))}
      </div>

      <style>{`
        @keyframes hitFlash {
          0%   { background: white !important; transform: scale(1.25); }
          100% { background: radial-gradient(circle,#ff6b35,#cc2200); transform: scale(1); }
        }
        @keyframes sonarPing {
          0%  { box-shadow: 0 0 0 0   rgba(255,100,0,0.8); }
          70% { box-shadow: 0 0 0 10px rgba(255,100,0,0); }
          100%{ box-shadow: 0 0 0 0   rgba(255,100,0,0); }
        }
        @keyframes missPing {
          0%  { box-shadow: 0 0 0 0  rgba(0,150,255,0.5); }
          70% { box-shadow: 0 0 0 8px rgba(0,150,255,0); }
          100%{ box-shadow: 0 0 0 0  rgba(0,150,255,0); }
        }
      `}</style>
    </div>
  );
}
