"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { CopyLink } from "./CopyLink";
import { sendJson } from "./send-json";

/** Any manager: their personal sign-in link, and a way to replace it. */
export function YourAccessPanel({ leagueId, personalPath }: { leagueId: string; personalPath: string | null }) {
  const router = useRouter();
  const [signOutOtherDevices, setSignOutOtherDevices] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resetLink() {
    setPending(true);
    setError(null);
    const result = await sendJson(`/api/leagues/${leagueId}/me/link`, "POST", { signOutOtherDevices });
    setPending(false);
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  return (
    <Panel title="Your access" bodyClassName="flex flex-col gap-4 p-4 sm:p-5">
      {personalPath && (
        <CopyLink
          path={personalPath}
          label="Your sign-in link"
          description="Open it on another device to sign in as you. Keep it private: anyone with it can act as you."
        />
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={signOutOtherDevices}
          onChange={(event) => setSignOutOtherDevices(event.target.checked)}
          className="accent-[var(--color-accent)]"
        />
        Also sign out my other devices
      </label>
      <Button variant="secondary" disabled={pending} onClick={resetLink} className="self-start">
        {pending ? "Resetting…" : "Reset my link"}
      </Button>
      <p className="text-sm text-fog-400">Resetting makes your old sign-in link stop working.</p>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
    </Panel>
  );
}
