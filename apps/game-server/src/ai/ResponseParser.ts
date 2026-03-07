// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/ai/ResponseParser.ts
// Parses and validates raw model text responses into structured move data.
// Handles malformed JSON, missing fields, and invalid coordinates gracefully.
// ─────────────────────────────────────────────────────────────────────────────

import type { HeatmapGrid, Coord } from "../types/game";
import { isValidCoordString, allCoords } from "../engine/coordinates";

export const VALID_STRATEGY_TAGS = [
  "HUNT_MODE",
  "PARITY_SEARCH",
  "SINK_MODE",
  "PROBABILITY_MAX",
  "EDGE_CLEAR",
  "ENDGAME",
] as const;

export type StrategyTag = (typeof VALID_STRATEGY_TAGS)[number];

export interface ParsedMove {
  target: Coord;
  reasoning: string;
  strategyTag?: StrategyTag;
  heatmap: HeatmapGrid;
  rawResponse: string;
}

export type ParseResult =
  | { success: true; move: ParsedMove }
  | { success: false; error: string; rawResponse: string };

/**
 * Parse a raw model response string into a validated ParsedMove.
 * Accepts responses with leading/trailing whitespace or markdown fences.
 */
export function parseModelResponse(raw: string): ParseResult {
  const rawResponse = raw;

  // ── Step 1: Extract JSON from response ──────────────────────────────────────
  let jsonText = extractJson(raw);
  if (!jsonText) {
    return {
      success: false,
      error: "Response does not contain a valid JSON object. Ensure your entire response is a single JSON object with no surrounding text.",
      rawResponse,
    };
  }

  // ── Step 2: Parse JSON ───────────────────────────────────────────────────────
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return {
      success: false,
      error: `JSON parse error: ${(e as Error).message}. Check for trailing commas, unquoted keys, or invalid values.`,
      rawResponse,
    };
  }

  // ── Step 3: Validate target coordinate ──────────────────────────────────────
  if (typeof parsed.target !== "string") {
    return {
      success: false,
      error: `"target" field is missing or not a string. Got: ${JSON.stringify(parsed.target)}`,
      rawResponse,
    };
  }

  const target = parsed.target.trim().toUpperCase();
  if (!isValidCoordString(target)) {
    return {
      success: false,
      error: `"target" value "${parsed.target}" is not a valid coordinate. Use A-J for rows and 1-10 for columns (e.g. "D5").`,
      rawResponse,
    };
  }

  // ── Step 4: Validate reasoning ───────────────────────────────────────────────
  if (typeof parsed.reasoning !== "string" || parsed.reasoning.trim().length < 10) {
    return {
      success: false,
      error: `"reasoning" field is missing or too short (minimum 10 characters). Explain your targeting logic.`,
      rawResponse,
    };
  }

  const reasoning = parsed.reasoning.trim().slice(0, 1000); // cap at 1000 chars

  // ── Step 5: Validate strategy tag (optional but validated if present) ────────
  let strategyTag: StrategyTag | undefined;
  if (parsed.strategy_tag !== undefined) {
    const tag = String(parsed.strategy_tag).trim().toUpperCase();
    if (VALID_STRATEGY_TAGS.includes(tag as StrategyTag)) {
      strategyTag = tag as StrategyTag;
    }
    // Invalid tag is silently dropped — not a fatal error
  }

  // ── Step 6: Validate and normalise probability grid ──────────────────────────
  const heatmapResult = parseProbabilityGrid(parsed.probability_grid);
  if (!heatmapResult.success) {
    return { success: false, error: heatmapResult.error, rawResponse };
  }

  return {
    success: true,
    move: {
      target,
      reasoning,
      strategyTag,
      heatmap: heatmapResult.grid,
      rawResponse,
    },
  };
}

// ── Probability grid parser ────────────────────────────────────────────────────

type GridParseResult =
  | { success: true; grid: HeatmapGrid }
  | { success: false; error: string };

function parseProbabilityGrid(raw: unknown): GridParseResult {
  const coords = allCoords();
  const grid: HeatmapGrid = Array.from({ length: 10 }, () => Array(10).fill(0));

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    // Model omitted the grid — return a uniform distribution
    // This is a soft failure: we log it but don't reject the move
    return { success: true, grid: uniformGrid() };
  }

  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length !== 100) {
    // Tolerate grids with slightly wrong count — fill missing with 0
    // (common failure mode: model omits already-shot cells)
  }

  let hasAnyValue = false;

  for (const coord of coords) {
    if (coord in obj) {
      const val = obj[coord];
      const num = typeof val === "number" ? val : parseFloat(String(val));
      if (!isNaN(num)) {
        const { row, col } = coordToRowCol(coord);
        grid[row][col] = Math.max(0, Math.min(1, num)); // clamp to [0,1]
        hasAnyValue = true;
      }
    }
  }

  if (!hasAnyValue) {
    return { success: true, grid: uniformGrid() };
  }

  return { success: true, grid };
}

function uniformGrid(): HeatmapGrid {
  return Array.from({ length: 10 }, () => Array(10).fill(0.01));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the first JSON object from a string.
 * Handles markdown fences like ```json ... ``` and leading prose.
 */
function extractJson(text: string): string | null {
  // Strip markdown fences
  const stripped = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Find first { and last }
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) return null;

  return stripped.slice(start, end + 1);
}

function coordToRowCol(coord: string): { row: number; col: number } {
  const row = "ABCDEFGHIJ".indexOf(coord[0].toUpperCase());
  const col = parseInt(coord.slice(1), 10) - 1;
  return { row, col };
}
