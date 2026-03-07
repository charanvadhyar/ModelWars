// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/tests/ai.test.ts
// Unit tests for AI integration: PromptBuilder, ResponseParser.
// AIOrchestrator is integration-tested separately (requires API keys).
// ─────────────────────────────────────────────────────────────────────────────

import { buildTurnPrompt, buildRetryPrompt, SYSTEM_PROMPT } from "../src/ai/PromptBuilder";
import { parseModelResponse } from "../src/ai/ResponseParser";
import { estimateCostUsd, MATCH_COST_HARD_CAP_USD } from "../src/ai/AIClient";
import type { GameState, ShipPlacement } from "../../../packages/shared/types/game";
import { GameEngine } from "../src/engine/GameEngine";

// ── Test runner (no jest — mirrors engine.test pattern) ───────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`  ✗ ${name}`);
    console.log(`    → ${e.message}`);
    failed++;
    failures.push(name);
  }
}

function expect(val: any) {
  return {
    toBe: (expected: any) => {
      if (val !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`);
    },
    toEqual: (expected: any) => {
      if (JSON.stringify(val) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`);
    },
    toContain: (substr: string) => {
      if (!String(val).includes(substr))
        throw new Error(`Expected "${val}" to contain "${substr}"`);
    },
    toHaveLength: (n: number) => {
      if (val.length !== n)
        throw new Error(`Expected length ${n}, got ${val.length}`);
    },
    toBeGreaterThan: (n: number) => {
      if (val <= n) throw new Error(`Expected ${val} > ${n}`);
    },
    toBeLessThanOrEqual: (n: number) => {
      if (val > n) throw new Error(`Expected ${val} <= ${n}`);
    },
    toBeTruthy: () => {
      if (!val) throw new Error(`Expected truthy, got ${JSON.stringify(val)}`);
    },
    toBeFalsy: () => {
      if (val) throw new Error(`Expected falsy, got ${JSON.stringify(val)}`);
    },
    not: {
      toBe: (expected: any) => {
        if (val === expected) throw new Error(`Expected not ${JSON.stringify(expected)}`);
      },
      toBeNull: () => {
        if (val === null) throw new Error(`Expected not null`);
      }
    }
  };
}

function expectThrows(fn: () => void) {
  try {
    fn();
    throw new Error("Expected function to throw but it did not");
  } catch (e: any) {
    if (e.message === "Expected function to throw but it did not") throw e;
  }
}

