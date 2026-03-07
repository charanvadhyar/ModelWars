// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/engine/ShipPlacer.ts
// Generates a random, valid ship layout for a 10x10 board.
// Ships do not overlap. They may be adjacent (standard Battleship rules).
// ─────────────────────────────────────────────────────────────────────────────

import {
  type ShipPlacement,
  type ShipId,
  type Orientation,
  ALL_SHIPS,
  SHIP_SIZES,
} from "../../../../packages/shared/types/game";

const MAX_ATTEMPTS = 1000;

/**
 * Generate a random valid ship placement for all 5 ships.
 * Throws if placement fails after MAX_ATTEMPTS (should never happen in practice).
 */
export function generateRandomLayout(): ShipPlacement[] {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = tryGenerateLayout();
    if (result !== null) return result;
  }
  throw new Error(
    `Failed to generate a valid ship layout after ${MAX_ATTEMPTS} attempts.`
  );
}

/**
 * Attempt one full layout. Returns null if any ship placement fails.
 */
function tryGenerateLayout(): ShipPlacement[] | null {
  const occupied = new Set<string>();
  const placements: ShipPlacement[] = [];

  for (const id of ALL_SHIPS) {
    const placement = tryPlaceShip(id, SHIP_SIZES[id], occupied);
    if (placement === null) return null;
    placements.push(placement);
    markOccupied(placement, occupied);
  }

  return placements;
}

/**
 * Try to place a single ship randomly.
 * Returns null if no valid position is found after 50 tries.
 */
function tryPlaceShip(
  id: ShipId,
  size: number,
  occupied: Set<string>
): ShipPlacement | null {
  for (let i = 0; i < 50; i++) {
    const orientation: Orientation = Math.random() < 0.5 ? "H" : "V";
    const maxRow = orientation === "V" ? 10 - size : 9;
    const maxCol = orientation === "H" ? 10 - size : 9;

    const row = randomInt(0, maxRow);
    const col = randomInt(0, maxCol);

    if (isValidPlacement(row, col, size, orientation, occupied)) {
      return { id, row, col, orientation, size };
    }
  }
  return null;
}

/**
 * Check that none of the cells the ship would occupy are already taken.
 */
function isValidPlacement(
  row: number,
  col: number,
  size: number,
  orientation: Orientation,
  occupied: Set<string>
): boolean {
  for (let i = 0; i < size; i++) {
    const r = orientation === "H" ? row : row + i;
    const c = orientation === "H" ? col + i : col;
    if (occupied.has(`${r},${c}`)) return false;
  }
  return true;
}

/**
 * Mark all cells occupied by a ship as taken.
 */
function markOccupied(
  placement: ShipPlacement,
  occupied: Set<string>
): void {
  const { row, col, size, orientation } = placement;
  for (let i = 0; i < size; i++) {
    const r = orientation === "H" ? row : row + i;
    const c = orientation === "H" ? col + i : col;
    occupied.add(`${r},${c}`);
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Validate an externally-provided layout (e.g. from a saved match).
 * Returns an array of error messages — empty means valid.
 */
export function validateLayout(placements: ShipPlacement[]): string[] {
  const errors: string[] = [];
  const occupied = new Set<string>();

  // Check all ships are present
  const placedIds = new Set(placements.map((p) => p.id));
  for (const id of ALL_SHIPS) {
    if (!placedIds.has(id)) errors.push(`Missing ship: ${id}`);
  }

  for (const { id, row, col, size, orientation } of placements) {
    // Check size matches expected
    if (size !== SHIP_SIZES[id]) {
      errors.push(`${id} has wrong size: expected ${SHIP_SIZES[id]}, got ${size}`);
    }

    for (let i = 0; i < size; i++) {
      const r = orientation === "H" ? row : row + i;
      const c = orientation === "H" ? col + i : col;
      const key = `${r},${c}`;

      if (r < 0 || r > 9 || c < 0 || c > 9) {
        errors.push(`${id} extends out of bounds at row=${r}, col=${c}`);
      } else if (occupied.has(key)) {
        errors.push(`${id} overlaps another ship at row=${r}, col=${c}`);
      } else {
        occupied.add(key);
      }
    }
  }

  return errors;
}
