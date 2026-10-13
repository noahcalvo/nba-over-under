import { TEAM_IDS } from "@/data/teams";
import { parseDraft, type ChallengeDraft } from "@/lib/challenge/board";

export type { ChallengeDraft };

// This browser's unsaved challenge picks. Next keeps visited routes mounted but hidden (React <Activity>) and restores
// their state on return, so a per-page copy would go stale; the board reads this one store (useSyncExternalStore) and
// writes only from user actions. localStorage is the record; when the browser refuses it the page works without a draft.

const key = (season: number) => `courtline.challenge.draft.v1.${season}`;
const listeners = new Set<() => void>();
let cache: { key: string | null; raw: string | null; value: ChallengeDraft | null } = { key: null, raw: null, value: null };

function read(season: number): string | null {
  try {
    return window.localStorage.getItem(key(season));
  } catch {
    return null;
  }
}

export function subscribeDraft(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** A stable object per stored string (useSyncExternalStore needs that). Null when absent or unreadable. */
export function getDraft(season: number): ChallengeDraft | null {
  const raw = read(season);
  if (cache.key === key(season) && raw === cache.raw) return cache.value;
  let value: ChallengeDraft | null = null;
  try {
    value = raw ? parseDraft(JSON.parse(raw), TEAM_IDS) : null;
  } catch {
    value = null;
  }
  cache = { key: key(season), raw, value };
  return value;
}

export function writeDraft(season: number, draft: ChallengeDraft | null): void {
  try {
    if (draft) window.localStorage.setItem(key(season), JSON.stringify(draft));
    else window.localStorage.removeItem(key(season));
  } catch {
    // Storage unavailable: the page still works without a draft.
  }
  listeners.forEach((listener) => listener());
}
