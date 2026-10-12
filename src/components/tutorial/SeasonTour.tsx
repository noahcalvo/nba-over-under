"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { Button, buttonClasses } from "@/components/ui/Button";
import { awardsOff } from "@/lib/awards";
import { indexTeams } from "@/lib/lines";
import { computeStandings, type Standings } from "@/lib/standings";
import type { TourStep } from "@/lib/tour/targets";
import { PUSH_RULE, SEASON_STEPS, seasonStepLabel } from "@/lib/tutorial/season-copy";
import { checkpointGames, teamsAt } from "@/lib/tutorial/season";
import type { SeasonLocation, SeasonStepState } from "@/lib/tutorial/season-steps";
import {
  awardChangeStory,
  awardImpactStory,
  awardsStory,
  fadeStory,
  pickStory,
  standingsStory,
  type BreakdownRow,
} from "@/lib/tutorial/season-story";
import type { DemoSeasonSession } from "./use-demo-season";

const EXIT_HREF = "/";

function hrefFor(location: SeasonLocation, leagueId: string): string {
  if (location.page === "team") return `/l/${leagueId}/teams/${location.teamId}`;
  return location.page === "rosters" ? `/l/${leagueId}/rosters` : `/l/${leagueId}`;
}

/** The guided season's current step over the real page, or a way back to the page the step is on. */
export function SeasonTour({ step, demo }: { step: SeasonStepState; demo: DemoSeasonSession }) {
  const exit = { label: "Exit demo", href: EXIT_HREF, onExit: demo.exit };
  const stepLabel = seasonStepLabel(demo.checkpoint);

  if (!step.onPage) {
    const page = step.page;
    const team = page.page === "team" ? demo.teams.find((candidate) => candidate.id === page.teamId) : null;
    const where = team ? `the ${team.city} ${team.name} page` : "the League overview";
    const resume: TourStep = {
      title: "Continue the tour",
      body: `The next step of the demo is on ${where}.`,
      spotlight: [],
      interactive: [],
    };
    return (
      <TourOverlay key={`resume-${step.id}`} step={resume} stepLabel={stepLabel} exit={exit}>
        <Link href={hrefFor(step.page, demo.league.id)} className={buttonClasses()}>
          Go to {team ? `the ${team.name}` : "the League overview"}
        </Link>
      </TourOverlay>
    );
  }

  const copy = SEASON_STEPS[step.id];
  return (
    <TourOverlay
      key={step.id}
      step={copy}
      stepLabel={stepLabel}
      onContinue={copy.advance === "continue" ? () => demo.seen(step.id) : undefined}
      exit={exit}
    >
      <StepDetails step={step} demo={demo} />
    </TourOverlay>
  );
}

/** The user's own numbers under the step's text. */
function StepDetails({ step, demo }: { step: SeasonStepState; demo: DemoSeasonSession }): ReactNode {
  const basis = demo.checkpoint === "final" ? "final" : "projected";
  const teamsById = indexTeams(demo.teams);
  const standings: Standings = computeStandings(demo.league, teamsById, basis);
  const { managers } = demo.league;
  /** The award sentences, the awards' effect on the standings and the user's breakdown (picks, fade, awards, total). */
  const awardDetails = (extra: readonly string[] = []) => (
    <>
      <Lines lines={[...awardsStory(standings.awards, managers, demo.viewerId), ...extra]} />
      <Story
        summary={awardImpactStory(
          standings,
          computeStandings(demo.league, teamsById, basis, awardsOff()),
          managers,
          demo.viewerId,
        )}
        rows={standingsStory(standings, managers, demo.viewerId).rows}
      />
    </>
  );
  const viewerRow = standings.rows.find((row) => row.managerId === demo.viewerId)!;
  const openingTeam = demo.teams.find((team) => team.id === demo.openingPick.teamId)!;

  switch (step.id) {
    case "mid-points": {
      const story = pickStory(demo.openingPick, openingTeam, "projected");
      return <Story summary={story.summary} rows={story.rows} />;
    }
    case "mid-standings": {
      const summary = standingsStory(standings, demo.league.managers, demo.viewerId);
      return (
        <>
          <Story summary={summary.summary} rows={summary.rows} />
          <p className="text-sm text-fog-300">{fadeStory(viewerRow, demo.league.managers)?.summary}</p>
        </>
      );
    }
    case "mid-awards":
      return awardDetails();
    case "final-awards": {
      // The same season cut at Midseason: what the projections said then.
      const midTeams = indexTeams(teamsAt(demo.teams, demo.season, checkpointGames("midseason")));
      const midseason = computeStandings(demo.league, midTeams, "projected").awards;
      return awardDetails(awardChangeStory(midseason, standings.awards, managers, demo.viewerId));
    }
    case "final-standings":
      return <Story summary={standingsStory(standings, demo.league.managers, demo.viewerId).summary} rows={[]} />;
    case "final-results": {
      const pick = pickStory(demo.openingPick, openingTeam, "final");
      const fade = fadeStory(viewerRow, demo.league.managers);
      const pushed = pick.evaluation.push === true || fade?.target.push === true;
      return (
        <>
          {/* Concise: the scoring was explained at Midseason, so only the result. */}
          <Story summary={`${openingTeam.city} ${openingTeam.name}: ${pick.summary}`} rows={pick.rows.slice(-1)} />
          {fade && <p className="text-sm text-fog-300">{fade.summary}</p>}
          {pushed && <p className="text-sm text-fog-300">{PUSH_RULE}</p>}
        </>
      );
    }
    case "final-finish":
      return (
        <div className="flex flex-col gap-2">
          <Button onClick={() => demo.seen("final-finish")}>Explore results</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={demo.replay}>
              Replay demo
            </Button>
            <Link href="/" className={buttonClasses("secondary")}>
              Create league
            </Link>
          </div>
        </div>
      );
    default:
      return null;
  }
}

function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((line) => (
        <p key={line} className="text-sm text-fog-300">
          {line}
        </p>
      ))}
    </div>
  );
}

function Story({ summary, rows }: { summary: string; rows: readonly BreakdownRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-fog-50">{summary}</p>
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-fog-400">{row.label}</dt>
              <dd className="text-right font-semibold tabular-nums text-fog-50">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
