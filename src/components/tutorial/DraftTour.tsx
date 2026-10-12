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
import { TUTORIAL_STEP_COUNT, TUTORIAL_STEPS, tutorialStep, type TutorialStepId } from "@/lib/tutorial/steps";
import type { League } from "@/lib/types";
import { useTutorialSession } from "./use-tutorial-session";

const EXIT_HREF = "/";
const SCORING_HREF = `/l/${DEMO_LEAGUE_ID}/scoring`;

const subscribeNever = () => () => {};

/** The guided draft. Client only: it resumes from this tab's storage, which the server can't see. */
export function DraftTour() {
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  return mounted ? <DraftTourSession /> : <DraftFallback />;
}

function DraftTourSession() {
  const { league, progress, generation, driver, acknowledge, simulate, restart } = useTutorialSession();
  const [hasSelection, setHasSelection] = useState(false);
  const [hasFadeTarget, setHasFadeTarget] = useState(false);
  const onSelectionChange = useCallback((selection: SideRef | null) => setHasSelection(selection !== null), []);
  const onFadeTargetChange = useCallback((target: number | null) => setHasFadeTarget(target !== null), []);
  const stepId = tutorialStep(progress, { league, hasSelection, hasFadeTarget });
  const step = TUTORIAL_STEPS[stepId];

  // Simulated steps play one command at a time; each new league version schedules the next.
  useEffect(() => {
    if (step.advance !== "automatic") return;
    const kind = stepId === "simulate" ? "draft" : "fades";
    const timer = window.setTimeout(
      () => simulate(kind, false),
      kind === "draft" ? TUTORIAL.pickIntervalMs : TUTORIAL.fadeIntervalMs,
    );
    return () => window.clearTimeout(timer);
  }, [step.advance, stepId, league.version, simulate]);

  const continueFor: Partial<Record<TutorialStepId, () => void>> = {
    welcome: () => acknowledge("welcomed"),
    snake: () => acknowledge("snakeExplained"),
  };

  return (
    <>
      <DraftRoomView
        key={generation}
        driver={driver}
        access={NO_ACCESS}
        headerTag="Demo draft"
        draftControls={false}
        completeAction={
          <Link href={SCORING_HREF} className={buttonClasses()}>
            See how scoring works
          </Link>
        }
        onSelectionChange={onSelectionChange}
        onFadeTargetChange={onFadeTargetChange}
      />
      <TourOverlay
        key={`${generation}-${stepId}`}
        step={step}
        stepLabel={`Step ${step.number} of ${TUTORIAL_STEP_COUNT}`}
        onContinue={continueFor[stepId]}
        onRestart={restart}
        exitHref={EXIT_HREF}
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
          <Link href={SCORING_HREF} className={buttonClasses("primary", "lg")}>
            See how scoring works
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
