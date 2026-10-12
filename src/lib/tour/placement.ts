import { TOUR } from "@/config/tour";
import type { Rect, Size } from "./geometry";

export type CalloutSide = "bottom" | "top" | "right" | "left" | "docked";

export interface CalloutPlacement {
  side: CalloutSide;
  top: number;
  left: number;
}

/** Wide enough to dock the callout in the bottom-right corner instead of across the bottom. */
const DOCK_RIGHT_MIN_WIDTH = 768;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Where the callout goes: below the spotlight, above it, right of it, then left of it, the first that fits inside the
 * viewport margins without covering the spotlight. Otherwise (the spotlight fills the screen, or is off screen) it docks
 * to the bottom edge, where the tour lets the user fold it away.
 */
export function placeCallout(target: Rect | null, callout: Size, viewport: Size): CalloutPlacement {
  const { calloutGap: gap, viewportMargin: margin } = TOUR;
  const maxLeft = viewport.width - margin - callout.width;
  const maxTop = viewport.height - margin - callout.height;
  if (target) {
    const centeredLeft = clamp(target.left + target.width / 2 - callout.width / 2, margin, maxLeft);
    const centeredTop = clamp(target.top + target.height / 2 - callout.height / 2, margin, maxTop);
    const below = target.top + target.height + gap;
    if (below <= maxTop) return { side: "bottom", top: below, left: centeredLeft };
    const above = target.top - gap - callout.height;
    if (above >= margin) return { side: "top", top: above, left: centeredLeft };
    const right = target.left + target.width + gap;
    if (right <= maxLeft) return { side: "right", top: centeredTop, left: right };
    const left = target.left - gap - callout.width;
    if (left >= margin) return { side: "left", top: centeredTop, left };
  }
  const left = viewport.width >= DOCK_RIGHT_MIN_WIDTH ? maxLeft : clamp((viewport.width - callout.width) / 2, margin, maxLeft);
  return { side: "docked", top: maxTop, left };
}

export interface PointerPlacement {
  direction: "down" | "up";
  top: number;
  left: number;
}

/** The pointer arrow: centered on the target, above it pointing down, or below it pointing up when there's no room. */
export function placePointer(target: Rect, viewport: Size): PointerPlacement {
  const { pointerSize: size, pointerGap: gap } = TOUR;
  const left = clamp(target.left + target.width / 2 - size / 2, 0, viewport.width - size);
  const above = target.top - gap - size;
  return above >= 0
    ? { direction: "down", top: above, left }
    : { direction: "up", top: target.top + target.height + gap, left };
}
