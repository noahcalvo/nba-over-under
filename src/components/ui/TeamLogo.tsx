"use client";

import Image from "next/image";
import { useState } from "react";
import { TeamBadge } from "@/components/ui/TeamBadge";
import { teamLogoUrl } from "@/lib/nba-logo";
import type { Team } from "@/lib/types";

/** Official logo from NBA's CDN; falls back to the abbreviation badge if it can't load. Decorative: the team name is always shown beside it. */
export function TeamLogo({ team, size = 32, className = "" }: { team: Team; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <TeamBadge team={team} size={size} className={className} />;
  return (
    <Image
      src={teamLogoUrl(team.nbaId)}
      alt=""
      width={size}
      height={size}
      unoptimized
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
