import type { Metadata } from "next";
import Link from "next/link";
import { SignInLink } from "@/components/account/SignInLink";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { alt as ogImageAlt, size as ogImageSize } from "@/app/opengraph-image";
import { LinkClaimForm } from "@/components/access/LinkClaimForm";
import { Logo } from "@/components/shell/Logo";
import { buttonClasses } from "@/components/ui/Button";
import { PageFallback } from "@/components/ui/PageFallback";
import { Panel } from "@/components/ui/Panel";
import { legacySeatIn } from "@/lib/access/legacy";
import { linkStatus, type LinkKind } from "@/lib/access/links";
import { ERROR_MESSAGES } from "@/lib/league/errors";
import { managerLabel } from "@/lib/league/managers";
import { getAccount } from "@/server/account";
import { readLinkToken } from "@/server/access";
import { getLegacyItems } from "@/server/legacy";
import { findLeague } from "@/server/league";
import { getViewerId } from "@/server/session";

const TITLES: Record<LinkKind, string> = {
  league_invite: "Join the league",
  seat_invite: "Rejoin your seat",
  personal: "Add this seat",
};

// The link preview chat apps show. Like the page, reading the link here changes nothing.
export async function generateMetadata({ params }: PageProps<"/i/[token]">): Promise<Metadata> {
  const { token } = await params;
  const link = await readLinkToken(token);
  const league = link && linkStatus(link, new Date()) === "active" ? await findLeague(link.leagueId) : null;
  if (!link || !league || league.archivedAt !== null) return { title: "Courtline" };

  const seat = league.managers.find((manager) => manager.id === link.managerId);
  const title =
    link.kind === "league_invite" || !seat
      ? `Join ${league.name} — NBA over/under pick'em`
      : `Add ${managerLabel(seat)} to your account`;
  const description = `${league.name} • ${league.seasonLabel}. Draft Overs and Unders on every NBA win total.`;
  // A page's openGraph replaces the root's, so name the site-wide card again. The tab keeps the root's "Courtline".
  const images = [{ url: "/opengraph-image", alt: ogImageAlt, ...ogImageSize }];
  return { description, openGraph: { title, description, siteName: "Courtline", images } };
}

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

  if (league.archivedAt !== null) {
    return (
      <Panel title="League deleted" bodyClassName="flex flex-col items-start gap-4 p-4 sm:p-5">
        <p className="text-fog-300">This league was deleted by its commissioner.</p>
        <Link href={`/l/${league.id}`} className={buttonClasses("secondary")}>
          View the league
        </Link>
      </Panel>
    );
  }

  const viewerSeat = await getViewerId(league.id);
  if (viewerSeat !== null && (link.kind === "league_invite" || viewerSeat === link.managerId)) {
    redirect(`/l/${league.id}`);
  }

  const account = await getAccount();
  const seat = league.managers.find((manager) => manager.id === link.managerId);
  // A seat this browser held before sign-in moves first: claiming another seat here would make that move fail for good.
  const legacySeat = account ? legacySeatIn((await getLegacyItems())?.seats, league.id) : undefined;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-4xl font-bold">{TITLES[link.kind]}</h1>
        <p className="mt-1 text-lg text-link">
          {league.name} • {league.seasonLabel}
        </p>
      </div>
      <Panel bodyClassName="p-4 sm:p-5">
        {legacySeat ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-fog-300">
              This browser already holds <span className="font-semibold text-fog-50">{managerLabel(legacySeat.manager)}</span>{" "}
              in {league.name} from before sign-in.
            </p>
            <Link href="/account" className={buttonClasses("primary", "lg")}>
              Move it to your account
            </Link>
          </div>
        ) : account ? (
          <LinkClaimForm
            token={token}
            kind={link.kind}
            league={{ id: league.id, name: league.name, managers: league.managers }}
            seatId={link.managerId}
            accountName={account.name}
          />
        ) : (
          <div className="flex flex-col items-start gap-4">
            {link.kind === "personal" && seat ? (
              <p className="text-fog-300">
                This link adds <span className="font-semibold text-fog-50">{managerLabel(seat)}</span> in {league.name} to
                your account.
              </p>
            ) : link.kind === "seat_invite" && seat ? (
              <p className="text-fog-300">Rejoin as {managerLabel(seat)}. The seat&apos;s picks are kept.</p>
            ) : (
              <p className="text-fog-300">Join {league.name} as one of its managers.</p>
            )}
            <SignInLink next={`/i/${token}`} className={buttonClasses("primary", "lg")}>
              Sign in with Google to continue
            </SignInLink>
          </div>
        )}
      </Panel>
    </section>
  );
}
