import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountSlot } from "@/components/account/AccountSlot";
import { LegacyNotice } from "@/components/account/LegacyNotice";
import { Landing } from "@/components/landing/Landing";
import { Logo } from "@/components/shell/Logo";
import { PageFallback } from "@/components/ui/PageFallback";
import { listViewerLeagues } from "@/server/league";

/** Signed in with a seat somewhere: straight to the most recently joined league. Otherwise the home page (/home). */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:py-16">
      <header className="flex items-center justify-between gap-3">
        <Logo />
        <AccountSlot placement="header" />
      </header>
      <Suspense fallback={<PageFallback label="Loading…" />}>
        <HomeOrLeague />
      </Suspense>
    </main>
  );
}

async function HomeOrLeague() {
  const [latest] = await listViewerLeagues();
  if (latest) redirect(`/l/${latest.id}`);
  return (
    <>
      <LegacyNotice />
      <Landing />
    </>
  );
}
