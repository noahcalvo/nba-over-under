import { describe, expect, it } from "vitest";
import { buildTutorialLeague, TUTORIAL_VIEWER_ID } from "@/data/tutorial-league";
import type { DraftCommand } from "@/lib/fades";
import type { Result } from "@/lib/league/errors";
import type { League, Side, TeamId } from "@/lib/types";
import { applyTutorialCommand } from "./session";

function must(result: Result<League>): League {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function confirm(teamId: TeamId, side: Side, pickNumber: number): DraftCommand {
  return { type: "confirm", teamId, side, pickNumber };
}

describe("applyTutorialCommand", () => {
  it("records the viewer's pick exactly as the draft endpoint would, without touching the input", () => {
    const league = buildTutorialLeague();
    const next = must(applyTutorialCommand(league, TUTORIAL_VIEWER_ID, confirm("DET", "UNDER", 1)));
    expect(next.draft.picks).toEqual([{ pickNumber: 1, managerId: "m1", teamId: "DET", side: "UNDER" }]);
    expect(next.version).toBe(league.version + 1);
    expect(league.draft.picks).toEqual([]);
  });

  it("refuses what a real league refuses", () => {
    const league = buildTutorialLeague();
    expect(applyTutorialCommand(league, "m2", confirm("DET", "UNDER", 1))).toEqual({ ok: false, error: "forbidden" });
    expect(applyTutorialCommand(league, "m1", confirm("DET", "UNDER", 2))).toEqual({ ok: false, error: "stale_pick" });
    expect(applyTutorialCommand(league, "m1", { type: "fade", managerId: "m1", targetPickNumber: 1 })).toEqual({
      ok: false,
      error: "not_fading",
    });
  });

  it("allows opposite sides for different managers but never a held side or both sides for one manager", () => {
    let league = must(applyTutorialCommand(buildTutorialLeague(), "m1", confirm("DET", "OVER", 1)));
    expect(applyTutorialCommand(league, "m2", confirm("DET", "OVER", 2))).toEqual({ ok: false, error: "side_taken" });
    league = must(applyTutorialCommand(league, "m2", confirm("BOS", "OVER", 2)));
    league = must(applyTutorialCommand(league, "m3", confirm("BOS", "UNDER", 3)));
    league = must(applyTutorialCommand(league, "m4", confirm("CLE", "OVER", 4)));
    // Round 2 runs backward: m4 picks again at 5.
    expect(applyTutorialCommand(league, "m4", confirm("CLE", "UNDER", 5))).toEqual({
      ok: false,
      error: "team_already_held",
    });
  });
});
