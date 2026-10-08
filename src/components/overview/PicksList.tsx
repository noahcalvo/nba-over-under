import { Badge } from "@/components/ui/Badge";
import { PaceBar } from "@/components/ui/PaceBar";
import { SidePill } from "@/components/ui/SidePill";
import { SignedValue } from "@/components/ui/SignedValue";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { formatNumber, formatRecord, NOT_AVAILABLE } from "@/lib/format";
import type { Basis, CallEvaluation } from "@/lib/scoring";
import type { ScoredCall } from "@/lib/standings";

function WinPace({ call }: { call: ScoredCall }) {
  const { evaluation, team, pick } = call;
  if (evaluation.wins === null) return <span className="text-fog-400">{NOT_AVAILABLE}</span>;
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 font-semibold tabular-nums">{formatNumber(evaluation.wins)}</span>
      <PaceBar value={evaluation.wins} line={team.line} side={pick.side} className="max-w-32" />
    </div>
  );
}

function FinalWins({ evaluation }: { evaluation: CallEvaluation }) {
  return evaluation.wins === null ? (
    <span className="text-fog-400">Pending</span>
  ) : (
    <span className="font-semibold tabular-nums">{formatNumber(evaluation.wins, 0)}</span>
  );
}

function Result({ evaluation }: { evaluation: CallEvaluation }) {
  if (evaluation.status !== "scored") return <Badge>Pending</Badge>;
  return evaluation.correct ? <Badge tone="accent">Correct</Badge> : <Badge tone="danger">Missed</Badge>;
}

export function PicksTable({ calls, basis }: { calls: ScoredCall[]; basis: Basis }) {
  const projected = basis === "projected";
  return (
    <table className="hidden w-full text-sm @2xl:table">
      <thead className="text-left text-xs uppercase tracking-wider text-fog-400">
        <tr className="border-b border-ink-700">
          <th scope="col" className="px-5 py-3 font-semibold">Team</th>
          <th scope="col" className="px-3 py-3 text-center font-semibold">Pick</th>
          <th scope="col" className="px-3 py-3 text-right font-semibold">Line</th>
          <th scope="col" className="px-3 py-3 text-center font-semibold">Record</th>
          {projected ? (
            <>
              <th scope="col" className="px-3 py-3 font-semibold">Win pace</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Proj. margin</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Proj. pts</th>
            </>
          ) : (
            <>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Final wins</th>
              <th scope="col" className="px-3 py-3 text-center font-semibold">Result</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Points</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {calls.map((call) => {
          const { pick, team, evaluation } = call;
          return (
            <tr key={pick.pickNumber} className="border-b border-ink-700/70 last:border-0">
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <TeamLogo team={team} size={32} />
                  <span className="font-medium">
                    {team.city} {team.name}
                  </span>
                </div>
              </td>
              <td className="px-3 py-3 text-center">
                <SidePill side={pick.side} />
              </td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatNumber(team.line)}</td>
              <td className="px-3 py-3 text-center tabular-nums text-fog-300">{formatRecord(team.wins, team.losses)}</td>
              {projected ? (
                <>
                  <td className="px-3 py-3">
                    <WinPace call={call} />
                  </td>
                  <td className="px-3 py-3 text-right text-base font-semibold">
                    <SignedValue value={evaluation.margin} empty="—" />
                  </td>
                  <td className="px-5 py-3 text-right text-base font-semibold">
                    <SignedValue value={evaluation.points} empty="—" />
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3 py-3 text-right">
                    <FinalWins evaluation={evaluation} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Result evaluation={evaluation} />
                  </td>
                  <td className="px-5 py-3 text-right text-base font-semibold">
                    <SignedValue value={evaluation.points} empty="—" />
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function PickCards({ calls, basis }: { calls: ScoredCall[]; basis: Basis }) {
  const projected = basis === "projected";
  return (
    <ul className="divide-y divide-ink-700 @2xl:hidden">
      {calls.map((call) => {
        const { pick, team, evaluation } = call;
        return (
          <li key={pick.pickNumber} className="px-4 py-4">
            <div className="flex items-center gap-3">
              <TeamLogo team={team} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {team.city} {team.name}
                </p>
                <p className="text-xs text-fog-400">
                  Pick {pick.pickNumber} · {formatRecord(team.wins, team.losses)}
                </p>
              </div>
              <SidePill side={pick.side} size="sm" />
              <span className="font-semibold tabular-nums">{formatNumber(team.line)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
              {projected ? (
                <>
                  <div className="min-w-0">
                    <dt className="text-xs text-fog-400">Win pace</dt>
                    <dd className="mt-1">
                      {evaluation.wins === null ? (
                        <span className="text-fog-400">{NOT_AVAILABLE}</span>
                      ) : (
                        <>
                          <span className="font-semibold tabular-nums">{formatNumber(evaluation.wins)}</span>
                          <PaceBar value={evaluation.wins} line={team.line} side={pick.side} className="mt-1.5" />
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fog-400">Proj. margin</dt>
                    <dd className="mt-1 font-semibold">
                      <SignedValue value={evaluation.margin} empty="—" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fog-400">Proj. pts</dt>
                    <dd className="mt-1 font-semibold">
                      <SignedValue value={evaluation.points} empty="—" />
                    </dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt className="text-xs text-fog-400">Final wins</dt>
                    <dd className="mt-1">
                      <FinalWins evaluation={evaluation} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fog-400">Result</dt>
                    <dd className="mt-1">
                      <Result evaluation={evaluation} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fog-400">Points</dt>
                    <dd className="mt-1 font-semibold">
                      <SignedValue value={evaluation.points} empty="—" />
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
