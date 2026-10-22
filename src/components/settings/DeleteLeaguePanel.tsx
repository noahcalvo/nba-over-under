"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { matchesLeagueName } from "@/lib/league/commands";
import { managerLabel } from "@/lib/league/managers";
import type { League } from "@/lib/types";

const inputClasses =
  "h-11 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 text-fog-50 placeholder:text-fog-400 focus:border-accent focus:outline-none";

/** Commissioner control: archive the league after typing its name. */
export function DeleteLeaguePanel({
  league,
}: {
  league: Pick<League, "id" | "name" | "commissionerId" | "managers">;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setInput("");
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !matchesLeagueName(input, league.name)) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/leagues/${league.id}/archive`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmName: input }),
      });
      if (response.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      const data = await response.json().catch(() => null);
      if (response.status === 409 && data?.error === "archived") {
        // Already deleted from another tab: leave Settings, which is read-only now.
        router.push("/");
        router.refresh();
        return;
      }
      setError(typeof data?.message === "string" ? data.message : "Couldn't delete the league.");
    } catch {
      setError("Couldn't reach the server. Try again.");
    }
    setPending(false);
  }

  const managers = [...league.managers].sort((a, b) => a.seat - b.seat);

  return (
    <Panel title="Delete league" bodyClassName="flex flex-col gap-4 p-4 sm:p-5">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fog-300">Deleting can&apos;t be undone.</p>
          <Button variant="secondary" className="text-negative" onClick={() => setOpen(true)}>
            Delete league…
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-fog-300">
            Members can still open the league read-only, but it leaves everyone&apos;s league list and its invite
            links stop working. This can&apos;t be undone.
          </p>
          <ul className="max-h-64 divide-y divide-ink-700 overflow-y-auto rounded-lg border border-ink-700">
            {managers.map((manager) => (
              <li key={manager.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate font-semibold">{managerLabel(manager)}</span>
                <span className="shrink-0 text-xs text-fog-400">
                  {[
                    manager.displayName === null ? "Open seat" : null,
                    manager.id === league.commissionerId ? "Commissioner" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            <span className="break-words">Type &quot;{league.name}&quot; to confirm</span>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              autoComplete="off"
              className={inputClasses}
            />
          </label>
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="secondary"
              className="text-negative"
              disabled={pending || !matchesLeagueName(input, league.name)}
            >
              {pending ? "Deleting…" : "Delete league"}
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}
