// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/engine/BoardState.ts
// Owns one player's board: ship placement, incoming shot resolution,
// fleet status tracking.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type Grid,
  type ShipPlacement,
  type ShipStatus,
  type FleetStatus,
  type ShotResult,
  type Coord,
  type GridCoord,
  ALL_SHIPS,
  SHIP_SIZES,
} from "../../../../packages/shared/types/game";
import { parseCoord, toCoord } from "./coordinates";

/** Internal cell — tracks which ship occupies the cell (if any) */
interface InternalCell {
  shipId: string | null;
  hit: boolean;
}

export class BoardState {
  /** Visible grid for spectators / targeting display */
  readonly grid: Grid;

  /** Internal grid tracking ship occupancy */
  private readonly internal: InternalCell[][];

  /** Fleet status map */
  private readonly fleet: FleetStatus;

  /** Ship placements (for serialisation / broadcast) */
  private readonly placements: ShipPlacement[];

  constructor(placements: ShipPlacement[]) {
    // Initialise empty grids
    this.grid = Array.from({ length: 10 }, () =>
      Array(10).fill("UNKNOWN")
    ) as Grid;

    this.internal = Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => ({ shipId: null, hit: false }))
    );

    // Initialise fleet status
    this.fleet = {} as FleetStatus;
    for (const id of ALL_SHIPS) {
      this.fleet[id] = { id, hits: 0, size: SHIP_SIZES[id], sunk: false };
    }

    this.placements = placements;

    // Place ships onto internal grid
    for (const placement of placements) {
      this.placeShip(placement);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Record an incoming shot.
   * Returns the result and, if a ship was sunk, its ID.
   */
  receiveShot(coord: Coord): { result: ShotResult; shipSunkId?: string } {
    const { row, col } = parseCoord(coord);
    const cell = this.internal[row][col];

    if (cell.hit) {
      throw new Error(`Cell ${coord} has already been shot.`);
    }

    cell.hit = true;

    if (cell.shipId === null) {
      this.grid[row][col] = "MISS";
      return { result: "MISS" };
    }

    // It's a hit
    const status = this.fleet[cell.shipId as keyof FleetStatus];
    status.hits += 1;

    if (status.hits === status.size) {
      // Ship is sunk — mark all its cells
      status.sunk = true;
      this.markShipSunk(cell.shipId);
      return { result: "SUNK", shipSunkId: cell.shipId };
    }

    this.grid[row][col] = "HIT";
    return { result: "HIT" };
  }

  /** True if every ship has been sunk */
  isDefeated(): boolean {
    return ALL_SHIPS.every((id) => this.fleet[id].sunk);
  }

  /** Snapshot of fleet status (safe to serialise) */
  getFleetStatus(): FleetStatus {
    return JSON.parse(JSON.stringify(this.fleet));
  }

  /** Snapshot of the visible grid (safe to serialise) */
  getGrid(): Grid {
    return this.grid.map((row) => [...row]) as Grid;
  }

  /** Ship placements for broadcast to spectators */
  getPlacements(): ShipPlacement[] {
    return [...this.placements];
  }

  /** Number of hits received */
  get totalHits(): number {
    return ALL_SHIPS.reduce((sum, id) => sum + this.fleet[id].hits, 0);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private placeShip(placement: ShipPlacement): void {
    const { id, row, col, orientation, size } = placement;

    for (let i = 0; i < size; i++) {
      const r = orientation === "H" ? row : row + i;
      const c = orientation === "H" ? col + i : col;

      if (r > 9 || c > 9) {
        throw new Error(
          `Ship ${id} placement out of bounds at row=${r}, col=${c}`
        );
      }

      if (this.internal[r][c].shipId !== null) {
        throw new Error(
          `Ship ${id} overlaps with ${this.internal[r][c].shipId} at ${toCoord(r, c)}`
        );
      }

      this.internal[r][c].shipId = id;
    }
  }

  private markShipSunk(shipId: string): void {
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        if (this.internal[row][col].shipId === shipId) {
          this.grid[row][col] = "SUNK";
        }
      }
    }
  }
}
