import { Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { PaceBar } from "@/components/ui/PaceBar";
import { Panel } from "@/components/ui/Panel";
import { SidePill } from "@/components/ui/SidePill";
import { SignedValue } from "@/components/ui/SignedValue";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { isLocked } from "@/lib/challenge/phase";
import { movementState, pickStatus, type PickStatus } from "@/lib/challenge/status";
import { formatDateTimeET, formatNumber, formatRecord, NOT_AVAILABLE } from "@/lib/format";
import { projectWins } from "@/lib/scoring";
import type { EntryResultsData, ResultRow } from "@/server/challenge-pages";
import { ChallengePageHeader } from "./ChallengePageHeader";
import { MovementBadge } from "./MovementBadge";
import { ResultsSummary } from "./ResultsSummary";

const DASH = "–";
const HEAD = "px-3 py-3 font-semibold";

const TONES: Record<PickStatus["tone"], "accent" | "danger" | "neutral"> = { good: "accent", bad: "danger", neutral: "neutral" };

function teamName(row: ResultRow): string {
  return `${row.team.city} ${row.team.name}`;
}

function TeamName({ row }: { row: ResultRow }) {
  return (
    <Link href={`/challenge/teams/${row.team.id}`} className="hover:underline focus-visible:underline">
      {teamName(row)}
    </Link>
  );
}

function Line({ value }: { value: number | null }) {
  return value === null ? <span className="text-fog-400">{DASH}</span> : <span className="tabular-nums">{formatNumber(value)}</span>;
}

function Movement({ row }: { row: ResultRow }) {
  const state = movementState(row.pick.lineAtPick, row.currentLine, row.move);
  if (state === "unknown") return <span className="text-fog-400">{DASH}</span>;
  if (state === "unchanged" || row.move === null) return <span className="text-fog-400">No change</span>;
  return <MovementBadge move={row.move} />;
}

// --- Before the lock: the saved picks, latest lines and movement ---------------------------------------------------

function OpenTable({ rows }: { rows: ResultRow[] }) {
  return (
    <table className="hidden w-full text-sm @2xl:table">
      <thead className="text-left text-xs uppercase tracking-wider text-fog-400">
        <tr className="border-b border-ink-700">
          <th scope="col" className="px-5 py-3 font-semibold">Team</th>
          <th scope="col" className="px-3 py-3 text-center font-semibold">Pick</th>
          <th scope="col" className={`${HEAD} text-right`}>Line at pick</th>
          <th scope="col" className={`${HEAD} text-right`}>Current line</th>
          <th scope="col" className="px-5 py-3 font-semibold">Movement</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.team.id} className="border-b border-ink-700/70 last:border-0">
            <td className="px-5 py-3">
              <div className="flex items-center gap-3">
                <TeamLogo team={row.team} size={32} />
                <span className="font-medium">
                  <TeamName row={row} />
                </span>
              </div>
            </td>
            <td className="px-3 py-3 text-center">
              <SidePill side={row.pick.side} />
            </td>
            <td className="px-3 py-3 text-right text-fog-300">
              <Line value={row.pick.lineAtPick} />
            </td>
            <td className="px-3 py-3 text-right font-semibold">
              <Line value={row.currentLine} />
            </td>
            <td className="px-5 py-3">
              <Movement row={row} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fog-400">{label}</dt>
      <dd className="mt-0.5 text-fog-50">{children}</dd>
    </div>
  );
}

function CardHeader({ row }: { row: ResultRow }) {
  return (
    <div className="flex items-center gap-3">
      <TeamLogo team={row.team} size={36} />
      <p className="min-w-0 flex-1 truncate font-semibold">
        <TeamName row={row} />
      </p>
      <SidePill side={row.pick.side} size="sm" />
    </div>
  );
}

