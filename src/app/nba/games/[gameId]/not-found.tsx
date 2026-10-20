import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

export default function GameNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-16 text-center">
      <h1 className="font-display text-4xl font-bold">Game not found</h1>
      <p className="text-fog-300">That game isn&apos;t on this season&apos;s NBA schedule. Check the link, or pick a game from the schedule.</p>
      <Link href="/nba" className={buttonClasses("primary")}>
        Back to schedule
      </Link>
    </div>
  );
}
