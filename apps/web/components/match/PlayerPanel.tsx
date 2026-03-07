"use client";
// components/match/PlayerPanel.tsx

import { BattleGrid } from "../board/BattleGrid";
import { HeatLegend }  from "../board/HeatLegend";
import { FleetStatus } from "../board/FleetStatus";
import { ReasoningPanel } from "../reasoning/ReasoningPanel";

type Grid10x10 = string[][];
type Heatmap   = number[][];

interface Props {
  color:        "amber" | "cyan";
  model:        string;
  attackGrid:   Grid10x10;
  defenseGrid:  Grid10x10;
  heatmap:      Heatmap;
  fleet:        any[];
  shipLayout:   any[];
  reasoningText: string;
  isActive:     boolean;
  isStreaming:  boolean;
  hits:         number;
  lastCoord?:   string | null;
  side:         "left" | "right";
}

function modelLabel(m: string): string {
  if (!m) return "AWAITING";
  if (m.startsWith("claude-opus"))    return "CLAUDE OPUS";
  if (m.startsWith("claude-sonnet"))  return "CLAUDE SONNET";
  if (m.startsWith("claude-haiku"))   return "CLAUDE HAIKU";
  if (m.startsWith("claude"))         return "CLAUDE";
  if (m.startsWith("gpt-4o-mini"))    return "GPT-4o mini";
  if (m.startsWith("gpt-4o"))         return "GPT-4o";
  if (m.startsWith("o3"))             return "O3-MINI";
  if (m.startsWith("o1"))             return "O1";
  return m.toUpperCase();
}

function modelVersion(m: string): string {
  if (!m) return "";
  if (m.startsWith("claude-opus-4"))    return "OPUS 4 · ANTHROPIC";
  if (m.startsWith("claude-sonnet-4"))  return "SONNET 4.6 · ANTHROPIC";
  if (m.startsWith("claude-haiku-4"))   return "HAIKU 4.5 · ANTHROPIC";
  if (m.startsWith("claude"))           return "· ANTHROPIC";
  if (m.startsWith("gpt-4o-mini"))      return "GPT-4o MINI · OPENAI";
  if (m.startsWith("gpt-4o"))           return "GPT-4o · OPENAI";
  if (m.startsWith("o3"))               return "O3-MINI · OPENAI";
  if (m.startsWith("o1"))               return "O1 · OPENAI";
  return m.toUpperCase();
}

function modelInitials(m: string): string {
  if (!m) return "??";
  if (m.startsWith("claude")) return "CL";
  if (m.startsWith("gpt-4o-mini")) return "GM";
  if (m.startsWith("gpt-4o"))     return "G4";
  if (m.startsWith("o3"))         return "O3";
  if (m.startsWith("o1"))         return "O1";
  return m.slice(0,2).toUpperCase();
}

export function PlayerPanel({
  color, model, attackGrid, defenseGrid, heatmap, fleet,
  shipLayout, reasoningText, isActive, isStreaming,
  hits, lastCoord, side,
}: Props) {
  const accent = color === "amber" ? "var(--amber)" : "var(--cyan)";
  const dim    = color === "amber" ? "var(--amber-dim)" : "var(--cyan-dim)";
  const glow   = color === "amber" ? "var(--amber-glow)" : "var(--cyan-glow)";

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>

      {/* Header */}
      <div style={{
        display:"flex", alignItems:"center", gap:"10px",
        padding:"10px 14px", borderRadius:"4px",
        background: glow, border:`1px solid ${dim}`,
      }}>
        <div style={{
          width:"34px", height:"34px", borderRadius:"4px", flexShrink:0,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontFamily:"var(--font-hud)", fontSize:"11px", fontWeight:900,
          background: dim, color: accent,
        }}>
          {modelInitials(model)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{
            fontFamily:"var(--font-hud)", fontSize:"13px", fontWeight:700,
            letterSpacing:"1px", color: accent, whiteSpace:"nowrap",
            overflow:"hidden", textOverflow:"ellipsis",
          }}>
            {modelLabel(model)}
          </div>
          <div style={{ fontSize:"9px", color:"var(--text-dim)", letterSpacing:"1px", marginTop:"1px" }}>
            {modelVersion(model)}
          </div>
        </div>
        <div style={{
          fontFamily:"var(--font-hud)", fontSize:"22px", fontWeight:900,
          color: accent, flexShrink:0,
        }}>
          {hits}
        </div>
      </div>

      {/* Targeting grid (what this model fires at) */}
      <div>
        <div style={{ fontSize:"9px", letterSpacing:"3px", color:"var(--text-dim)",
          marginBottom:"5px", textAlign:"center" }}>
          TARGETING GRID → OPPONENT WATERS
        </div>
        <BattleGrid
          grid={attackGrid as any}
          heatmap={heatmap}
          color={color}
          lastCoord={isActive ? lastCoord : null}
        />
        <HeatLegend />
      </div>

      {/* Defense grid (opponent fires at this model) */}
      <div>
        <div style={{ fontSize:"9px", letterSpacing:"3px", color:"var(--text-dim)",
          marginBottom:"5px", textAlign:"center" }}>
          OWN WATERS → INCOMING FIRE
        </div>
        <BattleGrid
          grid={defenseGrid as any}
          shipLayout={shipLayout}
          showShips
          color={color}
          lastCoord={!isActive ? lastCoord : null}
        />
      </div>

      {/* Fleet */}
      <FleetStatus fleet={fleet} color={color} />

      {/* Reasoning */}
      <ReasoningPanel
        text={reasoningText}
        isActive={isActive}
        isStreaming={isStreaming}
        color={color}
      />
    </div>
  );
}
