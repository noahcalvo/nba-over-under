"use client";

import { Suspense, use, type ReactNode } from "react";
import { SignedValue } from "@/components/ui/SignedValue";
import { formatDateTimeET, formatNumber } from "@/lib/format";
import { lineMovement, type MarketLine } from "@/lib/team-detail";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <dt className="text-lg text-fog-50">{label}</dt>
      <dd className="min-w-0 text-right font-display text-3xl font-bold tabular-nums text-fog-50">{children}</dd>
    </div>
  );
}

const SECTION_CLASS = "flex min-w-0 flex-col rounded-xl border border-ink-700 bg-ink-850/90 p-5 sm:p-6";

/** The panel streams: the heading shows at once and the rows arrive with the market read. */
export function SportsbookPanel({
  market,
  lockedLine,
  className = "",
}: {
  /** Never rejects: `readLines` reports a failed feed as a read with no lines. */
  market: Promise<MarketLine>;
  lockedLine: number | null;
  className?: string;
}) {
  return (
    <Suspense fallback={<SportsbookSkeleton className={className} />}>
      <Sportsbook market={market} lockedLine={lockedLine} className={className} />
    </Suspense>
  );
}

export function SportsbookSkeleton({ className }: { className: string }) {
  return (
    <section aria-busy="true" aria-labelledby="sportsbook-heading" className={`${SECTION_CLASS} ${className}`}>
      <h2 id="sportsbook-heading" className="font-display text-3xl font-bold text-accent">
        Sportsbook line
      </h2>
      <p className="mt-1 text-fog-400">Loading the latest line…</p>
      <div className="mt-4 divide-y divide-ink-700 border-y border-ink-700">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center justify-between gap-4 py-4">
            <div className="h-6 w-32 animate-pulse rounded bg-ink-800" />
            <div className="h-9 w-20 animate-pulse rounded bg-ink-800" />
          </div>
        ))}
      </div>
    </section>
  );
}

function Sportsbook({
  market: marketPromise,
  lockedLine,
  className,
}: {
  market: Promise<MarketLine>;
  lockedLine: number | null;
  className: string;
}) {
  const market = use(marketPromise);
  const movement = lineMovement(market.line, lockedLine);
  return (
    <section
      aria-labelledby="sportsbook-heading"
      className={`${SECTION_CLASS} ${className}`}
    >
      <h2 id="sportsbook-heading" className="font-display text-3xl font-bold text-accent">
        Sportsbook line
      </h2>
      <p className="mt-1 text-fog-300">Source: {market.book}</p>
      <dl className="mt-4 divide-y divide-ink-700 border-y border-ink-700">
        <Row label="At draft">
          {lockedLine === null ? (
            <span className="font-sans text-base font-normal text-fog-400">Not locked yet</span>
          ) : (
            formatNumber(lockedLine)
          )}
        </Row>
        <Row label="Latest available">
          {market.line === null ? (
            <span className="font-sans text-base font-normal text-fog-400">No current {market.book} market</span>
          ) : (
            formatNumber(market.line)
          )}
        </Row>
        {movement !== null && (
          <Row label="Movement">
            <SignedValue value={movement} suffix={Math.abs(movement) === 1 ? "win" : "wins"} />
          </Row>
        )}
      </dl>
      <div className="mt-4 space-y-1 text-sm text-fog-300">
        {market.asOf && <p>Updated {formatDateTimeET(market.asOf)}</p>}
        {market.error && <p className="text-fog-400">Couldn&apos;t refresh: {market.error}</p>}
        {lockedLine !== null && <p>League scoring uses the locked {formatNumber(lockedLine)} line.</p>}
      </div>
    </section>
  );
}
