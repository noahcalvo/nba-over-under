"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { buttonClasses } from "@/components/ui/Button";

export function BackToLeague() {
  const { leagueId } = useParams<{ leagueId: string }>();
  return (
    <Link href={`/l/${leagueId}`} className={buttonClasses("primary")}>
      Back to league overview
    </Link>
  );
}
