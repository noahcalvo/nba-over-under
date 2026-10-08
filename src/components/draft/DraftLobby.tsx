import { Users } from "lucide-react";
import { CopyLink } from "@/components/access/CopyLink";
import { Button } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Panel } from "@/components/ui/Panel";
import { draftTotalPicks } from "@/lib/draft";
import { managerLabel, openSeats } from "@/lib/league/managers";
import type { LeagueAccess } from "@/lib/access/links";
import type { League } from "@/lib/types";

export function DraftLobby({
  league,
  access,
  viewerId,
  canControl,
  pending,
  onStart,
  startBlocker,
  reviewed,
  onReviewedChange,
  teamCount,
}: {
  league: League;
  access: LeagueAccess;
  viewerId: string | null;
  canControl: boolean;
  pending: boolean;
  onStart: () => void;
  startBlocker: string | null;
  reviewed: boolean;
  onReviewedChange: (reviewed: boolean) => void;
  teamCount: number;
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
      {access.invitePath && openSeats(league.managers).length > 0 && (
        <CopyLink
          path={access.invitePath}
          label="League invite link"
          description="Send this to the group. Anyone with it can claim an open seat. Manage it in League settings."
        />
      )}
      {canControl && access.personalPath && (
        <CopyLink
          path={access.personalPath}
          label="Your sign-in link"
          description="Save this somewhere safe. It's the only way back into the commissioner seat if you switch devices or clear cookies."
        />
      )}
      <p className="text-sm text-fog-400">Open seats are drafted by the commissioner until someone claims them.</p>
      {canControl ? (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm text-fog-50">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => onReviewedChange(event.target.checked)}
              className="size-4 accent-accent"
            />
            I&apos;ve checked all {teamCount} lines.
          </label>
          <Button size="lg" onClick={onStart} disabled={pending || startBlocker !== null} className="self-start">
            Start draft
          </Button>
          {startBlocker && <p className="text-sm text-fog-400">{startBlocker}</p>}
        </div>
      ) : (
        <p className="text-sm font-semibold text-fog-300">Waiting for the commissioner to start the draft.</p>
      )}
    </Panel>
  );
}
