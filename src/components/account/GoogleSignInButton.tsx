"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { buttonClasses } from "@/components/ui/Button";
import { signInHref } from "@/lib/access/next-path";
import { authClient } from "./auth-client";

/**
 * Starts Google sign-in; Google sends the browser back to `next` signed in. A cancelled or failed sign-in comes back to
 * this page: Better Auth appends `error=…` to the error callback, and the page says so.
 */
export function GoogleSignInButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start() {
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: next,
        errorCallbackURL: signInHref(next),
      });
      // On success the browser is already navigating to Google; only a failure comes back here.
      if (result.error) throw new Error(result.error.message);
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className={`${buttonClasses("primary", "lg")} w-full`}
      >
        Continue with Google
      </button>
      {failed && <Alert>Sign-in isn&apos;t available right now.</Alert>}
    </div>
  );
}
