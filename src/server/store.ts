import "server-only";
import { buildDemoLeague } from "@/data/demo-league";
import { TEAM_IDS } from "@/data/teams";
import { createLeagueStore, type LeagueStore } from "@/lib/league/store";

// One store per server process. globalThis keeps it alive across dev hot reloads and shared between route bundles.
const globalForStore = globalThis as unknown as { __courtlineStore?: LeagueStore };

export const leagueStore: LeagueStore = (globalForStore.__courtlineStore ??= createLeagueStore({
  teamIds: TEAM_IDS,
  seed: [buildDemoLeague()],
}));
