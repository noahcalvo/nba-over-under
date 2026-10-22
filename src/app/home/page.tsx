import { AccountSlot } from "@/components/account/AccountSlot";
import { LegacyNotice } from "@/components/account/LegacyNotice";
import { Landing } from "@/components/landing/Landing";
import { Logo } from "@/components/shell/Logo";

/** Everything Courtline offers, whoever is viewing: the league switcher's "All leagues & create league". */
export default function AllLeaguesHome() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:py-16">
      <header className="flex items-center justify-between gap-3">
        <Logo />
        <AccountSlot placement="header" />
      </header>
      <LegacyNotice />
      <Landing />
    </main>
  );
}
