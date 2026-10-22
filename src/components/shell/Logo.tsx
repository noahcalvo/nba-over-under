import Link from "next/link";
import { BallIcon } from "@/components/icons/BallIcon";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 text-accent" aria-label="Courtline home">
      <BallIcon className={compact ? "size-7" : "size-10"} />
      {/* The compact logo (mobile top bar) drops the word on phones to leave room for the league menu. */}
      <span
        className={`font-display font-bold tracking-wide text-fog-50 ${compact ? "hidden text-xl sm:inline" : "text-3xl"}`}
      >
        COURTLINE
      </span>
    </Link>
  );
}
