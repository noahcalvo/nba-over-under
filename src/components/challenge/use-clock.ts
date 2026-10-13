"use client";

import { useCallback, useSyncExternalStore } from "react";

// One shared one-second tick for every countdown. `wall` is the browser's time at the latest tick, so a snapshot stays
// the same between ticks (useSyncExternalStore needs that).
const listeners = new Set<() => void>();
let wall = 0;
let timer: ReturnType<typeof setInterval> | null = null;
/** serverNow → server time minus browser time when this page first saw it: the countdown follows the server's clock. */
const offsets = new Map<string, number>();

function tick(): void {
  wall = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  wall = Date.now();
  timer ??= setInterval(tick, 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function offsetFor(serverNow: string): number {
  let offset = offsets.get(serverNow);
  if (offset === undefined) {
    offset = Date.parse(serverNow) - Date.now();
    offsets.set(serverNow, offset);
  }
  return offset;
}

/** Epoch ms on the server's clock, whole seconds, ticking each second. The server render uses `serverNow`. */
export function useClock(serverNow: string): number {
  const getSnapshot = useCallback(() => {
    if (wall === 0) wall = Date.now();
    return Math.floor((wall + offsetFor(serverNow)) / 1000) * 1000;
  }, [serverNow]);
  const getServerSnapshot = useCallback(() => Date.parse(serverNow), [serverNow]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
