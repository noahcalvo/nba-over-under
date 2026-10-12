import { TUTORIAL_STORAGE_KEY, type TutorialSnapshot } from "@/lib/tutorial/snapshot";

// This tab's demo. Storage can be missing or refuse writes (private windows, blocked site data): the demo still works,
// it just starts over on reload.

export function readTutorialSnapshot(): unknown {
  try {
    const raw = window.sessionStorage.getItem(TUTORIAL_STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeTutorialSnapshot(snapshot: TutorialSnapshot): void {
  try {
    window.sessionStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // See above.
  }
}

export function clearTutorialSnapshot(): void {
  try {
    window.sessionStorage.removeItem(TUTORIAL_STORAGE_KEY);
  } catch {
    // See above.
  }
}
