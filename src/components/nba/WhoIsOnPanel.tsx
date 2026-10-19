import Link from "next/link";
import { ChallengeInterestCard } from "@/components/nba/ChallengeInterestCard";
import { LeagueInterestCard } from "@/components/nba/LeagueInterestCard";
import { YourStakes } from "@/components/nba/YourStakes";
import { Panel } from "@/components/ui/Panel";
import { stakesPanelState } from "@/lib/nba-schedule/game-stakes";
import type { TeamInfo } from "@/lib/types";
import type { GameStakes } from "@/server/nba-pages";

/** Every pick and fade on either team in the viewer's leagues, plus their own challenge sides. Waits for the stakes. */
export async function WhoIsOnPanel({ teams, stakes }: { teams: TeamInfo[]; stakes: Promise<GameStakes> }) {
  const resolved = await stakes;
  const { leagues, challenge, yours } = resolved;
  const state = stakesPanelState(resolved);
  return (
    <Panel title="Who's on this game?" bodyClassName="flex flex-col gap-4 p-4 sm:p-5">
      <p className="text-sm text-fog-300">
        An Over gains from its team winning; an Under gains from its team losing. A fade roots against the pick it fades.
      </p>
      {state === "failed" ? (
        <p className="text-sm text-fog-300">{"Couldn't load your leagues' picks."}</p>
      ) : state === "join" ? (
        <Link href="/" className="text-sm font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {"Join or create a league to see who's on this game."}
        </Link>
      ) : (
        <>
          {state === "partial" && <p className="text-sm text-fog-400">Some of your leagues couldn&apos;t be loaded.</p>}
          {yours.length > 0 && <YourStakes stakes={yours} teams={teams} />}
          {leagues.map((interest) => (
            <LeagueInterestCard key={interest.leagueId} interest={interest} teams={teams} />
          ))}
          {challenge && <ChallengeInterestCard interest={challenge} teams={teams} />}
        </>
      )}
    </Panel>
  );
}
