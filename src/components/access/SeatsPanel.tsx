"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Panel } from "@/components/ui/Panel";
import { managerLabel } from "@/lib/league/managers";
import type { League } from "@/lib/types";
import { CopyLink } from "./CopyLink";
import { sendJson } from "./send-json";

/** Commissioner controls: the league invite and seat resets. */
export function SeatsPanel({
  league,
  invitePath,
  seatInvitePaths,
}: {
  league: Pick<League, "id" | "managers" | "commissionerId">;
  invitePath: string | null;
  seatInvitePaths: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState<string | null>(null);

  async function run(url: string, method: "POST" | "DELETE") {
    setPending(true);
    setError(null);
    const result = await sendJson(url, method);
    setPending(false);
    setConfirmingReset(null);
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  const inviteUrl = `/api/leagues/${league.id}/invite`;

  return (
    <Panel title="Seats & links" bodyClassName="flex flex-col gap-6 p-4 sm:p-5">
      <section className="flex flex-col gap-3">
        {invitePath ? (
          <CopyLink
            path={invitePath}
            label="League invite link"
            description="Send this to the group. Anyone with it can claim an open seat until you make a new link or turn it off."
          />
        ) : (
          <p className="text-sm text-fog-300">The league invite link is off. Nobody can claim an open seat.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(inviteUrl, "POST")}>
            {invitePath ? "Make a new link" : "Turn on invite link"}
          </Button>
          {invitePath && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(inviteUrl, "DELETE")}>
              Turn off
            </Button>
          )}
        </div>
      </section>

      <ul className="flex flex-col divide-y divide-ink-700 rounded-lg border border-ink-700">
        {league.managers.map((manager) => {
          const isCommissioner = manager.id === league.commissionerId;
          const rejoinPath = seatInvitePaths[manager.id];
          const status = isCommissioner
            ? "Commissioner"
            : manager.displayName === null
              ? "Open seat"
              : rejoinPath
                ? "Waiting to rejoin"
                : "Joined";
          return (
            <li key={manager.id} className="flex flex-col gap-3 px-3 py-3 sm:px-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 basis-40 items-center gap-3">
                  <ManagerAvatar manager={manager} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{managerLabel(manager)}</p>
                    <p className="text-xs text-fog-400">{status}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rejoinPath && <CopyLink path={rejoinPath} label="Rejoin link" compact />}
                  {!isCommissioner && manager.displayName !== null && confirmingReset !== manager.id && (
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmingReset(manager.id)}>
                      Reset seat
                    </Button>
                  )}
                </div>
              </div>
              {confirmingReset === manager.id && (
                <div className="flex flex-col gap-3 rounded-lg border border-negative/50 bg-negative/10 p-3 text-sm">
                  <p>
                    Sign {managerLabel(manager)} out on every device and make a one-time rejoin link? Their name and
                    picks stay.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => run(`/api/leagues/${league.id}/seats/${manager.id}/reset`, "POST")}
                    >
                      Reset seat
                    </Button>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmingReset(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
    </Panel>
  );
}
