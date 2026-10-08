import { describe, expect, it } from "vitest";
import {
  buildLineReview,
  cachedLineSource,
  describeFeedError,
  describeLineSet,
  freezeLines,
  indexTeams,
  isCompleteLineSet,
  isValidLine,
  lineReader,
  parseLineValues,
  sameLineValues,
  staticLineSource,
  withAvailableLines,
  withLines,
  type LineSource,
} from "@/lib/lines";
import type { LineSet, TeamInfo } from "@/lib/types";

const INFO: TeamInfo[] = [
  { id: "MIN", nbaId: 1, city: "Minnesota", name: "Timberwolves", conference: "West", color: "#0C2340", prevWins: 49, wins: 30, losses: 18 },
  { id: "OKC", nbaId: 2, city: "Oklahoma City", name: "Thunder", conference: "West", color: "#007AC1", prevWins: 68, wins: 36, losses: 12 },
];
const LINES: LineSet = {
  source: "FanDuel",
  season: "2026–27",
  asOf: "2026-10-01T00:00:00.000Z",
  values: { MIN: 49.5, OKC: 62.5 },
  manual: [],
};
const FALLBACK = { book: "FanDuel", season: "2026–27" };
const NOW = new Date("2026-10-08T19:42:00.000Z");

describe("withLines", () => {
  it("adds each team's line to its metadata", () => {
    expect(withLines(INFO, LINES).map((team) => [team.id, team.line, team.name])).toEqual([
      ["MIN", 49.5, "Timberwolves"],
      ["OKC", 62.5, "Thunder"],
    ]);
  });

  it("throws when a team has no line", () => {
    expect(() => withLines(INFO, { ...LINES, values: { MIN: 49.5 } })).toThrow("No line for OKC");
  });

  it("withAvailableLines leaves out teams without a line", () => {
    expect(withAvailableLines(INFO, { OKC: 62.5 }).map((team) => team.id)).toEqual(["OKC"]);
  });
});

describe("isCompleteLineSet", () => {
  const ids = new Set(["MIN", "OKC"]);

  it("needs a finite line for every team", () => {
    expect(isCompleteLineSet(LINES, ids)).toBe(true);
    expect(isCompleteLineSet({ ...LINES, values: { MIN: 49.5 } }, ids)).toBe(false);
    expect(isCompleteLineSet({ ...LINES, values: { MIN: 49.5, OKC: Number.NaN } }, ids)).toBe(false);
  });
});

describe("indexTeams and staticLineSource", () => {
  it("indexes teams by id", () => {
    expect(indexTeams(withLines(INFO, LINES)).OKC.line).toBe(62.5);
  });

  it("serves the same lines every time", async () => {
    await expect(staticLineSource(LINES).current()).resolves.toBe(LINES);
  });
});

describe("isValidLine and parseLineValues", () => {
  it("accepts half-win steps strictly inside a season", () => {
    for (const ok of [0.5, 41, 49.5, 81.5]) expect(isValidLine(ok)).toBe(true);
    for (const bad of [0, 82, -1, 49.25, Number.NaN, Infinity, "49.5", null]) expect(isValidLine(bad)).toBe(false);
  });

  it("parses a map of known teams with valid lines", () => {
    const ids = new Set(["MIN", "OKC"]);
    expect(parseLineValues({ MIN: 50.5 }, ids)).toEqual({ MIN: 50.5 });
    expect(parseLineValues({}, ids)).toEqual({});
    expect(parseLineValues({ XXX: 50.5 }, ids)).toBeNull();
    expect(parseLineValues({ MIN: 50.3 }, ids)).toBeNull();
    expect(parseLineValues([1], ids)).toBeNull();
    expect(parseLineValues(null, ids)).toBeNull();
  });

  it("compares line maps", () => {
    expect(sameLineValues({ MIN: 1.5, OKC: 2.5 }, { OKC: 2.5, MIN: 1.5 })).toBe(true);
    expect(sameLineValues({ MIN: 1.5 }, { MIN: 1.5, OKC: 2.5 })).toBe(false);
    expect(sameLineValues({ MIN: 1.5 }, { MIN: 2.5 })).toBe(false);
  });
});

