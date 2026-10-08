"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export interface LeagueSummary {
  id: string;
  name: string;
  seasonLabel: string;
}

export function LeagueSwitcher({
  league,
  otherLeagues,
  compact = false,
}: {
  league: LeagueSummary;
  otherLeagues: LeagueSummary[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full min-w-0 items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 text-left ${
          compact ? "px-3 py-1.5" : "px-4 py-3"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-semibold ${compact ? "text-sm" : "text-base"}`}>{league.name}</span>
          {!compact && <span className="block text-sm text-fog-300">{league.seasonLabel}</span>}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-fog-300" />
      </button>
      {open && (
        <div
          className={`absolute z-40 mt-2 rounded-lg border border-ink-600 bg-ink-900 p-2 shadow-xl ${compact ? "right-0 w-64" : "inset-x-0"}`}
        >
          {otherLeagues.length > 0 && (
            <ul className="mb-2 border-b border-ink-700 pb-2">
              {otherLeagues.map((other) => (
                <li key={other.id}>
                  <Link
                    href={`/l/${other.id}`}
                    onClick={() => setOpen(false)}
                    className="block truncate rounded-md px-3 py-2 text-sm hover:bg-ink-800"
                  >
                    {other.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 text-sm font-semibold text-link hover:bg-ink-800"
          >
            All leagues &amp; create league
          </Link>
        </div>
      )}
    </div>
  );
}
