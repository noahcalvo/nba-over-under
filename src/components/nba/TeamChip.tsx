import Link from "next/link";
import { TeamLogo } from "@/components/ui/TeamLogo";
import type { TeamInfo } from "@/lib/types";

/** A team's logo and name as one link. The logo is decorative (same target, skipped by keyboard and screen readers). */
export function TeamChip({ team, id, href }: { team: TeamInfo | undefined; id: string; href: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {team && (
        <Link href={href} tabIndex={-1} aria-hidden className="shrink-0">
          <TeamLogo team={team} size={22} />
        </Link>
      )}
      <Link href={href} className="truncate font-semibold text-fog-50 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {team?.name ?? id}
      </Link>
    </span>
  );
}
