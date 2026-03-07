// ─────────────────────────────────────────────────────────────────────────────
// apps/game-server/src/socket/MatchRegistry.ts
// In-memory registry of active MatchRunner instances.
// Single source of truth for match state during Phase 1 (pre-Redis).
// In Phase 2 (multi-match), replace with Redis-backed registry.
// ─────────────────────────────────────────────────────────────────────────────

import type { MatchRunner } from "./MatchRunner";

export class MatchRegistry {
  private readonly matches = new Map<string, MatchRunner>();

  register(runner: MatchRunner): void {
    if (this.matches.has(runner.matchId)) {
      throw new Error(`Match ${runner.matchId} is already registered.`);
    }
    this.matches.set(runner.matchId, runner);
  }

  get(matchId: string): MatchRunner | undefined {
    return this.matches.get(matchId);
  }

  has(matchId: string): boolean {
    return this.matches.has(matchId);
  }

  remove(matchId: string): void {
    this.matches.delete(matchId);
  }

  /** All active (RUNNING) matches */
  activeMatches(): MatchRunner[] {
    return [...this.matches.values()].filter(
      (r) => r.currentStatus === "RUNNING"
    );
  }

  count(): number {
    return this.matches.size;
  }
}
