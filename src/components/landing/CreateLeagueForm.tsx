"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

const inputClasses =
  "h-11 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 text-fog-50 placeholder:text-fog-400 focus:border-accent focus:outline-none";

export function CreateLeagueForm() {
  const router = useRouter();
  const [leagueName, setLeagueName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/leagues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leagueName, displayName }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data?.message === "string" ? data.message : "Couldn't create the league.");
        return;
      }
      router.push(`/l/${data.leagueId}/draft`);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          League name <span className="font-normal text-fog-400">Optional</span>
          <input
            value={leagueName}
            onChange={(event) => setLeagueName(event.target.value)}
            maxLength={32}
            placeholder="National Balla Association"
            className={inputClasses}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Your name
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={24}
            required
            placeholder="Manager 1"
            className={inputClasses}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Creating…" : "Create league"}
      </Button>
      <p className="text-sm text-fog-400">
        You&apos;ll be Manager 1 and the commissioner. Share the invite link from the draft room with three friends.
      </p>
    </form>
  );
}
