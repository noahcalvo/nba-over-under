import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LinkClaimForm } from "@/components/access/LinkClaimForm";
import { Logo } from "@/components/shell/Logo";
import { buttonClasses } from "@/components/ui/Button";
import { PageFallback } from "@/components/ui/PageFallback";
import { Panel } from "@/components/ui/Panel";
import { linkStatus, type LinkKind } from "@/lib/access/links";
import { ERROR_MESSAGES } from "@/lib/league/errors";
import { readLinkToken } from "@/server/access";
import { findLeague } from "@/server/league";
import { getViewerId } from "@/server/session";

const TITLES: Record<LinkKind, string> = {
  league_invite: "Join the league",
  seat_invite: "Rejoin your seat",
  personal: "Sign in",
};

export default function LinkPage({ params }: PageProps<"/i/[token]">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-8 px-4 py-10 sm:py-16">
      <Logo />
      <Suspense fallback={<PageFallback label="Checking your link…" />}>
        <LinkContent params={params} />
      </Suspense>
    </main>
  );
}

async function LinkContent({ params }: { params: PageProps<"/i/[token]">["params"] }) {
  const { token } = await params;
  // Display only: rendering never claims anything (chat apps fetch links to build previews). The claim route
  // rechecks the link under the league lock.
  const link = await readLinkToken(token);
  const league = link && linkStatus(link, new Date()) === "active" ? await findLeague(link.leagueId) : null;
  if (!link || !league) {
    return (
      <Panel title="Link not working" bodyClassName="flex flex-col items-start gap-4 p-4 sm:p-5">
        <p className="text-fog-300">{ERROR_MESSAGES.invalid_link}</p>
        <Link href="/" className={buttonClasses("secondary")}>
          Back to Courtline
        </Link>
      </Panel>
    );
  }

  const viewerSeat = await getViewerId(league.id);
  if (viewerSeat !== null && (link.kind === "league_invite" || viewerSeat === link.managerId)) {
    redirect(`/l/${league.id}`);
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-4xl font-bold">{TITLES[link.kind]}</h1>
        <p className="mt-1 text-lg text-link">
          {league.name} • {league.seasonLabel}
        </p>
      </div>
      <Panel bodyClassName="p-4 sm:p-5">
        <LinkClaimForm
          token={token}
          kind={link.kind}
          league={{ id: league.id, name: league.name, managers: league.managers }}
          seatId={link.managerId}
        />
      </Panel>
    </section>
  );
}