function describe(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function simpleLayout(): ShipPlacement[] {
  return [
    { id: "CARRIER",    row: 0, col: 0, orientation: "H", size: 5 },
    { id: "BATTLESHIP", row: 1, col: 0, orientation: "H", size: 4 },
    { id: "CRUISER",    row: 2, col: 0, orientation: "H", size: 3 },
    { id: "SUBMARINE",  row: 3, col: 0, orientation: "H", size: 3 },
    { id: "DESTROYER",  row: 4, col: 0, orientation: "H", size: 2 },
  ];
}

function makeHeatmap() {
  return Array.from({ length: 10 }, () => Array(10).fill(0.01));
}

function freshGameState(): GameState {
  const layout = simpleLayout();
  const engine = new GameEngine({
    modelA: "claude-sonnet-4-20250514",
    modelB: "gpt-4o-2024-08-06",
    layoutA: layout,
    layoutB: layout,
  });
  return engine.getState();
}

function makeProbabilityGrid(): Record<string, number> {
  const grid: Record<string, number> = {};
  const rows = "ABCDEFGHIJ";
  for (let r = 0; r < 10; r++) {
    for (let c = 1; c <= 10; c++) {
      grid[`${rows[r]}${c}`] = 0.01;
    }
  }
  return grid;
}

// ── PromptBuilder tests ───────────────────────────────────────────────────────

describe("SYSTEM_PROMPT", () => {
  test("contains coordinate format instructions", () => {
    expect(SYSTEM_PROMPT).toContain("A through J");
  });
  test("contains all 5 ship names", () => {
    expect(SYSTEM_PROMPT).toContain("CARRIER");
    expect(SYSTEM_PROMPT).toContain("BATTLESHIP");
    expect(SYSTEM_PROMPT).toContain("CRUISER");
    expect(SYSTEM_PROMPT).toContain("SUBMARINE");
    expect(SYSTEM_PROMPT).toContain("DESTROYER");
  });
  test("contains JSON schema instruction", () => {
    expect(SYSTEM_PROMPT).toContain("probability_grid");
    expect(SYSTEM_PROMPT).toContain("reasoning");
    expect(SYSTEM_PROMPT).toContain("strategy_tag");
  });
  test("instructs to return ONLY JSON", () => {
    expect(SYSTEM_PROMPT).toContain("ONLY");
  });
});

describe("buildTurnPrompt", () => {
  test("returns valid JSON string", () => {
    const state = freshGameState();
    const prompt = buildTurnPrompt({ state, player: "A" });
    const parsed = JSON.parse(prompt); // should not throw
    expect(typeof parsed).toBe("object");
  });

  test("includes turn number", () => {
    const state = freshGameState();
    const prompt = buildTurnPrompt({ state, player: "A" });
    expect(prompt).toContain("turn");
  });

  test("includes targeting grid ASCII", () => {
    const state = freshGameState();
    const prompt = buildTurnPrompt({ state, player: "A" });
    expect(prompt).toContain("targeting_grid");
    expect(prompt).toContain("?"); // unknown cells shown as ?
    expect(prompt).toContain("10"); // column 10 label present
  });

  test("includes fleet status", () => {
    const state = freshGameState();
    const prompt = buildTurnPrompt({ state, player: "A" });
    expect(prompt).toContain("CARRIER");
    expect(prompt).toContain("ALIVE");
  });

  test("includes shot history after moves are made", () => {
    const layout = simpleLayout();
    const engine = new GameEngine({
      modelA: "claude-sonnet-4-20250514",
      modelB: "gpt-4o-2024-08-06",
      layoutA: layout,
      layoutB: layout,
    });
    engine.applyMove({
      player: "A", coord: "J10", reasoning: "test",
      heatmap: makeHeatmap(), promptTokens: 100, completionTokens: 50, latencyMs: 200,
    });
    const state = engine.getState();
    const prompt = buildTurnPrompt({ state, player: "A" });
    expect(prompt).toContain("J10");
  });

  test("works for player B", () => {
    const state = freshGameState();
    const prompt = buildTurnPrompt({ state, player: "B" });
    const parsed = JSON.parse(prompt);
    expect(typeof parsed).toBe("object");
  });
});

describe("buildRetryPrompt", () => {
  test("includes error information", () => {
    const prompt = buildRetryPrompt('{"bad": true}', "missing target field", 2);
    expect(prompt).toContain("INVALID_RESPONSE");
    expect(prompt).toContain("missing target field");
  });

  test("includes attempt number", () => {
    const prompt = buildRetryPrompt("{}", "error", 2);
    const parsed = JSON.parse(prompt);
    expect(parsed.attempt).toBe(2);
  });

  test("truncates long previous responses", () => {
    const longResponse = "x".repeat(2000);
    const prompt = buildRetryPrompt(longResponse, "error", 1);
    expect(prompt.length).toBeLessThanOrEqual(2000); // shouldn't balloon
  });
});

// ── ResponseParser tests ──────────────────────────────────────────────────────

describe("parseModelResponse — valid responses", () => {
  test("parses a perfect response", () => {
    const grid = makeProbabilityGrid();
    const raw = JSON.stringify({
      target: "D5",
      reasoning: "High probability area based on parity search pattern",
      strategy_tag: "PARITY_SEARCH",
      probability_grid: grid,
    });
    const result = parseModelResponse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.move.target).toBe("D5");
      expect(result.move.strategyTag).toBe("PARITY_SEARCH");
      expect(result.move.reasoning).toContain("parity");
    }
  });

  test("strips markdown fences", () => {
    const grid = makeProbabilityGrid();
    const raw = "```json\n" + JSON.stringify({
      target: "A1",
      reasoning: "Testing markdown fence stripping in parser",
      probability_grid: grid,
    }) + "\n```";
    const result = parseModelResponse(raw);
    expect(result.success).toBe(true);
  });

  test("accepts lowercase coordinate and upcases it", () => {
    const grid = makeProbabilityGrid();
    const raw = JSON.stringify({
      target: "d5",
      reasoning: "Lowercase coordinate should be normalised correctly",
      probability_grid: grid,
    });
    const result = parseModelResponse(raw);
    expect(result.success).toBe(true);
    if (result.success) expect(result.move.target).toBe("D5");
  });

  test("accepts response without strategy_tag", () => {
    const grid = makeProbabilityGrid();
    const raw = JSON.stringify({
      target: "J10",
      reasoning: "Corner shot to clear edges and reduce unknown cells",
      probability_grid: grid,
    });
    const result = parseModelResponse(raw);
    expect(result.success).toBe(true);
    if (result.success) expect(result.move.strategyTag).toBe(undefined);
  });

  test("handles missing probability_grid gracefully (soft failure)", () => {
    const raw = JSON.stringify({
      target: "B3",
      reasoning: "Model forgot to include heatmap but move is valid",
    });
    const result = parseModelResponse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      // Should get uniform grid fallback
      expect(result.move.heatmap[0][0]).toBe(0.01);
    }
  });

  test("extracts JSON from response with leading prose", () => {
    const grid = makeProbabilityGrid();
    const raw = "Sure, here is my move:\n" + JSON.stringify({
      target: "E7",
      reasoning: "Following up on hit in this region for sink mode",
      probability_grid: grid,
    });
    const result = parseModelResponse(raw);
    expect(result.success).toBe(true);
  });

  test("caps reasoning at 1000 chars", () => {
    const grid = makeProbabilityGrid();
    const raw = JSON.stringify({
      target: "F6",
      reasoning: "x".repeat(2000),
      probability_grid: grid,
    });
    const result = parseModelResponse(raw);
    expect(result.success).toBe(true);
    if (result.success) expect(result.move.reasoning.length).toBeLessThanOrEqual(1000);
  });
});

