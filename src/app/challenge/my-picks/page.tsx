import Link from "next/link";
import { SignInLink } from "@/components/account/SignInLink";
import { Suspense } from "react";
import { ChallengePageHeader } from "@/components/challenge/ChallengePageHeader";
import { EntryResults } from "@/components/challenge/EntryResults";
import { ResultsFallback } from "@/components/challenge/ResultsFallback";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { CHALLENGE } from "@/config/challenge";
import { isLocked } from "@/lib/challenge/phase";
import { getAccount } from "@/server/account";
import { loadMyResults } from "@/server/challenge-pages";
import { prepareChallenge } from "@/server/challenge";

export default function MyPicksPage() {
  return (
    <Suspense fallback={<ResultsFallback title="My Picks" />}>
      <MyPicks />
    </Suspense>
  );
}

async function MyPicks() {
  const data = await loadMyResults();
  if (data) return <EntryResults data={data} />;
  const { phase } = await prepareChallenge();
  const locked = isLocked(phase);
  const signedIn = (await getAccount()) !== null;
  if (!signedIn) {
    return (
      <div className="flex flex-col gap-6">
        <ChallengePageHeader title="My Picks" subtitle={`The 30/30 Challenge · ${CHALLENGE.season} NBA season`} />
        <Panel bodyClassName="flex flex-col items-start gap-4 p-5">
          <p className="text-lg font-semibold text-fog-50">Sign in to see your entry</p>
          <p className="text-fog-300">
            Your entry belongs to your Google account. Sign in to see and edit it, or find it on the leaderboard.
          </p>
          <SignInLink next="/challenge/my-picks" className={buttonClasses("primary")}>
            Sign in
          </SignInLink>
        </Panel>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <ChallengePageHeader title="My Picks" subtitle={`The 30/30 Challenge · ${CHALLENGE.season} NBA season`} />
      <Panel bodyClassName="flex flex-col items-start gap-4 p-5">
        <p className="text-lg font-semibold text-fog-50">
          {locked ? "The challenge is locked" : "You haven't saved an entry yet"}
        </p>
        <p className="text-fog-300">
          {locked
            ? "Entries closed at the deadline, and your account has no entry."
            : "Call Over or Under on all 30 teams and save before the deadline."}{" "}
          Everyone else&apos;s entries are on the leaderboard.
        </p>
        <Link href={locked ? "/challenge/leaderboard" : "/challenge"} className={buttonClasses("primary")}>
          {locked ? "See the leaderboard" : "Make your picks"}
        </Link>
      </Panel>
    </div>
  );
}