describe("cachedLineSource", () => {
  function counting(results: Array<LineSet | Error>): LineSource & { calls: number } {
    const source = {
      calls: 0,
      async current() {
        const result = results[Math.min(source.calls++, results.length - 1)];
        if (result instanceof Error) throw result;
        return result;
      },
    };
    return source;
  }

  it("reuses a success until the ttl passes", async () => {
    let clock = 0;
    const inner = counting([LINES]);
    const cached = cachedLineSource(inner, 1000, 100, () => clock);
    await cached.current();
    clock = 999;
    await cached.current();
    expect(inner.calls).toBe(1);
    clock = 1000;
    await cached.current();
    expect(inner.calls).toBe(2);
  });

  it("reuses a failure until the retry delay passes", async () => {
    let clock = 0;
    const inner = counting([new Error("down"), LINES]);
    const cached = cachedLineSource(inner, 1000, 100, () => clock);
    await expect(cached.current()).rejects.toThrow("down");
    clock = 50;
    await expect(cached.current()).rejects.toThrow("down");
    expect(inner.calls).toBe(1);
    clock = 100;
    await expect(cached.current()).resolves.toBe(LINES);
  });

  it("shares one in-flight read", async () => {
    const inner = counting([LINES]);
    const cached = cachedLineSource(inner, 1000, 100, () => 0);
    await Promise.all([cached.current(), cached.current()]);
    expect(inner.calls).toBe(1);
  });
});

describe("lineReader", () => {
  it("reports a failed refresh alongside the last good lines", async () => {
    let fail = false;
    const read = lineReader({
      current: async () => {
        if (fail) throw new Error("FanDuel answered 403");
        return LINES;
      },
    });
    expect(await read()).toEqual({ lines: LINES, error: null });
    fail = true;
    expect(await read()).toEqual({ lines: LINES, error: "FanDuel answered 403" });
  });

  it("describes timeouts", () => {
    expect(describeFeedError(new DOMException("t", "TimeoutError"))).toBe("The sportsbook didn't answer in time.");
    expect(describeFeedError("weird")).toBe("The sportsbook's lines couldn't be read.");
  });
});

describe("buildLineReview and freezeLines", () => {
  it("puts overrides on top of the feed and lists missing teams", () => {
    const review = buildLineReview(INFO, { lines: { ...LINES, values: { MIN: 49.5 } }, error: null }, {}, FALLBACK);
    expect(review).toMatchObject({ book: "FanDuel", season: "2026–27", asOf: LINES.asOf, missing: ["OKC"] });
    expect(freezeLines(review, NOW)).toBeNull();

    const fixed = buildLineReview(INFO, { lines: { ...LINES, values: { MIN: 49.5 } }, error: null }, { OKC: 60.5, MIN: 48.5 }, FALLBACK);
    expect(fixed.rows.map((row) => [row.team.id, row.feed, row.override, row.line])).toEqual([
      ["MIN", 49.5, 48.5, 48.5],
      ["OKC", null, 60.5, 60.5],
    ]);
    expect(fixed.missing).toEqual([]);
  });

  it("freezes a pure feed set as the book's", () => {
    const review = buildLineReview(INFO, { lines: LINES, error: null }, {}, FALLBACK);
    expect(freezeLines(review, NOW)).toEqual(LINES);
  });

  it("credits the book and lists the commissioner's lines", () => {
    const review = buildLineReview(INFO, { lines: { ...LINES, values: { MIN: 49.5 } }, error: null }, { OKC: 60.5 }, FALLBACK);
    expect(freezeLines(review, NOW)).toEqual({ ...LINES, values: { MIN: 49.5, OKC: 60.5 }, manual: ["OKC"] });
  });

  it("names the commissioner when the feed never loaded and every line was entered", () => {
    const review = buildLineReview(INFO, { lines: null, error: "FanDuel answered 403" }, { MIN: 49.5, OKC: 60.5 }, FALLBACK);
    expect(review).toMatchObject({ book: "FanDuel", asOf: null, feedError: "FanDuel answered 403" });
    expect(freezeLines(review, NOW)).toEqual({
      values: { MIN: 49.5, OKC: 60.5 },
      source: "Commissioner",
      season: "2026–27",
      asOf: NOW.toISOString(),
      manual: ["MIN", "OKC"],
    });
  });

  it("describes a frozen set", () => {
    expect(describeLineSet({ ...LINES, asOf: NOW.toISOString(), manual: ["OKC"] })).toBe(
      "FanDuel · 2026–27 · as of Oct 8, 3:42 PM ET · 1 entered by the commissioner",
    );
  });
});
