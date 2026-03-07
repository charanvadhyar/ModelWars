"use client";
// hooks/useGameState.ts

import { useState, useEffect, useRef } from "react";

export interface CellState { state: "UNKNOWN" | "HIT" | "MISS" | "SUNK"; }
export type Grid10x10 = string[][];
export type Heatmap   = number[][];

export interface FleetStatus {
  id: string; size: number; sunk: boolean; hits: number;
}
export interface PlayerViewState {
  attackGrid:  Grid10x10;   // what this player has fired
  defenseGrid: Grid10x10;   // opponent's shots on this player's board
  fleet:       FleetStatus[];
  shipLayout:  any[];
  hits:        number;
}
export interface ReasoningState {
  textA: string; textB: string;
  activePlayer: "A" | "B" | null;
  isStreaming: boolean;
}
export interface GameViewState {
  playerA:        PlayerViewState;
  playerB:        PlayerViewState;
  reasoning:      ReasoningState;
  heatmapA:       Heatmap;
  heatmapB:       Heatmap;
  turn:           number;
  currentPlayer:  "A" | "B";
  modelA:         string;
  modelB:         string;
  spectators:     number;
  lastMoveCoord:  string | null;
  lastMovePlayer: "A" | "B" | null;
  isGameOver:     boolean;
  winner:         "A" | "B" | null;
  totalTurns:     number;
  durationMs:     number;
  errors:         { code: string; message: string; recoverable: boolean }[];
  connected:      boolean;
}

function emptyGrid(): Grid10x10 {
  return Array.from({ length: 10 }, () => Array(10).fill("UNKNOWN"));
}
function emptyHeatmap(): Heatmap {
  return Array.from({ length: 10 }, () => Array(10).fill(0));
}
function emptyPlayer(): PlayerViewState {
  return { attackGrid: emptyGrid(), defenseGrid: emptyGrid(), fleet: [], shipLayout: [], hits: 0 };
}
const INITIAL: GameViewState = {
  playerA: emptyPlayer(), playerB: emptyPlayer(),
  reasoning: { textA: "", textB: "", activePlayer: null, isStreaming: false },
  heatmapA: emptyHeatmap(), heatmapB: emptyHeatmap(),
  turn: 0, currentPlayer: "A",
  modelA: "", modelB: "",
  spectators: 0, lastMoveCoord: null, lastMovePlayer: null,
  isGameOver: false, winner: null, totalTurns: 0, durationMs: 0,
  errors: [], connected: false,
};

export function useGameState(
  on: (event: string, handler: (...args: any[]) => void) => () => void,
  connected: boolean
) {
  const [state, setState] = useState<GameViewState>(INITIAL);
  const bufA = useRef(""), bufB = useRef("");

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(on("GAME_STATE_UPDATE", ({ state: gs }: any) => {
      setState(prev => ({
        ...prev,
        turn:          gs.turn          ?? prev.turn,
        currentPlayer: gs.activePlayer  ?? prev.currentPlayer,
        modelA:        gs.modelA        ?? prev.modelA,
        modelB:        gs.modelB        ?? prev.modelB,
        playerA: {
          ...prev.playerA,
          attackGrid:  gs.playerA?.targetingGrid                   ?? prev.playerA.attackGrid,
          defenseGrid: gs.playerA?.ownGrid                         ?? prev.playerA.defenseGrid,
          fleet:       gs.playerA?.fleet ? Object.values(gs.playerA.fleet) : prev.playerA.fleet,
          hits:        gs.playerA?.shotsHit                        ?? prev.playerA.hits,
        },
        playerB: {
          ...prev.playerB,
          attackGrid:  gs.playerB?.targetingGrid                   ?? prev.playerB.attackGrid,
          defenseGrid: gs.playerB?.ownGrid                         ?? prev.playerB.defenseGrid,
          fleet:       gs.playerB?.fleet ? Object.values(gs.playerB.fleet) : prev.playerB.fleet,
          hits:        gs.playerB?.shotsHit                        ?? prev.playerB.hits,
        },
        connected: true,
      }));
    }));

    unsubs.push(on("MATCH_START", (payload: any) => {
      bufA.current = ""; bufB.current = "";
      setState(prev => ({
        ...INITIAL,
        modelA: payload.modelA,
        modelB: payload.modelB,
        playerA: { ...emptyPlayer(), shipLayout: payload.shipLayoutA ?? [] },
        playerB: { ...emptyPlayer(), shipLayout: payload.shipLayoutB ?? [] },
        connected: true,
      }));
    }));

    unsubs.push(on("REASONING_CHUNK", (payload: any) => {
      if (payload.player === "A") {
        if (!payload.done || bufA.current === "") bufA.current += payload.text;
      } else {
        if (!payload.done || bufB.current === "") bufB.current += payload.text;
      }
      // Reset the other player's buffer when a new player starts reasoning
      if (payload.player === "A" && bufB.current && !payload.done) bufB.current = "";
      if (payload.player === "B" && bufA.current && !payload.done) bufA.current = "";

      setState(prev => ({
        ...prev,
        reasoning: {
          textA: bufA.current,
          textB: bufB.current,
          activePlayer: payload.player,
          isStreaming: !payload.done,
        }
      }));
    }));

    unsubs.push(on("MOVE_RESULT", (payload: any) => {
      setState(prev => ({
        ...prev,
        lastMoveCoord:  payload.move?.coord  ?? null,
        lastMovePlayer: payload.move?.player ?? null,
      }));
    }));

    unsubs.push(on("HEATMAP_UPDATE", (payload: any) => {
      setState(prev => ({
        ...prev,
        heatmapA: payload.player === "A" ? payload.grid : prev.heatmapA,
        heatmapB: payload.player === "B" ? payload.grid : prev.heatmapB,
      }));
    }));

    unsubs.push(on("GAME_OVER", (payload: any) => {
      setState(prev => ({
        ...prev,
        isGameOver: true,
        winner:     payload.winner,
        totalTurns: payload.totalTurns,
        durationMs: payload.durationMs,
        reasoning:  { ...prev.reasoning, isStreaming: false },
      }));
    }));

    unsubs.push(on("SPECTATOR_COUNT", (payload: any) => {
      setState(prev => ({ ...prev, spectators: payload.count }));
    }));

    unsubs.push(on("ERROR", (payload: any) => {
      setState(prev => ({
        ...prev,
        errors: [...prev.errors.slice(-4), payload],
      }));
    }));

    return () => unsubs.forEach(u => u());
  }, [on]);

  useEffect(() => {
    setState(prev => ({ ...prev, connected }));
  }, [connected]);

  return state;
}
