// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/tests/socket.test.ts
// Unit tests for the WebSocket layer.
// Uses mock Socket.io server — no real network connections.
// ─────────────────────────────────────────────────────────────────────────────

import { MatchRegistry } from "../src/socket/MatchRegistry";
import { MatchEventEmitter } from "../src/socket/EventEmitter";
import { MatchRunner } from "../src/socket/MatchRunner";
import type { ShipPlacement } from "../../../packages/shared/types/game";

// ── Test runner ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  const result = (() => {
    try {
      const r = fn();
      if (r instanceof Promise) {
        return r.then(() => {
          console.log(`  ✓ ${name}`);
          passed++;
        }).catch((e: any) => {
          console.log(`  ✗ ${name}`);
          console.log(`    → ${e.message}`);
          failed++;
          failures.push(name);
        });
      }
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e: any) {
      console.log(`  ✗ ${name}`);
      console.log(`    → ${e.message}`);
      failed++;
      failures.push(name);
    }
  })();
  return result;
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
    toHaveLength: (n: number) => {
      if (val.length !== n) throw new Error(`Expected length ${n}, got ${val.length}`);
    },
    toBeGreaterThan: (n: number) => {
      if (val <= n) throw new Error(`Expected ${val} > ${n}`);
    },
    toBeDefined: () => {
      if (val === undefined) throw new Error(`Expected value to be defined`);
    },
    toBeUndefined: () => {
      if (val !== undefined) throw new Error(`Expected undefined, got ${JSON.stringify(val)}`);
    },
    toBeTruthy: () => { if (!val) throw new Error(`Expected truthy`); },
    toBeFalsy: () => { if (val) throw new Error(`Expected falsy`); },
    toContain: (substr: string) => {
      if (!String(val).includes(substr))
        throw new Error(`Expected "${val}" to contain "${substr}"`);
    },
    not: {
      toBe: (expected: any) => {
        if (val === expected) throw new Error(`Expected not ${JSON.stringify(expected)}`);
      },
      toBeDefined: () => {
        if (val !== undefined) throw new Error(`Expected undefined`);
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

// ── Mock Socket.io server ─────────────────────────────────────────────────────

interface EmittedEvent {
  room: string;
  event: string;
  payload: unknown;
}

function createMockIo() {
  const emitted: EmittedEvent[] = [];
  const socketCounts: Map<string, number> = new Map();

  const mockIo = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
      },
    }),
    in: (room: string) => ({
      fetchSockets: async () => {
        const count = socketCounts.get(room) ?? 0;
        return Array(count).fill({ id: "mock-socket" });
      },
    }),
    _emitted: emitted,
    _setSocketCount: (room: string, count: number) => socketCounts.set(room, count),
    _clear: () => emitted.splice(0),
  };

  return mockIo;
}

// ── Mock AI Orchestrator ──────────────────────────────────────────────────────

// Override createOrchestrator to return a deterministic mock
// We do this by monkey-patching the module at runtime

function createMockOrchestrator() {
  let callCount = 0;
  return {
    matchCostUsd: 0,
    executeTurn: async (player: any, state: any, callbacks: any) => {
      callCount++;
      // Signal done reasoning
      callbacks.onReasoningChunk("mock reasoning text", true);

      // Alternate shots deterministically to avoid repeat-shot errors
      // Use a different area per call to avoid repeat shots
      const row = "ABCDEFGHIJ"[Math.floor(callCount / 10) % 10];
      const col = (callCount % 10) + 1;
      const coord = `${row}${col}`;

      return {
        coord,
        reasoning: `Mock reasoning for turn ${callCount}`,
        heatmap: Array.from({ length: 10 }, () => Array(10).fill(0.01)),
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 10,
        isFallback: false,
        costUsd: 0.001,
      };
    },
    _callCount: () => callCount,
  };
}

// ── MatchRegistry tests ───────────────────────────────────────────────────────

