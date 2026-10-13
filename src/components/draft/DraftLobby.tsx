import { Users } from "lucide-react";
import { CopyLink } from "@/components/access/CopyLink";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { draftTotalPicks } from "@/lib/draft";
import { openSeats } from "@/lib/league/managers";
import type { LeagueAccess } from "@/lib/access/links";
import type { LeagueConfig } from "@/lib/league/config";
import type { League } from "@/lib/types";
import { DraftOrderPanel } from "./DraftOrderPanel";
import { LeagueSizeForm } from "./LeagueSizeForm";

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
  onSaveConfig,
  onConfigDirtyChange,
  onSaveOrder,
  onOrderDirtyChange,
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
  onSaveConfig: (config: LeagueConfig) => Promise<boolean>;
  onConfigDirtyChange: (dirty: boolean) => void;
  onSaveOrder: (order: string[]) => Promise<boolean>;
  onOrderDirtyChange: (dirty: boolean) => void;
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
      {canControl && (
        <LeagueSizeForm
          key={`${league.managers.length}x${league.draft.rounds}`}
          league={league}
          pending={pending}
          onSave={onSaveConfig}
          onDirtyChange={onConfigDirtyChange}
        />
      )}
      <DraftOrderPanel
        key={league.draft.seatOrder.join(",")}
        league={league}
        viewerId={viewerId}
        canEdit={canControl}
        pending={pending}
        onSave={onSaveOrder}
        onDirtyChange={onOrderDirtyChange}
      />
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
