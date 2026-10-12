import { restoreTutorial, snapshotOf, TUTORIAL_STORAGE_KEY, type RestoredTutorial } from "@/lib/tutorial/snapshot";

// This tab's guided demo, shared by every demo page. With Cache Components, Next keeps visited routes mounted but
// hidden (React <Activity>) and restores their state on return, so per-page state would go stale: the draft room or an
// overview left earlier would come back with an old copy of the demo. Every page reads this one store instead
// (useSyncExternalStore) and writes only from user or simulated actions, never from an effect.
//
// sessionStorage is the record (it survives reloads). When the browser refuses it (private windows, blocked site data)
// the demo still works in memory for this page load.

let memory: string | null = null;
let cached: { raw: string | null; generation: number; value: TutorialStore } | null = null;
let generation = 0;
const listeners = new Set<() => void>();

export interface TutorialStore {
  /** This tab's demo, or null before it starts (or after it was cleared). */
  tutorial: RestoredTutorial | null;
  /** Counts restarts: pages key their demo UI by it so a restart never shows an old selection or tab. */
  generation: number;
}

const SERVER_STORE: TutorialStore = { tutorial: null, generation: 0 };

function readRaw(): string | null {
  try {
    return window.sessionStorage.getItem(TUTORIAL_STORAGE_KEY) ?? memory;
  } catch {
    return memory;
  }
}

function writeRaw(raw: string | null): void {
  memory = raw;
  try {
    if (raw === null) window.sessionStorage.removeItem(TUTORIAL_STORAGE_KEY);
    else window.sessionStorage.setItem(TUTORIAL_STORAGE_KEY, raw);
  } catch {
    // See above: memory still holds it.
  }
  for (const listener of listeners) listener();
}

function parse(raw: string | null): RestoredTutorial | null {
  if (raw === null) return null;
  try {
    return restoreTutorial(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function subscribeTutorial(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The same object until the stored demo changes (useSyncExternalStore needs that). */
export function getTutorialStore(): TutorialStore {
  const raw = readRaw();
  if (!cached || cached.raw !== raw || cached.generation !== generation) {
    cached = { raw, generation, value: { tutorial: parse(raw), generation } };
  }
  return cached.value;
}

/** Nothing on the server: the demo lives in the browser. */
export function getServerTutorialStore(): TutorialStore {
  return SERVER_STORE;
}

export function saveTutorial({ league, progress, season }: RestoredTutorial): void {
  writeRaw(JSON.stringify(snapshotOf(league, progress, season)));
}

/** Ends this tab's demo: the next visit starts over from the first step. */
export function clearTutorial(): void {
  generation += 1;
  writeRaw(null);
}