describe("MatchRegistry", () => {
  test("registers and retrieves a runner", () => {
    const registry = new MatchRegistry();
    const mockRunner = { matchId: "match-1", currentStatus: "RUNNING" } as any;
    registry.register(mockRunner);
    expect(registry.get("match-1")).toBe(mockRunner);
  });

  test("has() returns true for registered matches", () => {
    const registry = new MatchRegistry();
    const mockRunner = { matchId: "match-2", currentStatus: "RUNNING" } as any;
    registry.register(mockRunner);
    expect(registry.has("match-2")).toBe(true);
    expect(registry.has("match-99")).toBe(false);
  });

  test("throws on duplicate registration", () => {
    const registry = new MatchRegistry();
    const mockRunner = { matchId: "match-dup", currentStatus: "RUNNING" } as any;
    registry.register(mockRunner);
    expectThrows(() => registry.register(mockRunner));
  });

  test("remove() deletes from registry", () => {
    const registry = new MatchRegistry();
    const mockRunner = { matchId: "match-del", currentStatus: "RUNNING" } as any;
    registry.register(mockRunner);
    registry.remove("match-del");
    expect(registry.has("match-del")).toBe(false);
  });

  test("activeMatches() returns only RUNNING matches", () => {
    const registry = new MatchRegistry();
    registry.register({ matchId: "m1", currentStatus: "RUNNING" } as any);
    registry.register({ matchId: "m2", currentStatus: "COMPLETED" } as any);
    registry.register({ matchId: "m3", currentStatus: "RUNNING" } as any);
    expect(registry.activeMatches()).toHaveLength(2);
  });

  test("count() returns total including non-running", () => {
    const registry = new MatchRegistry();
    registry.register({ matchId: "c1", currentStatus: "RUNNING" } as any);
    registry.register({ matchId: "c2", currentStatus: "COMPLETED" } as any);
    expect(registry.count()).toBe(2);
  });
});

// ── MatchEventEmitter tests ───────────────────────────────────────────────────

describe("MatchEventEmitter", () => {
  test("matchStart emits MATCH_START to correct room", () => {
    const mockIo = createMockIo();
    const emitter = new MatchEventEmitter(mockIo as any);
    emitter.matchStart("match-abc", {
      matchId: "match-abc",
      modelA: "claude-sonnet-4-20250514",
      modelB: "gpt-4o-2024-08-06",
      shipLayoutA: [],
      shipLayoutB: [],
    });
    const event = mockIo._emitted[0];
    expect(event.room).toBe("match-abc");
    expect(event.event).toBe("MATCH_START");
  });

  test("moveResult emits MOVE_RESULT", () => {
    const mockIo = createMockIo();
    const emitter = new MatchEventEmitter(mockIo as any);
    emitter.moveResult("match-xyz", {
      matchId: "match-xyz",
      move: {
        turnNumber: 1, player: "A", coord: "D5", result: "MISS",
        reasoning: "test", heatmap: [], promptTokens: 0,
        completionTokens: 0, latencyMs: 0, timestamp: Date.now(),
      },
    });
    expect(mockIo._emitted[0].event).toBe("MOVE_RESULT");
    expect(mockIo._emitted[0].room).toBe("match-xyz");
  });

  test("reasoningChunk emits REASONING_CHUNK with correct payload", () => {
    const mockIo = createMockIo();
    const emitter = new MatchEventEmitter(mockIo as any);
    emitter.reasoningChunk("match-r", {
      matchId: "match-r",
      player: "B",
      model: "gpt-4o-2024-08-06",
      text: "I think D5 is likely because...",
      turnNumber: 3,
      done: false,
    });
    const event = mockIo._emitted[0];
    expect(event.event).toBe("REASONING_CHUNK");
    expect((event.payload as any).player).toBe("B");
    expect((event.payload as any).done).toBe(false);
  });

  test("error emits ERROR to room", () => {
    const mockIo = createMockIo();
    const emitter = new MatchEventEmitter(mockIo as any);
    emitter.error("match-e", {
      code: "AI_RETRY",
      message: "Model re-prompting",
      recoverable: true,
    });
    expect(mockIo._emitted[0].event).toBe("ERROR");
    expect((mockIo._emitted[0].payload as any).recoverable).toBe(true);
  });

  test("broadcastSpectatorCount emits correct count", async () => {
    const mockIo = createMockIo();
    mockIo._setSocketCount("match-sc", 42);
    const emitter = new MatchEventEmitter(mockIo as any);
    await emitter.broadcastSpectatorCount("match-sc");
    const event = mockIo._emitted[0];
    expect(event.event).toBe("SPECTATOR_COUNT");
    expect((event.payload as any).count).toBe(42);
  });

  test("all event types emit to the correct room only", () => {
    const mockIo = createMockIo();
    const emitter = new MatchEventEmitter(mockIo as any);
    const matchId = "isolated-match";

    emitter.gameStateUpdate(matchId, { matchId, state: {} as any });
    emitter.heatmapUpdate(matchId, {
      matchId, player: "A",
      grid: Array.from({ length: 10 }, () => Array(10).fill(0)),
      turnNumber: 1,
    });
    emitter.gameOver(matchId, {
      matchId, winner: "A", totalTurns: 50,
      durationMs: 120000, transcriptId: "t-1",
    });

    for (const ev of mockIo._emitted) {
      expect(ev.room).toBe(matchId);
    }
  });
});