function OpenCards({ rows }: { rows: ResultRow[] }) {
  return (
    <ul className="divide-y divide-ink-700 @2xl:hidden">
      {rows.map((row) => (
        <li key={row.team.id} className="px-4 py-4">
          <CardHeader row={row} />
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <Field label="Line at pick">
              <Line value={row.pick.lineAtPick} />
            </Field>
            <Field label="Current line">
              <Line value={row.currentLine} />
            </Field>
            <Field label="Movement">
              <Movement row={row} />
            </Field>
          </dl>
        </li>
      ))}
    </ul>
  );
}

// --- After the lock: frozen lines and scores -------------------------------------------------------------------

function Status({ status }: { status: PickStatus }) {
  return <Badge tone={TONES[status.tone]}>{status.label}</Badge>;
}

function rowStatus(row: ResultRow, frozen: boolean): PickStatus {
  return pickStatus({ frozen, line: row.frozenLine, projected: row.projected, final: row.final });
}

function FrozenLine({ row, frozen }: { row: ResultRow; frozen: boolean }) {
  if (!frozen) return <span className="text-fog-400">{DASH}</span>;
  if (row.frozenLine === null) return <span className="text-fog-400">Unavailable</span>;
  return <span className="tabular-nums">{formatNumber(row.frozenLine)}</span>;
}

/** The team's win pace; a pick without a frozen line still shows it from the record (it just scores nothing). */
function ProjectedWins({ row }: { row: ResultRow }) {
  const wins = row.projected ? row.projected.wins : projectWins(row.team);
  return wins === null ? <span className="text-fog-400">{NOT_AVAILABLE}</span> : <span className="tabular-nums">{formatNumber(wins)}</span>;
}

function Pace({ row }: { row: ResultRow }) {
  if (row.frozenLine === null) return <span className="text-fog-400">{DASH}</span>;
  return <PaceBar value={row.projected?.wins ?? null} line={row.frozenLine} side={row.pick.side} />;
}

function ProjectedPoints({ row }: { row: ResultRow }) {
  return <SignedValue value={row.projected?.points ?? null} digits={2} empty={row.frozenLine === null ? DASH : NOT_AVAILABLE} />;
}

function FinalPoints({ row, frozen }: { row: ResultRow; frozen: boolean }) {
  if (row.final?.status === "scored") return <SignedValue value={row.final.points} digits={2} />;
  return <span className="text-fog-400">{frozen && row.frozenLine !== null ? "Pending" : DASH}</span>;
}

