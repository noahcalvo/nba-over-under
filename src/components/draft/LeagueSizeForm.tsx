"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { LEAGUE_LIMITS } from "@/config/league";
import { TOTAL_SIDES } from "@/data/teams";
import { isValidLeagueConfig, maxRounds, minManagerCount, type LeagueConfig } from "@/lib/league/config";
import type { League } from "@/lib/types";

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
}

/** Commissioner, before the draft: how many managers and rounds. The server checks the same rules (decideLeagueConfig). */
export function LeagueSizeForm({
  league,
  pending,
  onSave,
  onDirtyChange,
}: {
  league: League;
  pending: boolean;
  onSave: (config: LeagueConfig) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const saved: LeagueConfig = { managerCount: league.managers.length, rounds: league.draft.rounds };
  const [config, setConfig] = useState<LeagueConfig>(saved);
  const fewestManagers = minManagerCount(league.managers);
  const roundLimit = maxRounds(config.managerCount);
  const dirty = config.managerCount !== saved.managerCount || config.rounds !== saved.rounds;
  const valid = isValidLeagueConfig(config) && config.managerCount >= fewestManagers;

  function update(next: LeagueConfig) {
    setConfig(next);
    onDirtyChange(next.managerCount !== saved.managerCount || next.rounds !== saved.rounds);
  }

  async function save() {
    if (await onSave(config)) onDirtyChange(false);
  }

  return (
    <section aria-labelledby="league-size-title" className="flex flex-col gap-3 rounded-lg border border-ink-700 bg-ink-900 p-4">
      <h3 id="league-size-title" className="text-sm font-semibold">
        League size
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span aria-hidden className="text-xs text-fog-400">
            Managers
          </span>
          <Select
            label="Managers"
            value={String(config.managerCount)}
            onChange={(value) => {
              const managerCount = Number(value);
              update({ managerCount, rounds: Math.min(config.rounds, maxRounds(managerCount)) });
            }}
            options={range(fewestManagers, LEAGUE_LIMITS.maxManagers).map((count) => ({
              value: String(count),
              label: `${count} managers`,
            }))}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span aria-hidden className="text-xs text-fog-400">
            Rounds
          </span>
          <Select
            label="Rounds"
            value={String(config.rounds)}
            onChange={(value) => update({ ...config, rounds: Number(value) })}
            options={range(LEAGUE_LIMITS.minRounds, roundLimit).map((count) => ({
              value: String(count),
              label: `${count} round${count === 1 ? "" : "s"}`,
            }))}
            className="w-36"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={pending || !dirty || !valid}>
            Save size
          </Button>
          {dirty && (
            <Button variant="secondary" onClick={() => update(saved)} disabled={pending}>
              Discard
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-fog-400">
        {config.managerCount * config.rounds} of {TOTAL_SIDES} sides drafted · up to {roundLimit} rounds with{" "}
        {config.managerCount} managers.
        {fewestManagers > LEAGUE_LIMITS.minManagers &&
          ` Claimed seats stay, so the league needs at least ${fewestManagers} managers.`}
      </p>
    </section>
  );
}
