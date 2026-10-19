import Link from "next/link";
import { listViewerLeagues } from "@/server/league";

/** The leagues this browser holds a seat in (every season), as links. Reads the session cookie, so it streams on its own. */
export async function YourLeagues() {
  const leagues = await listViewerLeagues();
  if (leagues.length === 0) return null;
  return (
    <nav aria-label="Your leagues" className="flex flex-col gap-1">
      <p className="px-3 text-xs font-semibold uppercase tracking-[0.2em] text-fog-400">Your leagues</p>
      <ul className="flex flex-col gap-1">
        {leagues.map((league) => (
          <li key={league.id}>
            <Link
              href={`/l/${league.id}`}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-fog-300 transition-colors hover:bg-ink-800 hover:text-fog-50"
            >
              <span className="min-w-0 truncate">{league.name}</span>
              <span className="shrink-0 text-xs text-fog-400">{league.seasonLabel}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
