import { describe, expect, it } from "vitest";
import { TEAM_INFO } from "@/data/teams";
import { freezeFromSnapshots } from "./freeze";
import type { LineSnapshot } from "./types";

const IDS = TEAM_INFO.map((team) => team.id);
const DEADLINE = "2026-10-20T18:30:00.000Z";
const snapshot = (observedAt: string, lines: Record<string, number>, source = "FanDuel"): LineSnapshot => ({ observedAt, source, lines });
const full = (value: number): Record<string, number> => Object.fromEntries(IDS.map((id) => [id, value]));

describe("freezeFromSnapshots", () => {
  it("takes each line from the newest snapshot before the deadline", () => {
    const result = freezeFromSnapshots(
      [snapshot("2026-10-10T00:00:00.000Z", full(40.5)), snapshot("2026-10-15T00:00:00.000Z", full(41.5), "Book B")],
      DEADLINE,
      IDS,
    );
    expect(result.values.BOS).toBe(41.5);
    expect(result.observedAt.BOS).toBe("2026-10-15T00:00:00.000Z");
    expect(result.missing).toEqual([]);
    expect(result.source).toBe("Book B");
  });
  it("ignores a snapshot at or after the deadline", () => {
    const result = freezeFromSnapshots(
      [
        snapshot("2026-10-10T00:00:00.000Z", full(40.5)),
        snapshot(DEADLINE, full(45.5)),
        snapshot("2026-10-20T19:00:00.000Z", full(46.5)),
      ],
      DEADLINE,
      IDS,
    );
    expect(result.values.BOS).toBe(40.5);
    expect(result.observedAt.BOS).toBe("2026-10-10T00:00:00.000Z");
  });
  it("falls back to an older snapshot for a team the newest lacks, with that time", () => {
    const { MIN: _omit, ...rest } = full(41.5);
    void _omit;
    const result = freezeFromSnapshots(
      [snapshot("2026-10-10T00:00:00.000Z", full(40.5)), snapshot("2026-10-15T00:00:00.000Z", rest)],
      DEADLINE,
      IDS,
    );
    expect(result.values.MIN).toBe(40.5);
    expect(result.observedAt.MIN).toBe("2026-10-10T00:00:00.000Z");
    expect(result.values.BOS).toBe(41.5);
    expect(result.missing).toEqual([]);
  });
  it("marks a team in no pre-deadline snapshot as missing, never zero", () => {
    const { MIN: _a, ATL: _b, ...rest } = full(41.5);
    void _a;
    void _b;
    const result = freezeFromSnapshots([snapshot("2026-10-15T00:00:00.000Z", rest)], DEADLINE, IDS);
    expect(result.missing).toEqual(["ATL", "MIN"]);
    expect("MIN" in result.values).toBe(false);
    expect("ATL" in result.observedAt).toBe(false);
  });
  it("skips an invalid line value and looks further back", () => {
    const result = freezeFromSnapshots(
      [snapshot("2026-10-10T00:00:00.000Z", full(40.5)), snapshot("2026-10-15T00:00:00.000Z", { ...full(41.5), MIN: 0 })],
      DEADLINE,
      IDS,
    );
    expect(result.values.MIN).toBe(40.5);
  });
  it("misses all 30 with no snapshots", () => {
    const result = freezeFromSnapshots([], DEADLINE, IDS);
    expect(result.missing).toEqual([...IDS].sort());
    expect(result.missing).toHaveLength(30);
    expect(result.values).toEqual({});
    expect(result.source).toBeNull();
  });
  it("misses all 30 when every snapshot is at or after the deadline", () => {
    const result = freezeFromSnapshots([snapshot(DEADLINE, full(40.5))], DEADLINE, IDS);
    expect(result.missing).toHaveLength(30);
    expect(result.source).toBeNull();
  });
});
