import { describe, expect, it } from "vitest";
import { challengeNavItems, isChallengeNavActive } from "./nav-items";

function activeHrefs(pathname: string): string[] {
  return challengeNavItems()
    .filter((item) => isChallengeNavActive(item, pathname))
    .map((item) => item.href);
}

describe("challengeNavItems", () => {
  it("lists the pages in order", () => {
    expect(challengeNavItems().map((item) => item.href)).toEqual([
      "/",
      "/challenge",
      "/challenge/my-picks",
      "/challenge/leaderboard",
      "/challenge/how-it-works",
    ]);
  });

  it("keeps Home in the sidebar only", () => {
    expect(challengeNavItems().filter((item) => item.sidebarOnly).map((item) => item.href)).toEqual(["/"]);
  });
});

describe("isChallengeNavActive", () => {
  it("lights the challenge root only on the root", () => {
    expect(activeHrefs("/challenge")).toEqual(["/challenge"]);
    expect(activeHrefs("/challenge/my-picks")).toEqual(["/challenge/my-picks"]);
  });

  it("lights Leaderboard on an entry page", () => {
    expect(activeHrefs("/challenge/entries/abc")).toEqual(["/challenge/leaderboard"]);
  });

  it("lights My Picks on a team page", () => {
    expect(activeHrefs("/challenge/teams/MIN")).toEqual(["/challenge/my-picks"]);
  });

  it("lights How It Works on its page", () => {
    expect(activeHrefs("/challenge/how-it-works")).toEqual(["/challenge/how-it-works"]);
  });
});
