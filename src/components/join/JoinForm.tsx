"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { findManager, managerLabel, openSeats } from "@/lib/league/managers";
import type { League } from "@/lib/types";

export function JoinForm({ league, viewerId }: { league: League; viewerId: string | null }) {
  const router = useRouter();
  const seats = openSeats(league.managers);
  const [managerId, setManagerId] = useState(seats[0]?.id ?? "");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const viewer = findManager(league.managers, viewerId);
  if (league.isDemo) {
    return <JoinMessage league={league} text="The demo league is read-only. Create your own league to draft." />;
  }
  if (viewer) {
    return <JoinMessage league={league} text={`You're already in this league as ${managerLabel(viewer)}.`} />;
  }
  if (seats.length === 0) {
    return <JoinMessage league={league} text="This league is full." />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/leagues/${league.id}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ managerId, displayName }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data?.message === "string" ? data.message : "Couldn't join the league.");
        setPending(false);
        return;
      }
      router.push(`/l/${league.id}/draft`);
    } catch {
      setError("Couldn't reach the server. Try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Pick an open seat</legend>
        {league.managers.map((manager) => {
          const open = manager.displayName === null;
          return (
            <label
              key={manager.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                managerId === manager.id ? "border-accent/60 bg-accent/10" : "border-ink-700"
              } ${open ? "cursor-pointer" : "opacity-60"}`}
            >
              <input
                type="radio"
                name="seat"
                value={manager.id}
                checked={managerId === manager.id}
                disabled={!open}
                onChange={() => setManagerId(manager.id)}
                className="accent-[var(--color-accent)]"
              />
              <ManagerAvatar manager={manager} size="sm" />
              <span className="flex-1">{open ? `Seat ${manager.seat + 1} · open` : managerLabel(manager)}</span>
            </label>
          );
        })}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Your name
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={24}
          required
          className="h-11 rounded-lg border border-ink-600 bg-ink-900 px-3 text-fog-50 focus:border-accent focus:outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending || !managerId} className="self-start">
        {pending ? "Joining…" : "Join league"}
      </Button>
    </form>
  );
}

function JoinMessage({ league, text }: { league: League; text: string }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-fog-300">{text}</p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/l/${league.id}/draft`} className={buttonClasses("secondary")}>
          Go to the draft room
        </Link>
        <Link href="/" className={buttonClasses("ghost")}>
          All leagues
        </Link>
      </div>
    </div>
  );
}
