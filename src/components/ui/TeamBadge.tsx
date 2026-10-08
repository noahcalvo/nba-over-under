import type { Team } from "@/lib/types";

export function TeamBadge({ team, size = 32, className = "" }: { team: Team; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-display font-bold text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: team.color, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {team.id}
    </span>
  );
}
