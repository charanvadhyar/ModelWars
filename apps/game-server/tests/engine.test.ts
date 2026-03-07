// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/tests/engine.test.ts
// Unit tests for all game engine modules.
// Run with: npx jest engine.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { parseCoord, toCoord, isValidCoordString, allCoords } from "../src/engine/coordinates";
import { BoardState } from "../src/engine/BoardState";
import { generateRandomLayout, validateLayout } from "../src/engine/ShipPlacer";
import { validateMove, pickRandomValidMove, remainingMoves } from "../src/engine/MoveValidator";
import { GameEngine } from "../src/engine/GameEngine";
import type { ShipPlacement, Grid } from "../../../packages/shared/types/game";

// ── Coordinate Tests ──────────────────────────────────────────────────────────

describe("parseCoord", () => {
  test("parses A1 → row 0, col 0", () => {
    expect(parseCoord("A1")).toEqual({ row: 0, col: 0 });
  });

  test("parses J10 → row 9, col 9", () => {
    expect(parseCoord("J10")).toEqual({ row: 9, col: 9 });
  });

  test("parses D5 → row 3, col 4", () => {
    expect(parseCoord("D5")).toEqual({ row: 3, col: 4 });
  });

  test("is case-insensitive", () => {
    expect(parseCoord("a1")).toEqual({ row: 0, col: 0 });
    expect(parseCoord("j10")).toEqual({ row: 9, col: 9 });
  });

  test("throws on invalid input", () => {
    expect(() => parseCoord("K1")).toThrow();
    expect(() => parseCoord("A11")).toThrow();
    expect(() => parseCoord("A0")).toThrow();
    expect(() => parseCoord("")).toThrow();
    expect(() => parseCoord("11")).toThrow();
  });
});

describe("toCoord", () => {
  test("converts 0,0 → A1", () => {
    expect(toCoord(0, 0)).toBe("A1");
  });

  test("converts 9,9 → J10", () => {
    expect(toCoord(9, 9)).toBe("J10");
  });

  test("round-trips with parseCoord", () => {
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const coord = toCoord(row, col);
        expect(parseCoord(coord)).toEqual({ row, col });
      }
    }
  });

  test("throws on out-of-bounds", () => {
    expect(() => toCoord(-1, 0)).toThrow();
    expect(() => toCoord(10, 0)).toThrow();
    expect(() => toCoord(0, 10)).toThrow();
  });
});

describe("allCoords", () => {
  test("returns exactly 100 coordinates", () => {
    expect(allCoords()).toHaveLength(100);
  });

  test("all coordinates are unique", () => {
    const coords = allCoords();
    expect(new Set(coords).size).toBe(100);
  });
});

// ── ShipPlacer Tests ──────────────────────────────────────────────────────────

describe("generateRandomLayout", () => {
  test("generates a layout with all 5 ships", () => {
    const layout = generateRandomLayout();
    const ids = layout.map((p) => p.id);
    expect(ids).toContain("CARRIER");
    expect(ids).toContain("BATTLESHIP");
    expect(ids).toContain("CRUISER");
    expect(ids).toContain("SUBMARINE");
    expect(ids).toContain("DESTROYER");
  });

  test("passes layout validation", () => {
    for (let i = 0; i < 20; i++) {
      const layout = generateRandomLayout();
      const errors = validateLayout(layout);
      expect(errors).toHaveLength(0);
    }
  });

  test("no two ships overlap", () => {
    for (let i = 0; i < 20; i++) {
      const layout = generateRandomLayout();
      const cells = new Set<string>();
      for (const { row, col, size, orientation } of layout) {
        for (let j = 0; j < size; j++) {
          const r = orientation === "H" ? row : row + j;
          const c = orientation === "H" ? col + j : col;
          const key = `${r},${c}`;
          expect(cells.has(key)).toBe(false);
          cells.add(key);
        }
      }
    }
  });

  test("all ships fit within 10x10 grid", () => {
    for (let i = 0; i < 20; i++) {
      const layout = generateRandomLayout();
      for (const { row, col, size, orientation } of layout) {
        for (let j = 0; j < size; j++) {
          const r = orientation === "H" ? row : row + j;
          const c = orientation === "H" ? col + j : col;
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThanOrEqual(9);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(9);
        }
      }
    }
  });
});

