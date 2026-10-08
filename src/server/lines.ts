import "server-only";
import { LINES } from "@/config/lines";
import { STATIC_LINES } from "@/data/static-lines";
import { TEAM_INFO } from "@/data/teams";
import { fanDuelLineSource } from "@/lib/fanduel";
import { cachedLineSource, lineReader, staticLineSource, type LineSource } from "@/lib/lines";

// The JSON FanDuel's own NBA page loads. `_ak` is the public app key that page sends, not a secret. Undocumented:
// when it breaks, the review shows the error and the commissioner enters lines by hand.
const FANDUEL_NBA_URL =
  "https://sbapi.nj.sportsbook.fanduel.com/api/content-managed-page?page=CUSTOM&customPageId=nba&_ak=FhMFpcPWXMeyZxOx&timezone=America%2FNew_York";

async function fetchFanDuel(): Promise<unknown> {
  const response = await fetch(FANDUEL_NBA_URL, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(LINES.fetchTimeoutMs),
  });
  if (!response.ok) throw new Error(`${LINES.book} answered ${response.status}.`);
  return response.json();
}

/** FanDuel, cached. LINE_SOURCE=static serves the mock lines instead (offline dev, smoke tests). */
export const lineSource: LineSource =
  process.env.LINE_SOURCE === "static"
    ? staticLineSource(STATIC_LINES)
    : cachedLineSource(
        fanDuelLineSource({
          fetchJson: fetchFanDuel,
          teams: TEAM_INFO,
          book: LINES.book,
          season: LINES.season,
          marketSeason: LINES.fanDuelSeason,
        }),
        LINES.cacheSeconds * 1000,
        LINES.retrySeconds * 1000,
      );

/** The latest lines and, when the latest read failed, why (alongside the last good lines). Never rejects. */
export const readLines = lineReader(lineSource);
