import { Archive } from "lucide-react";
import type { ReactNode } from "react";
import { ERROR_MESSAGES } from "@/lib/league/errors";
import { findLeague } from "@/server/league";

/** Tells everyone a deleted (archived) league is read-only. Renders nothing for an active or unknown league. */
export async function ArchivedBanner({ leagueId }: { leagueId: Promise<string> }): Promise<ReactNode> {
  const league = await findLeague(await leagueId);
  if (!league || league.archivedAt === null) return null;
  return (
    <div
      role="status"
      className="mb-5 flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-850 px-4 py-3 text-sm text-fog-200"
    >
      <Archive aria-hidden className="size-4 shrink-0 text-fog-400" />
      <p>{ERROR_MESSAGES.archived}</p>
    </div>
  );
}
