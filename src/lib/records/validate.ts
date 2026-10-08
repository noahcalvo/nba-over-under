import { FeedError } from "@/lib/feed-error";
import type { SeasonRecords } from "./types";

/** Games played only go up during a season. A feed that goes backwards is stale or broken: keep what we have. */
export function checkNoRegression(stored: SeasonRecords, next: SeasonRecords): void {
  for (const [teamId, before] of Object.entries(stored)) {
    const after = next[teamId];
    if (after && after.wins + after.losses < before.wins + before.losses) {
      throw new FeedError(
        `The new standings had fewer games for ${teamId} than the saved ones, so the saved records were kept.`,
      );
    }
  }
}
