import type { Metadata } from "next";
import { ChallengePageHeader } from "@/components/challenge/ChallengePageHeader";
import { Panel } from "@/components/ui/Panel";
import { CHALLENGE } from "@/config/challenge";
import { SCORING } from "@/config/scoring";
import { formatNumber, formatSigned } from "@/lib/format";

export const metadata: Metadata = { title: "How It Works · 30/30 Challenge" };

export default function HowItWorksPage() {
  const margin = formatNumber(SCORING.marginWeight);
  const sections: { title: string; body: React.ReactNode }[] = [
    {
      title: "Make your picks",
      body: (
        <p>
          Call Over or Under on all 30 teams&apos; win totals. You need all 30 to save. Change and re-save any time before
          the deadline; your latest save counts.
        </p>
      ),
    },
    {
      title: "Lines move",
      body: (
        <p>
          FanDuel&apos;s win totals keep moving in the preseason. Each card shows the line from when you saved a pick
          (struck through) next to the current one. Your direction never changes by itself, and you never need to re-save.
        </p>
      ),
    },
    {
      title: "The deadline",
      body: (
        <p>
          Entries lock {CHALLENGE.lockMinutesBeforeTipoff} minutes before the first regular-season tip-off of{" "}
          {CHALLENGE.season}, read from the NBA schedule. If the opening game moves before the deadline, so does the
          deadline. After it, entries are read-only.
        </p>
      ),
    },
    {
      title: "Frozen lines",
      body: (
        <p>
          At the deadline every entry is scored against the same lines: FanDuel&apos;s latest lines observed before the
          deadline. A team without any line by then scores for nobody.
        </p>
      ),
    },
    {
      title: "Scoring",
      body: (
        <>
          <p>
            Each pick scores {formatSigned(SCORING.correctCall, 0)} when it is on the right side of the line and{" "}
            {formatSigned(SCORING.missedCall, 0)} when it is on the wrong side, plus ±{margin} for every win of margin
            between the team and the line. A team that lands exactly on the line is a push and scores 0. Your total is
            the sum of your 30 picks.
          </p>
          <p className="mt-3">
            During the season picks are projected from each team&apos;s win pace (wins ÷ games played × {SCORING.seasonGames}).
            A team that has not played yet shows &ldquo;Not available&rdquo;. A pick is final once its team has played{" "}
            {SCORING.seasonGames} games.
          </p>
        </>
      ),
    },
    {
      title: "Fair play",
      body: (
        <p>
          An entry belongs to the browser that saved it. There are no accounts, so one person could enter from several
          browsers. Clearing your cookies loses edit access, though the entry still counts. Other entries&apos; picks stay
          hidden until the lock.
        </p>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ChallengePageHeader title="How it works" subtitle={`The 30/30 Challenge · ${CHALLENGE.season} NBA season`} />
      <div className="grid gap-6 xl:grid-cols-2">
        {sections.map((section, index) => (
          <Panel key={section.title} title={`${index + 1}. ${section.title}`} bodyClassName="p-4 text-fog-300 sm:p-5">
            {section.body}
          </Panel>
        ))}
      </div>
    </div>
  );
}
