// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/types/game.ts
// Core game types (inlined from packages/shared/types/game.ts for self-contained build)
// ─────────────────────────────────────────────────────────────────────────────

export type Player = "A" | "B";

export type CellState =
  | "UNKNOWN"   // not yet targeted
  | "MISS"      // shot fired, no ship
  | "HIT"       // shot fired, ship present
  | "SUNK";     // the whole ship this cell belongs to has been sunk

export type ShotResult = "HIT" | "MISS" | "SUNK";

export type MatchStatus =
  | "PENDING"
  | "PLACING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ARCHIVED";

// ── Ships ────────────────────────────────────────────────────────────────────

export type ShipId =
  | "CARRIER"      // 5
  | "BATTLESHIP"   // 4
  | "CRUISER"      // 3
  | "SUBMARINE"    // 3
  | "DESTROYER";   // 2

export const SHIP_SIZES: Record<ShipId, number> = {
  CARRIER: 5,
  BATTLESHIP: 4,
  CRUISER: 3,
  SUBMARINE: 3,
  DESTROYER: 2,
};

export const ALL_SHIPS: ShipId[] = [
  "CARRIER",
  "BATTLESHIP",
  "CRUISER",
  "SUBMARINE",
  "DESTROYER",
];

export type Orientation = "H" | "V";

export interface ShipPlacement {
  id: ShipId;
  row: number;       // 0-indexed
  col: number;       // 0-indexed
  orientation: Orientation;
  size: number;
}

export interface ShipStatus {
  id: ShipId;
  hits: number;
  size: number;
  sunk: boolean;
}

// ── Coordinates ──────────────────────────────────────────────────────────────

/** Human-readable coordinate e.g. "A1", "J10" */
export type Coord = string;

export interface GridCoord {
  row: number; // 0–9  (A=0 … J=9)
  col: number; // 0–9  (1=0 … 10=9)
}

// ── Board ────────────────────────────────────────────────────────────────────

/** 10x10 grid of cell states — [row][col] */
export type Grid = CellState[][];

/** 10x10 probability heatmap — [row][col], values 0.0–1.0 */
export type HeatmapGrid = number[][];

// ── Moves ────────────────────────────────────────────────────────────────────

export interface Move {
  turnNumber: number;
  player: Player;
  coord: Coord;
  result: ShotResult;
  shipSunkId?: ShipId;
  reasoning: string;
  strategyTag?: string;
  heatmap: HeatmapGrid;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  timestamp: number;
}

// ── Fleet Status ─────────────────────────────────────────────────────────────

export type FleetStatus = Record<ShipId, ShipStatus>;

// ── Full Game State (broadcast to spectators) ─────────────────────────────────

export interface PlayerState {
  /** Targeting grid — what this player has shot at */
  targetingGrid: Grid;
  /** Own board — where this player's ships are (always visible to spectators) */
  ownGrid: Grid;
  fleet: FleetStatus;
  shotsHit: number;
  shotsMissed: number;
}

export interface GameState {
  matchId: string;
  status: MatchStatus;
  turn: number;
  activePlayer: Player;
  modelA: string;
  modelB: string;
  playerA: PlayerState;
  playerB: PlayerState;
  moveHistory: Move[];
  winner?: Player;
  startedAt: number;
  lastUpdatedAt: number;
}