function ResultsTable({ rows, frozen }: { rows: ResultRow[]; frozen: boolean }) {
  return (
    <table className="hidden w-full text-sm @3xl:table">
      <thead className="text-left text-xs uppercase tracking-wider text-fog-400">
        <tr className="border-b border-ink-700">
          <th scope="col" className="px-5 py-3 font-semibold">Team</th>
          <th scope="col" className="px-3 py-3 text-center font-semibold">Pick</th>
          <th scope="col" className={`${HEAD} text-right`}>Frozen line</th>
          <th scope="col" className={`${HEAD} text-center`}>Record</th>
          <th scope="col" className={`${HEAD} text-right`}>Proj. wins</th>
          <th scope="col" className={HEAD}>Win pace</th>
          <th scope="col" className={`${HEAD} text-right`}>Proj. pts</th>
          <th scope="col" className={`${HEAD} text-right`}>Final pts</th>
          <th scope="col" className="px-5 py-3 font-semibold">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.team.id} className="border-b border-ink-700/70 last:border-0">
            <td className="px-5 py-3">
              <div className="flex items-center gap-3">
                <TeamLogo team={row.team} size={32} />
                <span className="font-medium">
                  <TeamName row={row} />
                </span>
              </div>
            </td>
            <td className="px-3 py-3 text-center">
              <SidePill side={row.pick.side} />
            </td>
            <td className="px-3 py-3 text-right font-semibold">
              <FrozenLine row={row} frozen={frozen} />
            </td>
            <td className="px-3 py-3 text-center tabular-nums text-fog-300">{formatRecord(row.team.wins, row.team.losses)}</td>
            <td className="px-3 py-3 text-right">
              <ProjectedWins row={row} />
            </td>
            <td className="px-3 py-3">
              <Pace row={row} />
            </td>
            <td className="px-3 py-3 text-right text-base font-semibold">
              <ProjectedPoints row={row} />
            </td>
            <td className="px-3 py-3 text-right text-base font-semibold">
              <FinalPoints row={row} frozen={frozen} />
            </td>
            <td className="px-5 py-3">
              <Status status={rowStatus(row, frozen)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResultsCards({ rows, frozen }: { rows: ResultRow[]; frozen: boolean }) {
  return (
    <ul className="divide-y divide-ink-700 @3xl:hidden">
      {rows.map((row) => (
        <li key={row.team.id} className="px-4 py-4">
          <CardHeader row={row} />
          <div className="mt-3">
            <Pace row={row} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Field label="Frozen line">
              <FrozenLine row={row} frozen={frozen} />
            </Field>
            <Field label="Record">
              <span className="tabular-nums">{formatRecord(row.team.wins, row.team.losses)}</span>
            </Field>
            <Field label="Proj. wins">
              <ProjectedWins row={row} />
            </Field>
            <Field label="Proj. pts">
              <ProjectedPoints row={row} />
            </Field>
            <Field label="Final pts">
              <FinalPoints row={row} frozen={frozen} />
            </Field>
            <Field label="Status">
              <Status status={rowStatus(row, frozen)} />
            </Field>
          </dl>
        </li>
      ))}
    </ul>
  );
}

// --- The view ----------------------------------------------------------------------------------------------------

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-ink-600 bg-ink-850 px-4 py-3 text-sm text-fog-50">
      <span aria-hidden className="mt-0.5 shrink-0 text-fog-400">
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** One entry's page body: the saved picks before the lock, the frozen-line results after it. Server-rendered. */
export function EntryResults({ data }: { data: EntryResultsData }) {
  const { entry, season, phase, isViewer, hidden, rows } = data;
  const locked = isLocked(phase);
  const frozen = season?.frozen ?? null;
  const deadline = season?.deadline ? formatDateTimeET(season.deadline) : null;
  const missing = frozen
    ? frozen.missing.map((id) => {
        const row = rows.find((candidate) => candidate.team.id === id);
        return row ? teamName(row) : id;
      })
    : [];
  return (
    <div className="flex flex-col gap-6">
      <ChallengePageHeader
        title={entry.displayName}
        subtitle={`${data.seasonLabel} · Saved ${formatDateTimeET(entry.savedAt)}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          {isViewer && <Badge tone="accent">Your entry</Badge>}
          {isViewer && !locked && (
            <Link href="/challenge" className={buttonClasses("primary")}>
              Edit picks
            </Link>
          )}
        </div>
      </ChallengePageHeader>

      {hidden ? (
        <Panel bodyClassName="flex items-start gap-3 p-5 text-fog-300">
          <Lock aria-hidden className="mt-0.5 size-5 shrink-0 text-fog-400" />
          <p>Picks are revealed when the challenge locks{deadline ? ` at ${deadline}` : ""}.</p>
        </Panel>
      ) : (
        <>
          {locked && <ResultsSummary data={data} />}
          {locked && !frozen && (
            <Notice icon={<Lock className="size-4" />}>
              The challenge is locked. The shared lines are being frozen; scores appear once they are.
            </Notice>
          )}
          {missing.length > 0 && frozen && (
            <Notice icon={<TriangleAlert className="size-4" />}>
              No {frozen.source} line was available before the deadline for {listNames(missing)}. Those picks score for
              nobody.
            </Notice>
          )}
          <Panel
            title={locked ? "Picks" : "Saved picks"}
            actions={<span className="text-sm text-fog-400">{rows.length} teams</span>}
          >
            <div className="@container">
              {locked ? (
                <>
                  <ResultsTable rows={rows} frozen={frozen !== null} />
                  <ResultsCards rows={rows} frozen={frozen !== null} />
                </>
              ) : (
                <>
                  <OpenTable rows={rows} />
                  <OpenCards rows={rows} />
                </>
              )}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
