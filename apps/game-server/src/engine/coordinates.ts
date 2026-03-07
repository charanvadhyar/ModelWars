// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/engine/coordinates.ts
// Human-readable coordinate ↔ grid index conversion and validation
// ─────────────────────────────────────────────────────────────────────────────

import type { Coord, GridCoord } from "../../../../packages/shared/types/game";

const ROW_LABELS = "ABCDEFGHIJ";
const COORD_REGEX = /^([A-J])(10|[1-9])$/;

/**
 * Parse a human-readable coordinate string into 0-indexed row/col.
 * Throws on invalid input.
 *
 * "A1"  → { row: 0, col: 0 }
 * "J10" → { row: 9, col: 9 }
 */
export function parseCoord(coord: Coord): GridCoord {
  const match = coord.trim().toUpperCase().match(COORD_REGEX);
  if (!match) {
    throw new Error(
      `Invalid coordinate "${coord}". Expected format: A-J followed by 1-10 (e.g. "D5", "J10").`
    );
  }
  const row = ROW_LABELS.indexOf(match[1]);
  const col = parseInt(match[2], 10) - 1;
  return { row, col };
}

/**
 * Convert 0-indexed row/col back to human-readable coordinate.
 *
 * { row: 0, col: 0 } → "A1"
 * { row: 9, col: 9 } → "J10"
 */
export function toCoord(row: number, col: number): Coord {
  if (row < 0 || row > 9 || col < 0 || col > 9) {
    throw new Error(`Grid position out of bounds: row=${row}, col=${col}`);
  }
  return `${ROW_LABELS[row]}${col + 1}`;
}

/**
 * Returns true if the coordinate string is syntactically valid.
 * Does not check whether the cell has already been shot.
 */
export function isValidCoordString(coord: string): boolean {
  return COORD_REGEX.test(coord.trim().toUpperCase());
}

/**
 * Generate all 100 coordinate strings for a 10x10 grid, in row-major order.
 */
export function allCoords(): Coord[] {
  const coords: Coord[] = [];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      coords.push(toCoord(row, col));
    }
  }
  return coords;
}
