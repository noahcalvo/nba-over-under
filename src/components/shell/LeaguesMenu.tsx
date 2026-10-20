"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { LeagueMenu, type LeagueSummary } from "./LeagueSwitcher";

/** The league switcher's menu without a current league: every league this browser holds a seat in. */
export function LeaguesMenu({ leagues }: { leagues: LeagueSummary[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-left"
      >
        <span className="block min-w-0 flex-1 truncate text-sm font-semibold">Your leagues</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-fog-300" />
      </button>
      {open && <LeagueMenu leagues={leagues} onNavigate={() => setOpen(false)} className="right-0 w-64" />}
    </div>
  );
}