describe("validateLayout", () => {
  test("catches missing ships", () => {
    const layout = generateRandomLayout().filter((p) => p.id !== "CARRIER");
    const errors = validateLayout(layout);
    expect(errors.some((e) => e.includes("CARRIER"))).toBe(true);
  });

  test("catches overlapping ships", () => {
    const layout: ShipPlacement[] = [
      { id: "CARRIER", row: 0, col: 0, orientation: "H", size: 5 },
      { id: "BATTLESHIP", row: 0, col: 0, orientation: "H", size: 4 }, // overlaps
      { id: "CRUISER", row: 2, col: 0, orientation: "H", size: 3 },
      { id: "SUBMARINE", row: 3, col: 0, orientation: "H", size: 3 },
      { id: "DESTROYER", row: 4, col: 0, orientation: "H", size: 2 },
    ];
    const errors = validateLayout(layout);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ── BoardState Tests ──────────────────────────────────────────────────────────

function makeSimpleLayout(): ShipPlacement[] {
  return [
    { id: "CARRIER",    row: 0, col: 0, orientation: "H", size: 5 }, // A1–A5
    { id: "BATTLESHIP", row: 1, col: 0, orientation: "H", size: 4 }, // B1–B4
    { id: "CRUISER",    row: 2, col: 0, orientation: "H", size: 3 }, // C1–C3
    { id: "SUBMARINE",  row: 3, col: 0, orientation: "H", size: 3 }, // D1–D3
    { id: "DESTROYER",  row: 4, col: 0, orientation: "H", size: 2 }, // E1–E2
  ];
}

describe("BoardState", () => {
  test("initialises all cells as UNKNOWN", () => {
    const board = new BoardState(makeSimpleLayout());
    const grid = board.getGrid();
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        expect(grid[r][c]).toBe("UNKNOWN");
      }
    }
  });

  test("records a miss correctly", () => {
    const board = new BoardState(makeSimpleLayout());
    const result = board.receiveShot("J10"); // empty cell
    expect(result.result).toBe("MISS");
    expect(board.getGrid()[9][9]).toBe("MISS");
  });

  test("records a hit correctly", () => {
    const board = new BoardState(makeSimpleLayout());
    const result = board.receiveShot("A1"); // CARRIER at row 0, col 0
    expect(result.result).toBe("HIT");
    expect(board.getGrid()[0][0]).toBe("HIT");
  });

  test("records a sunk correctly when all hits land", () => {
    const board = new BoardState(makeSimpleLayout());
    // DESTROYER is at E1 (row 4, col 0) and E2 (row 4, col 1)
    board.receiveShot("E1");
    const result = board.receiveShot("E2");
    expect(result.result).toBe("SUNK");
    expect(result.shipSunkId).toBe("DESTROYER");
    // Both cells should now show SUNK
    expect(board.getGrid()[4][0]).toBe("SUNK");
    expect(board.getGrid()[4][1]).toBe("SUNK");
  });

  test("throws on repeat shot", () => {
    const board = new BoardState(makeSimpleLayout());
    board.receiveShot("A1");
    expect(() => board.receiveShot("A1")).toThrow();
  });

  test("isDefeated is false after partial sinking", () => {
    const board = new BoardState(makeSimpleLayout());
    board.receiveShot("E1");
    board.receiveShot("E2"); // DESTROYER sunk
    expect(board.isDefeated()).toBe(false);
  });

  test("isDefeated is true after all ships sunk", () => {
    const board = new BoardState(makeSimpleLayout());
    const shots = [
      "A1","A2","A3","A4","A5", // CARRIER
      "B1","B2","B3","B4",       // BATTLESHIP
      "C1","C2","C3",            // CRUISER
      "D1","D2","D3",            // SUBMARINE
      "E1","E2",                 // DESTROYER
    ];
    for (const s of shots) board.receiveShot(s);
    expect(board.isDefeated()).toBe(true);
  });
});

// ── MoveValidator Tests ───────────────────────────────────────────────────────

function emptyGrid(): Grid {
  return Array.from({ length: 10 }, () => Array(10).fill("UNKNOWN")) as Grid;
}

describe("validateMove", () => {
  test("accepts a valid UNKNOWN cell", () => {
    const result = validateMove("D5", emptyGrid());
    expect(result.valid).toBe(true);
  });

  test("rejects an invalid coordinate format", () => {
    const result = validateMove("K5", emptyGrid());
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.retryable).toBe(true);
  });

  test("rejects a cell that has already been shot (MISS)", () => {
    const grid = emptyGrid();
    grid[3][4] = "MISS"; // D5 already shot
    const result = validateMove("D5", grid);
    expect(result.valid).toBe(false);
  });

  test("rejects a cell that has already been shot (HIT)", () => {
    const grid = emptyGrid();
    grid[0][0] = "HIT";
    const result = validateMove("A1", grid);
    expect(result.valid).toBe(false);
  });

  test("rejects empty string", () => {
    const result = validateMove("", emptyGrid());
    expect(result.valid).toBe(false);
  });
});

describe("pickRandomValidMove", () => {
  test("returns a cell that is UNKNOWN", () => {
    const grid = emptyGrid();
    const coord = pickRandomValidMove(grid);
    const { row, col } = parseCoord(coord);
    expect(grid[row][col]).toBe("UNKNOWN");
  });

  test("returns the only remaining cell", () => {
    // Fill all cells except J10
    const grid = emptyGrid();
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (!(r === 9 && c === 9)) grid[r][c] = "MISS";
      }
    }
    expect(pickRandomValidMove(grid)).toBe("J10");
  });

  test("throws when no moves remain", () => {
    const grid = emptyGrid();
    for (let r = 0; r < 10; r++)
      for (let c = 0; c < 10; c++)
        grid[r][c] = "MISS";
    expect(() => pickRandomValidMove(grid)).toThrow();
  });
});

