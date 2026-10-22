import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { LegacyNotice } from "@/components/account/LegacyNotice";
import { CreateLeagueForm } from "@/components/landing/CreateLeagueForm";
import { Logo } from "@/components/shell/Logo";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { LEAGUE_LIMITS } from "@/config/league";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { signInHref } from "@/lib/access/next-path";
import { managerLabel } from "@/lib/league/managers";
import { getAccount } from "@/server/account";
import { listViewerLeagues } from "@/server/league";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:py-16">
      <Logo />
      <LegacyNotice />
      <section>
        <h1 className="font-display text-4xl font-bold sm:text-5xl">Draft the season.</h1>
        <p className="mt-2 max-w-xl text-fog-300">
          {LEAGUE_LIMITS.minManagers}–{LEAGUE_LIMITS.maxManagers} managers snake-draft Overs and Unders on every NBA win
          total, then score on how the season plays out.
        </p>
      </section>
      <Panel title="30/30 Challenge" bodyClassName="p-4 sm:p-5">
        <p className="max-w-xl text-fog-300">
          Pick Over or Under on all 30 win totals, lock in before opening night and climb the leaderboard. No league
          needed.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link href="/challenge" className={buttonClasses("primary")}>
            Make your picks
          </Link>
          <Link href="/challenge/how-it-works" className="font-semibold text-link hover:text-fog-50">
            How it works
          </Link>
        </div>
      </Panel>
      <Panel title="NBA schedule" bodyClassName="p-4 sm:p-5">
        <p className="max-w-xl text-fog-300">
          Tonight&apos;s games, standings, and who in your leagues is rooting for whom.
        </p>
        <div className="mt-4">
          <Link href="/nba" className={buttonClasses("secondary")}>
            Open the schedule
          </Link>
        </div>
      </Panel>
      <Panel title="Create league" bodyClassName="p-4 sm:p-5">
        <Suspense fallback={<div aria-busy className="h-40 animate-pulse rounded-lg bg-ink-800/60" />}>
          <CreateLeague />
        </Suspense>
      </Panel>
      <Suspense fallback={null}>
        <YourLeagues />
      </Suspense>
      <Panel title="Just looking?" bodyClassName="p-4 sm:p-5">
        <Link
          href={`/l/${DEMO_LEAGUE_ID}/draft`}
          className="inline-flex items-center gap-2 font-semibold text-link hover:text-fog-50"
        >
          Try the demo <ArrowRight aria-hidden className="size-4" />
        </Link>
        <p className="mt-1 text-sm text-fog-400">
          A guided draft: make a pick and a fade yourself, and we simulate the other managers. Nothing is saved.
        </p>
      </Panel>
    </main>
  );
}

async function CreateLeague() {
  const account = await getAccount();
  if (!account) {
    return (
      <Link href={signInHref("/")} className={buttonClasses("primary", "lg")}>
        Sign in with Google to create a league
      </Link>
    );
  }
  return <CreateLeagueForm accountName={account.name} />;
}

async function YourLeagues() {
  const leagues = await listViewerLeagues();
  if (leagues.length === 0) return null;
  return (
    <Panel title="Your leagues">
      <ul className="divide-y divide-ink-700">
        {leagues.map((league) => (
          <li key={league.id}>
            <Link href={`/l/${league.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-800 sm:px-5">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{league.name}</span>
                <span className="block text-sm text-fog-400">
                  {managerLabel(league.manager)}
                  {league.commissionerId === league.manager.id ? " · Commissioner" : ""}
                </span>
              </span>
              <ArrowRight aria-hidden className="size-4 shrink-0 text-fog-400" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
