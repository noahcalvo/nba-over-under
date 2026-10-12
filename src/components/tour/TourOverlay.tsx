"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { usePrefersReducedMotion } from "@/components/ui/use-prefers-reduced-motion";
import { TOUR } from "@/config/tour";
import { inflateRect, type Size } from "@/lib/tour/geometry";
import { placeCallout, placePointer } from "@/lib/tour/placement";
import type { TourStep, TourTargetId } from "@/lib/tour/targets";
import { findTargets, isDisplayed } from "./dom";
import { useInteractionGate } from "./use-interaction-gate";
import { useTargetRects } from "./use-target-rects";

/** Until the callout has been measured. */
const INITIAL_CALLOUT: Size = { width: 352, height: 220 };

/**
 * A guided-tour step over the real UI: dims everything but the step's spotlight, points at where to act, and explains
 * it in a callout that stays on screen. Mount with key={step id} so each step starts fresh.
 */
export function TourOverlay({
  step,
  stepLabel,
  onContinue,
  onRestart,
  exitHref,
  children,
}: {
  step: TourStep;
  /** E.g. "Step 2 of 8". */
  stepLabel: string;
  /** Required when the step has a continueLabel. */
  onContinue?: () => void;
  onRestart: () => void;
  exitHref: string;
  /** Step-specific controls under the text (simulation progress, finish links). */
  children?: ReactNode;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const calloutRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const maskId = useId();
  const [folded, setFolded] = useState(false);
  const [calloutSize, setCalloutSize] = useState<Size>(INITIAL_CALLOUT);
  const ids = useMemo<TourTargetId[]>(
    () => [...new Set([...step.spotlight, ...(step.pointAt ? [step.pointAt] : [])])],
    [step],
  );
  const { rects, viewport } = useTargetRects(ids);
  useInteractionGate(step.interactive, calloutRef);

  // Each step: bring its spotlight on screen and move focus to the callout so its text is read first.
  useEffect(() => {
    calloutRef.current?.focus({ preventScroll: true });
    const first = step.spotlight.flatMap(findTargets).find(isDisplayed);
    first?.scrollIntoView({
      block: first.offsetHeight > window.innerHeight * 0.8 ? "start" : "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [step, reduceMotion]);

  useEffect(() => {
    const callout = calloutRef.current;
    if (!callout) return;
    const observer = new ResizeObserver(() => setCalloutSize({ width: callout.offsetWidth, height: callout.offsetHeight }));
    observer.observe(callout);
    return () => observer.disconnect();
  }, []);

  // Escape folds the callout out of the way (and back); it never leaves the tour.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFolded((current) => !current);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const holes = step.spotlight
    .flatMap((id) => rects.get(id) ?? [])
    .map((rect) => inflateRect(rect, TOUR.spotlightPadding));
  const anchor = step.spotlight.map((id) => rects.get(id)?.[0]).find((rect) => rect !== undefined);
  const placement = placeCallout(
    anchor ? inflateRect(anchor, TOUR.spotlightPadding) : null,
    calloutSize,
    viewport,
  );
  const pointAt = step.pointAt ? rects.get(step.pointAt)?.[0] : undefined;
  const pointer = pointAt && placePointer(pointAt, viewport);
  const Arrow = pointer?.direction === "up" ? ArrowUp : ArrowDown;

  return createPortal(
    <>
      <svg aria-hidden className="pointer-events-none fixed inset-0 z-40 size-full">
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            {holes.map((hole, index) => (
              <rect key={index} x={hole.left} y={hole.top} width={hole.width} height={hole.height} rx={14} fill="black" />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" className="fill-ink-950/80" mask={`url(#${maskId})`} />
      </svg>
      {holes.map((hole, index) => (
        <div
          key={index}
          aria-hidden
          className="pointer-events-none fixed z-40 rounded-[14px] ring-2 ring-accent/70 motion-safe:animate-pulse"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
      ))}
      {pointer && (
        <Arrow
          aria-hidden
          className="pointer-events-none fixed z-50 text-accent drop-shadow motion-safe:animate-bounce"
          style={{ top: pointer.top, left: pointer.left, width: TOUR.pointerSize, height: TOUR.pointerSize }}
        />
      )}
      <div
        ref={calloutRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-accent/60 bg-ink-900 p-4 shadow-2xl focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
        style={{ top: placement.top, left: placement.left }}
      >
        <div className="flex items-center gap-1">
          <p className="flex-1 text-xs font-semibold uppercase tracking-[0.2em] text-link">{stepLabel}</p>
          <Button variant="ghost" size="sm" onClick={() => setFolded((current) => !current)} aria-expanded={!folded} aria-label={folded ? "Show tip" : "Hide tip"}>
            {folded ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRestart} aria-label="Restart demo">
            <RotateCcw aria-hidden className="size-4" />
          </Button>
          <Link href={exitHref} aria-label="Exit demo" className="inline-flex size-8 items-center justify-center rounded-lg text-fog-300 hover:text-fog-50 focus-visible:outline-2 focus-visible:outline-accent">
            <X aria-hidden className="size-4" />
          </Link>
        </div>
        <h2 id={titleId} className="mt-1 font-display text-xl font-semibold text-fog-50">
          {step.title}
        </h2>
        {!folded && (
          <>
            <p className="mt-2 text-sm text-fog-300">{step.body}</p>
            {step.details && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold text-link">{step.details.summary}</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-fog-300">
                  {step.details.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            )}
            {children && <div className="mt-4 flex flex-col gap-3">{children}</div>}
            {step.continueLabel && onContinue && (
              <Button className="mt-4 w-full" onClick={onContinue}>
                {step.continueLabel}
              </Button>
            )}
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
