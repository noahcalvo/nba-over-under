"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "@/components/access/send-json";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ERROR_MESSAGES } from "@/lib/league/errors";

export interface LegacySeatItem {
  leagueId: string;
  leagueName: string;
  /** The seat's name, or "Manager 2" while unnamed. */
  seatLabel: string;
}

export interface LegacyClaimItems {
  seats: LegacySeatItem[];
  entry: { displayName: string } | null;
}

type SeatOutcome = "moved" | "already_yours" | "already_joined" | "seat_owned";
type EntryOutcome = "moved" | "entry_exists";

interface Outcomes {
  seats: { leagueId: string; leagueName: string; seatLabel: string | null; message: string; done: boolean }[];
  entry: { displayName: string; message: string; done: boolean } | null;
}

const SEAT_MESSAGES: Record<SeatOutcome, string> = {
  moved: "Moved",
  already_yours: "Already in your account",
  already_joined: ERROR_MESSAGES.already_joined,
  seat_owned: ERROR_MESSAGES.seat_owned,
};

const ENTRY_MESSAGES: Record<EntryOutcome, string> = {
  moved: "Moved",
  entry_exists: ERROR_MESSAGES.entry_exists,
};

function readOutcomes(data: Record<string, unknown>, items: LegacyClaimItems | null): Outcomes {
  const seats = Array.isArray(data.seats) ? (data.seats as { leagueId: string; leagueName: string; outcome: SeatOutcome }[]) : [];
  const entry = (data.entry ?? null) as { displayName: string; outcome: EntryOutcome } | null;
  return {
    seats: seats.map((seat) => ({
      leagueId: seat.leagueId,
      leagueName: seat.leagueName,
      seatLabel: items?.seats.find((item) => item.leagueId === seat.leagueId)?.seatLabel ?? null,
      message: SEAT_MESSAGES[seat.outcome] ?? "Couldn't move this seat.",
      done: seat.outcome === "moved" || seat.outcome === "already_yours",
    })),
    entry: entry && {
      displayName: entry.displayName,
      message: ENTRY_MESSAGES[entry.outcome] ?? "Couldn't move this entry.",
      done: entry.outcome === "moved",
    },
  };
}

function Row({ title, detail, message, done }: { title: string; detail: string; message?: string; done?: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
      <span className="min-w-0">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block text-sm text-fog-400">{detail}</span>
      </span>
      {message && <span className={`text-sm ${done ? "font-semibold text-accent" : "text-fog-300"}`}>{message}</span>}
    </li>
  );
}

/**
 * What this browser still holds from before sign-in, with one button to move it into the account. The outcomes stay
 * on screen after the refresh, when the server has nothing left to list.
 */
export function LegacyClaim({ items }: { items: LegacyClaimItems | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcomes | null>(null);

  async function move() {
    setPending(true);
    setError(null);
    const result = await sendJson("/api/account/legacy", "POST");
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOutcomes(readOutcomes(result.data, items));
    router.refresh();
  }

  if (outcomes) {
    return (
      <div className="flex flex-col gap-4">
        <ul className="divide-y divide-ink-700">
          {outcomes.seats.map((seat) => (
            <Row
              key={seat.leagueId}
              title={seat.leagueName}
              detail={seat.seatLabel ?? "League seat"}
              message={seat.message}
              done={seat.done}
            />
          ))}
          {outcomes.entry && (
            <Row title="30/30 Challenge entry" detail={outcomes.entry.displayName} message={outcomes.entry.message} done={outcomes.entry.done} />
          )}
        </ul>
        {outcomes.seats.length === 0 && !outcomes.entry && <p className="px-4 text-fog-300 sm:px-5">Nothing to move.</p>}
        <div className="px-4 pb-4 sm:px-5">
          <Link href="/" className="font-semibold text-link hover:text-fog-50">
            Back to Courtline
          </Link>
        </div>
      </div>
    );
  }

  if (!items) return <p className="p-4 text-fog-300 sm:p-5">Nothing to move.</p>;

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-ink-700">
        {items.seats.map((seat) => (
          <Row key={seat.leagueId} title={seat.leagueName} detail={seat.seatLabel} />
        ))}
        {items.entry && <Row title="30/30 Challenge entry" detail={items.entry.displayName} />}
      </ul>
      <div className="flex flex-col items-start gap-3 px-4 pb-4 sm:px-5">
        {error && <Alert>{error}</Alert>}
        <Button size="lg" onClick={move} disabled={pending}>
          {pending ? "Moving…" : "Move to my account"}
        </Button>
      </div>
    </div>
  );
}
