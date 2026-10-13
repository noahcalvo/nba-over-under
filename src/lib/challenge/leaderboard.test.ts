import { describe, expect, it } from "vitest";
import { leaderboardSubtitle, paceText } from "./leaderboard";

describe("leaderboardSubtitle", () => {
  const deadline = "2026-10-20T23:00:00.000Z";
  it("counts entries and names the deadline while open", () => {
    expect(leaderboardSubtitle("open", 2, deadline, null)).toBe(
      "2 entries saved. Picks and scores appear when the challenge locks at Oct 20, 7:00 PM ET.",
    );
    expect(leaderboardSubtitle("open", 1, null, null)).toBe("1 entry saved. Picks and scores appear when the challenge locks.");
  });

  it("says locked before games, ranked in season, final at the end", () => {
    expect(leaderboardSubtitle("locked", 3, deadline, "2026-10-20T23:00:05.000Z")).toBe(
      "Locked Oct 20, 7:00 PM ET. Scores start with the first games.",
    );
    expect(leaderboardSubtitle("locking", 3, null, null)).toBe("Locked. Scores start with the first games.");
    expect(leaderboardSubtitle("in_season", 3, deadline, null)).toBe("Ranked by projected score (win pace).");
    expect(leaderboardSubtitle("final", 3, deadline, null)).toBe("Final standings.");
  });
});

describe("paceText", () => {
  it("is empty while unscored", () => {
    expect(paceText("locked", null, 0, 0)).toBeNull();
    expect(paceText("in_season", 0, 0, 0)).toBeNull();
  });
  it("reads On pace in season and Correct when final", () => {
    expect(paceText("in_season", 1.2, 7, 12)).toBe("On pace 7/12");
    expect(paceText("final", 4, 20, 30)).toBe("Correct 20/30");
  });
});
