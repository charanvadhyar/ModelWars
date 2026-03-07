// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/engine/MoveValidator.ts
// Validates proposed AI moves before they are applied to the board.
// ─────────────────────────────────────────────────────────────────────────────

import type { Grid, Coord } from "../types/game";
import { isValidCoordString, parseCoord } from "./coordinates";

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string; retryable: boolean };

/**
 * Validate a proposed move coordinate against the current targeting grid.
 *
 * @param coord     - The coordinate the AI wants to shoot (e.g. "D5")
 * @param targetingGrid - The shooting player's targeting grid (what they've shot so far)
 */
export function validateMove(coord: string, targetingGrid: Grid): ValidationResult {
  // 1. Format check
  if (!isValidCoordString(coord)) {
    return {
      valid: false,
      reason: `"${coord}" is not a valid coordinate. Use A-J for rows and 1-10 for columns (e.g. "D5", "J10").`,
      retryable: true,
    };
  }

  // 2. Already-shot check
  const { row, col } = parseCoord(coord);
  const cell = targetingGrid[row][col];

  if (cell !== "UNKNOWN") {
    return {
      valid: false,
      reason: `Cell ${coord} has already been targeted (result: ${cell}). Choose an UNKNOWN cell.`,
      retryable: true,
    };
  }

  return { valid: true };
}

/**
 * Pick a random valid (UNKNOWN) cell from the targeting grid.
 * Used as a fallback when the AI fails validation 3 times.
 */
export function pickRandomValidMove(targetingGrid: Grid): Coord {
  const available: Coord[] = [];

  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      if (targetingGrid[row][col] === "UNKNOWN") {
        const rowLabel = "ABCDEFGHIJ"[row];
        available.push(`${rowLabel}${col + 1}`);
      }
    }
  }

  if (available.length === 0) {
    throw new Error("No valid moves remaining — the board is fully shot.");
  }

  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Returns the count of remaining UNKNOWN cells (valid moves left).
 */
export function remainingMoves(targetingGrid: Grid): number {
  let count = 0;
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      if (targetingGrid[row][col] === "UNKNOWN") count++;
    }
  }
  return count;
}
