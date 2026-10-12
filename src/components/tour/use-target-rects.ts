"use client";

import { useEffect, useState } from "react";
import { sameRects, type Rect, type Size } from "@/lib/tour/geometry";
import type { TourTargetId } from "@/lib/tour/targets";
import { findTargets, visibleRect } from "./dom";

export interface TargetLayout {
  /** Visible rects of every element tagged with each id, in document order. Off-screen elements are left out. */
  rects: ReadonlyMap<TourTargetId, readonly Rect[]>;
  viewport: Size;
}

const EMPTY: TargetLayout = { rects: new Map(), viewport: { width: 0, height: 0 } };

/**
 * Measures the tagged elements and re-measures (once per frame at most) on any scroll, including inside scroll
 * containers, on resize, and on DOM or layout changes, so the spotlight follows content as it moves.
 */
export function useTargetRects(ids: readonly TourTargetId[]): TargetLayout {
  const key = ids.join(" ");
  const [layout, setLayout] = useState<TargetLayout>(EMPTY);
  useEffect(() => {
    const wanted = key === "" ? [] : (key.split(" ") as TourTargetId[]);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rects = new Map(wanted.map((id) => [id, findTargets(id).flatMap((element) => visibleRect(element) ?? [])]));
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      setLayout((current) =>
        current.viewport.width === viewport.width &&
        current.viewport.height === viewport.height &&
        wanted.every((id) => sameRects(current.rects.get(id) ?? [], rects.get(id) ?? []))
          ? current
          : { rects, viewport },
      );
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    schedule();
    const resizes = new ResizeObserver(schedule);
    resizes.observe(document.body);
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resizes.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [key]);
  return layout;
}
