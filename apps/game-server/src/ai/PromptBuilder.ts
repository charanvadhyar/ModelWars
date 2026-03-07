// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/ai/PromptBuilder.ts
// Constructs the structured prompts sent to AI models each turn.
// Designed to be model-agnostic — both Claude and GPT receive identical content.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Player,
  GameState,
  Move,
  ShipId,
} from "../types/game";
import { toCoord } from "../engine/coordinates";

// ── System prompt (sent once at game start) ───────────────────────────────────

export const SYSTEM_PROMPT = `You are playing Battleship on a 10x10 grid against another AI opponent.

GRID COORDINATES:
- Rows are labeled A through J (A = top, J = bottom)
- Columns are labeled 1 through 10 (1 = left, 10 = right)
- Example coordinates: A1 (top-left), J10 (bottom-right), D5 (middle area)

SHIPS IN PLAY:
- CARRIER: 5 cells
- BATTLESHIP: 4 cells
- CRUISER: 3 cells
- SUBMARINE: 3 cells
- DESTROYER: 2 cells

RULES:
- Ships are placed horizontally or vertically, never diagonally
- You may not target a cell you have already shot
- The game ends when all of one player's ships are completely sunk

YOUR GOAL: Win by sinking all 5 of your opponent's ships before they sink yours.

RESPONSE FORMAT:
You must respond with ONLY a valid JSON object — no prose, no markdown, no explanation outside the JSON.
The JSON must match this exact schema:

{
  "target": "B4",
  "reasoning": "Explain your targeting logic in 50-500 characters",
  "strategy_tag": "one of: HUNT_MODE | PARITY_SEARCH | SINK_MODE | PROBABILITY_MAX | EDGE_CLEAR | ENDGAME",
  "probability_grid": {
    "A1": 0.02, "A2": 0.03, ... (all 100 cells, values 0.0-1.0)
  }
}

STRATEGY TAGS:
- HUNT_MODE: Searching for undiscovered ships using parity or probability
- PARITY_SEARCH: Using checkerboard/offset pattern to maximise coverage
- SINK_MODE: Following up on a hit to sink a specific ship
- PROBABILITY_MAX: Targeting the highest-probability cell from your model
- EDGE_CLEAR: Systematically clearing edges and corners
- ENDGAME: Mopping up last known ship positions

The probability_grid must contain exactly 100 keys (A1 through J10).
Already-shot cells should have probability 0.0.
Probabilities should reflect your genuine belief about where ships are located.`;

// ── Turn prompt ────────────────────────────────────────────────────────────────

export interface TurnPromptOptions {
  state: GameState;
  player: Player;
}

/**
 * Build the user-turn message for a given game state and player.
 * This is sent each turn as the "user" message.
 */
export function buildTurnPrompt(options: TurnPromptOptions): string {
  const { state, player } = options;
  const playerState = player === "A" ? state.playerA : state.playerB;
  const history = state.moveHistory.filter((m) => m.player === player);

  const shotHistory = history.map((m) => ({
    coord: m.coord,
    result: m.result,
    ...(m.shipSunkId ? { ship_sunk: m.shipSunkId } : {}),
  }));

  const fleetStatus: Record<string, string> = {};
  for (const [id, status] of Object.entries(playerState.fleet)) {
    fleetStatus[id] = status.sunk ? "SUNK" : `ALIVE (${status.hits}/${status.size} hits)`;
  }

  // Opponent fleet — we know which ships are sunk (visible to all)
  const opponentState = player === "A" ? state.playerB : state.playerA;
  const opponentFleet: Record<string, string> = {};
  for (const [id, status] of Object.entries(opponentState.fleet)) {
    opponentFleet[id] = status.sunk ? "SUNK" : "UNKNOWN";
  }

  // Build ASCII targeting grid for readability
  const targetingGridAscii = buildAsciiGrid(playerState.targetingGrid);

  // Opponent shots on us
  const incomingShots = state.moveHistory
    .filter((m) => m.player !== player)
    .map((m) => ({ coord: m.coord, result: m.result }));

  const payload = {
    turn: state.turn + 1,
    your_shots_fired: history.length,
    your_shot_history: shotHistory,
    incoming_shots_against_you: incomingShots,
    your_fleet_status: fleetStatus,
    opponent_fleet_status: opponentFleet,
    targeting_grid: targetingGridAscii,
    targeting_grid_legend: "? = unknown, M = miss, H = hit, X = sunk ship cell",
    instruction:
      "It is your turn. Analyse the board and return ONLY a valid JSON object matching the schema in your system prompt. Do not include any text outside the JSON.",
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Build the re-prompt message when a model returns an invalid response.
 */
export function buildRetryPrompt(
  previousResponse: string,
  validationError: string,
  attemptNumber: number
): string {
  return JSON.stringify({
    error: "INVALID_RESPONSE",
    attempt: attemptNumber,
    validation_error: validationError,
    your_previous_response: previousResponse.slice(0, 500),
    instruction:
      "Your previous response was invalid. Return ONLY a valid JSON object matching the schema. No prose, no markdown fences, just the JSON object.",
  });
}

// ── ASCII grid builder ─────────────────────────────────────────────────────────

function buildAsciiGrid(grid: string[][]): string {
  const colHeader = "   1  2  3  4  5  6  7  8  9  10";
  const rows = grid.map((row, r) => {
    const rowLabel = "ABCDEFGHIJ"[r];
    const cells = row.map((cell) => {
      switch (cell) {
        case "UNKNOWN": return " ?";
        case "MISS":    return " M";
        case "HIT":     return " H";
        case "SUNK":    return " X";
        default:        return " ?";
      }
    });
    return `${rowLabel} ${cells.join(" ")}`;
  });
  return [colHeader, ...rows].join("\n");
}
