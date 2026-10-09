"use client";

import { Check, Crosshair, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";
import { SidePill } from "@/components/ui/SidePill";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { fadeTargets } from "@/lib/fades";
import { formatNumber } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { TeamLookup } from "@/lib/standings";
import type { DraftPick, League } from "@/lib/types";

/** Opponent picks the acting seat can fade, grouped by the manager who drafted them. */
export function FadeTargets({
  league,
  teams,
  seats,
  fadingFor,
  onFadingForChange,
  selected,
  onSelect,
}: {
  league: League;
  teams: TeamLookup;
  /** Seats this viewer can still submit a fade for. */
  seats: string[];
  fadingFor: string;
  onFadingForChange: (managerId: string) => void;
  selected: number | null;
  onSelect: (pickNumber: number) => void;
}) {
  const targets = fadeTargets(league.draft, fadingFor);
  const owners = league.managers.filter((manager) => targets.some((pick) => pick.managerId === manager.id));
  const fadeCount = (pick: DraftPick) => league.fades.filter((fade) => fade.targetPickNumber === pick.pickNumber).length;
  return (
    <Panel
      title="Choose a fade"
      icon={<Crosshair aria-hidden className="size-5 text-fog-300" />}
      actions={
        seats.length > 1 ? (
          <Select
            label="Fading for"
            value={fadingFor}
            onChange={onFadingForChange}
            options={seats.map((id) => {
              const manager = findManager(league.managers, id)!;
              return {
                value: id,
                label: `Fading for ${managerLabel(manager)}${manager.displayName === null ? " (open seat)" : ""}`,
              };
            })}
            className="w-full sm:w-64"
          />
        ) : undefined
      }
    >
      <p className="border-b border-ink-700 px-4 py-3 text-sm text-fog-300 sm:px-5">
        Pick one opponent pick you think will miss. If it does, the fade scores +2.
      </p>
      <div className="flex flex-col divide-y divide-ink-700">
        {owners.map((owner) => (
          <section key={owner.id} aria-label={`${managerLabel(owner)}'s picks`} className="px-4 py-3 sm:px-5">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <ManagerAvatar manager={owner} size="sm" />
              {managerLabel(owner)}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {targets
                .filter((pick) => pick.managerId === owner.id)
                .map((pick) => {
                  const team = teams[pick.teamId];
                  const isSelected = pick.pickNumber === selected;
                  const count = fadeCount(pick);
                  return (
                    <li key={pick.pickNumber}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`Fade ${team.city} ${team.name} ${pick.side} ${formatNumber(team.line)}, pick ${pick.pickNumber} by ${managerLabel(owner)}`}
                        onClick={() => onSelect(pick.pickNumber)}
                        className={`flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          isSelected ? "border-accent bg-accent/10" : "border-ink-700 bg-ink-900 hover:border-fog-400"
                        }`}
                      >
                        <span className="w-5 shrink-0 text-xs tabular-nums text-fog-400">{pick.pickNumber}</span>
                        <TeamLogo team={team} size={26} />
                        <span className="min-w-0 flex-1 truncate">{team.name}</span>
                        {count > 0 && (
                          <span className="shrink-0 text-xs text-fog-400">
                            {count} fade{count === 1 ? "" : "s"}
                          </span>
                        )}
                        <SidePill side={pick.side} size="sm" />
                        <span className="w-9 shrink-0 text-right font-semibold tabular-nums">{formatNumber(team.line)}</span>
                        {isSelected && <Check aria-hidden className="size-4 shrink-0 text-accent" />}
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}

/** The chosen target and its confirm button. A confirmed fade is locked. */
export function FadeConfirm({
  league,
  teams,
  fadingFor,
  target,
  pending,
  onConfirm,
  onClear,
}: {
  league: League;
  teams: TeamLookup;
  fadingFor: string;
  target: DraftPick | null;
  pending: boolean;
  onConfirm: () => void;
  onClear: () => void;
}) {
  const manager = findManager(league.managers, fadingFor)!;
  if (!target) {
    return (
      <div className="rounded-lg border border-dashed border-ink-600 px-4 py-6 text-center text-sm text-fog-300">
        Choose an opponent pick to fade{manager.displayName === null ? ` for ${managerLabel(manager)}` : ""}.
      </div>
    );
  }
  const team = teams[target.teamId];
  const owner = findManager(league.managers, target.managerId)!;
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-ink-700 bg-ink-900/70 p-4">
      <div className="flex items-center gap-4">
        <TeamLogo team={team} size={56} />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-fog-400">
            {managerLabel(manager)} fades
          </p>
          <p className="truncate font-display text-xl font-semibold">
            {team.city} {team.name}
          </p>
          <p className="font-display text-lg font-bold">
            <span className={target.side === "OVER" ? "text-over" : "text-under"}>{target.side}</span>{" "}
            {formatNumber(team.line)}{" "}
            <span className="text-sm font-semibold text-fog-300">
              · {managerLabel(owner)}, pick {target.pickNumber}
            </span>
          </p>
        </div>
      </div>
      <Button size="lg" onClick={onConfirm} disabled={pending}>
        <Lock aria-hidden className="size-4" />
        Confirm fade
      </Button>
      <p className="-mt-2 text-center text-xs text-fog-400">A confirmed fade is locked for the season.</p>
      <Button variant="secondary" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}
