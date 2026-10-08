"use client";

import { ListChecks } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { formatDateTimeET, formatNumber } from "@/lib/format";
import { isValidLine, sameLineValues } from "@/lib/lines";
import type { LineReview, TeamId } from "@/lib/types";

function toDrafts(overrides: Readonly<Record<TeamId, number>>): Record<TeamId, string> {
  return Object.fromEntries(Object.entries(overrides).map(([teamId, line]) => [teamId, String(line)]));
}

/** Empty boxes mean "use the book's line". */
function parseDrafts(drafts: Record<TeamId, string>): { values: Record<TeamId, number>; invalid: Set<TeamId> } {
  const values: Record<TeamId, number> = {};
  const invalid = new Set<TeamId>();
  for (const [teamId, text] of Object.entries(drafts)) {
    if (text.trim() === "") continue;
    const value = Number(text);
    if (isValidLine(value)) values[teamId] = value;
    else invalid.add(teamId);
  }
  return { values, invalid };
}

/**
 * Before the draft: every team's line from the book, with the commissioner's lines on top. Remount it (key) when the
 * saved overrides change so the boxes reset to what was saved.
 */
export function LineReviewPanel({
  review,
  canEdit,
  pending,
  onSave,
  onDirtyChange,
}: {
  review: LineReview;
  canEdit: boolean;
  pending: boolean;
  onSave: (overrides: Record<TeamId, number>) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [drafts, setDrafts] = useState(() => toDrafts(review.overrides));
  const { values, invalid } = parseDrafts(drafts);
  const dirty = invalid.size > 0 || !sameLineValues(values, review.overrides);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const missingNames = review.rows.filter((row) => row.line === null).map((row) => row.team.name);

  return (
    <Panel
      title="Lines"
      icon={<ListChecks aria-hidden className="size-5 text-fog-300" />}
      bodyClassName="flex flex-col"
      actions={
        <p className="text-sm text-fog-300">
          {review.book} · {review.season} win totals ·{" "}
          {review.asOf ? `updated ${formatDateTimeET(review.asOf)}` : "not loaded"}
        </p>
      }
    >
      <div className="flex flex-col gap-3 px-4 pt-4 sm:px-5">
        {review.feedError && (
          <Alert>
            Couldn&apos;t refresh {review.book} lines: {review.feedError}{" "}
            {review.asOf
              ? `Showing the lines from ${formatDateTimeET(review.asOf)}.`
              : canEdit
                ? "Enter the lines by hand below to draft without them."
                : "The commissioner can enter them by hand."}
          </Alert>
        )}
        {missingNames.length > 0 && (
          <Alert>
            No line yet for {missingNames.length === review.rows.length ? "any team" : missingNames.join(", ")}.{" "}
            {canEdit ? "Enter the missing lines to start the draft." : "The commissioner needs to enter them."}
          </Alert>
        )}
        <p className="text-sm text-fog-400">
          Lines lock when the draft starts.{" "}
          {canEdit && `Leave a box empty to use the ${review.book} line; anything you type replaces it.`}
        </p>
      </div>

      <div className="@container mt-3">
        <div className="grid grid-cols-[minmax(0,1fr)_4rem_5.5rem] gap-3 border-y border-ink-700 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-fog-400 sm:px-5">
          <span>Team</span>
          <span className="text-right">{review.book}</span>
          <span className="text-right">Line</span>
        </div>
        <ul className="divide-y divide-ink-700/70">
          {review.rows.map((row) => {
            const id = row.team.id;
            const label = `${row.team.city} ${row.team.name}`;
            return (
              <li key={id} className="grid grid-cols-[minmax(0,1fr)_4rem_5.5rem] items-center gap-3 px-4 py-2 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{label}</p>
                  {row.line === null ? (
                    <p className="text-xs text-negative">Missing</p>
                  ) : row.override !== null ? (
                    <p className="text-xs text-accent">Entered by the commissioner</p>
                  ) : null}
                </div>
                <span className="text-right tabular-nums text-fog-300">
                  {row.feed === null ? "—" : formatNumber(row.feed)}
                </span>
                {canEdit ? (
                  <input
                    inputMode="decimal"
                    aria-label={`${label} line`}
                    aria-invalid={invalid.has(id)}
                    placeholder={row.feed === null ? "Enter" : formatNumber(row.feed)}
                    value={drafts[id] ?? ""}
                    onChange={(event) => setDrafts((current) => ({ ...current, [id]: event.target.value }))}
                    className="h-9 w-full rounded-md border border-ink-600 bg-ink-900 px-2 text-right font-semibold tabular-nums text-fog-50 placeholder:font-normal placeholder:text-fog-400 focus-visible:outline-2 focus-visible:outline-accent aria-[invalid=true]:border-negative"
                  />
                ) : (
                  <span className="text-right font-semibold tabular-nums">
                    {row.line === null ? "—" : formatNumber(row.line)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 border-t border-ink-700 px-4 py-3 sm:px-5">
          <Button onClick={() => void onSave(values)} disabled={!dirty || invalid.size > 0 || pending}>
            Save lines
          </Button>
          <Button variant="ghost" onClick={() => setDrafts(toDrafts(review.overrides))} disabled={!dirty || pending}>
            Discard changes
          </Button>
          {invalid.size > 0 && (
            <p className="text-sm text-negative">Lines must be between 0.5 and 81.5, in steps of 0.5.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
