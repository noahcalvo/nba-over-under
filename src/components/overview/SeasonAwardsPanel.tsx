import { Award, ThumbsDown, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Panel } from "@/components/ui/Panel";
import { SidePill } from "@/components/ui/SidePill";
import { SignedValue } from "@/components/ui/SignedValue";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { TeamLink } from "@/components/ui/TeamLink";
import { SCORING } from "@/config/scoring";
import { AWARD_LABELS, awardPendingText, type AwardKind, type PickAward, type SeasonAwards } from "@/lib/awards";
import { formatNumber, formatSigned } from "@/lib/format";
import { findManager, managerLabel } from "@/lib/league/managers";
import type { Manager } from "@/lib/types";

const AWARD_POINTS: Record<AwardKind, number> = { best: SCORING.bestPickAward, worst: SCORING.worstPickAward };

/** Pick scores show two decimals here (as on Rosters): awards are decided by small differences. */
const SCORE_DIGITS = 2;

/** "Best Pick +2" next to a pick that holds an award; "proj." while it is provisional. */
export function AwardTag({ award }: { award: PickAward }) {
  const projected = award.call.evaluation.basis === "projected";
  return (
    <Badge tone={award.kind === "best" ? "accent" : "danger"} className="normal-case tracking-normal">
      {projected ? "Proj. " : ""}
      {AWARD_LABELS[award.kind]} {formatSigned(award.points, 0)}
    </Badge>
  );
}

function Winner({ award, managers, viewerId }: { award: PickAward; managers: Manager[]; viewerId: string | null }) {
  const { team, pick, evaluation } = award.call;
  const owner = findManager(managers, pick.managerId);
  const projected = evaluation.basis === "projected";
  return (
    <li className="flex items-center gap-3 py-2">
      <TeamLink teamId={team.id} decorative>
        <TeamLogo team={team} size={36} />
      </TeamLink>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fog-50">
          <TeamLink teamId={team.id}>
            {team.city} {team.name}
          </TeamLink>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-fog-300">
          <SidePill side={pick.side} size="sm" />
          <span className="tabular-nums">
            <span className="sr-only">Locked line </span>
            {formatNumber(team.line)}
          </span>
          {owner && (
            <>
              <span aria-hidden>·</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <ManagerAvatar manager={owner} size="sm" />
                <span className="truncate">{owner.id === viewerId ? "You" : managerLabel(owner)}</span>
              </span>
            </>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <SignedValue value={evaluation.points} digits={SCORE_DIGITS} className="block font-display text-lg font-bold" />
        <span className="block text-[11px] text-fog-400">{projected ? "Proj. pick score" : "Pick score"}</span>
      </div>
    </li>
  );
}

function AwardBlock({
  kind,
  awards,
  managers,
  viewerId,
}: {
  kind: AwardKind;
  awards: SeasonAwards;
  managers: Manager[];
  viewerId: string | null;
}) {
  const winners = awards[kind];
  const Icon = kind === "best" ? Trophy : ThumbsDown;
  return (
    <section aria-label={AWARD_LABELS[kind]} className="px-4 py-3 sm:px-5">
      <header className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-fog-300">
          <Icon aria-hidden className={`size-4 ${kind === "best" ? "text-positive" : "text-negative"}`} />
          {AWARD_LABELS[kind]}
        </h3>
        <span className="text-sm font-semibold">
          <SignedValue value={AWARD_POINTS[kind]} digits={0} suffix="pts" />
          <span className="sr-only"> to its owner</span>
        </span>
      </header>
      {winners.length === 0 ? (
        <p className="mt-2 text-sm text-fog-400">{awardPendingText(awards.pendingReason ?? "draft")}</p>
      ) : (
        <>
          <ul className="divide-y divide-ink-700/70">
            {winners.map((award) => (
              <Winner key={award.call.pick.pickNumber} award={award} managers={managers} viewerId={viewerId} />
            ))}
          </ul>
          {winners.length > 1 && (
            <p className="text-xs text-fog-400">
              Tied: each pick earns {formatSigned(AWARD_POINTS[kind], 0)} for its owner.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Best Pick and Worst Pick on the shown basis: provisional while projected, settled once final. */
export function SeasonAwardsPanel({
  awards,
  managers,
  viewerId,
}: {
  awards: SeasonAwards;
  managers: Manager[];
  viewerId: string | null;
}) {
  const badge = awards.status === "final" ? "Final" : awards.status === "projected" ? "Projected" : "Pending";
  return (
    <Panel
      title="Season awards"
      tour="season-awards"
      icon={<Award aria-hidden className="size-5 text-fog-300" />}
      actions={<Badge tone={awards.status === "final" ? "accent" : "neutral"}>{badge}</Badge>}
    >
      <div className="divide-y divide-ink-700">
        <AwardBlock kind="best" awards={awards} managers={managers} viewerId={viewerId} />
        <AwardBlock kind="worst" awards={awards} managers={managers} viewerId={viewerId} />
      </div>
      <p className="border-t border-ink-700 px-4 py-2.5 text-xs text-fog-400 sm:px-5">
        {awards.status === "final"
          ? `Decided on final ${SCORING.seasonGames}-game records and counted in the final standings.`
          : awards.status === "projected"
            ? `Provisional: based on win pace and counted in the projected standings. Leaders can change until every drafted team finishes its ${SCORING.seasonGames} games.`
            : "The league's highest and lowest individual pick scores earn these awards. Fades don't count."}
      </p>
    </Panel>
  );
}
