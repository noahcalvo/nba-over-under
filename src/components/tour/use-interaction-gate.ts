"use client";

import { useEffect, type RefObject } from "react";
import type { TourTargetId } from "@/lib/tour/targets";
import { findTargets, focusablesIn } from "./dom";

const BLOCKED_EVENTS = ["mousedown", "click", "dblclick", "auxclick", "contextmenu", "submit"] as const;

/**
 * While a step is shown, only the callout and the step's interactive areas take input: clicks, presses and focus
 * elsewhere are stopped before the app sees them, and Tab cycles through the allowed controls. Scrolling stays free.
 */
export function useInteractionGate(interactive: readonly TourTargetId[], callout: RefObject<HTMLElement | null>) {
  const key = interactive.join(" ");
  useEffect(() => {
    const ids = key === "" ? [] : (key.split(" ") as TourTargetId[]);
    const roots = () => [callout.current, ...ids.flatMap(findTargets)].filter((root): root is HTMLElement => root !== null);
    const allowed = (target: EventTarget | null) =>
      target instanceof Node && roots().some((root) => root.contains(target));
    const block = (event: Event) => {
      if (allowed(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onFocus = (event: FocusEvent) => {
      if (!allowed(event.target)) callout.current?.focus({ preventScroll: true });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const order = focusablesIn(roots());
        if (order.length === 0) return;
        const index = order.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey
          ? order[index <= 0 ? order.length - 1 : index - 1]
          : order[index === -1 || index === order.length - 1 ? 0 : index + 1];
        event.preventDefault();
        next.focus();
      } else if ((event.key === "Enter" || event.key === " ") && !allowed(event.target)) {
        block(event);
      }
    };
    for (const type of BLOCKED_EVENTS) document.addEventListener(type, block, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      for (const type of BLOCKED_EVENTS) document.removeEventListener(type, block, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [key, callout]);
}
