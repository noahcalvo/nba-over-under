"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import type { LinkKind } from "@/lib/access/links";
import { findManager, managerLabel, openSeats } from "@/lib/league/managers";
import type { League } from "@/lib/types";
import { sendJson } from "./send-json";

const inputClasses =
  "h-11 rounded-lg border border-ink-600 bg-ink-900 px-3 text-fog-50 focus:border-accent focus:outline-none";

type ClaimLeague = Pick<League, "id" | "name" | "managers">;

/** The form behind /i/{token}: claim an open seat, re-claim a reset seat, or sign in with a personal link. */
export function LinkClaimForm({
  token,
  kind,
  league,
  seatId,
}: {
  token: string;
  kind: LinkKind;
  league: ClaimLeague;
  /** The link's seat. Null for a league invite. */
  seatId: string | null;
}) {
  const router = useRouter();
  const seat = findManager(league.managers, seatId);
  const open = openSeats(league.managers);
  const [managerId, setManagerId] = useState(open[0]?.id ?? "");
  const [displayName, setDisplayName] = useState(kind === "seat_invite" ? (seat?.displayName ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (kind === "league_invite" && open.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-fog-300">Every seat in {league.name} is taken.</p>
        <Link href={`/l/${league.id}`} className={buttonClasses("secondary")}>
          View the league
        </Link>
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await sendJson("/api/links/claim", "POST", { token, managerId, displayName });
    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }
    router.push(kind === "personal" ? `/l/${league.id}` : `/l/${league.id}/draft`);
  }

  const errorMessage = error && (
    <p role="alert" className="text-sm text-negative">
      {error}
    </p>
  );

  if (kind === "personal" && seat) {
    return (
      <form onSubmit={onSubmit} className="flex flex-col items-start gap-4">
        <div className="flex items-center gap-3">
          <ManagerAvatar manager={seat} />
          <p className="text-fog-300">
            This link signs this browser in as <span className="font-semibold text-fog-50">{managerLabel(seat)}</span>{" "}
            in {league.name}.
          </p>
        </div>
        {errorMessage}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Signing in…" : `Continue as ${managerLabel(seat)}`}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {kind === "league_invite" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">Pick an open seat</legend>
          {league.managers.map((manager) => {
            const isOpen = manager.displayName === null;
            return (
              <label
                key={manager.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  managerId === manager.id ? "border-accent/60 bg-accent/10" : "border-ink-700"
                } ${isOpen ? "cursor-pointer" : "opacity-60"}`}
              >
                <input
                  type="radio"
                  name="seat"
                  value={manager.id}
                  checked={managerId === manager.id}
                  disabled={!isOpen}
                  onChange={() => setManagerId(manager.id)}
                  className="accent-[var(--color-accent)]"
                />
                <ManagerAvatar manager={manager} size="sm" />
                <span className="flex-1">{isOpen ? `Seat ${manager.seat + 1} · open` : managerLabel(manager)}</span>
              </label>
            );
          })}
        </fieldset>
      ) : (
        seat && (
          <div className="flex items-center gap-3">
            <ManagerAvatar manager={seat} />
            <p className="text-fog-300">
              Rejoin seat {seat.seat + 1}. Its picks are kept; you can change the name.
            </p>
          </div>
        )
      )}
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Your name
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={24}
          required
          className={inputClasses}
        />
      </label>
      {errorMessage}
      <Button type="submit" size="lg" disabled={pending || (kind === "league_invite" && !managerId)} className="self-start">
        {pending ? "Joining…" : kind === "league_invite" ? "Join league" : "Rejoin league"}
      </Button>
    </form>
  );
}
