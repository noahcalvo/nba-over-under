"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TeamLogo } from "@/components/ui/TeamLogo";
import type { TeamOption } from "@/lib/team-detail";
import type { League, TeamInfo } from "@/lib/types";

export function TeamHeader({
  league,
  info,
  teamOptions,
  showProjected,
  onShowProjectedChange,
}: {
  league: League;
  info: TeamInfo;
  teamOptions: TeamOption[];
  showProjected: boolean;
  onShowProjectedChange: (value: boolean) => void;
}) {
  const router = useRouter();
  const fullName = `${info.city} ${info.name}`;
  return (
    <header className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="min-w-0 text-base">
        <ol className="flex min-w-0 items-center gap-2 text-fog-300">
          <li className="min-w-0 truncate">
            <Link href={`/l/${league.id}`} className="text-link hover:underline">
              {league.name}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="min-w-0 truncate text-fog-50">
            {fullName}
          </li>
        </ol>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          <TeamLogo team={info} size={64} />
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold leading-tight text-fog-50 sm:text-5xl">{fullName}</h1>
            <p className="mt-1 text-lg text-fog-300 sm:text-2xl">
              {league.name} • {league.seasonLabel}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:items-end">
          {league.isDemo && (
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-link">Demo data</span>
          )}
          <div className="flex w-full flex-wrap items-center gap-x-6 gap-y-3 sm:w-auto">
            <Switch checked={showProjected} onChange={onShowProjectedChange} label="Show projected" />
            <Select
              label="Team"
              value={info.id}
              onChange={(id) => router.push(`/l/${league.id}/teams/${id}`)}
              className="w-full sm:w-72"
              options={teamOptions.map((option) => ({ value: option.id, label: `Team: ${option.label}` }))}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