describe("parseModelResponse — invalid responses", () => {
  test("fails on completely empty response", () => {
    const result = parseModelResponse("");
    expect(result.success).toBe(false);
  });

  test("fails on pure prose (no JSON)", () => {
    const result = parseModelResponse("I will shoot at D5 because it seems likely.");
    expect(result.success).toBe(false);
  });

  test("fails on invalid JSON", () => {
    const result = parseModelResponse("{ target: D5, reasoning: missing quotes }");
    expect(result.success).toBe(false);
  });

  test("fails when target field is missing", () => {
    const result = parseModelResponse(JSON.stringify({
      reasoning: "No target field included",
      probability_grid: makeProbabilityGrid(),
    }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("target");
  });

  test("fails when target is an invalid coordinate", () => {
    const result = parseModelResponse(JSON.stringify({
      target: "K5",
      reasoning: "K row does not exist on a standard Battleship grid",
      probability_grid: makeProbabilityGrid(),
    }));
    expect(result.success).toBe(false);
  });

  test("fails when reasoning is too short", () => {
    const result = parseModelResponse(JSON.stringify({
      target: "A1",
      reasoning: "short",
      probability_grid: makeProbabilityGrid(),
    }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("reasoning");
  });

  test("includes rawResponse on failure", () => {
    const raw = "not json at all";
    const result = parseModelResponse(raw);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.rawResponse).toBe(raw);
  });
});

describe("parseModelResponse — heatmap parsing", () => {
  test("clamps probability values to [0, 1]", () => {
    const grid = makeProbabilityGrid();
    grid["A1"] = 1.5; // over max
    grid["B2"] = -0.3; // under min
    const raw = JSON.stringify({
      target: "D5",
      reasoning: "Testing heatmap value clamping behaviour",
      probability_grid: grid,
    });
    const result = parseModelResponse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.move.heatmap[0][0]).toBeLessThanOrEqual(1);
      expect(result.move.heatmap[1][1]).toBeGreaterThan(-0.1);
    }
  });

  test("produces 10x10 grid", () => {
    const grid = makeProbabilityGrid();
    const raw = JSON.stringify({
      target: "G3",
      reasoning: "Targeting grid row G column 3 for strategic reasons",
      probability_grid: grid,
    });
    const result = parseModelResponse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.move.heatmap).toHaveLength(10);
      expect(result.move.heatmap[0]).toHaveLength(10);
    }
  });
});

// ── Cost estimation tests ─────────────────────────────────────────────────────

describe("estimateCostUsd", () => {
  test("calculates Claude Sonnet cost correctly", () => {
    // 1000 input tokens, 500 output tokens at $3/$15 per 1M
    const cost = estimateCostUsd("claude-sonnet-4-20250514", 1000, 500);
    const expected = (1000 / 1_000_000) * 3.00 + (500 / 1_000_000) * 15.00;
    expect(Math.abs(cost - expected) < 0.000001).toBe(true);
  });

  test("calculates GPT-4o cost correctly", () => {
    const cost = estimateCostUsd("gpt-4o-2024-08-06", 800, 300);
    const expected = (800 / 1_000_000) * 5.00 + (300 / 1_000_000) * 15.00;
    expect(Math.abs(cost - expected) < 0.000001).toBe(true);
  });

  test("returns 0 for unknown model", () => {
    expect(estimateCostUsd("unknown-model-xyz", 1000, 500)).toBe(0);
  });

  test("hard cap constant is $0.50", () => {
    expect(MATCH_COST_HARD_CAP_USD).toBe(0.50);
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("Failed:");
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}
