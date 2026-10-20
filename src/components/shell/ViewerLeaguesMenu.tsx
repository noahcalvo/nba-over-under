import { Suspense } from "react";
import { listViewerLeagues } from "@/server/league";
import { LeaguesMenu } from "./LeaguesMenu";

/**
 * The mobile header's way into a league outside a league (the challenge and NBA pages): this browser's leagues stream
 * in; until then the menu only links home.
 */
export function ViewerLeaguesMenu() {
  return (
    <Suspense fallback={<LeaguesMenu leagues={[]} />}>
      <ViewerLeagues />
    </Suspense>
  );
}

async function ViewerLeagues() {
  const leagues = await listViewerLeagues();
  return (
    <LeaguesMenu leagues={leagues.map(({ id, name, seasonLabel }) => ({ id, name, seasonLabel }))} />
  );
}