describe("remainingMoves", () => {
  test("returns 100 on empty grid", () => {
    expect(remainingMoves(emptyGrid())).toBe(100);
  });

  test("decrements correctly", () => {
    const grid = emptyGrid();
    grid[0][0] = "MISS";
    grid[1][1] = "HIT";
    expect(remainingMoves(grid)).toBe(98);
  });
});

// ── GameEngine Integration Tests ──────────────────────────────────────────────

function makeHeatmap(): number[][] {
  return Array.from({ length: 10 }, () => Array(10).fill(0.01));
}

function makeMove(overrides: Partial<Parameters<GameEngine["applyMove"]>[0]> = {}) {
  return {
    player: "A" as const,
    coord: "A1",
    reasoning: "test reasoning",
    heatmap: makeHeatmap(),
    promptTokens: 100,
    completionTokens: 50,
    latencyMs: 200,
    ...overrides,
  };
}

describe("GameEngine", () => {
  test("initialises with correct match state", () => {
    const engine = new GameEngine({ modelA: "claude", modelB: "gpt4o" });
    const state = engine.getState();
    expect(state.status).toBe("IN_PROGRESS");
    expect(state.turn).toBe(0);
    expect(state.activePlayer).toBe("A");
  });

  test("alternates active player after each move", () => {
    const layout = makeSimpleLayout();
    const engine = new GameEngine({
      modelA: "claude", modelB: "gpt4o",
      layoutA: layout, layoutB: layout,
    });

    expect(engine.currentPlayer).toBe("A");
    engine.applyMove(makeMove({ player: "A", coord: "J10" }));
    expect(engine.currentPlayer).toBe("B");
    engine.applyMove(makeMove({ player: "B", coord: "J9" }));
    expect(engine.currentPlayer).toBe("A");
  });

  test("throws when wrong player submits a move", () => {
    const layout = makeSimpleLayout();
    const engine = new GameEngine({
      modelA: "claude", modelB: "gpt4o",
      layoutA: layout, layoutB: layout,
    });
    expect(() =>
      engine.applyMove(makeMove({ player: "B", coord: "A1" }))
    ).toThrow();
  });

  test("detects game over when all ships sunk", () => {
    const layout = makeSimpleLayout();
    const engine = new GameEngine({
      modelA: "claude", modelB: "gpt4o",
      layoutA: layout, layoutB: layout,
    });

    // Player A sinks all of Player B's ships (same layout)
    const shots = [
      "A1","A2","A3","A4","A5",
      "B1","B2","B3","B4",
      "C1","C2","C3",
      "D1","D2","D3",
      "E1",
    ];

    let lastResult;
    for (const coord of shots) {
      lastResult = engine.applyMove(makeMove({ player: "A", coord }));
      if (!lastResult.gameOver) {
        // B makes a harmless shot to keep turns alternating
        engine.applyMove(makeMove({ player: "B", coord: `J${shots.indexOf(coord) + 1}` }));
      }
    }

    // Last shot sinks the DESTROYER
    const finalResult = engine.applyMove(makeMove({ player: "A", coord: "E2" }));
    expect(finalResult.gameOver).toBe(true);
    expect(finalResult.winner).toBe("A");
    expect(engine.isOver).toBe(true);
    expect(engine.getState().status).toBe("COMPLETED");
  });

  test("throws if move submitted after game over", () => {
    const layout = makeSimpleLayout();
    const engine = new GameEngine({
      modelA: "claude", modelB: "gpt4o",
      layoutA: layout, layoutB: layout,
    });

    const shots = ["A1","A2","A3","A4","A5","B1","B2","B3","B4","C1","C2","C3","D1","D2","D3","E1","E2"];
    for (const coord of shots) {
      const r = engine.applyMove(makeMove({ player: "A", coord }));
      if (r.gameOver) break;
      engine.applyMove(makeMove({ player: "B", coord: `J${shots.indexOf(coord) + 1}` }));
    }

    expect(() =>
      engine.applyMove(makeMove({ player: "A", coord: "J10" }))
    ).toThrow();
  });

  test("getState returns both boards and move history", () => {
    const layout = makeSimpleLayout();
    const engine = new GameEngine({
      modelA: "claude", modelB: "gpt4o",
      layoutA: layout, layoutB: layout,
    });
    engine.applyMove(makeMove({ player: "A", coord: "H8" }));
    const state = engine.getState();
    expect(state.moveHistory).toHaveLength(1);
    expect(state.playerA.targetingGrid[7][7]).not.toBe("UNKNOWN");
  });
});
