"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { DraftFallback } from "@/components/draft/DraftFallback";
import { DraftRoomView } from "@/components/draft/DraftRoomView";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { Button, buttonClasses } from "@/components/ui/Button";
import { TUTORIAL } from "@/config/tour";
import { DEMO_LEAGUE_ID } from "@/data/demo-league";
import { NO_ACCESS } from "@/lib/access/links";
import { draftTotalPicks, roundOf } from "@/lib/draft";
import type { SideRef } from "@/lib/draft-filters";
import { TUTORIAL_STEP_COUNT, TUTORIAL_STEPS, tutorialStep } from "@/lib/tutorial/steps";
import type { League } from "@/lib/types";
import { getServerTutorialStore, getTutorialStore, subscribeTutorial } from "./tutorial-store";
import { useTutorialSession } from "./use-tutorial-session";

const EXIT_HREF = "/";
/** The guided season starts on the demo league's overview. */
const SEASON_HREF = `/l/${DEMO_LEAGUE_ID}`;

const subscribeNever = () => () => {};

/** The guided draft. Client only: it resumes from this tab's storage, which the server can't see. */
export function DraftTour() {
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  // A restart (exit, replay) remounts the room, so no selection or filter survives into the new demo.
  const { generation } = useSyncExternalStore(subscribeTutorial, getTutorialStore, getServerTutorialStore);
  return mounted ? <DraftTourSession key={generation} /> : <DraftFallback />;
}

function DraftTourSession() {
  const { league, driver, simulate, exit } = useTutorialSession();
  const [hasSelection, setHasSelection] = useState(false);
  const [hasFadeTarget, setHasFadeTarget] = useState(false);
  const onSelectionChange = useCallback((selection: SideRef | null) => setHasSelection(selection !== null), []);
  const onFadeTargetChange = useCallback((target: number | null) => setHasFadeTarget(target !== null), []);
  const stepId = tutorialStep({ league, hasSelection, hasFadeTarget });
  const step = TUTORIAL_STEPS[stepId];

  // Simulated steps play one command at a time; each new league version schedules the next. The last fade completes
  // the draft, which moves the tour on to its final step.
  const simulating = stepId === "simulate" ? "draft" : stepId === "fade-sim" ? "fades" : null;
  useEffect(() => {
    if (simulating === null) return;
    const timer = window.setTimeout(
      () => simulate(simulating, false),
      simulating === "draft" ? TUTORIAL.pickIntervalMs : TUTORIAL.fadeIntervalMs,
    );
    return () => window.clearTimeout(timer);
  }, [simulating, league.version, simulate]);

  return (
    <>
      <DraftRoomView
        driver={driver}
        access={NO_ACCESS}
        headerTag="Demo draft"
        draftControls={false}
        completeAction={
          <Link href={SEASON_HREF} className={buttonClasses()}>
            Go to your league
          </Link>
        }
        onSelectionChange={onSelectionChange}
        onFadeTargetChange={onFadeTargetChange}
      />
      <TourOverlay
        key={stepId}
        step={step}
        stepLabel={`Step ${step.number} of ${TUTORIAL_STEP_COUNT}`}
        exit={{ label: "Exit demo", href: EXIT_HREF, onExit: exit }}
      >
        {stepId === "simulate" && (
          <SimulationProgress label={draftProgress(league)} onSkip={() => simulate("draft", true)} />
        )}
        {stepId === "fade-sim" && (
          <SimulationProgress
            label={`${league.fades.length} of ${league.managers.length} fades locked`}
            onSkip={() => simulate("fades", true)}
          />
        )}
        {stepId === "complete" && (
          <Link href={SEASON_HREF} className={buttonClasses("primary", "lg")}>
            Go to your league
          </Link>
        )}
      </TourOverlay>
    </>
  );
}

/** "Pick 9 of 44 · Round 3, left to right": the snake direction of the pick being made. */
function draftProgress(league: League): string {
  const { draft } = league;
  const total = draftTotalPicks(draft);
  const current = Math.min(draft.picks.length + 1, total);
  const round = roundOf(current, draft.seatOrder.length);
  return `Pick ${current} of ${total} · Round ${round}, ${round % 2 === 1 ? "left to right" : "right to left"}`;
}

function SimulationProgress({ label, onSkip }: { label: string; onSkip: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p role="status" className="text-sm font-semibold text-fog-50">
        {label}
      </p>
      <Button variant="secondary" size="sm" onClick={onSkip}>
        Skip to the end
      </Button>
    </div>
  );
}
