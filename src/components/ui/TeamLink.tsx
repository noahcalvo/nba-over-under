"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import type { TeamId } from "@/lib/types";

/**
 * Links to a team's page in the current league. `decorative` is for a logo next to a named link: same target, but
 * skipped by the keyboard and screen readers so the link isn't announced twice.
 */
export function TeamLink({
  teamId,
  decorative = false,
  className = "",
  children,
}: {
  teamId: TeamId;
  decorative?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { leagueId } = useParams<{ leagueId: string }>();
  return (
    <Link
      href={`/l/${leagueId}/teams/${teamId}`}
      tabIndex={decorative ? -1 : undefined}
      aria-hidden={decorative || undefined}
      className={decorative ? `shrink-0 ${className}` : `hover:underline focus-visible:underline ${className}`}
    >
      {children}
    </Link>
  );
}
