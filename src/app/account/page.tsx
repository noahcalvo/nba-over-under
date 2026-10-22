import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountSlot } from "@/components/account/AccountSlot";
import { LegacyClaim } from "@/components/account/LegacyClaim";
import { Logo } from "@/components/shell/Logo";
import { PageFallback } from "@/components/ui/PageFallback";
import { Panel } from "@/components/ui/Panel";
import { startSignInHref } from "@/lib/access/next-path";
import { managerLabel } from "@/lib/league/managers";
import { getAccount } from "@/server/account";
import { getLegacyItems } from "@/server/legacy";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-8 px-4 py-10 sm:py-16">
      <header className="flex items-center justify-between gap-3">
        <Logo />
        <AccountSlot placement="header" />
      </header>
      <Suspense fallback={<PageFallback label="Loading…" />}>
        <AccountContent />
      </Suspense>
    </main>
  );
}

async function AccountContent() {
  const account = await getAccount();
  if (!account) redirect(startSignInHref("/account"));
  const legacy = await getLegacyItems();
  const items = legacy && {
    seats: legacy.seats.map((league) => ({
      leagueId: league.id,
      leagueName: league.name,
      seatLabel: managerLabel({ ...league.manager }),
    })),
    entry: legacy.entry && { displayName: legacy.entry.displayName },
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl font-bold">Account</h1>
      <Panel title="Signed in" bodyClassName="p-4 sm:p-5">
        <p className="font-semibold">{account.name}</p>
        <p className="text-fog-300">{account.email}</p>
      </Panel>
      <Panel title="From before sign-in" bodyClassName="py-1">
        <LegacyClaim items={items} />
      </Panel>
    </div>
  );
}
