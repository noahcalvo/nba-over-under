import { Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Panel } from "@/components/ui/Panel";
import { draftTotalPicks } from "@/lib/draft";
import { managerLabel, openSeats } from "@/lib/league/managers";
import type { League } from "@/lib/types";
import { InviteLink } from "./InviteLink";

export function DraftLobby({
  league,
  viewerId,
  canControl,
  pending,
  onStart,
}: {
  league: League;
  viewerId: string | null;
  canControl: boolean;
  pending: boolean;
  onStart: () => void;
}) {
  return (
    <Panel
      title="Draft lobby"
      icon={<Users aria-hidden className="size-5 text-fog-300" />}
      bodyClassName="flex flex-col gap-5 p-4 sm:p-5"
    >
      <p className="text-sm text-fog-300">
        {league.managers.length} managers · {league.draft.rounds} rounds · snake order · {draftTotalPicks(league.draft)}{" "}
        picks
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {league.managers.map((manager) => (
          <li key={manager.id} className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-3">
            <ManagerAvatar manager={manager} />
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {managerLabel(manager)}
                {manager.id === viewerId && <span className="ml-2 text-xs text-accent">You</span>}
              </p>
              <p className="text-xs text-fog-400">
                {manager.id === league.commissionerId
                  ? "Commissioner"
                  : manager.displayName === null
                    ? "Open seat"
                    : "Joined"}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {openSeats(league.managers).length > 0 && <InviteLink leagueId={league.id} />}
      <p className="text-sm text-fog-400">Open seats are drafted by the commissioner until someone claims them.</p>
      {canControl ? (
        <Button size="lg" onClick={onStart} disabled={pending} className="self-start">
          Start draft
        </Button>
      ) : (
        <p className="text-sm font-semibold text-fog-300">Waiting for the commissioner to start the draft.</p>
      )}
    </Panel>
  );
}
