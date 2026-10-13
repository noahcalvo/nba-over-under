import { describe, expect, it } from "vitest";
import { SEASON_CHECKPOINTS } from "./season";
import { ADVANCE_LABELS, CHECKPOINT_LABELS, PLAYING_LINES, PLAYING_LINES_PER_ADVANCE, playingLine, SEASON_STEPS, seasonStepLabel } from "./season-copy";
import { SEASON_STEP_ORDER } from "./season-steps";

describe("SEASON_STEPS", () => {
  it("has a Continue button exactly on the informational steps", () => {
    for (const step of Object.values(SEASON_STEPS)) {
      expect(Boolean(step.continueLabel)).toBe(step.advance === "continue");
    }
  });

  it("lets the user act only where an action step needs it, and points there", () => {
    expect(SEASON_STEPS["mid-pick"]).toMatchObject({ interactive: ["highlight-pick-team"], pointAt: "highlight-pick-team" });
    expect(SEASON_STEPS["mid-back"]).toMatchObject({ interactive: ["nav-overview"], pointAt: "nav-overview" });
    for (const id of ["draft-advance", "mid-advance"] as const) {
      expect(SEASON_STEPS[id]).toMatchObject({ interactive: ["season-control"], pointAt: "season-advance" });
    }
  });

  it("states the games each advance plays from the season config", () => {
    expect(SEASON_STEPS["draft-advance"].body).toContain("first 41 games");
    expect(SEASON_STEPS["mid-advance"].body).toContain("remaining 41 games");
  });

  it("introduces the season awards at Midseason, when there are leaders, with the configured points", () => {
    expect(SEASON_STEP_ORDER.draft).not.toContain("draft-awards");
    expect(SEASON_STEPS["mid-awards"].body).toContain("+2 (Best Pick)");
    expect(SEASON_STEPS["mid-awards"].body).toContain("−2 (Worst Pick)");
    expect(SEASON_STEPS["mid-awards"].body).toMatch(/can still change/);
    for (const id of ["mid-awards", "final-awards"] as const) {
      expect(SEASON_STEPS[id].spotlight[0]).toBe("season-awards");
      expect(SEASON_STEPS[id].advance).toBe("continue");
    }
  });

  it("opens Final results on the user's own outcome and closes on the final standings", () => {
    expect(SEASON_STEP_ORDER.final).toEqual(["final-results", "final-awards", "final-finish"]);
    expect(SEASON_STEPS["final-finish"].spotlight).toEqual(["standings"]);
  });

  it("names each Continue after what it leads to, never a bare Continue", () => {
    for (const step of Object.values(SEASON_STEPS)) expect(step.continueLabel).not.toBe("Continue");
  });

  it("keeps the tour short: 1, 6 and 3 steps at the three checkpoints", () => {
    expect(SEASON_CHECKPOINTS.map((checkpoint) => SEASON_STEP_ORDER[checkpoint].length)).toEqual([1, 6, 3]);
  });

  it("keeps every step to its title and body: no folded-away rules", () => {
    for (const step of Object.values(SEASON_STEPS)) expect(step.details).toBeUndefined();
  });
});

describe("labels", () => {
  it("names the three checkpoints and only offers the next one", () => {
    expect(Object.values(CHECKPOINT_LABELS)).toEqual(["Draft complete", "Midseason", "Final results"]);
    expect(ADVANCE_LABELS).toEqual({ draft: "Advance to Midseason", midseason: "Finish the Season", final: null });
    expect(seasonStepLabel("midseason")).toBe("Midseason");
  });
});

describe("playingLine", () => {
  it("steps through a few lines in turn from the starting one, wrapping round the list", () => {
    const last = PLAYING_LINES.length - 1;
    const shown = [0, 0.34, 0.67, 0.99, 1].map((fraction) => playingLine(last, fraction));
    expect(shown).toEqual([PLAYING_LINES[last], PLAYING_LINES[0], PLAYING_LINES[1], PLAYING_LINES[1], PLAYING_LINES[1]]);
    expect(new Set(shown).size).toBe(PLAYING_LINES_PER_ADVANCE);
  });
});
