// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/ai/PlacementParser.ts
// Parses and validates a model's fleet placement response.
// ─────────────────────────────────────────────────────────────────────────────

import type { ShipPlacement, ShipId, Orientation } from "../types/game";
import { ALL_SHIPS, SHIP_SIZES } from "../types/game";
import { validateLayout } from "../engine/ShipPlacer";

export type PlacementParseResult =
  | { success: true;  placements: ShipPlacement[]; reasoning: string }
  | { success: false; error: string };

export function parsePlacementResponse(raw: string): PlacementParseResult {
  // Strip markdown fences and extract JSON object
  const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { success: false, error: "No JSON object found in response." };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch (e) {
    return { success: false, error: `JSON parse error: ${(e as Error).message}` };
  }

  if (!Array.isArray(parsed.placements)) {
    return { success: false, error: '"placements" must be an array.' };
  }
  if (parsed.placements.length !== 5) {
    return { success: false, error: `Expected 5 ship placements, got ${parsed.placements.length}.` };
  }

  const placements: ShipPlacement[] = [];
  const seenShips = new Set<ShipId>();

  for (const p of parsed.placements) {
    const ship = String(p.ship ?? "").trim().toUpperCase() as ShipId;
    if (!ALL_SHIPS.includes(ship)) {
      return { success: false, error: `Unknown ship "${p.ship}". Must be one of: ${ALL_SHIPS.join(", ")}` };
    }
    if (seenShips.has(ship)) {
      return { success: false, error: `Duplicate ship "${ship}" in placements.` };
    }
    seenShips.add(ship);

    const coord = String(p.start ?? "").trim().toUpperCase();
    const m = coord.match(/^([A-J])(10|[1-9])$/);
    if (!m) {
      return { success: false, error: `Invalid start coordinate "${p.start}" for ${ship}. Use letter A-J + number 1-10 (e.g. "A1", "J10").` };
    }

    const row = "ABCDEFGHIJ".indexOf(m[1]);
    const col = parseInt(m[2], 10) - 1;

    const orientation = String(p.orientation ?? "").trim().toUpperCase() as Orientation;
    if (orientation !== "H" && orientation !== "V") {
      return { success: false, error: `Invalid orientation "${p.orientation}" for ${ship}. Must be "H" or "V".` };
    }

    // Bounds check before validateLayout (gives clearer error)
    const size = SHIP_SIZES[ship];
    if (orientation === "H" && col + size > 10) {
      return { success: false, error: `${ship} (size ${size}) starting at ${coord} extends beyond column 10 with orientation H.` };
    }
    if (orientation === "V" && row + size > 10) {
      return { success: false, error: `${ship} (size ${size}) starting at ${coord} extends beyond row J with orientation V.` };
    }

    placements.push({ id: ship, row, col, orientation, size });
  }

  // Full layout validation (catches overlaps etc.)
  const errors = validateLayout(placements);
  if (errors.length > 0) {
    return { success: false, error: `Layout invalid: ${errors[0]}` };
  }

  const reasoning = typeof parsed.reasoning === "string"
    ? parsed.reasoning.trim().slice(0, 600)
    : "Fleet placed.";

  return { success: true, placements, reasoning };
}
