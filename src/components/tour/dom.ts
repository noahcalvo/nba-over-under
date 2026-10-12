import { clipRect, type Rect } from "@/lib/tour/geometry";
import type { TourTargetId } from "@/lib/tour/targets";

export function findTargets(id: TourTargetId): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`));
}

/** Laid out at all (not display: none), on screen or not. */
export function isDisplayed(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

function toRect(box: DOMRect): Rect {
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

function clipsContent(element: Element): boolean {
  const style = getComputedStyle(element);
  return /(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`);
}

/** The part of the element the user can see: clipped by every scrolling ancestor and the viewport. Null when none. */
export function visibleRect(element: HTMLElement): Rect | null {
  if (!isDisplayed(element)) return null;
  const clips: Rect[] = [];
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (clipsContent(parent)) clips.push(toRect(parent.getBoundingClientRect()));
  }
  clips.push({ top: 0, left: 0, width: window.innerWidth, height: window.innerHeight });
  return clipRect(toRect(element.getBoundingClientRect()), clips);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Keyboard-focusable elements inside the roots (and the roots themselves), in document order. */
export function focusablesIn(roots: readonly HTMLElement[]): HTMLElement[] {
  const found = new Set<HTMLElement>();
  for (const root of roots) {
    if (root.matches(FOCUSABLE)) found.add(root);
    root.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((element) => found.add(element));
  }
  return [...found]
    .filter(isDisplayed)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}
