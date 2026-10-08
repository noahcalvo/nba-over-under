import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CreateLeagueForm } from "@/components/landing/CreateLeagueForm";
import { Logo } from "@/components/shell/Logo";
import { Panel } from "@/components/ui/Panel";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { findManager, managerLabel } from "@/lib/league/managers";
import { listSeatLeagues } from "@/server/league";
import { readSeats } from "@/server/viewer";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:py-16">
      <Logo />
      <section>
        <h1 className="font-display text-4xl font-bold sm:text-5xl">Draft the season.</h1>
        <p className="mt-2 max-w-xl text-fog-300">
          Four managers snake-draft Overs and Unders on every NBA win total, then score on how the season plays out.
        </p>
      </section>
      <Panel title="Create league" bodyClassName="p-4 sm:p-5">
        <CreateLeagueForm />
      </Panel>
      <Suspense fallback={null}>
        <YourLeagues />
      </Suspense>
      <Panel title="Just looking?" bodyClassName="p-4 sm:p-5">
        <Link
          href={`/l/${DEMO_LEAGUE_ID}`}
          className="inline-flex items-center gap-2 font-semibold text-link hover:text-fog-50"
        >
          Open the demo league <ArrowRight aria-hidden className="size-4" />
        </Link>
        <p className="mt-1 text-sm text-fog-400">A finished draft and a half-played season, read-only.</p>
      </Panel>
    </main>
  );
}

async function YourLeagues() {
  const leagues = listSeatLeagues(await readSeats());
  if (leagues.length === 0) return null;
  return (
    <Panel title="Your leagues">
      <ul className="divide-y divide-ink-700">
        {leagues.map(({ league, managerId }) => {
          const manager = findManager(league.managers, managerId);
          return (
            <li key={league.id}>
              <Link href={`/l/${league.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-800 sm:px-5">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{league.name}</span>
                  <span className="block text-sm text-fog-400">
                    {manager ? managerLabel(manager) : "Spectator"}
                    {league.commissionerId === managerId ? " · Commissioner" : ""}
                  </span>
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-fog-400" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
