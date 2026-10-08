import "server-only";
import { RECORDS } from "@/config/records";
import { TEAM_IDS, TEAM_INFO, teamIdByNickname } from "@/data/teams";
import { espnStandingsUrl, parseEspnStandings } from "@/lib/records/espn";
import { staticRecordSource } from "@/lib/records/static";
import type { RecordSource } from "@/lib/records/types";
import { fetchFeedJson } from "@/server/feed";

const espnRecordSource: RecordSource = {
  name: RECORDS.source,
  async fetch(season) {
    const payload = await fetchFeedJson(espnStandingsUrl(season), {
      source: RECORDS.source,
      timeoutMs: RECORDS.fetchTimeoutMs,
    });
    return parseEspnStandings(payload, season, teamIdByNickname, TEAM_IDS);
  },
};

/** ESPN, or with RECORD_SOURCE=static the mock records from src/data/teams.ts (offline dev, smoke test). */
export const recordSource: RecordSource =
  process.env.RECORD_SOURCE === "static"
    ? staticRecordSource(
        "Mock data",
        Object.fromEntries(TEAM_INFO.map((team) => [team.id, { wins: team.wins, losses: team.losses }])),
      )
    : espnRecordSource;
