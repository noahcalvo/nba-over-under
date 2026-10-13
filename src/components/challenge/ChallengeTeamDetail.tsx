import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SeasonProgressPanel } from "@/components/team/SeasonProgressPanel";
import { TeamStatStrip, type LineLabels } from "@/components/team/TeamStatStrip";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { SidePill } from "@/components/ui/SidePill";
import { SignedValue } from "@/components/ui/SignedValue";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { isLocked } from "@/lib/challenge/phase";
import { formatNumber, NOT_AVAILABLE } from "@/lib/format";
import type { ChallengePhase } from "@/lib/challenge/types";
import type { ChallengeTeamData } from "@/server/challenge-pages";

function lineLabels(phase: ChallengePhase): LineLabels {
  const unset = phase === "locking" ? "Freezing now" : isLocked(phase) ? "No line before the deadline" : "Set at the deadline";
  return { label: "Frozen line", unset, set: "Frozen at the deadline" };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-fog-400">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-fog-50">{children}</dd>
    </div>
  );
}

function YourPick({ data }: { data: ChallengeTeamData }) {
  const { pick, phase, frozenLine, currentLine, projected, final } = data;
  if (!pick) {
    return (
      <p className="text-fog-300">
        No entry yet.{" "}
        <Link href="/challenge" className="text-link hover:underline">
          Make your picks
        </Link>
      </p>
    );
  }
  const locked = isLocked(phase);
  const line = (value: number | null) => (value === null ? "–" : formatNumber(value));
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
      <Field label="Side">
        <SidePill side={pick.side} />
      </Field>
      <Field label="Line at pick">
        <span className="tabular-nums">{line(pick.lineAtPick)}</span>
      </Field>
      {locked ? (
        <Field label="Frozen line">
          <span className="tabular-nums">{frozenLine === null ? "Unavailable" : formatNumber(frozenLine)}</span>
        </Field>
      ) : (
        <Field label="Current line">
          <span className="tabular-nums">{line(currentLine)}</span>
        </Field>
      )}
      {locked && (
        <>
          <Field label="Projected points">
            <SignedValue value={projected?.points ?? null} digits={2} empty={frozenLine === null ? "–" : NOT_AVAILABLE} />
          </Field>
          <Field label="Final points">
            {final?.status === "scored" ? (
              <SignedValue value={final.points} digits={2} />
            ) : (
              <span className="text-fog-400">{frozenLine === null ? "–" : "Pending"}</span>
            )}
          </Field>
        </>
      )}
    </dl>
  );
}

/** A team's challenge page: record and pace against the frozen line (none before the lock) and the viewer's pick. */
export function ChallengeTeamDetail({ data }: { data: ChallengeTeamData }) {
  const { info, division, frozenLine, phase } = data;
  const fullName = `${info.city} ${info.name}`;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          <Link
            href="/challenge/my-picks"
            className={`${buttonClasses("ghost", "sm")} -ml-3`}
          >
            <ArrowLeft aria-hidden className="size-4" />
            My Picks
          </Link>
        </div>
        <div className="flex min-w-0 items-center gap-4">
          <TeamLogo team={info} size={64} />
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold leading-tight text-fog-50 sm:text-5xl">{fullName}</h1>
            <p className="mt-1 text-lg text-fog-300 sm:text-2xl">
              {info.conference} • {division}
            </p>
          </div>
        </div>
      </header>
      <TeamStatStrip record={info} lockedLine={frozenLine} showProjected lineLabels={lineLabels(phase)} />
      <SeasonProgressPanel
        gameLog={data.gameLog}
        record={info}
        lockedLine={frozenLine}
        showProjected
        teamNames={data.teamNames}
        note="Challenge lines freeze at the deadline."
        noLineNote="The frozen-line pace appears once the challenge locks."
      />
      <Panel title="Your pick" bodyClassName="p-4 sm:p-5">
        <YourPick data={data} />
      </Panel>
    </div>
  );
}