// ── MatchRunner tests ─────────────────────────────────────────────────────────

describe("MatchRunner — construction", () => {
  test("generates a matchId if not provided", () => {
    const mockIo = createMockIo();
    const emitter = new MatchEventEmitter(mockIo as any);
    const runner = new MatchRunner({
      modelA: "claude-sonnet-4-20250514",
      modelB: "gpt-4o-2024-08-06",
      emitter,
    });
    expect(runner.matchId).toBeDefined();
    expect(runner.matchId.length).toBeGreaterThan(0);
  });

  test("uses provided matchId", () => {
    const mockIo = createMockIo();
    const emitter = new MatchEventEmitter(mockIo as any);
    const runner = new MatchRunner({
      matchId: "custom-id-123",
      modelA: "claude-sonnet-4-20250514",
      modelB: "gpt-4o-2024-08-06",
      emitter,
    });
    expect(runner.matchId).toBe("custom-id-123");
  });

  test("starts in IDLE status", () => {
    const mockIo = createMockIo();
    const emitter = new MatchEventEmitter(mockIo as any);
    const runner = new MatchRunner({
      modelA: "claude-sonnet-4-20250514",
      modelB: "gpt-4o-2024-08-06",
      emitter,
    });
    expect(runner.currentStatus).toBe("IDLE");
  });

  test("stores model names", () => {
    const mockIo = createMockIo();
    const emitter = new MatchEventEmitter(mockIo as any);
    const runner = new MatchRunner({
      modelA: "claude-sonnet-4-20250514",
      modelB: "gpt-4o-2024-08-06",
      emitter,
    });
    expect(runner.modelA).toBe("claude-sonnet-4-20250514");
    expect(runner.modelB).toBe("gpt-4o-2024-08-06");
  });

  test("abort() transitions to ABORTED", () => {
    const mockIo = createMockIo();
    const emitter = new MatchEventEmitter(mockIo as any);
    const runner = new MatchRunner({
      modelA: "claude-sonnet-4-20250514",
      modelB: "gpt-4o-2024-08-06",
      emitter,
    });
    runner.abort();
    expect(runner.currentStatus).toBe("ABORTED");
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────

// Collect any async tests
setImmediate(async () => {
  // Wait a tick for any pending async tests
  await new Promise(r => setTimeout(r, 100));

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("Failed:");
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exit(1);
  } else {
    console.log("All tests passed ✓");
  }
});
