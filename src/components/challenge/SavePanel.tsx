"use client";

import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { CHALLENGE } from "@/config/challenge";
import { signInHref } from "@/lib/access/next-path";
import { formatDateTimeET } from "@/lib/format";
import { RAIL_PANEL } from "./rail-panel";

export const NAME_INPUT_ID = "challenge-entry-name";

/** Where "Sign in to save" goes: back to the board, whose local draft is untouched by the round trip. */
export const SIGN_IN_TO_SAVE_HREF = signInHref("/challenge");

/** "Saved …", "Unsaved changes" or what stops the save: one line, for the compact bar. */
export function saveStatusText({ blocker, dirty, savedAt }: { blocker: string | null; dirty: boolean; savedAt: string | null }) {
  if (blocker) return blocker;
  if (dirty) return "Unsaved changes";
  return savedAt ? `Saved ${formatDateTimeET(savedAt)}` : "";
}

const SAVE_BUTTON =
  "hidden h-14 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 font-display text-lg font-bold text-accent-ink transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent xl:flex";

export function LockedLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <Link href="/challenge/my-picks" className={buttonClasses("secondary")}>
        My Picks
      </Link>
      <Link href="/challenge/leaderboard" className={buttonClasses("secondary")}>
        Leaderboard
      </Link>
    </div>
  );
}

export function SavePanel({
  name,
  onName,
  canSave,
  label,
  blocker,
  savedAt,
  saving,
  onSave,
  onDiscard,
  dirty,
  locked,
  signedIn,
}: {
  name: string;
  onName: (name: string) => void;
  canSave: boolean;
  label: string;
  /** Why Save is disabled, if something stops it. */
  blocker: string | null;
  savedAt: string | null;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  dirty: boolean;
  locked: boolean;
  /** Signed out, saving needs an account: the save button becomes a link to sign in. */
  signedIn: boolean;
}) {
  if (locked) {
    return (
      <section aria-labelledby="save-heading" className={RAIL_PANEL}>
        <h2 id="save-heading" className="flex items-center gap-2 font-display text-xl font-bold text-fog-50">
          <Lock aria-hidden className="size-5 text-fog-400" />
          Picks are locked
        </h2>
        <p className="mt-2 text-sm text-fog-300">Follow your entry and everyone else&apos;s through the season.</p>
        <LockedLinks className="mt-4" />
      </section>
    );
  }
  return (
    <section aria-label="Save your entry" className={`${RAIL_PANEL} flex flex-col gap-4`}>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-fog-300">Name on the leaderboard</span>
        <input
          id={NAME_INPUT_ID}
          value={name}
          onChange={(event) => onName(event.target.value)}
          maxLength={CHALLENGE.nameMaxLength}
          autoComplete="nickname"
          placeholder="Your name"
          className="h-11 rounded-lg border border-ink-600 bg-ink-900 px-3 text-fog-50 placeholder:text-fog-400 focus:border-accent focus:outline-none"
        />
      </label>
      {signedIn ? (
        <button type="button" onClick={onSave} disabled={!canSave || saving} className={`${SAVE_BUTTON} disabled:cursor-not-allowed disabled:opacity-40`}>
          {saving ? "Saving…" : label}
          <ArrowRight aria-hidden className="size-5" />
        </button>
      ) : (
        <Link href={SIGN_IN_TO_SAVE_HREF} className={SAVE_BUTTON}>
          Sign in to save
          <ArrowRight aria-hidden className="size-5" />
        </Link>
      )}
      <div className="flex min-h-6 flex-col gap-1 text-sm">
        {blocker && <p className="text-fog-300">{blocker}</p>}
        {dirty ? (
          <p className="flex items-center gap-2 text-fog-50">
            Unsaved changes
            <button
              type="button"
              onClick={onDiscard}
              className="rounded px-1.5 font-semibold text-fog-300 underline-offset-2 hover:text-fog-50 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Discard
            </button>
          </p>
        ) : (
          savedAt && <p className="font-semibold text-accent">Saved {formatDateTimeET(savedAt)}</p>
        )}
      </div>
    </section>
  );
}
