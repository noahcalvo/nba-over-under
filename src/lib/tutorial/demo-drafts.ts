import { buildTutorialLeague, TUTORIAL_VIEWER_ID, tutorialTeams } from "@/data/tutorial-league";
import type { League, Side, TeamId } from "@/lib/types";
import { applyTutorialCommand } from "./session";
import { simulateAll } from "./simulation";

// Tests only: guided demos completed the way a user would complete them (one pick, one fade, the rest simulated).

/** The user opens with `teamId` `side`, the draft is simulated, the user fades `fadeTarget`, the other fades follow. */
export function completedDemo(teamId: TeamId, side: Side, fadeTarget = 2): League {
  const teams = tutorialTeams();
  const confirm = { type: "confirm" as const, teamId, side, pickNumber: 1 };
  const opened = applyTutorialCommand(buildTutorialLeague(), TUTORIAL_VIEWER_ID, confirm);
  if (!opened.ok) throw new Error(opened.error);
  const drafted = simulateAll(opened.value, teams, "draft");
  const fade = { type: "fade" as const, managerId: TUTORIAL_VIEWER_ID, targetPickNumber: fadeTarget };
  const faded = applyTutorialCommand(drafted, TUTORIAL_VIEWER_ID, fade);
  if (!faded.ok) throw new Error(faded.error);
  return simulateAll(faded.value, teams, "fades");
}
